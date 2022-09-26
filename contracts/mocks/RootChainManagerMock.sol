// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../vesting/IRootChainManager.sol";

contract PredicatMock is Ownable {
    using SafeERC20 for IERC20;

    event LockedERC20(
        address indexed depositor,
        address indexed depositReceiver,
        address indexed rootToken,
        uint256 amount
    );

    function lockTokens(address depositor, address depositReceiver, address rootToken, bytes calldata depositData)
    public onlyOwner()
    {
        uint256 amount = abi.decode(depositData, (uint256));
        emit LockedERC20(depositor, depositReceiver, rootToken, amount);
        IERC20(rootToken).safeTransferFrom(depositor, address(this), amount);
    }

    function exitTokens(address, address rootToken, bytes memory log)
    public onlyOwner()
    {
        (address withdrawer, uint256 amount) = abi.decode(log, (address, uint256));
        IERC20(rootToken).safeTransfer(withdrawer, amount);
    }
}

contract RootChainManagerMock is IRootChainManager, Context {
    PredicatMock public predicate = new PredicatMock();

    event BridgeDeposit(address user, address rootToken, bytes depositData);

    function tokenToType(address) external pure override returns (bytes32) {
        return 0;
    }

    function typeToPredicate(bytes32) external view override returns (address) {
        return address(predicate);
    }

    function depositFor(address user, address rootToken, bytes calldata depositData) external override {
        // Checks
        predicate.lockTokens(
            _msgSender(),
            user,
            rootToken,
            depositData
        );
        // State sync
    }

    function exit(bytes calldata inputData) external override {
        revert("not mocked");
    }
}
