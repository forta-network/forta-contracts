// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "openzeppelin-contracts-4.9/utils/Multicall.sol";
import "openzeppelin-contracts-4.9/token/ERC20/IERC20.sol";
import "openzeppelin-contracts-4.9/token/ERC20/utils/SafeERC20.sol";

import "openzeppelin-contracts-upgradeable-4.9/proxy/utils/UUPSUpgradeable.sol";
import "openzeppelin-contracts-upgradeable-4.9/token/ERC20/IERC20Upgradeable.sol";
import "openzeppelin-contracts-upgradeable-4.9/access/AccessControlUpgradeable.sol";
import "openzeppelin-contracts-upgradeable-4.9/token/ERC20/extensions/ERC4626Upgradeable.sol";

import "../../errors/GeneralErrors.sol";
import "../utils/IVersioned.sol";

contract GeneralFortaStakingVault is ERC4626Upgradeable, AccessControlUpgradeable, UUPSUpgradeable, Multicall, IVersioned {
    using SafeERC20 for IERC20;

    bytes32 public constant SLASHER_ROLE = keccak256("SLASHER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    uint256 public constant MIN_WITHDRAWAL_DELAY = 1 days;
    uint256 public constant MAX_WITHDRAWAL_DELAY = 90 days;

    // treasury for slashing
    address private _treasury;
    uint64 private _withdrawalDelay;
    // depositor => deposit timestamp
    mapping(address => uint256) private _depositTimes;

    event Slashed(address indexed by, uint256 indexed value);
    event DelaySet(uint256 newWithdrawalDelay);
    event TreasurySet(address newTreasury);

    error WithdrawalNotReady();

    string public constant version = "0.1.0";

    /**
     * @notice Initializer method, access point to initialize inheritance tree.
     * @param __admin Granted DEFAULT_ADMIN_ROLE.
     * @param __asset Asset to stake (FORT).
     * @param __treasury address where the slashed tokens go to.
     * @param __withdrawalDelay minimum delay between depositing/minting and withdraw/redeem (in seconds).
     */
    function initialize(address __admin, address __asset, address __treasury, uint64 __withdrawalDelay) public initializer {
        if (__admin == address(0)) revert ZeroAddress("__admin");
        if (__asset == address(0)) revert ZeroAddress("__asset");
        if (__treasury == address(0)) revert ZeroAddress("__treasury");
        if(__withdrawalDelay == 0) revert ZeroAmount("__withdrawalDelay");

        __ERC20_init("General FORT Staking Vault", "vFORTGeneral");
        __ERC4626_init(IERC20Upgradeable(__asset));
        __AccessControl_init();
        __UUPSUpgradeable_init();
        _grantRole(DEFAULT_ADMIN_ROLE, __admin);
        _treasury = __treasury;
        _withdrawalDelay = __withdrawalDelay;
    }

    /**
     * @notice Slash an amount of the vault's underlying asset, and transfer it to the treasury.
     * Restricted to the `SLASHER_ROLE`.
     * @dev This will alter the relationship between shares and assets.
     * Emits a Slashed event.
     * @param stakeValue amount of staked token to be slashed.
    */
    function slash(
        uint256 stakeValue
    ) external onlyRole(SLASHER_ROLE) {
        if (stakeValue == 0) revert ZeroAmount("stakeValue");
        SafeERC20.safeTransfer(IERC20(asset()), _treasury, stakeValue);
        emit Slashed(_msgSender(), stakeValue);
    }

    /// Returns treasury address (slashed tokens destination)
    function treasury() public view returns (address) {
        return _treasury;
    }

    /// Returns withdrawal delay needed to wait before exiting vault (in seconds)
    function withdrawalDelay() public view returns (uint64) {
        return _withdrawalDelay;
    }

    /**
     * @notice Sets withdrawal delay. Restricted to DEFAULT_ADMIN_ROLE
     * @param newDelay in seconds.
     */
    function setDelay(uint64 newDelay) external onlyRole(DEFAULT_ADMIN_ROLE) {
        // TODO: Uncomment for PROD
        // if (newDelay < MIN_WITHDRAWAL_DELAY) revert AmountTooSmall(newDelay, MIN_WITHDRAWAL_DELAY);
        // if (newDelay > MAX_WITHDRAWAL_DELAY) revert AmountTooLarge(newDelay, MAX_WITHDRAWAL_DELAY);
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
    
    // Access control for the upgrade process
    function _authorizeUpgrade(address newImplementation) internal virtual override onlyRole(UPGRADER_ROLE) {
    }

    /**
     * @inheritdoc ERC4626Upgradeable
     * @dev Modified to track user deposits' timestamp for withdrawal delay
     */
    function _deposit(address caller, address receiver, uint256 assets, uint256 shares) internal override {
        _depositTimes[caller] = block.timestamp;
        super._deposit(caller, receiver, assets, shares);
    }

    /**
     * @inheritdoc ERC4626Upgradeable
     * @dev Modified to check user deposits' timestamp for lapse of their withdrawal delay
     */
    function _withdraw(
        address caller,
        address receiver,
        address owner,
        uint256 assets,
        uint256 shares
    ) internal override {
        if(_depositTimes[caller] + _withdrawalDelay > block.timestamp) revert WithdrawalNotReady();
        super._withdraw(caller, receiver, owner, assets, shares);
    }
    
    /**
     *  50
     * - 1 _treasury + _withdrawalDelay
     * - 1 _depositTimes
     * --------------------------
     *  48 __gap
     */
    uint256[48] private __gap;
}