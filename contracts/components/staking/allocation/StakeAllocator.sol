// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "./IStakeAllocator.sol";
import "../SubjectTypeValidator.sol";
import "../FortaStakingUtils.sol";
import "../rewards/IRewardsDistributor.sol";
import "../stake_subjects/IStakeSubjectGateway.sol";
import "../../BaseComponentUpgradeable.sol";
import "../../../tools/Distributions.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

/**
 * This contract also manages the allocation of stake. See SubjectTypeValidator.sol for in depth explanation of Subject Agency
 *
 * Stake constants:
 * totalStake = activeStake + inactiveStake
 * activeStake(delegated) = allocatedStake(delegated) + unallocatedStake(delegated)
 * activeStake(delegator) = allocatedStake(delegator) + unallocatedStake(delegator)
 * allocatedStake(managed) = (allocatedStake(delegated) + allocatedStake(delegator)) / totalManagedSubjects(delegated)
 * activeStake(managed) = inactiveStake(managed) = 0;
 *
 */
contract StakeAllocator is BaseComponentUpgradeable, SubjectTypeValidator, IStakeAllocator {
    using Distributions for Distributions.Balances;

    string public constant version = "0.1.0";
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    IStakeSubjectGateway private immutable _subjectGateway;

    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    IRewardsDistributor public immutable rewardsDistributor;

    // subject => active stake
    Distributions.Balances private _allocatedStake;
    // subject => inactive stake
    Distributions.Balances private _unallocatedStake;

    event AllocatedStake(uint8 indexed subjectType, uint256 indexed subject, bool increase, uint256 amount, uint256 totalAllocated);
    event UnallocatedStake(uint8 indexed subjectType, uint256 indexed subject, bool increase, uint256 amount, uint256 totalAllocated);

    error SenderCannotAllocateFor(uint8 subjectType, uint256 subject);
    error CannotDelegateStakeUnderMin(uint8 subjectType, uint256 subject);
    error CannotDelegateNoEnabledSubjects(uint8 subjectType, uint256 subject);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address _forwarder, address __subjectGateway, address _rewardsDistributor) initializer ForwardedContext(_forwarder) {
        if (__subjectGateway == address(0)) revert ZeroAddress("__subjectGateway");
        if (_rewardsDistributor == address(0)) revert ZeroAddress("_rewardsDistributor");
        _subjectGateway = IStakeSubjectGateway(__subjectGateway);
        rewardsDistributor = IRewardsDistributor(_rewardsDistributor);
    }

    /**
     * @notice Initializer method, access point to initialize inheritance tree.
     * @param __manager address of AccessManager.
     */
    function initialize(address __manager) public initializer {
        __BaseComponentUpgradeable_init(__manager);
    }

    /************* External Views *************/

    /// Active stake allocated on subject
    function allocatedStakeFor(uint8 subjectType, uint256 subject) public view returns (uint256) {
        return _allocatedStake.balanceOf(FortaStakingUtils.subjectToActive(subjectType, subject));
    }

    /// Total allocated stake in all managed subjects, both from delegated and delegator. Only returns values from
    /// DELEGATED types, else 0.
    function allocatedManagedStake(uint8 subjectType, uint256 subject) public view returns (uint256) {
        if (getSubjectTypeAgency(subjectType) == SubjectStakeAgency.DELEGATED) {
            return
                _allocatedStake.balanceOf(FortaStakingUtils.subjectToActive(subjectType, subject)) +
                _allocatedStake.balanceOf(FortaStakingUtils.subjectToActive(getDelegatorSubjectType(subjectType), subject));
        }
        return 0;
    }
    

    /// Returns allocatedManagedStake (own + delegator's) in DELEGATED / total managed subjects, or 0 if not DELEGATED
    function allocatedStakePerManaged(uint8 subjectType, uint256 subject) external view returns (uint256) {
        if (getSubjectTypeAgency(subjectType) != SubjectStakeAgency.DELEGATED || _subjectGateway.totalManagedSubjects(subjectType, subject) == 0) {
            return 0;
        }
        return allocatedManagedStake(subjectType, subject) / _subjectGateway.totalManagedSubjects(subjectType, subject);
    }

    /// Returns allocatedManagedStake (own only) in DELEGATED / total managed subjects, or 0 if not DELEGATED
    function allocatedOwnStakePerManaged(uint8 subjectType, uint256 subject) public view returns (uint256) {
        if (getSubjectTypeAgency(subjectType) != SubjectStakeAgency.DELEGATED) {
            return 0;
        }
        return allocatedStakeFor(subjectType, subject) / _subjectGateway.totalManagedSubjects(subjectType, subject);
    }

    /// Returns allocatedManagedStake (delegators only) in DELEGATED / total managed subjects, or 0 if not DELEGATED
    function allocatedDelegatorsStakePerManaged(uint8 subjectType, uint256 subject) public view returns (uint256) {
        if (getSubjectTypeAgency(subjectType) != SubjectStakeAgency.DELEGATED) {
            return 0;
        }
        return allocatedStakeFor(getDelegatorSubjectType(subjectType), subject) / _subjectGateway.totalManagedSubjects(subjectType, subject);
    }

    /// Total active stake not allocated on subjects
    function unallocatedStakeFor(uint8 subjectType, uint256 subject) external view returns (uint256) {
        return _unallocatedStake.balanceOf(FortaStakingUtils.subjectToActive(subjectType, subject));
    }

    /************* Manual allocations *************/

    /**
     * @notice owner of a DELEGATED subject moves tokens from its own unallocated to allocated.
     * It will fail if allocating more than the max for managed stake.
     * @param subjectType type id of Stake Subject. See SubjectTypeValidator.sol
     * @param subject id identifying subject (external to FortaStaking).
     * @param amount amount of stake to move from unallocated to allocated.
     */
    function allocateOwnStake(
        uint8 subjectType,
        uint256 subject,
        uint256 amount
    ) external onlyAgencyType(subjectType, SubjectStakeAgency.DELEGATED) {
        if (!_subjectGateway.canManageAllocation(subjectType, subject, _msgSender())) revert SenderCannotAllocateFor(subjectType, subject);
        _allocateStake(subjectType, subject, _msgSender(), amount);
    }

    /**
     * @notice owner of a DELEGATED subject moves it's own tokens from allocated to unallocated.
     * @param subjectType type id of Stake Subject. See SubjectTypeValidator.sol
     * @param subject id identifying subject (external to FortaStaking).
     * @param amount amount of incoming staked token.
     */
    function unallocateOwnStake(
        uint8 subjectType,
        uint256 subject,
        uint256 amount
    ) external onlyAgencyType(subjectType, SubjectStakeAgency.DELEGATED) {
        if (!_subjectGateway.canManageAllocation(subjectType, subject, _msgSender())) revert SenderCannotAllocateFor(subjectType, subject);
        _unallocateStake(subjectType, subject, amount);
    }

    /**
     * @notice owner of a DELEGATED subject moves tokens from DELEGATOR's unallocated to allocated.
     * It will fail if allocating more than the max for managed stake.
     * @param subjectType type id of Stake Subject. See SubjectTypeValidator.sol
     * @param subject id identifying subject (external to FortaStaking).
     * @param amount amount of stake to move from unallocated to allocated.
     */
    function allocateDelegatorStake(
        uint8 subjectType,
        uint256 subject,
        uint256 amount
    ) external onlyAgencyType(subjectType, SubjectStakeAgency.DELEGATED) {
        if (!_subjectGateway.canManageAllocation(subjectType, subject, _msgSender())) revert SenderCannotAllocateFor(subjectType, subject);
        _allocateStake(getDelegatorSubjectType(subjectType), subject, _msgSender(), amount);
    }

    /**
     * @notice owner of a DELEGATED subject moves it's own tokens from allocated to unallocated.
     * @param subjectType type id of Stake Subject. See SubjectTypeValidator.sol
     * @param subject id identifying subject (external to FortaStaking).
     * @param amount amount of staked token.
     */
    function unallocateDelegatorStake(
        uint8 subjectType,
        uint256 subject,
        uint256 amount
    ) external onlyAgencyType(subjectType, SubjectStakeAgency.DELEGATED) {
        if (!_subjectGateway.canManageAllocation(subjectType, subject, _msgSender())) revert SenderCannotAllocateFor(subjectType, subject);
        _unallocateStake(getDelegatorSubjectType(subjectType), subject, amount);
    }

    /**
     * @notice moves tokens from unallocatedStake to allocatedStake if possible.
     * @param subjectType type id of Stake Subject. See SubjectTypeValidator.sol
     * @param subject id identifying subject (external to FortaStaking).
     * @param allocator allocator.
     * @param amount amount of staked token.
     */
    function _allocateStake(
        uint8 subjectType,
        uint256 subject,
        address allocator,
        uint256 amount
    ) private {
        uint256 activeSharesId = FortaStakingUtils.subjectToActive(subjectType, subject);
        if (_unallocatedStake.balanceOf(activeSharesId) < amount) revert AmountTooLarge(amount, _unallocatedStake.balanceOf(activeSharesId));
        (int256 extra, uint256 max) = _allocationIncreaseChecks(subjectType, subject, getSubjectTypeAgency(subjectType), allocator, amount);
        if (extra > 0) revert AmountTooLarge(amount, max);
        _allocatedStake.mint(activeSharesId, amount);
        _unallocatedStake.burn(activeSharesId, amount);
        rewardsDistributor.didAllocate(subjectType, subject, amount, 0, address(0));
        emit AllocatedStake(subjectType, subject, true, amount, _allocatedStake.balanceOf(activeSharesId));
        emit UnallocatedStake(subjectType, subject, false, amount, _unallocatedStake.balanceOf(activeSharesId));
    }

    /**
     * @notice moves tokens from allocatedStake to unallocatedStake if possible.
     * @param subjectType type id of Stake Subject. See SubjectTypeValidator.sol
     * @param subject id identifying subject (external to FortaStaking).
     * @param amount amount of staked token.
     */
    function _unallocateStake(
        uint8 subjectType,
        uint256 subject,
        uint256 amount
    ) private {
        uint256 activeSharesId = FortaStakingUtils.subjectToActive(subjectType, subject);
        if (_allocatedStake.balanceOf(activeSharesId) < amount) revert AmountTooLarge(amount, _allocatedStake.balanceOf(activeSharesId));

        _allocatedStake.burn(activeSharesId, amount);
        _unallocatedStake.mint(activeSharesId, amount);
        rewardsDistributor.didUnallocate(subjectType, subject, amount, 0, address(0));

        emit AllocatedStake(subjectType, subject, false, amount, _allocatedStake.balanceOf(activeSharesId));
        emit UnallocatedStake(subjectType, subject, true, amount, _unallocatedStake.balanceOf(activeSharesId));
    }

    /************* When incrementing/decrementing activeStake (IStakeAllocator) *************/

    /**
     * @notice Allocates stake on deposit (increment of activeStake) for a DELEGATED subject incrementing it's allocatedStake.
     * If allocatedStake is going to be over the max
     * for the corresponding MANAGED subject, the excess increments unallocatedStake.
     * @param activeSharesId ERC1155 id representing the active shares of a subject / subjectType pair.
     * @param subjectType type id of Stake Subject. See SubjectTypeValidator.sol
     * @param subject id identifying subject (external to FortaStaking).
     * @param stakeAmount amount of incoming staked token.
     * @param sharesAmount amount of minted active shares for stake
     */
    function depositAllocation(
        uint256 activeSharesId,
        uint8 subjectType,
        uint256 subject,
        address allocator,
        uint256 stakeAmount,
        uint256 sharesAmount
    ) external override onlyRole(STAKING_CONTRACT_ROLE) {
        SubjectStakeAgency agency = getSubjectTypeAgency(subjectType);
        if (agency != SubjectStakeAgency.DELEGATED && agency != SubjectStakeAgency.DELEGATOR) {
            return;
        }

        (int256 extra, ) = _allocationIncreaseChecks(subjectType, subject, agency, allocator, stakeAmount);
        if (extra > 0) {
            _allocatedStake.mint(activeSharesId, stakeAmount - uint256(extra));
            rewardsDistributor.didAllocate(subjectType, subject, stakeAmount - uint256(extra), sharesAmount, allocator);
            emit AllocatedStake(subjectType, subject, true, stakeAmount - uint256(extra), _allocatedStake.balanceOf(activeSharesId));
            _unallocatedStake.mint(activeSharesId, uint256(extra));
            emit UnallocatedStake(subjectType, subject, true, uint256(extra), _unallocatedStake.balanceOf(activeSharesId));
        } else {
            _allocatedStake.mint(activeSharesId, stakeAmount);
            rewardsDistributor.didAllocate(subjectType, subject, stakeAmount, sharesAmount, allocator);
            emit AllocatedStake(subjectType, subject, true, stakeAmount, _allocatedStake.balanceOf(activeSharesId));
        }

    }

    /**
     * @notice method to call when substracting activeStake. Will burn unallocatedStake (and allocatedStake if amount is bigger than unallocatedStake).
     * If withdrawal leads to DELEGATED to be below staking minimum, unallocates delegators' stake.
     * @param activeSharesId ERC1155 id representing the active shares of a subject / subjectType pair.
     * @param subjectType type id of Stake Subject. See SubjectTypeValidator.sol
     * @param subject id identifying subject (external to FortaStaking).
     * @param stakeAmount amount of outgoing staked token.
     * @param sharesAmount amount of outgoing active shares
     */
    function withdrawAllocation(
        uint256 activeSharesId,
        uint8 subjectType,
        uint256 subject,
        address allocator,
        uint256 stakeAmount,
        uint256 sharesAmount
    ) external onlyRole(STAKING_CONTRACT_ROLE) {
        uint256 oldUnallocated = _unallocatedStake.balanceOf(activeSharesId);
        int256 fromAllocated = int256(stakeAmount) - int256(oldUnallocated);
        if (fromAllocated > 0) {
            _allocatedStake.burn(activeSharesId, uint256(fromAllocated));
            rewardsDistributor.didUnallocate(subjectType, subject, uint256(fromAllocated), sharesAmount, allocator);
            emit AllocatedStake(subjectType, subject, false, uint256(fromAllocated), _allocatedStake.balanceOf(activeSharesId));
            _unallocatedStake.burn(activeSharesId, _unallocatedStake.balanceOf(activeSharesId));
            emit UnallocatedStake(subjectType, subject, false, oldUnallocated, 0);
        } else {
            _unallocatedStake.burn(activeSharesId, stakeAmount);
            rewardsDistributor.didUnallocate(subjectType, subject, 0, sharesAmount, allocator);
            emit UnallocatedStake(subjectType, subject, false, stakeAmount, _unallocatedStake.balanceOf(activeSharesId));
        }

        if (getSubjectTypeAgency(subjectType) == SubjectStakeAgency.DELEGATED) {
            uint256 managedSubjects = _subjectGateway.totalManagedSubjects(subjectType, subject);
            if (_delegatedSubjectStakeIsLessThanMinimum(subjectType, subject, managedSubjects)) {
                uint8 delegatorSubjectType = getDelegatorSubjectType(subjectType);
                uint256 delegatorAllocatedStake = allocatedStakeFor(delegatorSubjectType, subject);
                if (delegatorAllocatedStake > 0) {
                    _unallocateStake(delegatorSubjectType, subject, delegatorAllocatedStake);
                }
            }
        }
    }


    /**
     * @notice Checks if:
     *  - incoming allocation will go over managed subject stakeThreshold.max
     *  - if DELEGATED, reverts if sender is not the owner of the relevant registry,.
     *  - if DELEGATOR, reverts if DELEGATED has not staked over stakeThreshold.min of managed subject.
     * @param subjectType type id of Stake Subject. See SubjectTypeValidator.sol
     * @param subject id identifying subject (external to FortaStaking).
     * @param agency of the subjectType
     * @param amount of tokens to be allocated.
     * @return extra amount of tokens over the managed stakeThreshold.max
     * @return max stakeThreshold.max / totalManagedSubjects
     */
    function _allocationIncreaseChecks(
        uint8 subjectType,
        uint256 subject,
        SubjectStakeAgency agency,
        address allocator,
        uint256 amount
    ) private view returns (int256 extra, uint256 max) {
        uint256 subjects = 0;
        uint256 maxPerManaged = 0;
        uint256 currentlyAllocated = 0;
        if (agency == SubjectStakeAgency.DELEGATED) {
            // i.e ScannerPoolRegistry
            if (!_subjectGateway.canManageAllocation(subjectType, subject, allocator)) revert SenderCannotAllocateFor(subjectType, subject);

            subjects = _subjectGateway.totalManagedSubjects(subjectType, subject);
            maxPerManaged = _subjectGateway.maxManagedStakeFor(subjectType, subject);
            currentlyAllocated = allocatedManagedStake(subjectType, subject);
        } else if (agency == SubjectStakeAgency.DELEGATOR) {
            // i.e Delegator to ScannerPoolRegistry
            uint8 delegatedSubjectType = getDelegatedSubjectType(subjectType);
            subjects = _subjectGateway.totalManagedSubjects(delegatedSubjectType, subject);
            if (subjects == 0) {
                revert CannotDelegateNoEnabledSubjects(delegatedSubjectType, subject);
            }
            maxPerManaged = _subjectGateway.maxManagedStakeFor(delegatedSubjectType, subject);
            
            // If DELEGATED has staked less than minimum stake, revert cause delegation not unlocked
            if (
                _delegatedSubjectStakeIsLessThanMinimum(delegatedSubjectType, subject, subjects)
            ) {
                revert CannotDelegateStakeUnderMin(delegatedSubjectType, subject);
            }
            currentlyAllocated = allocatedManagedStake(delegatedSubjectType, subject);
        }

        return (int256(currentlyAllocated + amount) - int256(maxPerManaged * subjects), maxPerManaged * subjects);
    }

    /**
     * @notice Checks if DELEGATED has not staked over stakeThreshold.min of managed subject.
     * @param delegatedSubjectType type id of DELEGATED Stake Subject. See SubjectTypeValidator.sol
     * @param subject id identifying subject (external to FortaStaking).
     * @param managedSubjects total amount of managed subjects
     * @return isLess than minimum
     */
    function _delegatedSubjectStakeIsLessThanMinimum(uint8 delegatedSubjectType, uint256 subject, uint256 managedSubjects) private view returns (bool isLess) {
        if (managedSubjects == 0) {
            return false;
        }
        return allocatedStakeFor(delegatedSubjectType, subject) / managedSubjects <
            _subjectGateway.minManagedStakeFor(delegatedSubjectType, subject);
    }

    function didTransferShares(
        uint256 sharesId,
        uint8 subjectType,
        address from,
        address to,
        uint256 sharesAmount
    ) external onlyRole(STAKING_CONTRACT_ROLE) {
        rewardsDistributor.didTransferShares(sharesId, subjectType, from, to, sharesAmount);
    }
}
