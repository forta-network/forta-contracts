// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./FortaCommon.sol";

/**
 * This version of the Forta token is living on the root (or parent) chain. That would be:
 * - Mainnet for production
 * - Goerli for testing
 *
 * In addition to all the common forta features, the version is mintable by a specific role.
 */
contract Forta is FortaCommon {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /**
     * @notice Initializer method, access point to initialize inheritance tree.
     * @param admin address for the ADMIN_ROLE of the token.
     */
    function initialize(address admin) public initializer {
        __FortaCommon_init(admin);
        _setRoleAdmin(MINTER_ROLE, ADMIN_ROLE);
    }

    /// Allow MINTER_ROLE to mint new tokens
    function mint(address to, uint256 amount) public onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    /**
     * @notice Contract version
     * @dev Since FortaCommon is IVersioned, Forta is deployed in L1 and FortaBridgedPolygon in L2,
     * we need to implement the interface with a method instead of immutable variable.
     * @return version of FORT deployed in L1
     */
    function version() external pure virtual override returns(string memory) {
        return "0.1.0";
    }

    uint256[50] private __gap; 
}
