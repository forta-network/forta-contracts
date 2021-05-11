// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Address.sol";
import "./vendor/TokenVestingUpgradeable.sol";
import "./accesslist/IAccessList.sol";

contract VestingWallet is TokenVestingUpgradeable {
    IAccessList public immutable accesslist;

    // initializer locks instance
    constructor(address _accesslist) initializer {
        accesslist = IAccessList(_accesslist);
    }

    function initialize(
        address beneficiary_,
        address admin_,
        uint256 start_,
        uint256 cliffDuration_,
        uint256 duration_
    ) external initializer {
        __TokenVesting_init(beneficiary_, admin_, start_, cliffDuration_, duration_);
    }

    function execute(address target, uint256 value, bytes calldata data) external {
        require(_msgSender() == beneficiary(), "VestingWallet: unauthorized caller"); // only beneficiary can trigger
        require(accesslist.isAuthorized(target, data[0]), "VestingWallet: unauthorized call"); // call must be whitelisted
        Address.functionCallWithValue(target, data, value);
    }
}
