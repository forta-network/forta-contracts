// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-protocol/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "../stake_subjects/StakeSubjectGateway.sol";
import "../FortaStakingUtils.sol";
import "../../../tools/Distributions.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/Timers.sol";
import "./Accumulators.sol";
import "./IRewardsDistributor.sol";

contract RewardsDistributor is BaseComponentUpgradeable, SubjectTypeValidator, IRewardsDistributor {
    
    using Timers for Timers.Timestamp;
    using Accumulators for Accumulators.Accumulator;
    using Distributions for Distributions.Balances;

    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    IERC20 public immutable rewardsToken;

    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    StakeSubjectGateway private immutable _subjectGateway;

    string public constant version = "0.1.0";
    uint256 public constant DEFAULT_COMISSION_PERCENT = 0 ;// 5;

    struct DelegatedAccStake {
        Accumulators.Accumulator delegated;
        Accumulators.Accumulator delegators;
        Accumulators.Accumulator delegatorsTotal;
        mapping(address => Accumulators.Accumulator) delegatorsPortions;
    }
    // delegated share id => DelegatedAccStake
    mapping(uint256 => DelegatedAccStake) private _accStakes;
    // share => epoch => amount
    mapping (uint256 => mapping(uint256 => uint256)) private _rewardsPerEpoch;
    // share => epoch => address => claimed
    mapping (uint256 => mapping(uint256 => mapping(address => bool))) private _claimedRewardsPerEpoch;

    // activeSubjectId => percent
    mapping(uint256 => uint256) public delegatorCommision;
    // activeSubjectId => percent
    mapping(uint256 => Timers.Timestamp) private _delegationParamsTimers;
    uint64 public delegationParamsDelay;

    event Rewarded(uint8 indexed subjectType, uint256 indexed subject, uint32 blockNumber, uint256 value);
    //event ClaimedRewards(uint8 indexed subjectType, uint256 indexed subject, address indexed to, uint256 value);
    event DelegationParamsDelaySet(uint64 delay);

    error RewardingNonRegisteredSubject(uint8 subjectType, uint256 subject);
    error SetComissionNotReady();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(
        address _forwarder,
        address _rewardsToken,
        address __subjectGateway
    ) initializer ForwardedContext(_forwarder) {
        if (_rewardsToken == address(0)) revert ZeroAddress("_rewardsToken");
        if (__subjectGateway == address(0)) revert ZeroAddress("__subjectGateway");
        rewardsToken = IERC20(_rewardsToken);
        _subjectGateway = StakeSubjectGateway(__subjectGateway);
    }

    function initialize(address _manager, uint64 _delegationParamsDelay) public initializer {
        __BaseComponentUpgradeable_init(_manager);

        if (_delegationParamsDelay == 0) revert ZeroAmount("_delegationParamsDelay");
        delegationParamsDelay = _delegationParamsDelay;
        emit DelegationParamsDelaySet(_delegationParamsDelay);
    }

    function didAddStake(uint256 shareId, uint256 amount, address staker) onlyRole(ALLOCATOR_CONTRACT_ROLE) external {
        DelegatedAccStake storage s = _accStakes[shareId];
        uint8 subjectType = FortaStakingUtils.subjectTypeOfShares(shareId);
        bool delegated = getSubjectTypeAgency(subjectType) == SubjectStakeAgency.DELEGATED;
        if (delegated) {
            s.delegated.addRate(amount);
        } else {
            s.delegators.addRate(amount);

            // This doesn't make sense.
            s.delegatorsTotal.addRate(amount);
            s.delegatorsPortions[staker].addRate(amount);
        }
    }

    function didRemoveStake(uint256 shareId, uint256 amount, address staker) onlyRole(ALLOCATOR_CONTRACT_ROLE) external {
        DelegatedAccStake storage delAccStake = _accStakes[shareId];
        // delAccStake.stakers[staker].subRate(amount);
        // delAccStake.total.subRate(amount);
    }

    function reward(uint8 subjectType, uint256 subjectId, uint256 amount, uint256 epochNumber) onlyRole(REWARDER_ROLE) external {
        if (subjectType != NODE_RUNNER_SUBJECT) revert InvalidSubjectType(subjectType);
        if (!_subjectGateway.isRegistered(subjectType, subjectId)) revert RewardingNonRegisteredSubject(subjectType, subjectId);
        uint256 shareId = FortaStakingUtils.subjectToActive(subjectType, subjectId);
        _rewardsPerEpoch[shareId][epochNumber] = amount;
    }

    function availableReward(uint8 subjectType, uint256 subjectId, uint256 epochNumber, address staker) public view returns (uint256) {
        // TODO: comission
        // TODO: if subjectType is node runner, check staker is owner of nft

        bool delegator = getSubjectTypeAgency(subjectType) == SubjectStakeAgency.DELEGATOR;

        uint256 shareId = delegator
            ? FortaStakingUtils.subjectToActive(getDelegatedSubjectType(subjectType), subjectId)
            : FortaStakingUtils.subjectToActive(subjectType, subjectId);

        if (_claimedRewardsPerEpoch[shareId][epochNumber][staker]) {
            return 0;
        }

        DelegatedAccStake storage s = _accStakes[shareId];

        uint256 N = s.delegated.getValueAtEpoch(epochNumber);
        uint256 D = s.delegators.getValueAtEpoch(epochNumber);
        uint256 T = N + D;

        uint256 A = delegator ? D : N;
        uint256 R = _rewardsPerEpoch[shareId][epochNumber];
        uint256 r = Math.mulDiv(R, A, T);

        if (delegator) {
            uint256 d = s.delegatorsPortions[staker].getValueAtEpoch(epochNumber);
            uint256 DT = s.delegatorsTotal.getValueAtEpoch(epochNumber);
            r = Math.mulDiv(r, d, DT);
        }

        return r;
    }

    // array de epochNumber
    function claimRewards(uint8 subjectType, uint256 subjectId, uint256 epochNumber) external {
        uint256 epochRewards = availableReward(subjectType, subjectId, epochNumber, _msgSender());
        uint256 shareId;
        if (subjectType == NODE_RUNNER_SUBJECT) {
            shareId = FortaStakingUtils.subjectToActive(subjectType, subjectId);
        } else if (subjectType ==  DELEGATOR_NODE_RUNNER_SUBJECT) {
            shareId = FortaStakingUtils.subjectToActive(getDelegatedSubjectType(subjectType), subjectId);
        }
        _claimedRewardsPerEpoch[shareId][epochNumber][_msgSender()] = true;
        SafeERC20.safeTransfer(rewardsToken, _msgSender(), epochRewards);
    }

    function setCommission(
        uint8 subjectType,
        uint256 subject,
        uint256 comissionPercent
    ) external onlyAgencyType(subjectType, SubjectStakeAgency.DELEGATED) {
        if (_subjectGateway.ownerOf(subjectType, subject) != _msgSender()) revert SenderNotOwner(_msgSender(), subject);
        // only owner only subject type delegated
        uint256 shareId = FortaStakingUtils.subjectToActive(subjectType, subject);
        Timers.Timestamp storage timer = _delegationParamsTimers[shareId];

        if (!timer.isExpired()) revert SetComissionNotReady();

        delegatorCommision[FortaStakingUtils.subjectToActive(subjectType, subject)] = comissionPercent;
        uint64 deadline = SafeCast.toUint64(block.timestamp) + delegationParamsDelay;
        timer.setDeadline(deadline);
    }

    function setDelegationsParamDelay(uint64 newDelay) external onlyRole(STAKING_ADMIN_ROLE) {
        if (newDelay == 0) revert ZeroAmount("newDelay");
        delegationParamsDelay = newDelay;
        emit DelegationParamsDelaySet(newDelay);
    }

    function getEpochNumber() external view returns(uint256) {
        return EpochCheckpoints.getEpochNumber();
    }

    // TODO: function sweep
}
