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

    IERC20 public immutable rewardsToken;
    StakeSubjectGateway private immutable _subjectGateway;

    string public constant version = "0.1.0";
    uint256 public constant DEFAULT_COMISSION_PERCENT = 5;

    struct DelegatedAccStake {
        Accumulators.Accumulator total;
        Accumulators.Accumulator delegated;
        Accumulators.Accumulator totalDelegators;
        mapping(address => Accumulators.Accumulator) delegators;
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

    function initialize(uint64 _delegationParamsDelay) public initializer {
        if (_delegationParamsDelay == 0) revert ZeroAmount("_delegationParamsDelay");
        delegationParamsDelay = _delegationParamsDelay;
        emit DelegationParamsDelaySet(_delegationParamsDelay);
    }

    function didAddStake(uint256 shareId, uint256 amount, address staker) onlyRole(STAKING_CONTRACT) external {
        DelegatedAccStake storage delAccStake = _accStakes[shareId];
        uint8 subjectType = FortaStakingUtils.subjectTypeOfShares(shareId);
        delAccStake.stakers[staker].addRate(amount);
        delAccStake.total.addRate(amount);
    }

    function didRemoveStake(uint256 shareId, uint256 amount, address staker) onlyRole(STAKING_CONTRACT) external {
        DelegatedAccStake storage delAccStake = _accStakes[shareId];
        delAccStake.stakers[staker].subRate(amount);
        delAccStake.total.subRate(amount);
    }

    function reward(uint8 subjectType, uint256 subjectId, uint256 amount, uint256 epochNumber) onlyRole(REWARDER) external {
        if (subjectType != NODE_RUNNER_SUBJECT) revert InvalidSubjectType(subjectType);
        if (!_subjectGateway.isRegistered(subjectType, subjectId)) revert RewardingNonRegisteredSubject(subjectType, subjectId);
        uint256 shareId = FortaStakingUtils.subjectToActive(subjectType, subjectId);
        _rewardsPerEpoch[shareId][epochNumber] = amount;
    }

    function availableReward(uint8 subjectType, uint256 subjectId, uint256 epochNumber, address staker) public view returns (uint256) {
        // ignoring comission by now
        uint256 shareId;
        if (subjectType == NODE_RUNNER_SUBJECT) {
            shareId = FortaStakingUtils.subjectToActive(subjectType, subjectId);
        } else if (subjectType ==  DELEGATOR_NODE_RUNNER_SUBJECT) {
            shareId = FortaStakingUtils.subjectToActive(getDelegatedSubjectType(subjectType), subjectId);
        }
        if (_claimedRewardsPerEpoch[shareId][epochNumber][staker]) {
            return 0;
        }
        Accumulators.Accumulator storage acc = _accStakes[shareId].stakers[staker];

        return Math.mulDiv(
            _rewardsPerEpoch[shareId][epochNumber], // R
            acc.getAtEpoch(epochNumber), // A,
            _accStakes[shareId].total.getAtEpoch(epochNumber)// T
        );
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
}