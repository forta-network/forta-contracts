// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "./VestingWalletV1.sol";

/**
 * This contract is designed for recovering the in case the beneficiary was lost.
 */
contract VestingWalletRecovery is VestingWalletV1 {
    event BeneficiaryUpdate(address newBeneficiary);

    function updateBeneficiary(address newBeneficiary) external onlyOwner {
        _setBeneficiary(newBeneficiary);
        emit BeneficiaryUpdate(newBeneficiary);
    }
}
