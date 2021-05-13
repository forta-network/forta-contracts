// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/contracts/proxy/Clones.sol";
import "./VestingWallet.sol";

contract VestingFactory {
    VestingWallet public immutable template;

    event NewVesting(address indexed beneficiary, address instance);

    constructor(address _accesslist) {
        template = new VestingWallet(_accesslist);
    }

    function create(
        address beneficiary_,
        address admin_,
        uint256 start_,
        uint256 cliffDuration_,
        uint256 duration_
    ) public returns (address) {
        address instance = Clones.clone(address(template));
        VestingWallet(payable(instance)).initialize(beneficiary_, admin_, start_, cliffDuration_, duration_);
        emit NewVesting(beneficiary_, instance);
        return instance;
    }
}
