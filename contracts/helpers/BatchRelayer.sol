// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";

contract BatchRelayer is Ownable {
  function relay(address target, bytes[] calldata data) external onlyOwner() returns (bytes[] memory results) {
    results = new bytes[](data.length);
    for (uint256 i = 0; i < data.length; i++) {
        results[i] = Address.functionCall(target, data[i]);
    }
    return results;
  }
}
