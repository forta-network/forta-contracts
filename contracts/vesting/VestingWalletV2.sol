// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "./VestingWallet.sol";

interface IRootChainManager {
    function tokenToType(address) external view returns (bytes32);
    function typeToPredicate(bytes32) external view returns (address);
    function depositFor(address user, address rootToken, bytes calldata depositData) external;
}

contract VestingWalletV2 is VestingWallet {
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    IRootChainManager public immutable RootChainManager;
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    address           public immutable L2EscrowFactory;
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    address           public immutable L2EscrowTemplate;

    mapping (address => uint256) private _historicalBalanceBridged;

    event TokensBridged(address indexed token, uint256 amount, address l2escrow, address l2manager);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(
        address __RootChainManager,
        address __L2EscrowFactory,
        address __L2EscrowTemplate
    ) { // parent is already initializer
        RootChainManager = IRootChainManager(__RootChainManager);
        L2EscrowFactory  = __L2EscrowFactory;
        L2EscrowTemplate = __L2EscrowTemplate;
    }

    /**
     * bridge token to L2
     */
    function bridge(address token, uint256 amount) public virtual {
        bridge(token, amount, beneficiary());
    }

    /**
     * bridge token to L2, with custom escrow manager on L2
     */
    function bridge(address token, uint256 amount, address l2manager) public virtual onlyBeneficiary() {
        // lock historicalBalance
        _historicalBalanceBridged[token] = _historicalBalance(token);

        // compute l2escrow address
        address l2escrow = Clones.predictDeterministicAddress(
            L2EscrowTemplate,
            keccak256(abi.encodePacked(
                address(this),
                l2manager
            )),
            L2EscrowFactory
        );

        // approval
        address predicate = RootChainManager.typeToPredicate(RootChainManager.tokenToType(token));
        SafeERC20.safeApprove(IERC20(token), predicate, amount);

        // deposit
        RootChainManager.depositFor(l2escrow, token, abi.encode(amount));

        emit TokensBridged(token, amount, l2escrow, l2manager);
    }

    function _historicalBalance(address token) internal virtual override view returns (uint256) {
        return Math.max(super._historicalBalance(token), _historicalBalanceBridged[token]);
    }
}
