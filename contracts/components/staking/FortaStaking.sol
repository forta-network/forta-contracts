// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/interfaces/draft-IERC2612.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "@openzeppelin/contracts/utils/Timers.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155SupplyUpgradeable.sol";

import "./IStakeMigrator.sol";
import "./FortaStakingUtils.sol";
import "./SubjectTypeValidator.sol";
import "./allocation/IStakeAllocator.sol";
import "./stake_subjects/IStakeSubjectGateway.sol";
import "./slashing/ISlashingExecutor.sol";
import "../BaseComponentUpgradeable.sol";
import "../../tools/Distributions.sol";
import "../utils/ReentrancyGuardHandler.sol";

/**
 * @dev This is a generic staking contract for the Forta platform. It allows any account to deposit ERC20 tokens to
 * delegate their "power" by staking on behalf of a particular subject. The subject can be scanner, or any other actor
 * in the Forta ecosystem, who need to lock assets in order to contribute to the system.
 *
 * Stakers take risks with their funds, as bad action from a subject can lead to slashing of the funds. In the
 * meantime, stakers are elligible for rewards. Rewards distributed to a particular subject's stakers are distributed
 * following to each staker's share in the subject.
 *
 * Stakers can withdraw their funds, following a withdrawal delay. During the withdrawal delay, funds are no longer
 * counting toward the active stake of a subject, but are still slashable.
 *
 * The SLASHER_ROLE should be given to a smart contract that will be in charge of handling the slashing proposal process.
 *
 * Stakers receive ERC1155 shares in exchange for their stake, making the active stake transferable. When a withdrawal
 * is initiated, similarly the ERC1155 tokens representing the (transferable) active shares are burned in exchange for
 * non-transferable ERC1155 tokens representing the inactive shares.
 *
 * ERC1155 shares representing active stake are transferable, and can be used in an AMM. Their value is however subject
 * to quick devaluation in case of slashing event for the corresponding subject. Thus, trading of such shares should be
 * be done very carefully.
 *
 * WARNING: To stake from another smart contract (smart contract wallets included), it must be fully ERC1155 compatible,
 * implementing ERC1155Receiver. If not, minting of active and inactive shares will fail.
 * Do not deposit on the constructor if you don't implement ERC1155Receiver. During the construction, the minting will
 * succeed but you will not be able to withdraw or mint new shares from the contract. If this happens, transfer your
 * shares to an EOA or fully ERC1155 compatible contract.
 */
contract FortaStaking is BaseComponentUpgradeable, ERC1155SupplyUpgradeable, SubjectTypeValidator, ISlashingExecutor, IStakeMigrator, ReentrancyGuardHandlerUpgradeable {
    using Distributions for Distributions.Balances;
    using Distributions for Distributions.SignedBalances;
    using Timers for Timers.Timestamp;
    using ERC165Checker for address;

    // NOTE: do not set as immutable. Previous versions were deployed, and setting as immutable would
    // generate an incopatible storage layout for new versions, risking storage layout collisions.
    IERC20 public stakedToken;

    // subject => active stake
    Distributions.Balances private _activeStake;
    // subject => inactive stake
    Distributions.Balances private _inactiveStake;
    // subject => staker => inactive stake timer
    mapping(uint256 => mapping(address => Timers.Timestamp)) private _lockingDelay;

    // subject => reward
    Distributions.Balances private _rewards;
    // subject => staker => released reward
    mapping(uint256 => Distributions.SignedBalances) private _released;

    /// @custom:oz-renamed-from _frozen
    mapping(uint256 => bool) private _deprecated_frozen;
    uint64 private _withdrawalDelay;

    // treasury for slashing
    address private _treasury;
    /// @custom:oz-retyped-from IStakeController
    /// @custom:oz-renamed-from _stakingParameters
    IStakeSubjectGateway public subjectGateway;

    uint256 public slashDelegatorsPercent;
    IStakeAllocator public allocator;
    mapping(uint256 => uint256) public openProposals; // activeShareId --> counter

    uint256 _reentrancyStatus;

    uint256 public constant MIN_WITHDRAWAL_DELAY = 1 days;
    uint256 public constant MAX_WITHDRAWAL_DELAY = 90 days;
    uint256 public constant MAX_SLASHABLE_PERCENT = 90;
    uint256 private constant HUNDRED_PERCENT = 100;

    event StakeDeposited(uint8 indexed subjectType, uint256 indexed subject, address indexed account, uint256 amount);
    event WithdrawalInitiated(uint8 indexed subjectType, uint256 indexed subject, address indexed account, uint64 deadline);
    event WithdrawalExecuted(uint8 indexed subjectType, uint256 indexed subject, address indexed account);
    event Froze(uint8 indexed subjectType, uint256 indexed subject, address indexed by, bool isFrozen);
    event Slashed(uint8 indexed subjectType, uint256 indexed subject, address indexed by, uint256 value);
    event SlashedShareSent(uint8 indexed subjectType, uint256 indexed subject, address indexed by, uint256 value);
    event DelaySet(uint256 newWithdrawalDelay);
    event TreasurySet(address newTreasury);
    event StakeHelpersConfigured(address indexed subjectGateway, address indexed allocator);
    event MaxStakeReached(uint8 indexed subjectType, uint256 indexed subject);
    event TokensSwept(address indexed token, address to, uint256 amount);
    event SlashDelegatorsPercentSet(uint256 percent);

    error WithdrawalNotReady();
    error SlashingOver90Percent();
    error WithdrawalSharesNotTransferible();
    error FrozenSubject();
    error NoActiveShares();
    error NoInactiveShares();
    error StakeInactiveOrSubjectNotFound();

    string public constant version = "0.1.2";

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address _forwarder) initializer ForwardedContext(_forwarder) {}

    /**
     * @notice Initializer method, access point to initialize inheritance tree.
     * @param __manager address of AccessManager.
     * @param __stakedToken ERC20 to be staked (FORT).
     * @param __withdrawalDelay cooldown period between withdrawal init and withdrawal (in seconds).
     * @param __treasury address where the slashed tokens go to.
     */
    function initialize(address __manager, IERC20 __stakedToken, uint64 __withdrawalDelay, address __treasury) public initializer {
        if (__treasury == address(0)) revert ZeroAddress("__treasury");
        if (address(__stakedToken) == address(0)) revert ZeroAddress("__stakedToken");
        __BaseComponentUpgradeable_init(__manager);
        __ERC1155_init("");
        __ERC1155Supply_init();
        _withdrawalDelay = __withdrawalDelay;
        _treasury = __treasury;
        stakedToken = IERC20(__stakedToken);
        emit DelaySet(__withdrawalDelay);
        emit TreasurySet(__treasury);
    }

    /**
     * Reinitializer to setup the reentrancy guard (introduced in v0.1.2)
     */
    function setReentrancyGuard() public reinitializer(2) {
        __ReentrancyGuard_init_unchained();
    }

    function _setStatus(uint256 newStatus) internal virtual override {
        _reentrancyStatus = newStatus;
    }

    function _getStatus() internal virtual override returns (uint256) {
        return _reentrancyStatus;
    }

    /// Returns treasury address (slashed tokens destination)
    function treasury() public view returns (address) {
        return _treasury;
    }

    /**
     * @notice Get stake of a subject (not marked for withdrawal).
     * @param subjectType type id of Stake Subject. See SubjectTypeValidator.sol
     * @param subject id identifying subject (external to FortaStaking).
     * @return amount of stakedToken actively staked on subject+subjectType.
     */
    function activeStakeFor(uint8 subjectType, uint256 subject) public view returns (uint256) {
        return _activeStake.balanceOf(FortaStakingUtils.subjectToActive(subjectType, subject));
    }

    /**
     * @notice Get total active stake of all subjects (not marked for withdrawal).
     * @return amount of stakedToken actively staked on all subject+subjectTypes.
     */
    function totalActiveStake() public view returns (uint256) {
        return _activeStake.totalSupply();
    }

    /**
     * @notice Get inactive stake of a subject (marked for withdrawal).
     * @param subjectType type id of Stake Subject. See SubjectTypeValidator.sol
     * @param subject id identifying subject (external to FortaStaking).
     * @return amount of stakedToken still staked on subject+subjectType but marked for withdrawal.
     */
    function inactiveStakeFor(uint8 subjectType, uint256 subject) external view returns (uint256) {
        return _inactiveStake.balanceOf(FortaStakingUtils.subjectToInactive(subjectType, subject));
    }

    /**
     * @notice Get total inactive stake of all subjects (marked for withdrawal).
     * @return amount of stakedToken still staked on all subject+subjectTypes but marked for withdrawal.
     */
    function totalInactiveStake() public view returns (uint256) {
        return _inactiveStake.totalSupply();
    }

    /**
     * @notice Get (active) shares of an account on a subject, corresponding to a fraction of the subject stake.
     * @dev This is equivalent to getting the ERC1155 balanceOf for keccak256(abi.encodePacked(subjectType, subject)),
     * shifted 9 bits, with the 9th bit set and uint8(subjectType) masked in
     * @param subjectType type id of Stake Subject. See SubjectTypeValidator.sol
     * @param subject id identifying subject (external to FortaStaking).
     * @param account holder of the ERC1155 staking shares.
     * @return amount of ERC1155 shares account is in possession in representing stake on subject+subjectType.
     */
    function sharesOf(uint8 subjectType, uint256 subject, address account) public view returns (uint256) {
        return balanceOf(account, FortaStakingUtils.subjectToActive(subjectType, subject));
    }

    /**
     * @notice Get the total (active) shares on a subject.
     * @dev This is equivalent to getting the ERC1155 totalSupply for keccak256(abi.encodePacked(subjectType, subject)),
     * shifted 9 bits, with the 9th bit set and uint8(subjectType) masked in
     * @param subjectType type id of Stake Subject. See SubjectTypeValidator.sol
     * @param subject id identifying subject (external to FortaStaking).
     * @return total ERC1155 shares representing stake on subject+subjectType.
     */
    function totalShares(uint8 subjectType, uint256 subject) external view returns (uint256) {
        return totalSupply(FortaStakingUtils.subjectToActive(subjectType, subject));
    }

    /**
     * @notice Get inactive shares of an account on a subject, corresponding to a fraction of the subject inactive stake.
     * @dev This is equivalent to getting the ERC1155 balanceOf for keccak256(abi.encodePacked(subjectType, subject)),
     * shifted 9 bits, with the 9th bit unset and uint8(subjectType) masked in.
     * @param subjectType type id of Stake Subject. See SubjectTypeValidator.sol
     * @param subject id identifying subject (external to FortaStaking).
     * @param account holder of the ERC1155 staking shares.
     * @return amount of ERC1155 shares account is in possession in representing inactive stake on subject+subjectType, marked for withdrawal.
     */
    function inactiveSharesOf(uint8 subjectType, uint256 subject, address account) external view returns (uint256) {
        return balanceOf(account, FortaStakingUtils.subjectToInactive(subjectType, subject));
    }

    /**
     * @notice Get the total inactive shares on a subject.
     * @dev This is equivalent to getting the ERC1155 totalSupply for keccak256(abi.encodePacked(subjectType, subject)),
     * shifted 9 bits, with the 9th bit unset and uint8(subjectType) masked in
     * @param subjectType type id of Stake Subject. See SubjectTypeValidator.sol
     * @param subject id identifying subject (external to FortaStaking).
     * @return total ERC1155 shares representing inactive stake on subject+subjectType, marked for withdrawal.
     */
    function totalInactiveShares(uint8 subjectType, uint256 subject) external view returns (uint256) {
        return totalSupply(FortaStakingUtils.subjectToInactive(subjectType, subject));
    }

    /**
     * @notice Checks if a subject frozen (stake of frozen subject cannot be withdrawn).
     * @param subjectType type id of Stake Subject. See SubjectTypeValidator.sol
     * @param subject id identifying subject (external to FortaStaking).
     * @return true if subject is frozen, false otherwise
     */
    function isFrozen(uint8 subjectType, uint256 subject) public view returns (bool) {
        uint256 sharesId = FortaStakingUtils.subjectToActive(subjectType, subject);
        return openProposals[sharesId] > 0 || _deprecated_frozen[sharesId];
    }

    /**
     * @notice Deposit `stakeValue` tokens for a given `subject`, and mint the corresponding active ERC1155 shares.
     * will return tokens staked over maximum for the subject.
     * If stakeValue would drive the stake over the maximum, only stakeValue - excess is transferred, but transaction will
     * not fail.
     * Reverts if max stake for subjectType not set, or subject not found.
     * @dev NOTE: Subject type is necessary because we can't infer subject ID uniqueness between scanners, agents, etc
     * Emits a ERC1155.TransferSingle event and StakeDeposited (to allow accounting per subject type)
     * Emits MaxStakeReached(subjectType, activeSharesId)
     * WARNING: To stake from another smart contract (smart contract wallets included), it must be fully ERC1155 compatible,
     * implementing ERC1155Receiver. If not, minting of active and inactive shares will fail.
     * Do not deposit on the constructor if you don't implement ERC1155Receiver. During the construction, the minting will
     * succeed but you will not be able to withdraw or mint new shares from the contract. If this happens, transfer your
     * shares to an EOA or fully ERC1155 compatible contract.
     * @param subjectType type id of Stake Subject. See SubjectTypeValidator.sol
     * @param subject id identifying subject (external to FortaStaking).
     * @param stakeValue amount of staked token.
     * @return amount of ERC1155 active shares minted.
     */
    function deposit(
        uint8 subjectType,
        uint256 subject,
        uint256 stakeValue
    ) external onlyValidSubjectType(subjectType) notAgencyType(subjectType, SubjectStakeAgency.MANAGED) nonReentrant returns (uint256) {
        if (address(subjectGateway) == address(0)) revert ZeroAddress("subjectGateway");
        if (!subjectGateway.isStakeActivatedFor(subjectType, subject)) revert StakeInactiveOrSubjectNotFound();
        address staker = _msgSender();
        uint256 activeSharesId = FortaStakingUtils.subjectToActive(subjectType, subject);
        bool reachedMax;
        (stakeValue, reachedMax) = _getInboundStake(subjectType, subject, stakeValue);
        if (reachedMax) {
            emit MaxStakeReached(subjectType, subject);
        }
        uint256 sharesValue = stakeToActiveShares(activeSharesId, stakeValue);
        SafeERC20.safeTransferFrom(stakedToken, staker, address(this), stakeValue);

        _activeStake.mint(activeSharesId, stakeValue);
        _mint(staker, activeSharesId, sharesValue, new bytes(0));
        emit StakeDeposited(subjectType, subject, staker, stakeValue);
        allocator.depositAllocation(activeSharesId, subjectType, subject, staker, stakeValue, sharesValue);
        return sharesValue;
    }

    /**
     * deposits active stake from SCANNER to SCANNER_POOL if not frozen. Inactive stake remains for withdrawal in old subject
     * Burns active stake and shares for old subject.
     * @dev No slash has been executed, so new SCANNER_POOL share proportions apply.
     */
    function migrate(
        uint8 oldSubjectType,
        uint256 oldSubject,
        uint8 newSubjectType,
        uint256 newSubject,
        address staker
    ) external onlyRole(SCANNER_2_SCANNER_POOL_MIGRATOR_ROLE) nonReentrant {
        if (oldSubjectType != SCANNER_SUBJECT) revert InvalidSubjectType(oldSubjectType);
        if (newSubjectType != SCANNER_POOL_SUBJECT) revert InvalidSubjectType(newSubjectType);
        if (isFrozen(oldSubjectType, oldSubject)) revert FrozenSubject();

        uint256 oldSharesId = FortaStakingUtils.subjectToActive(oldSubjectType, oldSubject);
        uint256 oldShares = balanceOf(staker, oldSharesId);
        uint256 stake = activeSharesToStake(oldSharesId, oldShares);
        uint256 newSharesId = FortaStakingUtils.subjectToActive(newSubjectType, newSubject);
        uint256 newShares = stakeToActiveShares(newSharesId, stake);

        _activeStake.burn(oldSharesId, stake);
        _activeStake.mint(newSharesId, stake);
        _burn(staker, oldSharesId, oldShares);
        _mint(staker, newSharesId, newShares, new bytes(0));
        emit StakeDeposited(newSubjectType, newSubject, staker, stake);
        allocator.depositAllocation(newSharesId, newSubjectType, newSubject, staker, stake, newShares);
    }

    /**
     * Calculates how much of the incoming stake fits for subject.
     * @param subjectType valid subect type
     * @param subject the id of the subject
     * @param stakeValue stake sent by staker
     * @return stakeValue - excess
     * @return true if reached max
     */
    function _getInboundStake(uint8 subjectType, uint256 subject, uint256 stakeValue) private view returns (uint256, bool) {
        uint256 max = subjectGateway.maxStakeFor(subjectType, subject);
        if (activeStakeFor(subjectType, subject) >= max) {
            return (0, true);
        } else {
            uint256 stakeLeft = max - activeStakeFor(subjectType, subject);
            return (
                Math.min(
                    stakeValue, // what the user wants to stake
                    stakeLeft // what is actually left
                ),
                activeStakeFor(subjectType, subject) + stakeValue >= max
            );
        }
    }

    /** @notice Starts the withdrawal process for an amount of shares. Burns active shares and mints inactive
     * shares (non transferrable). Stake will be available for withdraw() after _withdrawalDelay. If the
     * subject has not been slashed, the shares will correspond 1:1 with stake.
     * @dev Emits a WithdrawalInitiated event.
     * @param subjectType type id of Stake Subject. See SubjectTypeValidator.sol
     * @param subject id identifying subject (external to FortaStaking).
     * @param sharesValue amount of shares token.
     * @return amount of time until withdrawal is valid.
     */
    function initiateWithdrawal(uint8 subjectType, uint256 subject, uint256 sharesValue) external onlyValidSubjectType(subjectType) nonReentrant returns (uint64) {
        address staker = _msgSender();
        uint256 activeSharesId = FortaStakingUtils.subjectToActive(subjectType, subject);
        if (balanceOf(staker, activeSharesId) == 0) revert NoActiveShares();
        uint64 deadline = SafeCast.toUint64(block.timestamp) + _withdrawalDelay;

        _lockingDelay[activeSharesId][staker].setDeadline(deadline);

        uint256 activeShares = Math.min(sharesValue, balanceOf(staker, activeSharesId));
        uint256 stakeValue = activeSharesToStake(activeSharesId, activeShares);
        uint256 inactiveShares = stakeToInactiveShares(FortaStakingUtils.activeToInactive(activeSharesId), stakeValue);
        SubjectStakeAgency agency = getSubjectTypeAgency(subjectType);
        _activeStake.burn(activeSharesId, stakeValue);
        _inactiveStake.mint(FortaStakingUtils.activeToInactive(activeSharesId), stakeValue);
        _burn(staker, activeSharesId, activeShares);
        _mint(staker, FortaStakingUtils.activeToInactive(activeSharesId), inactiveShares, new bytes(0));
        if (agency == SubjectStakeAgency.DELEGATED || agency == SubjectStakeAgency.DELEGATOR) {
            allocator.withdrawAllocation(activeSharesId, subjectType, subject, staker, stakeValue, activeShares);
        }

        emit WithdrawalInitiated(subjectType, subject, staker, deadline);

        return deadline;
    }

    /**
     * @notice Burn `sharesValue` inactive shares for a given `subject`, and withdraw the corresponding tokens
     * (if the subject type has not been frozen, and the withdrawal delay time has passed).
     * @dev shares must have been marked for withdrawal before by initiateWithdrawal().
     * Emits events WithdrawalExecuted and ERC1155.TransferSingle.
     * @param subjectType type id of Stake Subject. See SubjectTypeValidator.sol
     * @param subject id identifying subject (external to FortaStaking).
     * @return amount of withdrawn staked tokens.
     */
    function withdraw(uint8 subjectType, uint256 subject) external onlyValidSubjectType(subjectType) returns (uint256) {
        address staker = _msgSender();
        uint256 inactiveSharesId = FortaStakingUtils.subjectToInactive(subjectType, subject);
        if (balanceOf(staker, inactiveSharesId) == 0) revert NoInactiveShares();
        if (openProposals[FortaStakingUtils.inactiveToActive(inactiveSharesId)] > 0) revert FrozenSubject();

        Timers.Timestamp storage timer = _lockingDelay[FortaStakingUtils.inactiveToActive(inactiveSharesId)][staker];
        if (!timer.isExpired()) revert WithdrawalNotReady();
        timer.reset();
        emit WithdrawalExecuted(subjectType, subject, staker);

        uint256 inactiveShares = balanceOf(staker, inactiveSharesId);
        uint256 stakeValue = inactiveSharesToStake(inactiveSharesId, inactiveShares);

        _inactiveStake.burn(inactiveSharesId, stakeValue);
        _burn(staker, inactiveSharesId, inactiveShares);
        SafeERC20.safeTransfer(stakedToken, staker, stakeValue);

        return stakeValue;
    }

    /**
     * @notice Slash a fraction of a subject stake, and transfer it to the treasury. Restricted to the `SLASHER_ROLE`.
     * @dev This will alter the relationship between shares and stake, reducing shares value for a subject.
     * Emits a Slashed event.
     * Unallocated stake if needed.
     * A slash over a DELEGATED type will propagate to DELEGATORs according to proposerPercent.
     * @param subjectType type id of Stake Subject. See SubjectTypeValidator.sol
     * @param subject id identifying subject (external to FortaStaking).
     * @param stakeValue amount of staked token to be slashed.
     * @param proposer address of the slash proposer. Must be nonzero address if proposerPercent > 0
     * @param proposerPercent percentage of stakeValue sent to the proposer. From 0 to MAX_SLASHABLE_PERCENT
     * @return stakeValue
     */

    function slash(
        uint8 subjectType,
        uint256 subject,
        uint256 stakeValue,
        address proposer,
        uint256 proposerPercent
    ) external override onlyRole(SLASHER_ROLE) notAgencyType(subjectType, SubjectStakeAgency.DELEGATOR) returns (uint256) {
        uint256 activeSharesId = FortaStakingUtils.subjectToActive(subjectType, subject);

        if (getSubjectTypeAgency(subjectType) == SubjectStakeAgency.DELEGATED) {
            uint256 delegatorSlashValue = Math.mulDiv(stakeValue, slashDelegatorsPercent, HUNDRED_PERCENT);
            uint256 delegatedSlashValue = stakeValue - delegatorSlashValue;

            _slash(activeSharesId, subjectType, subject, delegatedSlashValue);

            if (delegatorSlashValue > 0) {
                uint8 delegatorType = getDelegatorSubjectType(subjectType);
                uint256 activeDelegatorSharesId = FortaStakingUtils.subjectToActive(delegatorType, subject);
                _slash(activeDelegatorSharesId, delegatorType, subject, delegatorSlashValue);
            }
        } else {
            _slash(activeSharesId, subjectType, subject, stakeValue);
        }

        uint256 proposerShare = Math.mulDiv(stakeValue, proposerPercent, HUNDRED_PERCENT);

        if (proposerShare > 0) {
            if (proposer == address(0)) revert ZeroAddress("proposer");
            SafeERC20.safeTransfer(stakedToken, proposer, proposerShare);
        }

        SafeERC20.safeTransfer(stakedToken, _treasury, stakeValue - proposerShare);
        emit SlashedShareSent(subjectType, subject, proposer, proposerShare);

        return stakeValue;
    }

    /**
     * @notice burns slashed stake from active and/or inactive stake for subjectType/subject.
     * @param activeSharesId ERC1155 id of the shares being slashed
     * @param subjectType type id of Stake Subject. See SubjectTypeValidator.sol
     * @param subject id identifying subject (external to FortaStaking).
     * @param stakeValue amount of staked token to be slashed.
     */
    function _slash(uint256 activeSharesId, uint8 subjectType, uint256 subject, uint256 stakeValue) private {
        uint256 activeStake = _activeStake.balanceOf(activeSharesId);
        uint256 inactiveStake = _inactiveStake.balanceOf(FortaStakingUtils.activeToInactive(activeSharesId));
        // We set the slash limit at 90% of the stake, so new depositors on slashed pools (with now 0 stake) won't mint
        // an amounts of shares so big that they might cause overflows.
        // New shares = pool shares * new staked amount / pool stake
        // See deposit and stakeToActiveShares methods.
        uint256 maxSlashableStake = Math.mulDiv(activeStake + inactiveStake, MAX_SLASHABLE_PERCENT, HUNDRED_PERCENT);

        if (stakeValue > maxSlashableStake) revert SlashingOver90Percent();

        uint256 slashFromActive = Math.mulDiv(activeStake, stakeValue, activeStake + inactiveStake);
        uint256 slashFromInactive = stakeValue - slashFromActive;

        _activeStake.burn(activeSharesId, slashFromActive);
        _inactiveStake.burn(FortaStakingUtils.activeToInactive(activeSharesId), slashFromInactive);

        SubjectStakeAgency subjectAgency = getSubjectTypeAgency(subjectType);
        if (subjectAgency == SubjectStakeAgency.DELEGATED || subjectAgency == SubjectStakeAgency.DELEGATOR) {
            allocator.withdrawAllocation(activeSharesId, subjectType, subject, address(0), slashFromActive, 0);
        }

        emit Slashed(subjectType, subject, _msgSender(), stakeValue);
    }

    /**
     * @notice Freeze/unfreeze withdrawal of a subject stake. This will be used when something suspicious happens
     * with a subject but there is not a strong case yet for slashing.
     * Restricted to the `SLASHER_ROLE`.
     * @dev Emits a Freeze event.
     * @param subjectType type id of Stake Subject. See SubjectTypeValidator.sol
     * @param subject id identifying subject (external to FortaStaking).
     * @param frozen true to freeze, false to unfreeze.
     */
    function freeze(uint8 subjectType, uint256 subject, bool frozen) external override onlyRole(SLASHER_ROLE) onlyValidSubjectType(subjectType) {
        uint256 sharesId = FortaStakingUtils.subjectToActive(subjectType, subject);
        _migrateFrozenToOpenProposals(sharesId);
        if (frozen) {
            openProposals[sharesId]++;
        } else {
            openProposals[sharesId] = openProposals[sharesId] >= 1 ? openProposals[sharesId] - 1 : 0;
        }
        emit Froze(subjectType, subject, _msgSender(), openProposals[sharesId] != 0);
    }

    /**
     * @notice If there is open cases before upgrading to openProposals (frozen == true), we increment as an extra proposal
     * and set to false. There could be more than 1 open, in that case SLASHING_ARBITER_ROLE should be cautious with not unfreezing.
     * This method will be obsolete when all the _deprecated_frozen are false
     * @param activeSharesId of the subject
     */
    function _migrateFrozenToOpenProposals(uint256 activeSharesId) private {
        if (_deprecated_frozen[activeSharesId]) {
            _deprecated_frozen[activeSharesId] = false;
            openProposals[activeSharesId]++;
        }
    }

    /**
     * @notice Sweep all token that might be mistakenly sent to the contract. This covers both unrelated tokens and staked
     * tokens that would be sent through a direct transfer. Restricted to SWEEPER_ROLE.
     * If tokens are the same as staked tokens, only the extra tokens (no stake) will be transferred.
     * @dev WARNING: thoroughly review the token to sweep.
     * @param token address of the token to be swept.
     * @param recipient destination address of the swept tokens
     * @return amount of tokens swept. For unrelated tokens is FortaStaking's balance, for stakedToken its
     * the balance over the active stake + inactive stake
     */
    function sweep(IERC20 token, address recipient) external onlyRole(SWEEPER_ROLE) returns (uint256) {
        uint256 amount = token.balanceOf(address(this));

        if (token == stakedToken) {
            amount -= totalActiveStake();
            amount -= totalInactiveStake();
        }

        SafeERC20.safeTransfer(token, recipient, amount);
        emit TokensSwept(address(token), recipient, amount);
        return amount;
    }

    /**
     * @dev Relay a ERC2612 permit signature to the staked token. This cal be bundled with a {deposit} or a {reward}
     * operation using Multicall.
     * @param value amount of token allowance for deposit/reward
     * @param deadline for the meta-tx to be relayed.
     * @param v part of signature
     * @param r part of signature
     * @param s part of signature
     */
    function relayPermit(uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external {
        IERC2612(address(stakedToken)).permit(_msgSender(), address(this), value, deadline, v, r, s);
    }

    function _beforeTokenTransfer(address operator, address from, address to, uint256[] memory ids, uint256[] memory amounts, bytes memory data) internal virtual override {
        for (uint256 i = 0; i < ids.length; i++) {
            if (FortaStakingUtils.isActive(ids[i])) {
                uint8 subjectType = FortaStakingUtils.subjectTypeOfShares(ids[i]);
                if (subjectType == DELEGATOR_SCANNER_POOL_SUBJECT && to != address(0) && from != address(0)) {
                    allocator.didTransferShares(ids[i], subjectType, from, to, amounts[i]);
                }
            } else {
                if (!(from == address(0) || to == address(0))) revert WithdrawalSharesNotTransferible();
            }
        }

        super._beforeTokenTransfer(operator, from, to, ids, amounts, data);
    }

    // Conversions

    /**
     * @notice Convert active token stake amount to active shares amount
     * @param activeSharesId ERC1155 active shares id
     * @param amount active stake amount
     * @return ERC1155 active shares amount
     */
    function stakeToActiveShares(uint256 activeSharesId, uint256 amount) public view returns (uint256) {
        uint256 activeStake = _activeStake.balanceOf(activeSharesId);
        return activeStake == 0 ? amount : Math.mulDiv(totalSupply(activeSharesId), amount, activeStake);
    }

    /**
     * @notice Convert inactive token stake amount to inactive shares amount
     * @param inactiveSharesId ERC1155 inactive shares id
     * @param amount inactive stake amount
     * @return ERC1155 inactive shares amount
     */
    function stakeToInactiveShares(uint256 inactiveSharesId, uint256 amount) public view returns (uint256) {
        uint256 inactiveStake = _inactiveStake.balanceOf(inactiveSharesId);
        return inactiveStake == 0 ? amount : Math.mulDiv(totalSupply(inactiveSharesId), amount, inactiveStake);
    }

    /**
     * @notice Convert active shares amount to active stake amount.
     * @param activeSharesId ERC1155 active shares id
     * @param amount ERC1155 active shares amount
     * @return active stake amount
     */
    function activeSharesToStake(uint256 activeSharesId, uint256 amount) public view returns (uint256) {
        uint256 activeSupply = totalSupply(activeSharesId);
        return activeSupply == 0 ? 0 : Math.mulDiv(_activeStake.balanceOf(activeSharesId), amount, activeSupply);
    }

    /**
     * @notice Convert inactive shares amount to inactive stake amount.
     * @param inactiveSharesId ERC1155 inactive shares id
     * @param amount ERC1155 inactive shares amount
     * @return inactive stake amount
     */
    function inactiveSharesToStake(uint256 inactiveSharesId, uint256 amount) public view returns (uint256) {
        uint256 inactiveSupply = totalSupply(inactiveSharesId);
        return inactiveSupply == 0 ? 0 : Math.mulDiv(_inactiveStake.balanceOf(inactiveSharesId), amount, inactiveSupply);
    }

    // Admin: change withdrawal delay

    /**
     * @notice Sets withdrawal delay. Restricted to DEFAULT_ADMIN_ROLE
     * @param newDelay in seconds.
     */
    function setDelay(uint64 newDelay) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newDelay < MIN_WITHDRAWAL_DELAY) revert AmountTooSmall(newDelay, MIN_WITHDRAWAL_DELAY);
        if (newDelay > MAX_WITHDRAWAL_DELAY) revert AmountTooLarge(newDelay, MAX_WITHDRAWAL_DELAY);
        _withdrawalDelay = newDelay;
        emit DelaySet(newDelay);
    }

    /**
     * @notice Sets destination of slashed tokens. Restricted to DEFAULT_ADMIN_ROLE
     * @param newTreasury address.
     */
    function setTreasury(address newTreasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newTreasury == address(0)) revert ZeroAddress("newTreasury");
        _treasury = newTreasury;
        emit TreasurySet(newTreasury);
    }

    // Admin: change staking parameters manager
    function configureStakeHelpers(IStakeSubjectGateway _subjectGateway, IStakeAllocator _allocator) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (address(_subjectGateway) == address(0)) revert ZeroAddress("_subjectGateway");
        if (address(_allocator) == address(0)) revert ZeroAddress("_allocator");
        subjectGateway = _subjectGateway;
        allocator = _allocator;
        emit StakeHelpersConfigured(address(_subjectGateway), address(_allocator));
    }

    function setSlashDelegatorsPercent(uint256 percent) external onlyRole(STAKING_ADMIN_ROLE) {
        slashDelegatorsPercent = percent;
        emit SlashDelegatorsPercentSet(percent);
    }

    // Overrides

    /**
     * @notice Sets URI of the ERC1155 tokens. Restricted to DEFAULT_ADMIN_ROLE
     * @param newUri root of the hosted metadata.
     */
    function setURI(string memory newUri) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setURI(newUri);
    }

    /**
     * @notice Helper to get either msg msg.sender if not a meta transaction, signer of forwarder metatx if it is.
     * @inheritdoc ForwardedContext
     */
    function _msgSender() internal view virtual override(ContextUpgradeable, BaseComponentUpgradeable) returns (address sender) {
        return super._msgSender();
    }

    /**
     * @notice Helper to get msg.data if not a meta transaction, forwarder data in metatx if it is.
     * @inheritdoc ForwardedContext
     */
    function _msgData() internal view virtual override(ContextUpgradeable, BaseComponentUpgradeable) returns (bytes calldata) {
        return super._msgData();
    }

    /**
     *  50
     * - 1 (stakedToken)
     * - 1 (_activeStake)
     * - 1 (_inactiveStake)
     * - 1 (_lockingDelay)
     * - 1 (_rewards)
     * - 1 (_released)
     * - 1 _frozen
     * - 1 _withdrawalDelay
     * - 1 _treasury
     * - 1 subjectGateway
     * - 1 slashDelegatorsPercent
     * - 1 allocator
     * - 1 openProposals
     * - 1 _reentrancyStatus
     * --------------------------
     *  36 __gap
     */
    uint256[36] private __gap;
}
