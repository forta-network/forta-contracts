// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-protocol/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "../stakeSubjectHandling/StakeSubjectHandler.sol";
import "../../../tools/Distributions.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract RewardsAllocator is BaseComponentUpgradeable, SubjectTypeValidator {

    using Distributions for Distributions.Balances

    event Rewarded(uint8 indexed subjectType, uint256 indexed subject, address indexed from, uint256 value);
    event Released(uint8 indexed subjectType, uint256 indexed subject, address indexed to, uint256 value);

    IERC20 public immutable rewardsToken;
    
    // subject => reward
    Distributions.Balances private _rewards;
    // subject => staker => released reward
    mapping(uint256 => Distributions.SignedBalances) private _released;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address _forwarder, address _rewardsToken) initializer ForwardedContext(_forwarder) {
        if (_rewardsToken == address(0)) revert ZeroAddress("_rewardsToken");
        rewardsToken = _rewardsToken;
    }

    /**
     * @notice Deposit reward value for a given `subject`. The corresponding tokens will be shared amongst the shareholders
     * of this subject.
     * @dev Emits a Reward event.
     * @param subjectType type id of Stake Subject. See SubjectTypeValidator.sol
     * @param subject id identifying subject (external to FortaStaking).
     * @param value amount of reward tokens.
     */
    function reward(
        uint8 subjectType,
        uint256 subject,
        uint256 value
    ) public onlyValidSubjectType(subjectType) {

        _rewards.mint(FortaStakingUtils.subjectToActive(subjectType, subject), value);
        emit Rewarded(subjectType, subject, _msgSender(), value);
    }

    /**
     * @notice Release reward owed by given `account` for its current or past share for a given `subject`.
     * @dev If staking from a contract, said contract may optionally implement ERC165 for IRewardReceiver.
     * Emits a Release event.
     * @param subjectType type id of Stake Subject. See SubjectTypeValidator.sol
     * @param subject id identifying subject (external to FortaStaking).
     * @param account that staked on the subject.
     * @return available reward transferred.
     */
    function releaseReward(
        uint8 subjectType,
        uint256 subject,
        address account
    ) public onlyValidSubjectType(subjectType) returns (uint256) {
        uint256 activeSharesId = FortaStakingUtils.subjectToActive(subjectType, subject);
        uint256 value = _availableReward(activeSharesId, account);
        _rewards.burn(activeSharesId, value);
        _released[activeSharesId].mint(account, SafeCast.toInt256(value));

        SafeERC20.safeTransfer(rewardToken, account, value);

        emit Released(subjectType, subject, account, value);

        if (Address.isContract(account) && account.supportsInterface(type(IRewardReceiver).interfaceId)) {
            IRewardReceiver(account).onRewardReceived(subjectType, subject, value);
        }

        return value;
    }

    /**
     * @notice Amount of reward tokens owed by given `account` for its current or past share for a given `subject`.
     * @param activeSharesId ERC1155 id representing the active shares of a subject / subjectType pair.
     * @param account address of the staker
     * @return rewards available for staker on that subject.
     */
    function _availableReward(uint256 activeSharesId, address account) internal view returns (uint256) {
        return
            SafeCast.toUint256(
                SafeCast.toInt256(_historicalRewardFraction(activeSharesId, balanceOf(account, activeSharesId), Math.Rounding.Down)) -
                    _released[activeSharesId].balanceOf(account)
            );
    }

    /**
     * @dev Amount of reward tokens owed by given `account` for its current or past share for a given `subject`.
     * @param subjectType type of staking subject (see SubjectTypeValidator.sol)
     * @param subject ID of subject
     * @param account address of the staker
     * @return rewards available for staker on that subject.
     */
    function availableReward(
        uint8 subjectType,
        uint256 subject,
        address account
    ) external view returns (uint256) {
        uint256 activeSharesId = FortaStakingUtils.subjectToActive(subjectType, subject);
        return _availableReward(activeSharesId, account);
    }

    
    function _totalHistoricalReward(uint256 activeSharesId) internal view returns (uint256) {
        return SafeCast.toUint256(SafeCast.toInt256(_rewards.balanceOf(activeSharesId)) + _released[activeSharesId].totalSupply());
    }

    function _historicalRewardFraction(
        uint256 activeSharesId,
        uint256 amount
    ) internal view returns (uint256) {
        uint256 supply = totalSupply(activeSharesId);
        return amount > 0 && supply > 0 ? Math.mulDiv(_totalHistoricalReward(activeSharesId), amount, supply, rounding) : 0;
    }

}