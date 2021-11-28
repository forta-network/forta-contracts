// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./FortaCommon.sol";

contract FortaBridged is FortaCommon {
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    address public immutable childChainManagerProxy;

    modifier flashRole(bytes32 role, address user) {
        bool missing = !hasRole(role, user);

        if (missing) {
            _grantRole(role, user);
        }
        _;
        if (missing) {
            _revokeRole(role, user);
        }
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address _childChainManagerProxy) {
        childChainManagerProxy = _childChainManagerProxy;
    }

    function initialize(address admin) public initializer {
        __FortaCommon_init(admin);
    }

    function deposit(address user, bytes calldata depositData) external flashRole(WHITELIST_ROLE, user) {
        require(msg.sender == childChainManagerProxy, "FortaBridged: only childChainManagerProxy can deposit");

        uint256 amount = abi.decode(depositData, (uint256));
        _mint(user, amount);
    }

    function withdraw(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    function withdrawTo(uint256 amount, address receiver) external flashRole(WHITELIST_ROLE, receiver) {
        _transfer(msg.sender, receiver, amount);
        _burn(receiver, amount);
    }
}
