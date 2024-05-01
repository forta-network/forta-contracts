// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "./FortaCommon.sol";

/**
 * This version of the Forta token is living on the child chain. That would be:
 * - Polygon for production
 * - Amoy for testing
 *
 * When tokens are deposited from the root chain using the Polygon Portal, the `childChainManagerProxy`
 * will call the {deposit} function, which will mint corresponding tokens on the child chain.
 * 
 * When a user decides to bridge the token using the `FortaStakingVaultRootTunnel` on Ethereum,
 * the `FortaStakingVaultChildTunnel` contract will receive its message and call the {deposit} function,
 * minting the corresponding tokens on the child chain.
 * 
 * The total supply on the side chain is expected to match the amount of locked tokens on the parent chain,
 * whether that be on the `RootChainManagerProxy` or in the `FortaStakingVaultRootTunnel` contract.
 *
 * In order to bridge tokens back from the child chain to the parent chain, any user
 * can call either the {withdraw} or the {withdrawTo} function. This will burn tokens here,
 * emitting a burn event (Transfer event from the user to address(0)) in the process. This burn event
 * is needed to trigger unlocking the corresponding tokens on the parent chain.
 */
contract FortaBridgedPolygon is FortaCommon {
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    address public immutable childChainManagerProxy;
    // Polygon-side StakingVaultChildTunnel contract receiving Ethereum messages
    address public stakingVaultChildTunnel;

    event StakingVaultChildTunnelSet(address indexed childTunnel);

    error DepositOnlyByChildChainManagerOrStakingVaultChildTunnel();

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
        if (msg.sender != childChainManagerProxy || msg.sender != stakingVaultChildTunnel) revert DepositOnlyByChildChainManagerOrStakingVaultChildTunnel();

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
     * @notice Storage variable etter function for the StakingVaultChildTunnel contract address
     * @dev Only to be called by the ADMIN role holder.
     * @param _childTunnel Address of StakingVaultChildTunnel contract, which will receive
     * messages from the StakingVaultRootTunnel on Ethereum mainnet.
     */
    function setStakingVaultChildTunnel(address _childTunnel) external onlyRole(ADMIN_ROLE) {
        if (_childTunnel == address(0)) revert ZeroAddress("__childTunnel");

        stakingVaultChildTunnel = _childTunnel;
        emit StakingVaultChildTunnelSet(_childTunnel);
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
     * - 1 childTunnel
     * --------------------------
     *  48 __gap
     */
    uint256[48] private __gap; 
}
