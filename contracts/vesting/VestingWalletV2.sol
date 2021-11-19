// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "../components/escrow/StakingEscrowUtils.sol";
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
    address           public immutable L1Token;
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    address           public immutable L2EscrowFactory;
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    address           public immutable L2EscrowTemplate;

    uint256           public           historicalBalanceBridged;

    event TokensBridged(address indexed l2escrow, address indexed l2manager, uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(
        address __RootChainManager,
        address __L1Token,
        address __L2EscrowFactory,
        address __L2EscrowTemplate
    ) { // parent is already initializer
        RootChainManager = IRootChainManager(__RootChainManager);
        L1Token          = __L1Token;
        L2EscrowFactory  = __L2EscrowFactory;
        L2EscrowTemplate = __L2EscrowTemplate;
    }

    /**
     * bridge token to L2
     */
    function bridge(uint256 amount)
        public
        virtual
    {
        bridge(amount, beneficiary());
    }

    /**
     * bridge token to L2, with custom escrow manager on L2
     */
    function bridge(uint256 amount, address l2manager)
        public
        virtual
        onlyBeneficiary()
    {
        // lock historicalBalance
        historicalBalanceBridged = _historicalBalance(L1Token);

        // compute l2escrow address
        address l2escrow = Clones.predictDeterministicAddress(
            L2EscrowTemplate,
            StakingEscrowUtils.computeSalt(address(this), l2manager),
            L2EscrowFactory
        );

        // approval
        address predicate = RootChainManager.typeToPredicate(RootChainManager.tokenToType(L1Token));
        SafeERC20.safeApprove(IERC20(L1Token), predicate, amount);

        // deposit
        RootChainManager.depositFor(l2escrow, L1Token, abi.encode(amount));

        emit TokensBridged(l2escrow, l2manager, amount);
    }

    /**
     * Historical balance override to keep vesting speed when tokens are bridged.
     */
    function _historicalBalance(address token)
        internal
        virtual
        override
        view
        returns (uint256)
    {
        if (token == L1Token) {
            return Math.max(super._historicalBalance(token), historicalBalanceBridged);
        } else {
            return super._historicalBalance(token);
        }
    }

    /**
     * Admin operations
     */
    function setHistoricalBalanceBridged(uint256 value)
        public
        onlyOwner()
    {
        historicalBalanceBridged = value;
    }

    function incrHistoricalBalanceBridged(uint256 value)
        public
        onlyOwner()
    {
        historicalBalanceBridged += value;
    }

    function decrHistoricalBalanceBridged(uint256 value)
        public
        onlyOwner()
    {
        historicalBalanceBridged -= value;
    }
}
