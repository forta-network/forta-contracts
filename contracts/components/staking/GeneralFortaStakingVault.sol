// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/Multicall.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC4626Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../errors/GeneralErrors.sol";
import "../utils/IVersioned.sol";

contract GeneralFortaStakingVault is ERC4626Upgradeable, AccessControlUpgradeable, UUPSUpgradeable, Multicall, IVersioned {
    using SafeERC20 for IERC20;

    bytes32 constant SLASHER_ROLE = keccak256("SLASHER_ROLE");
    bytes32 constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    // treasury for slashing
    address private _treasury;

    event Slashed(address indexed by, uint256 indexed value);
    event TreasurySet(address newTreasury);

    string public constant version = "0.1.0";

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {
        _disableInitializers();
    }

    /**
     * @notice Initializer method, access point to initialize inheritance tree.
     * @param __admin Granted DEFAULT_ADMIN_ROLE.
     * @param __asset Asset to stake (FORT).
     * @param __treasury address where the slashed tokens go to.
     */
    function initialize(address __admin, address __asset, address __treasury) public initializer {
        if (__admin == address(0)) revert ZeroAddress("__admin");
        if (__asset == address(0)) revert ZeroAddress("__asset");
        if (__treasury == address(0)) revert ZeroAddress("__treasury");

        __ERC20_init("General FORT Staking Vault", "vFORTGeneral");
        __ERC4626_init(IERC20MetadataUpgradeable(__asset));
        __AccessControl_init();
        __UUPSUpgradeable_init();
        _grantRole(DEFAULT_ADMIN_ROLE, __admin);
        _treasury = __treasury;
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
        SafeERC20.safeTransferFrom(IERC20(asset()), address(this), _treasury, stakeValue);
        emit Slashed(_msgSender(), stakeValue);
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
     *  50
     * - 1 _treasury
     * --------------------------
     *  49 __gap
     */
    uint256[49] private __gap;
}