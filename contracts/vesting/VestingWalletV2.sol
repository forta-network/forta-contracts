// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "./escrow/StakingEscrowUtils.sol";
import "./IRootChainManager.sol";
import "./VestingWalletV1.sol";

/**
 * This contract exists on the root chain, where it manages vesting token allocations.
 *
 * During deployment, immutable storage is used to configure the parameters relevant to
 * cross-chain operations. Proxies (UUPS) can then use this as their implementation and
 * will automatically uses these parameters (hardcoded in the implementation).
 */
contract VestingWalletV2 is VestingWalletV1 {
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

    uint256           public           historicalBalanceMin;

    event TokensBridged(address indexed l2Escrow, address indexed l2Manager, uint256 amount);
    event HistoricalBalanceMinChanged(uint256 newValue, uint256 oldValue);

    error BridgingToContract();

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
     * @notice Bridge token to L2
     * @dev In case the beneficiary is a smart contract, bridging that way might be dangerous. In such cases,
     * bridge(uint256,address) should be preferred.
     * @param amount of tokens to be bridged
     */
    function bridge(uint256 amount)
        public
        virtual
    {
        if (Address.isContract(beneficiary())) revert BridgingToContract();
        bridge(amount, beneficiary());
    }

    /**
     * @notice Bridge token to L2, with custom escrow manager on L2.
     * @dev Using a custom escrow manager is needed if the beneficiary isn't valid on the child chain, for example if it
     * is a smart wallet that doesn't exist at the same address on the child chain. 
     * If the beneficiary of the contract is a smart wallet valid on both chains, it must be explicitly mentioned as the manager.
     * @dev amount of tokens to be bridged.
     * @dev l2Manager the address that will be controller generated StakinEscrow in L2.
     */
    function bridge(uint256 amount, address l2Manager)
        public
        virtual
        onlyBeneficiary()
    {
        if (amount == 0) revert ZeroAmount("");
        if (l2Manager== address(0)) revert ZeroAddress("l2Manager");
        // lock historicalBalance
        historicalBalanceMin = _historicalBalance(l1Token);

        // compute l2Escrow address
        address l2Escrow = Clones.predictDeterministicAddress(
            l2EscrowTemplate,
            StakingEscrowUtils.computeSalt(address(this), l2Manager),
            l2EscrowFactory
        );
        address predicate = rootChainManager.typeToPredicate(rootChainManager.tokenToType(l1Token));
        // approval
        IERC20(l1Token).approve(predicate, amount);

        // deposit
        rootChainManager.depositFor(l2Escrow, l1Token, abi.encode(amount));
        // reset approval
        IERC20(address(l1Token)).approve(predicate, 0);

        emit TokensBridged(l2Escrow, l2Manager, amount);
    }

    /// Historical balance override to keep vesting speed when tokens are bridged.
    function _historicalBalance(address token)
        internal
        virtual
        override
        view
        returns (uint256)
    {
        if (token == l1Token) {
            return Math.max(super._historicalBalance(token), historicalBalanceMin);
        } else {
            return super._historicalBalance(token);
        }
    }

    // Admin operations

    /**
     * @dev Sets historical balance minimum. Only use if there is an imbalance between L1 VestingWallet and L2 StakingEscrow
     */ 
    function setHistoricalBalanceMin(uint256 value)
        public
        onlyOwner()
    {
        emit HistoricalBalanceMinChanged(value, historicalBalanceMin);
        historicalBalanceMin = value;
    }

    /**
     * @dev Sets  historical balance. Only use if there is an imbalance between L1 VestingWallet and L2 StakingEscrow
     */ 
    function updateHistoricalBalanceMin(int256 update)
        public
        onlyOwner()
    {
        setHistoricalBalanceMin((historicalBalanceMin.toInt256() + update).toUint256());
    }

    /**
     *  50
     * - 1 rootChainManager (in error since immutable, but deployed)
     * - 1 l1Token (in error since immutable, but deployed)
     * - 1 l2EscrowFactory (in error since immutable, but deployed)
     * - 1 l2EscrowTemplate (in error since immutable, but deployed)
     * - 1 historicalBalanceMin
     * --------------------------
     *  45 __gap
     */
    uint256[45] private __gap;
}
