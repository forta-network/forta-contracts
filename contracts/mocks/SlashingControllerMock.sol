// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-protocol/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.4;

import "../components/staking/ISlashingController.sol";
import "../components/staking/FortaStaking.sol";


contract SlashingControllerMock is ISlashingController {

    uint256 private _slashedStakeValue;
    uint8 private _subjectType;
    uint256 private _subject;
    address private _proposer;
    uint256 private _slashPercentToProposer;
    FortaStaking public staking;

    function setFortaStaking(FortaStaking _staking) external {
        staking = _staking;
    }

    function slash() external {
        staking.slash(1);
    }

    function setSlashedStakeValue(uint256 value) external {
        _slashedStakeValue = value;
    }

    function getSlashedStakeValue(uint256) external view override returns (uint256 stakeValue) {
        return _slashedStakeValue;
    }

    function setSubject(uint8 subjectType, uint256 subject) external {
        _subject = subject;
        _subjectType = subjectType;
    }

    function getSubject(uint256) external view override returns (uint8 subjectType, uint256 subject) {
        return (_subjectType, _subject);
    }

    function setProposer(address proposer) external {
        _proposer = proposer;
    }


    function getProposer(uint256) external view override returns (address) {
        return _proposer;
    }

    function setSlashPercentToProposer(uint256 percent) external {
        _slashPercentToProposer = percent;
    }

    function slashPercentToProposer() external view override returns (uint256) {
        return _slashPercentToProposer;
    }
}