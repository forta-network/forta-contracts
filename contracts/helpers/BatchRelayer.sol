// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";

/**
 * @notice Helper contract for deploy scripts for batch transactions.
 */
contract BatchRelayer is Ownable {

  /**
  * @dev Calls multiple functions on the contract deployed in `target` address. Only callable by owner of BatchRelayer.
  * @param target the destination contract.
  * @param data encoded method calls with arguments.
  * @return results of the method calls.
  */
  function relay(address target, bytes[] calldata data) external onlyOwner() returns (bytes[] memory results) {
    results = new bytes[](data.length);
    for (uint256 i = 0; i < data.length; i++) {
        results[i] = Address.functionCall(target, data[i]);
    }
    return results;
  }
}
