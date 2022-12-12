// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "./FortaCommon.sol";

/**
 * This version of the Forta token is living on the child chain. That would be:
 * - Polygon for production
 * - Mumbai for testing
 *
 * When tokens are deposited from the root chain, the `childChainManagerProxy` will call the
 * {deposit} function, which will mint corresponding tokens on the child chain. The total supply
 * on the side chain is expected to match the amount of locked tokens on the parent chain.
 *
 * In order to bridge tokens back from the child chain to the parent chain, any user
 * can call either the {withdraw} or the {withdrawTo} function. This will burn tokens here,
 * emitting a burn event (Transfer event from the user to address(0)) in the process. This burn event
 * is needed to trigger unlocking the corresponding tokens on the parent chain.
 */
contract FortaBridgedPolygon is FortaCommon {
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    address public immutable childChainManagerProxy;

    error DepositOnlyByChildChainManager();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address _childChainManagerProxy) {
        if (_childChainManagerProxy == address(0)) revert ZeroAddress("_childChainManagerProxy");
        childChainManagerProxy = _childChainManagerProxy;
    }

    /**
     * @notice Initializer method, access point to initialize inheritance tree.
     * @param admin address that will be ADMIN_ROLE.
     */
    function initialize(address admin) public initializer {
        __FortaCommon_init(admin);
    }

    /**
     * @dev To avoid token locked on the parent chains not being correctly represented on the
     * child chain, this should NEVER revert (exception: _mint can revert if totalSupply() <= _maxSupply()).
     * @param user the destination address for the tokens.
     * @param depositData encoded data sent by the bridge.
     */
    function deposit(address user, bytes calldata depositData) external {
        if (msg.sender != childChainManagerProxy) revert DepositOnlyByChildChainManager();

        uint256 amount = abi.decode(depositData, (uint256));
        _mint(user, amount);
    }

    /**
     * @dev Burns tokens in L2 so Polygon's PoS bridge will unlock them in L1.
     * @param amount of tokens to send to L1
     */
    function withdraw(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    /**
     * @dev In order for a token holder on the child chain to be able to withdraw tokens to
     * another address on the parent chain, this function will temporarily transfer the tokens to
     * the address of the receiver on the parent chain so that the burn event is correct.
     * @param amount of tokens to send to L1
     * @param receiver destination address in L1
     */
    function withdrawTo(uint256 amount, address receiver) external {
        _transfer(msg.sender, receiver, amount);
        _burn(receiver, amount);
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
     *  50
     * - 1 childChainManagerProxy (on error, since it is immutable, but deployed);
     * --------------------------
     *  49 __gap
     */
    uint256[49] private __gap; 
}
