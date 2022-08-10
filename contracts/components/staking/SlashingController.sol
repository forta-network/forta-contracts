// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-protocol/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.4;

import "../BaseComponentUpgradeable.sol";
import "./SubjectTypes.sol";
import "./ISlashingExecutor.sol";
import "./FortaStakingParameters.sol";
import "../utils/StateMachines.sol";
import "../../errors/GeneralErrors.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract SlashingController is BaseComponentUpgradeable, StateMachines, SubjectTypeValidator {
    using Counters for Counters.Counter;

    enum SlashStates {
        UNDEFINED,
        CREATED,
        REJECTED,
        DISMISSED,
        IN_REVIEW,
        REVIEWED,
        EXECUTED,
        REVERTED
    }

    enum PenaltyMode {
        UNDEFINED,
        MIN_STAKE,
        MAX_STAKE,
        CURRENT_STAKE
    }

    struct SlashPenalty {
        uint256 percentSlashed;
        PenaltyMode mode;
    }

    struct Deposit {
        address reporter;
        uint256 amount;
    }

    struct Proposal {
        string evidence;
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
    FortaStakingParameters public stakingParameters;
    IERC20 public depositToken;
    uint256 public depositAmount;
    address public treasury;

    string public constant version = "0.1.0";

    event SlashProposalCreated(uint256 indexed proposalId, address indexed reporter, uint256 subjectId, uint8 subjectType, string evidence, uint256 deposit);
    event SlashProposalUpdated(address indexed reviewer, uint256 indexed proposalId, address indexed reporter, uint256 subjectId, uint8 subjectType, string evidence);
    event SlashingExecutorChanged(address indexed slashingExecutor);
    event StakingParametersManagerChanged(address indexed stakingParametersManager);
    event DepositAmountChanged(uint256 amount);
    event TreasuryChanged(address newTreasury);
    event DepositReturned(address indexed proposer, uint256 amount);
    event DepositSlashed(address indexed proposer, uint256 amount);
    event SlashPenaltyAdded(bytes32 indexed penaltyId, uint256 percentSlashed, PenaltyMode mode);
    event SlashPenaltyRemoved(bytes32 indexed penaltyId, uint256 percentSlashed, PenaltyMode mode);

    error WrongSlashPenaltyId(bytes32 penaltyId);
    error NonExistentProposal(uint256 proposalId);
    error UnauthorizedToSlashProposal(bytes32 roleNeeded, address caller);
    error NonRegisteredSubject(uint8 subjectType, uint256 subjectId);

    modifier onlyValidSlashPenaltyId(bytes32 penaltyId) {
        if (penalties[penaltyId].mode == PenaltyMode.UNDEFINED) revert WrongSlashPenaltyId(penaltyId);
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address forwarder) initializer ForwardedContext(forwarder) {}

    /**
     * @notice Initializer method, access point to initialize inheritance tree.
     * @param __manager address of AccessManager.
     * @param __router address of Router.
     */
    function initialize(
        address __manager,
        address __router,
        ISlashingExecutor __executor,
        FortaStakingParameters __stakingParameters,
        address __depositToken,
        address __treasury,
        uint256 __depositAmount,
        bytes32[] calldata __slashPenaltyIds,
        SlashPenalty[] calldata __slashPenalties
    ) public initializer {
        __AccessManaged_init(__manager);
        __Routed_init(__router);
        __UUPSUpgradeable_init();

        _setSlashingExecutor(__executor);
        _setStakingParametersManager(__stakingParameters);
        _setTreasury(__treasury);
        _setDepositAmount(__depositAmount);
        _setSlashPenalties(__slashPenaltyIds, __slashPenalties);

        if (__depositToken == address(0)) revert ZeroAddress("__depositToken");
        depositToken = IERC20(__depositToken);

        // UNDEFINED --> CREATED
        uint256[] memory afterUndefined = new uint256[](1);
        afterUndefined[0] = uint256(SlashStates.CREATED);
        _configureState(uint256(SlashStates.UNDEFINED), afterUndefined);

        // CREATED --> DISMISSED, REJECTED or IN_REVIEW
        uint256[] memory afterCreated = new uint256[](3);
        afterCreated[0] = uint256(SlashStates.DISMISSED);
        afterCreated[1] = uint256(SlashStates.REJECTED);
        afterCreated[2] = uint256(SlashStates.IN_REVIEW);
        _configureState(uint256(SlashStates.CREATED), afterCreated);

        // IN_REVIEW --> REVIEWED or REVERTED
        uint256[] memory afterInReview = new uint256[](3);
        afterInReview[0] = uint256(SlashStates.REVIEWED);
        afterInReview[1] = uint256(SlashStates.REVERTED);
        _configureState(uint256(SlashStates.IN_REVIEW), afterInReview);

        // REVIEWED --> EXECUTED or REVERTED
        uint256[] memory afterReviewed = new uint256[](2);
        afterReviewed[0] = uint256(SlashStates.EXECUTED);
        afterReviewed[1] = uint256(SlashStates.REVERTED);
        _configureState(uint256(SlashStates.REVIEWED), afterReviewed);
    }

    function proposeSlash(
        string calldata _evidence,
        uint8 _subjectType,
        uint256 _subjectId,
        bytes32 _penaltyId
    ) external returns (uint256 proposalId) {
        if (!stakingParameters.isRegistered(_subjectType, _subjectId)) revert NonRegisteredSubject(_subjectType, _subjectId);
        Proposal memory slashProposal = Proposal(_evidence, _subjectId, msg.sender, _penaltyId, _subjectType);
        _validateProposal(slashProposal);
        SafeERC20.safeTransferFrom(depositToken, msg.sender, address(this), depositAmount);
        _proposalIds.increment();
        proposalId = _proposalIds.current();
        proposals[proposalId] = slashProposal;
        deposits[proposalId] = depositAmount;
        _createMachine(proposalId, uint256(SlashStates.CREATED));
        emit SlashProposalCreated(proposalId, slashProposal.proposer, slashProposal.subjectId, slashProposal.subjectType, slashProposal.evidence, depositAmount);
        slashingExecutor.freeze(_subjectType, _subjectId, true);
        return proposalId;
    }

    function dismissSlashProposal(uint256 _proposalId) external onlyRole(SLASHING_ARBITER_ROLE) {
        if (deposits[_proposalId] == 0) revert ZeroAmount("deposit on _proposalId");
        _transitionTo(_proposalId, uint256(SlashStates.DISMISSED));
        _returnDeposit(_proposalId);
        slashingExecutor.freeze(proposals[_proposalId].subjectType, proposals[_proposalId].subjectId, false);
    }

    function rejectSlashProposal(uint256 _proposalId) external onlyRole(SLASHING_ARBITER_ROLE) {
        if (deposits[_proposalId] == 0) revert ZeroAmount("deposit on _proposalId");
        _transitionTo(_proposalId, uint256(SlashStates.REJECTED));
        _slashDeposit(_proposalId);
        slashingExecutor.freeze(proposals[_proposalId].subjectType, proposals[_proposalId].subjectId, false);
    }

    function markAsInReviewSlashProposal(uint256 _proposalId) external onlyRole(SLASHING_ARBITER_ROLE) {
        if (deposits[_proposalId] == 0) revert ZeroAmount("deposit on _proposalId");
        _transitionTo(_proposalId, uint256(SlashStates.IN_REVIEW));
        _returnDeposit(_proposalId);
    }

    function reviewSlashProposalParameters(
        uint256 _proposalId,
        string calldata _evidence,
        uint8 _subjectType,
        uint256 _subjectId,
        bytes32 _penaltyId
    ) external onlyRole(SLASHING_ARBITER_ROLE) onlyInState(_proposalId, uint256(SlashStates.IN_REVIEW)) {
        if (proposals[_proposalId].proposer == address(0)) revert NonExistentProposal(_proposalId);
        if (_subjectType != proposals[_proposalId].subjectType || _subjectId != proposals[_proposalId].subjectId) {
            _emitHook(
                abi.encodeWithSignature(
                    "hook_slashProposalUpdated(uint256,uint8,uint256,uint8,uint25)",
                    _proposalId,
                    _subjectType,
                    _subjectId,
                    proposals[_proposalId].subjectType,
                    proposals[_proposalId].subjectId
                )
            );
        }
        Proposal memory slashProposal = Proposal(_evidence, _subjectId, proposals[_proposalId].proposer, _penaltyId, _subjectType);
        _validateProposal(slashProposal);
        proposals[_proposalId] = slashProposal;
        emit SlashProposalUpdated(msg.sender, _proposalId, slashProposal.proposer, slashProposal.subjectId, slashProposal.subjectType, slashProposal.evidence);
    }

    function markAsReviewedSlashProposal(uint256 _proposalId) external onlyRole(SLASHING_ARBITER_ROLE) {
        _transitionTo(_proposalId, uint256(SlashStates.REVIEWED));
    }

    function revertSlashProposal(uint256 _proposalId) external {
        _authorizeRevertSlashProposal(_proposalId);
        _transitionTo(_proposalId, uint256(SlashStates.REVERTED));
        slashingExecutor.freeze(proposals[_proposalId].subjectType, proposals[_proposalId].subjectId, false);
    }

    function executeSlashProposal(uint256 _proposalId) external onlyRole(SLASHER_ROLE) {
        /*if (slashPercents[proposals[_proposalId].penaltyId])
        _transitionTo(_proposalId, uint256(SlashStates.EXECUTED));
        slashingExecutor.freeze(proposals[_proposalId].subjectType, proposals[_proposalId].subjectId, false);

        );*/
    }

    function setSlashingExecutor(ISlashingExecutor _executor) external onlyRole(STAKING_ADMIN_ROLE) {
        _setSlashingExecutor(_executor);
    }

    function setStakingParametersManager(FortaStakingParameters _stakingParameters) external onlyRole(STAKING_ADMIN_ROLE) {
        _setStakingParametersManager(_stakingParameters);
    }

    function setDepositAmount(uint256 _amount) external onlyRole(STAKING_ADMIN_ROLE) {
        _setDepositAmount(_amount);
    }

    function setTreasury(address _treasury) external onlyRole(STAKING_ADMIN_ROLE) {
        _setTreasury(_treasury);
    }

    function setSlashPenalties(bytes32[] calldata _slashReasons, SlashPenalty[] calldata _slashPenalties) external onlyRole(STAKING_ADMIN_ROLE) {
        _setSlashPenalties(_slashReasons, _slashPenalties);
    }

    function _authorizeRevertSlashProposal(uint256 _proposalId) private view {
        if (isInState(_proposalId, uint256(SlashStates.IN_REVIEW)) && !hasRole(SLASHING_ARBITER_ROLE, msg.sender)) {
            revert UnauthorizedToSlashProposal(SLASHING_ARBITER_ROLE, msg.sender);
        } else if (isInState(_proposalId, uint256(SlashStates.REVIEWED)) && !hasRole(SLASHER_ROLE, msg.sender)) {
            revert UnauthorizedToSlashProposal(SLASHER_ROLE, msg.sender);
        }
        // If it's in another state, _transitionTo() will revert
    }

    function _validateProposal(Proposal memory _slashProposal) private view onlyValidSlashPenaltyId(_slashProposal.penaltyId) onlyValidSubjectType(_slashProposal.subjectType) {
        if (bytes(_slashProposal.evidence).length == 0) revert EmptyString("_slashProposal.evidence");
    }

    function _setSlashingExecutor(ISlashingExecutor _executor) private {
        if (address(_executor) == address(0)) revert ZeroAddress("_executor");
        slashingExecutor = _executor;
        emit SlashingExecutorChanged(address(_executor));
    }

    function _setStakingParametersManager(FortaStakingParameters _stakingParameters) private {
        if (address(_stakingParameters) == address(0)) revert ZeroAddress("_stakingParameters");
        stakingParameters = _stakingParameters;
        emit StakingParametersManagerChanged(address(_stakingParameters));
    }

    function _setDepositAmount(uint256 _amount) private {
        if (_amount == 0) revert ZeroAmount("_amount");
        depositAmount = _amount;
        emit DepositAmountChanged(depositAmount);
    }


    function _setTreasury(address _treasury) private {
        if (_treasury == address(0)) revert ZeroAddress("_treasury");
        treasury = _treasury;
        emit TreasuryChanged(_treasury);
    }

    function _setSlashPenalties(bytes32[] calldata _slashReasons, SlashPenalty[] calldata _slashPenalties) private {
        uint256 length = _slashReasons.length;
        if (length != _slashPenalties.length) revert DifferentLenghtArray("_slashReasons", "_slashPenalties");
        for (uint256 i = 0; i < length; i++) {
            if (penalties[_slashReasons[i]].mode != PenaltyMode.UNDEFINED) {
                emit SlashPenaltyRemoved(_slashReasons[i], penalties[_slashReasons[i]].percentSlashed, penalties[_slashReasons[i]].mode);
            }
            penalties[_slashReasons[i]] = _slashPenalties[i];
            emit SlashPenaltyAdded(_slashReasons[i], _slashPenalties[i].percentSlashed, _slashPenalties[i].mode);
        }
    }

    function _returnDeposit(uint256 _proposalId) private {
        SafeERC20.safeTransfer(depositToken, proposals[_proposalId].proposer, deposits[_proposalId]);
        deposits[_proposalId] = 0;
        emit DepositReturned(proposals[_proposalId].proposer, deposits[_proposalId]);
    }

    function _slashDeposit(uint256 _proposalId) private {
        SafeERC20.safeTransfer(depositToken, treasury, deposits[_proposalId]);
        deposits[_proposalId] = 0;
        emit DepositSlashed(proposals[_proposalId].proposer, deposits[_proposalId]);
    }
}
