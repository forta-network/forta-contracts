// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "./FortaCommon.sol";

/**
 * Interface necessary to implement for successful bridging
 * from Ethereum mainnet to OP-stack chains, which for us
 * would be the Base Sepolia testnet.
 * Detailed here:
 * https://docs.optimism.io/builders/app-developers/bridging/standard-bridge#bridged-tokens
 */
interface IOptimismMintableERC20 is IERC165 {
    function remoteToken() external view returns (address);

    function bridge() external returns (address);

    function mint(address _to, uint256 _amount) external;

    function burn(address _from, uint256 _amount) external;
}

/**
 * This version of the Forta token is living on the Base Sepolia Layer 2 testnet.
 *
 * On Base Sepolia, when tokens are bridged from the L1, the `L2StandardBridge` will call the
 * {mint} function, which will mint corresponding tokens on the L2 side. The total supply
 * on the L2 is expected to match the amount of locked tokens on the L1.
 *
 * In order to bridge tokens back from the L2 to L1, any user
 * can call the {bridgeERC20To} function on the `L2StandardBridge`. This will burn tokens here,
 * emitting a burn event (Transfer event from the user to address(0)) in the process. This burn event
 * is needed to trigger unlocking the corresponding tokens on the L1.
 */
contract FortaBridgedBaseSepolia is FortaCommon, IOptimismMintableERC20 {
    address private l1RemoteToken;
    address private l2StandardBridge;

    event L2StandardBridgeSet(address indexed bridgeAddress);
    event RemoteTokenSet(address indexed tokenAddress);

    error MintOnlyByL2StandardBridge();
    error BurnOnlyByL2StandardBridge();

    /**
     * @notice Initializer method, access point to initialize inheritance tree.
     * @param admin address that will be ADMIN_ROLE.
     */
    function initialize(address admin) public initializer {
        __FortaCommon_init(admin);
    }

    /**
     * @notice Allows the StandardBridge on this network to mint tokens.
     * @param to address to mint tokens to.
     * @param amount amount of tokens to mint.
     */
    function mint(address to, uint256 amount) external {
        if (msg.sender != l2StandardBridge) revert MintOnlyByL2StandardBridge();

        _mint(to, amount);
    }

    /**
     * @notice Allows the StandardBridge on this network to burn tokens.
     * @param from Address to burn tokens from.
     * @param amount Amount of tokens to burn.
     */
    function burn(address from, uint256 amount) external {
        if (msg.sender != l2StandardBridge) revert BurnOnlyByL2StandardBridge();

        _burn(from, amount);
    }

    /**
     * @notice L2StandardBridge address setter
     * @param l2StandardBridgeAddress Address of L2StandardBridge
     */
    function setBridge(address l2StandardBridgeAddress) external onlyRole(ADMIN_ROLE) {
        if (l2StandardBridgeAddress == address(0)) revert ZeroAddress("l2StandardBridgeAddress");

        l2StandardBridge = l2StandardBridgeAddress;
        emit L2StandardBridgeSet(l2StandardBridgeAddress);
    }

    /**
     * @notice Remote L2 token address setter
     * @param remoteTokenAddress Address of remote L1 token
     */
    function setRemoteToken(address remoteTokenAddress) external onlyRole(ADMIN_ROLE) {
        if (remoteTokenAddress == address(0)) revert ZeroAddress("remoteTokenAddress");

        l1RemoteToken = remoteTokenAddress;
        emit RemoteTokenSet(remoteTokenAddress);
    }

    /**
     * @notice L2StandardBridge address getter
     * @return Address of L2StandardBridge
     */
    function bridge() public view returns (address) {
        return l2StandardBridge;
    }

    /**
     * @notice Remote L2 token address getter
     * @return Address of remote L1 token
     */
    function remoteToken() public view returns (address) {
        return l1RemoteToken;
    }

    /**
     * @notice ERC165 interface check function.
     * @param interfaceId Interface ID to check.
     * @return Whether or not the interface is supported by this contract.
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override(AccessControlUpgradeable, IERC165) returns (bool) {
        return interfaceId == type(IOptimismMintableERC20).interfaceId || super.supportsInterface(interfaceId);
    }

    /**
     * @notice Contract version
     * @dev Since FortaCommon is IVersioned, Forta is deployed in L1 and FortaBridgedPolygon in L2,
     * we need to implement the interface with a method instead of immutable variable.
     * @return version of FORT deployed in L2
     */
    function version() external pure returns(string memory) {
        return "0.2.0";
    }

    /**
     *  49
     * - 1 l1RemoteToken
     * - 1 l2StandardBridge
     * --------------------------
     *  47 __gap
     */
    uint256[47] private __gap; 
}