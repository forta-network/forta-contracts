// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-protocol/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "../stake_subjects/StakeSubjectGateway.sol";
import "../../utils/StateMachines.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract SlashingController is BaseComponentUpgradeable, StateMachineController, SubjectTypeValidator {
    using Counters for Counters.Counter;
    using StateMachines for StateMachines.Machine;

    StateMachines.State public constant UNDEFINED = StateMachines.State._00;
    StateMachines.State public constant CREATED = StateMachines.State._01;
    StateMachines.State public constant REJECTED = StateMachines.State._02;
    StateMachines.State public constant DISMISSED = StateMachines.State._03;
    StateMachines.State public constant IN_REVIEW = StateMachines.State._04;
    StateMachines.State public constant REVIEWED = StateMachines.State._05;
    StateMachines.State public constant EXECUTED = StateMachines.State._06;
    StateMachines.State public constant REVERTED = StateMachines.State._07;

    enum PenaltyMode {
        UNDEFINED,
        MIN_STAKE,
        CURRENT_STAKE
    }

    struct SlashPenalty {
        uint256 percentSlashed;
        PenaltyMode mode;
    }

    struct Deposit {
        address proposer;
        uint256 amount;
    }

    struct Proposal {
        uint256 subjectId;
        address proposer;
        bytes32 penaltyId;
        uint8 subjectType;
    }

    Counters.Counter private _proposalIds;
    mapping(uint256 => Proposal) public proposals; // proposalId --> Proposal
    mapping(uint256 => uint256) public deposits; // proposalId --> tokenAmount
    mapping(bytes32 => SlashPenalty) public penalties; // penaltyId --> SlashPenalty
    ISlashingExecutor public slashingExecutor;
    /// @custom:oz-renamed-from stakingParameters
    StakeSubjectGateway public subjectGateway; // Should be immutable, but it's already deployed.
    uint256 public depositAmount;
    uint256 public slashPercentToProposer;

    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    IERC20 public immutable depositToken;
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    StateMachines.Machine private immutable _transitionTable;

    //solhint-disable-next-line const-name-snakecase
    string public constant version = "0.1.1";
    uint256 public constant MAX_EVIDENCE_LENGTH = 5;
    uint256 public constant MAX_CHAR_LENGTH = 200;
    uint256 private constant HUNDRED_PERCENT = 100;

    event SlashProposalUpdated(
        address indexed updater,
        uint256 indexed proposalId,
        StateMachines.State indexed stateId,
        address proposer,
        uint256 subjectId,
        uint8 subjectType,
        bytes32 penaltyId
    );
    event EvidenceSubmitted(uint256 proposalId, StateMachines.State stateId, string[] evidence);
    event DepositAmountChanged(uint256 amount);
    event SlashPercentToProposerChanged(uint256 amount);
    event DepositSubmitted(uint256 indexed proposalId, address indexed proposer, uint256 amount);
    event DepositReturned(uint256 indexed proposalId, address indexed proposer, uint256 amount);
    event DepositSlashed(uint256 indexed proposalId, address indexed proposer, uint256 amount);
    event SlashPenaltyAdded(bytes32 indexed penaltyId, uint256 percentSlashed, PenaltyMode mode);
    event SlashPenaltyRemoved(bytes32 indexed penaltyId, uint256 percentSlashed, PenaltyMode mode);

    error WrongSlashPenaltyId(bytes32 penaltyId);
    error NonRegisteredSubject(uint8 subjectType, uint256 subjectId);
    error WrongPercentValue(uint256 value);

    modifier onlyValidSlashPenaltyId(bytes32 penaltyId) {
        if (penalties[penaltyId].mode == PenaltyMode.UNDEFINED) revert WrongSlashPenaltyId(penaltyId);
        _;
    }

    modifier onlyValidPercent(uint256 percent) {
        if (percent > HUNDRED_PERCENT) revert WrongPercentValue(percent);
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address _forwarder, address _depositToken) initializer ForwardedContext(_forwarder) {
        if (_depositToken == address(0)) revert ZeroAddress("_depositToken");
        depositToken = IERC20(_depositToken);
        _transitionTable = StateMachines
            .EMPTY_MACHINE
            .addEdgeTransition(UNDEFINED, CREATED)
            .addEdgeTransition(CREATED, DISMISSED)
            .addEdgeTransition(CREATED, REJECTED)
            .addEdgeTransition(CREATED, IN_REVIEW)
            .addEdgeTransition(IN_REVIEW, REVIEWED)
            .addEdgeTransition(IN_REVIEW, REVERTED)
            .addEdgeTransition(REVIEWED, EXECUTED)
            .addEdgeTransition(REVIEWED, REVERTED);
    }

    /**
     * @notice Initializer method, access point to initialize inheritance tree.
     * @param __manager address of AccessManager.
     */
    function initialize(
        address __manager,
        ISlashingExecutor __executor,
        StakeSubjectGateway __subjectGateway,
        uint256 __depositAmount,
        uint256 __slashPercentToProposer,
        bytes32[] calldata __slashPenaltyIds,
        SlashPenalty[] calldata __slashPenalties
    ) public initializer {
        __BaseComponentUpgradeable_init(__manager);

        _setSlashingExecutor(__executor);
        _setsubjectGateway(__subjectGateway);
        _setDepositAmount(__depositAmount);
        _setSlashPercentToProposer(__slashPercentToProposer);
        _setSlashPenalties(__slashPenaltyIds, __slashPenalties);
    }

    // Proposal LifeCycle
    /**
     * @notice Creates a slash proposal pointing to a slashable subject. To do so, the proposer must provide a FORT deposit and present evidence.
     * @param _subjectType type of the subject.
     * @param _subjectId ERC721 registry id of the stake subject.
     * @param _penaltyId if of the SlashPenalty to inflict upon the subject if the proposal goes through.
     * @param _evidence IPFS hashes of the evidence files, proof of the subject being slash worthy.
     * @return proposalId the proposal identifier.
     */
    function proposeSlash(
        uint8 _subjectType,
        uint256 _subjectId,
        bytes32 _penaltyId,
        string[] calldata _evidence
    ) external onlyValidSlashPenaltyId(_penaltyId) onlyValidSubjectType(_subjectType) notAgencyType(_subjectType, SubjectStakeAgency.DELEGATOR) returns (uint256 proposalId) {
        if (!subjectGateway.isRegistered(_subjectType, _subjectId)) revert NonRegisteredSubject(_subjectType, _subjectId);
        if (subjectGateway.totalStakeFor(_subjectType, _subjectId) == 0) revert ZeroAmount("subject stake");
        Proposal memory slashProposal = Proposal(_subjectId, _msgSender(), _penaltyId, _subjectType);
        SafeERC20.safeTransferFrom(depositToken, _msgSender(), address(this), depositAmount);
        _proposalIds.increment();
        proposalId = _proposalIds.current();
        deposits[proposalId] = depositAmount;
        proposals[proposalId] = slashProposal;
        emit DepositSubmitted(proposalId, _msgSender(), depositAmount);
        _freeze(_subjectType, _subjectId);
        _transition(proposalId, CREATED);
        emit SlashProposalUpdated(_msgSender(), proposalId, CREATED, slashProposal.proposer, slashProposal.subjectId, slashProposal.subjectType, slashProposal.penaltyId);
        _submitEvidence(proposalId, CREATED, _evidence);
        return proposalId;
    }

    /**
     * @notice Arbiter dismisses a slash proposal (the proposal is legitimate, but after investigation, it is not a slashable offense)
     * The deposit is returned to the proposer, and the stake of the subject is unfrozen
     * @param _proposalId the proposal identifier.
     * @param _evidence IPFS hashes of the evidence files, proof of the subject not being slashable.
     */
    function dismissSlashProposal(uint256 _proposalId, string[] calldata _evidence) external onlyRole(SLASHING_ARBITER_ROLE) {
        _transition(_proposalId, DISMISSED);
        _submitEvidence(_proposalId, DISMISSED, _evidence);
        _returnDeposit(_proposalId);
        _unfreeze(_proposalId);
    }

    /**
     * @notice Arbiter rejects a slash proposal, slashing the deposit of the proposer (the proposal is deemed as spam, misconduct, or similar)
     * and unfreezing the subject's stake.
     * @param _proposalId the proposal identifier.
     * @param _evidence IPFS hashes of the evidence files, justification for slashing the proposer's deposit.
     */
    function rejectSlashProposal(uint256 _proposalId, string[] calldata _evidence) external onlyRole(SLASHING_ARBITER_ROLE) {
        _transition(_proposalId, REJECTED);
        _submitEvidence(_proposalId, REJECTED, _evidence);
        _slashDeposit(_proposalId);
        _unfreeze(_proposalId);
    }

    /**
     * @notice Arbiter recognizes the report as valid and procceeds to investigate. The deposit is returned to proposer, stake remains frozen.
     * @param _proposalId the proposal identifier.
     */
    function markAsInReviewSlashProposal(uint256 _proposalId) external onlyRole(SLASHING_ARBITER_ROLE) {
        _transition(_proposalId, IN_REVIEW);
        if (deposits[_proposalId] == 0) revert ZeroAmount("deposit on _proposalId");
        _returnDeposit(_proposalId);
    }

    /**
     * @notice After investigation, arbiter updates the proposal's incorrect assumptions. This can only be done if the proposal is IN_REVIEW, and
     * presenting evidence for the changes.
     * Changing the subject and subjectType will unfreeze the previous target and freeze the new.
     * Changing the penalty will affect slashing amounts.
     * @param _proposalId the proposal identifier.
     * @param _subjectType type of the subject.
     * @param _subjectId ERC721 registry id of the stake subject.
     * @param _penaltyId if of the SlashPenalty to inflict upon the subject if the proposal goes through.
     * @param _evidence IPFS hashes of the evidence files, proof of need for proposal changes.
     */
    function reviewSlashProposalParameters(
        uint256 _proposalId,
        uint8 _subjectType,
        uint256 _subjectId,
        bytes32 _penaltyId,
        string[] calldata _evidence
    )
        external
        onlyRole(SLASHING_ARBITER_ROLE)
        onlyInState(_proposalId, IN_REVIEW)
        onlyValidSlashPenaltyId(_penaltyId)
        onlyValidSubjectType(_subjectType)
        notAgencyType(_subjectType, SubjectStakeAgency.DELEGATOR)
    {
        // No need to check for proposal existence, onlyInState will revert if _proposalId is in undefined state
        if (!subjectGateway.isRegistered(_subjectType, _subjectId)) revert NonRegisteredSubject(_subjectType, _subjectId);
        if (subjectGateway.totalStakeFor(_subjectType, _subjectId) == 0) revert ZeroAmount("subject stake");
        _submitEvidence(_proposalId, IN_REVIEW, _evidence);
        if (_subjectType != proposals[_proposalId].subjectType || _subjectId != proposals[_proposalId].subjectId) {
            _unfreeze(_proposalId);
            _freeze(_subjectType, _subjectId);
        }
        _updateProposal(_proposalId, _subjectType, _subjectId, _penaltyId);
    }

    function _updateProposal(uint256 _proposalId, uint8 _subjectType, uint256 _subjectId, bytes32 _penaltyId) private {
        Proposal memory slashProposal = Proposal(_subjectId, proposals[_proposalId].proposer, _penaltyId, _subjectType);
        proposals[_proposalId] = slashProposal;
        emit SlashProposalUpdated(_msgSender(), _proposalId, IN_REVIEW, slashProposal.proposer, slashProposal.subjectId, slashProposal.subjectType, slashProposal.penaltyId);
    }

    /**
     * @notice Arbiter marks the proposal as reviewed, so the slasher can execute or revert.
     * @param _proposalId the proposal identifier.
     */
    function markAsReviewedSlashProposal(uint256 _proposalId) external onlyRole(SLASHING_ARBITER_ROLE) {
        _transition(_proposalId, REVIEWED);
    }

    /**
     * @notice The slashing proposal should not be executed. Stake is unfrozen.
     * If the proposal is IN_REVIEW, this can be executed by the SLASHING_ARBITER_ROLE.
     * If the proposal is REVIEWED, this can be executed by the SLASHER_ROLE.
     * @param _proposalId the proposal identifier.
     * @param _evidence IPFS hashes of the evidence files, proof of the slash being not valid.
     */
    function revertSlashProposal(uint256 _proposalId, string[] calldata _evidence) external {
        _authorizeRevertSlashProposal(_proposalId);
        _transition(_proposalId, REVERTED);
        _submitEvidence(_proposalId, REVERTED, _evidence);
        _unfreeze(_proposalId);
    }

    /**
     * @notice The slashing proposal is executed. Subject's stake is slashed and unfrozen.
     * The proposer gets a % of the slashed stake as defined by slashPercentToProposer.
     * Only executable by SLASHER_ROLE
     * @param _proposalId the proposal identifier.
     */
    function executeSlashProposal(uint256 _proposalId) external onlyRole(SLASHER_ROLE) {
        _transition(_proposalId, EXECUTED);
        Proposal memory proposal = proposals[_proposalId];
        slashingExecutor.slash(proposal.subjectType, proposal.subjectId, getSlashedStakeValue(_proposalId), proposal.proposer, slashPercentToProposer);
        slashingExecutor.freeze(proposal.subjectType, proposal.subjectId, false);
    }

    // Penalty calculation (ISlashingController)

    /**
     * @notice gets the stake amount to be slashed.
     * The amount depends on the StakePenalty.
     * In all cases, the amount will be the minimum of the max slashable stake for the subject and:
     * MIN_STAKE: a % of the subject's MIN_STAKE
     * CURRENT_STAKE: a % of the subject's active + inactive stake.
     */
    function getSlashedStakeValue(uint256 _proposalId) public view returns (uint256) {
        Proposal memory proposal = proposals[_proposalId];
        SlashPenalty memory penalty = penalties[proposal.penaltyId];
        uint256 totalStake = subjectGateway.totalStakeFor(proposal.subjectType, proposal.subjectId);
        uint256 max = Math.mulDiv(totalStake, slashingExecutor.MAX_SLASHABLE_PERCENT(), HUNDRED_PERCENT);
        if (penalty.mode == PenaltyMode.UNDEFINED) {
            return 0;
        } else if (penalty.mode == PenaltyMode.MIN_STAKE) {
            uint256 minStake = 0;
            if (getSubjectTypeAgency(proposal.subjectType) == SubjectStakeAgency.DELEGATED) {
                minStake = subjectGateway.minManagedStakeFor(proposal.subjectType, proposal.subjectId);
            } else {
                minStake = subjectGateway.minStakeFor(proposal.subjectType, proposal.subjectId);
            }
            return Math.min(max, Math.mulDiv(minStake, penalty.percentSlashed, HUNDRED_PERCENT));
        } else if (penalty.mode == PenaltyMode.CURRENT_STAKE) {
            return Math.min(max, Math.mulDiv(totalStake, penalty.percentSlashed, HUNDRED_PERCENT));
        }
        return 0;
    }

    // Gets the subjectType and subjectId for a proposalId
    function getSubject(uint256 _proposalId) external view returns (uint8 subjectType, uint256 subject) {
        return (proposals[_proposalId].subjectType, proposals[_proposalId].subjectId);
    }

    // Gets the proposer of a proposalId
    function getProposer(uint256 _proposalId) external view returns (address) {
        return proposals[_proposalId].proposer;
    }

    // Admin methods
    function setDepositAmount(uint256 _amount) external onlyRole(STAKING_ADMIN_ROLE) {
        _setDepositAmount(_amount);
    }

    function setSlashPercentToProposer(uint256 _amount) external onlyRole(STAKING_ADMIN_ROLE) {
        _setSlashPercentToProposer(_amount);
    }

    function setSlashPenalties(bytes32[] calldata _slashReasons, SlashPenalty[] calldata _slashPenalties) external onlyRole(STAKING_ADMIN_ROLE) {
        _setSlashPenalties(_slashReasons, _slashPenalties);
    }

    // Private validations

    function _authorizeRevertSlashProposal(uint256 _proposalId) private view {
        bytes32 requiredRole = currentState(_proposalId) == IN_REVIEW ? SLASHING_ARBITER_ROLE : SLASHER_ROLE;
        if (!hasRole(requiredRole, _msgSender())) {
            revert MissingRole(requiredRole, _msgSender());
        }
        // If it's in another state, _transition() will revert
    }

    function _unfreeze(uint256 _proposalId) private {
        slashingExecutor.freeze(proposals[_proposalId].subjectType, proposals[_proposalId].subjectId, false);
    }

    function _freeze(uint8 _subjectType, uint256 _subjectId) private {
        slashingExecutor.freeze(_subjectType, _subjectId, true);
    }

    // Private param setting

    function _setSlashingExecutor(ISlashingExecutor _executor) private {
        if (address(_executor) == address(0)) revert ZeroAddress("_executor");
        slashingExecutor = _executor;
    }

    function _setsubjectGateway(StakeSubjectGateway _subjectGateway) private {
        if (address(_subjectGateway) == address(0)) revert ZeroAddress("_subjectGateway");
        subjectGateway = _subjectGateway;
    }

    function _setDepositAmount(uint256 _amount) private {
        if (_amount == 0) revert ZeroAmount("_amount");
        depositAmount = _amount;
        emit DepositAmountChanged(depositAmount);
    }

    function _setSlashPercentToProposer(uint256 _amount) private onlyValidPercent(_amount) {
        slashPercentToProposer = _amount;
        emit SlashPercentToProposerChanged(_amount);
    }

    function _setSlashPenalties(bytes32[] calldata _slashReasons, SlashPenalty[] calldata _slashPenalties) private {
        uint256 length = _slashReasons.length;
        if (length != _slashPenalties.length) revert DifferentLengthArray("_slashReasons", "_slashPenalties");
        for (uint256 i = 0; i < length; i++) {
            if (penalties[_slashReasons[i]].mode != PenaltyMode.UNDEFINED) {
                emit SlashPenaltyRemoved(_slashReasons[i], penalties[_slashReasons[i]].percentSlashed, penalties[_slashReasons[i]].mode);
            }
            penalties[_slashReasons[i]] = _slashPenalties[i];
            emit SlashPenaltyAdded(_slashReasons[i], _slashPenalties[i].percentSlashed, _slashPenalties[i].mode);
        }
    }

    // Evidence handling
    function _submitEvidence(uint256 _proposalId, StateMachines.State _stateId, string[] calldata _evidence) private {
        uint256 evidenceLength = _evidence.length;
        if (evidenceLength == 0) revert ZeroAmount("evidence length");
        if (evidenceLength > MAX_EVIDENCE_LENGTH) revert ArrayTooBig(evidenceLength, MAX_EVIDENCE_LENGTH);
        for (uint256 i = 0; i < evidenceLength; i++) {
            if (bytes(_evidence[i]).length > MAX_CHAR_LENGTH) revert StringTooLarge(bytes(_evidence[i]).length, MAX_CHAR_LENGTH);
        }
        emit EvidenceSubmitted(_proposalId, _stateId, _evidence);
    }

    // Private deposit handling
    function _returnDeposit(uint256 _proposalId) private {
        uint256 amount = deposits[_proposalId];
        delete deposits[_proposalId];
        SafeERC20.safeTransfer(depositToken, proposals[_proposalId].proposer, amount);
        emit DepositReturned(_proposalId, proposals[_proposalId].proposer, amount);
    }

    function _slashDeposit(uint256 _proposalId) private {
        uint256 amount = deposits[_proposalId];
        delete deposits[_proposalId];
        SafeERC20.safeTransfer(depositToken, slashingExecutor.treasury(), amount);
        emit DepositSlashed(_proposalId, proposals[_proposalId].proposer, amount);
    }

    function transitionTable() public view virtual override returns (StateMachines.Machine) {
        return _transitionTable;
    }
}
