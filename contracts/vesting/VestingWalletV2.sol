// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "./escrow/StakingEscrowUtils.sol";
import "./IRootChainManager.sol";
import "./VestingWallet.sol";

contract VestingWalletV2 is VestingWallet {
    using SafeCast for int256;
    using SafeCast for uint256;

    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    IRootChainManager public immutable rootChainManager;
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    address           public immutable l1Token;
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    address           public immutable l2EscrowFactory;
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    address           public immutable l2EscrowTemplate;

    uint256           public           historicalBalanceMinimum;

    event TokensBridged(address indexed l2escrow, address indexed l2manager, uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(
        address _rootChainManager,
        address _l1Token,
        address _l2EscrowFactory,
        address _l2EscrowTemplate
    ) { // parent is already initializer
        rootChainManager = IRootChainManager(_rootChainManager);
        l1Token          = _l1Token;
        l2EscrowFactory  = _l2EscrowFactory;
        l2EscrowTemplate = _l2EscrowTemplate;
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
        historicalBalanceMinimum = _historicalBalance(l1Token);

        // compute l2escrow address
        address l2escrow = Clones.predictDeterministicAddress(
            l2EscrowTemplate,
            StakingEscrowUtils.computeSalt(address(this), l2manager),
            l2EscrowFactory
        );

        // approval
        SafeERC20.safeApprove(
            IERC20(l1Token),
            rootChainManager.typeToPredicate(rootChainManager.tokenToType(l1Token)),
            amount
        );

        // deposit
        rootChainManager.depositFor(l2escrow, l1Token, abi.encode(amount));

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
        if (token == l1Token) {
            return Math.max(super._historicalBalance(token), historicalBalanceMinimum);
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
        historicalBalanceMinimum = value;
    }

    function updateHistoricalBalanceBridged(int256 update)
        public
        onlyOwner()
    {
        historicalBalanceMinimum = (historicalBalanceMinimum.toInt256() + update).toUint256();
    }
}
