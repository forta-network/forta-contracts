// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/StorageSlot.sol";

/**
 * This contract is designed for recovering the in case the beneficiary was lost.
 */
contract VestingWalletRecoveryLight {
    /// Storage
    // Initializable
    uint8 private _initialized;
    bool private _initializing;
    // ContextUpgradeable
    uint256[50] private __gap_1;
    // OwnableUpgradeable
    address private _owner;
    uint256[49] private __gap_2;
    // UUPSUpgradeable
    uint256[50] private __gap_3;
    // ERC1967UpgradeUpgradeable
    uint256[50] private __gap_4;
    // VestingWallerV1
    mapping (address => uint256) private _released;
    address private _beneficiary;
    uint256 private _start;
    uint256 private _cliff;
    uint256 private _duration;

    /// Constants and Events
    // ERC1967UpgradeUpgradeable
    bytes32 internal constant _IMPLEMENTATION_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
    event Upgraded(address indexed implementation);

    function changeOwnerAndUpgrade(address newBeneficiary, address newImplementation) external {
        // change ownership
        _beneficiary = newBeneficiary;

        // ERC1967Upgrade._setImplementation
        require(Address.isContract(newImplementation), "ERC1967: new implementation is not a contract");
        StorageSlot.getAddressSlot(_IMPLEMENTATION_SLOT).value = newImplementation;
        emit Upgraded(newImplementation);
    }

    function proxiableUUID() external pure returns (bytes32) {
        return _IMPLEMENTATION_SLOT;
    }


    function upgradeTo(address) external pure {
        revert();
    }

    function upgradeToAndCall(address, bytes memory) external pure {
        revert();
    }
}
