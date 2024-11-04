// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "./FortaCommon.sol";
import "./IArbToken.sol";

/**
 * This version of the Forta token is living on the Arbitrum Layer 2.
 *
 * On Arbitrum, when tokens are bridged from the L1, the `L2ERC20Gateway` will call the
 * {bridgeMint} function, which will mint corresponding tokens on the L2 side. The total supply
 * on the L2 is expected to match the amount of locked tokens on the L1.
 *
 * In order to bridge tokens back from the L2 to L1, any user
 * can call the {outBoundTransfer} function on the `L2GatewayRouter`. This will burn tokens here,
 * emitting a burn event (Transfer event from the user to address(0)) in the process.
 */
contract FortaBridgedArbitrum is FortaCommon, IArbToken {
    address private l1TokenAddress;
    address private l2ERC20Gateway;

    error MintOnlyByL2ERC20Gateway();
    error BurnOnlyByL2ERC20Gateway();

    /**
     * @notice Initializer method, access point to initialize inheritance tree.
     * @param __admin address that will be ADMIN_ROLE.
     * @param __l1TokenAddress address of L1 FORT token.
     * @param __l2ERC20Gateway address of Arbitrum ERC20Gateway.
     */
    function initialize(address __admin, address __l1TokenAddress, address __l2ERC20Gateway) public initializer {
        if (__l1TokenAddress == address(0)) revert ZeroAddress("l1TokenAddress");
        if (__l2ERC20Gateway == address(0)) revert ZeroAddress("l2ERC20Gateway");

        __FortaCommon_init(__admin);
        l1TokenAddress = __l1TokenAddress;
        l2ERC20Gateway = __l2ERC20Gateway;
    }

    /**
     * @notice Allows the L2ERC20Gateway on this network to mint tokens,
     * as part of bridging form L1.
     * @dev Only callable by L2ERC20Gateway
     * @param account Address to bridge tokens to.
     * @param amount Amount of tokens to bridge.
     */
    function bridgeMint(address account, uint256 amount) external {
        if (msg.sender != l2ERC20Gateway) revert MintOnlyByL2ERC20Gateway();

        _mint(account, amount);
    }

    /**
     * @notice Allows the L2ERC20Gateway on this network to burn tokens,
     * as part of bridging to L1.
     * @dev Only callable by L2ERC20Gateway
     * @param account Address to bridge tokens from.
     * @param amount Amount of tokens to bridge.
     */
    function bridgeBurn(address account, uint256 amount) external {
        if (msg.sender != l2ERC20Gateway) revert BurnOnlyByL2ERC20Gateway();

        _burn(account, amount);
    }

    /**
     * @notice L1 token address getter
     * @return Address of layer 1 token
     */
    function l1Address() external view returns (address) {
        return l1TokenAddress;
    }

    /**
     * @notice Contract version
     * @dev Since FortaCommon is IVersioned, Forta is deployed in L1 and FortaBridgedPolygon and FortaBridgedArbitrum in L2,
     * we need to implement the interface with a method instead of immutable variable.
     * @return version of FORT deployed in Arbitrum L2
     */
    function version() external pure returns(string memory) {
        return "0.1.0";
    }

    /**
     *  49
     * - 1 l1TokenAddress
     * - 1 l2ERC20Gateway
     * --------------------------
     *  47 __gap
     */
    uint256[47] private __gap; 
}
