// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/structs/BitMaps.sol";
import "./AgentRegistryCore.sol";

/**
* @dev AgentRegistry methods and state handling disabling and enabling agents, and
* recognizing stake changes that might disable an agent.
* NOTE: This contract was deployed before StakeAwareUpgradeable was created, so __StakeAwareUpgradeable_init
* is not called.
*/
abstract contract AgentRegistryEnable is AgentRegistryCore {
    using BitMaps for BitMaps.BitMap;

    enum Permission {
        ADMIN,
        OWNER,
        length
    }

    mapping(uint256 => BitMaps.BitMap) private _disabled;
    
    event AgentEnabled(uint256 indexed agentId, bool indexed enabled, Permission permission, bool value);

    /**
     * @notice Check if agent is enabled
     * @param agentId ERC721 token id of the agent.
     * @return true if the agent exist, has not been disabled, and is staked over minimum
     * Returns false if otherwise
     */
    function isEnabled(uint256 agentId) public view virtual returns (bool) {
        return (
            isRegistered(agentId) &&
            getDisableFlags(agentId) == 0 &&
            (!_isStakeActivated() || _isStakedOverMin(agentId))
        );
    }

    /**
     * @notice Enable an agent if sender has correct permission and the agent is staked over minimum stake.
     * @dev agents can be disabled by ADMIN or OWNER.
     * @param agentId ERC721 token id of the agent.
     * @param permission the sender claims to have to enable the agent.
     */
    function enableAgent(uint256 agentId, Permission permission) public virtual {
        if (!_hasPermission(agentId, permission)) revert DoesNotHavePermission(_msgSender(), uint8(permission), agentId);
        _enable(agentId, permission, true);
    }

    /**
     * @notice Disable an agent if sender has correct permission.
     * @dev agents can be disabled by ADMIN or OWNER.
     * @param agentId ERC721 token id of the agent.
     * @param permission the sender claims to have to enable the agent.
     */
    function disableAgent(uint256 agentId, Permission permission) public virtual {
        if (!_hasPermission(agentId, permission)) revert DoesNotHavePermission(_msgSender(), uint8(permission), agentId);
        _enable(agentId, permission, false);
    }

    /**
     * @notice Get the disabled flags for an agentId.
     * @dev Permission (uint8) is used for indexing, so we don't need to loop. 
     * If not disabled, all flags will be 0.
     * @param agentId ERC721 token id of the agent.
     * @return uint256 containing the byte flags.
     */
    function getDisableFlags(uint256 agentId) public view returns (uint256) {
        return _disabled[agentId]._data[0];
    }

    /**
     * @notice Permission check.
     * @dev it does not uses AccessManager since it is agent specific
     * @param agentId ERC721 token id of the agent.
     * @param permission the sender claims to have to enable the agent.
     * @return true if: permission.ADMIN and _msgSender is ADMIN_ROLE, Permission.OWNER and owner of agentId,
     * false otherwise.
     */
    function _hasPermission(uint256 agentId, Permission permission) internal view returns (bool) {
        if (permission == Permission.ADMIN) { return hasRole(AGENT_ADMIN_ROLE, _msgSender()); }
        if (permission == Permission.OWNER) { return _msgSender() == ownerOf(agentId); }
        return false;
    }

    /**
     * @notice Internal methods for enabling the agent.
     * @dev fires hook _before and _after enable within the inheritance tree.
     * @param agentId ERC721 token id of the agent.
     * @param permission the sender claims to have to enable the agent.
     * @param enable true if enabling, false if disabling.
     */
    function _enable(uint256 agentId, Permission permission, bool enable) internal {
        _beforeAgentEnable(agentId, permission, enable);
        _agentEnable(agentId, permission, enable);
        _afterAgentEnable(agentId, permission, enable);
    }

    /**
     * @notice Hook _before agent enable
     * @dev does nothing in this contract
     * @param agentId ERC721 token id of the agent.
     * @param permission the sender claims to have to enable the agent.
     * @param value true if enabling, false if disabling.
     */
    function _beforeAgentEnable(uint256 agentId, Permission permission, bool value) internal virtual {
    }

    /**
     * @notice Logic for enabling agents, sets flag corresponding to permission.
     * @dev does nothing in this contract
     * @param agentId ERC721 token id of the agent.
     * @param permission the sender claims to have to enable the agent.
     * @param value true if enabling, false if disabling.
     */
    function _agentEnable(uint256 agentId, Permission permission, bool value) internal virtual {
        _disabled[agentId].setTo(uint8(permission), !value);
        emit AgentEnabled(agentId, isEnabled(agentId), permission, value);
    }

    /**
     * @notice Hook _after agent enable
     * @dev emits Router hook
     * @param agentId ERC721 token id of the agent.
     * @param permission the sender claims to have to enable the agent.
     * @param value true if enabling, false if disabling.
     */
    function _afterAgentEnable(uint256 agentId, Permission permission, bool value) internal virtual {
        
    }
    
    /**
     * Obligatory inheritance dismambiguation of ForwardedContext's _msgSender()
     * @return sender msg.sender if not a meta transaction, signer of forwarder metatx if it is.
     */
    function _msgSender() internal view virtual override(AgentRegistryCore) returns (address sender) {
        return super._msgSender();
    }

    /**
     * Obligatory inheritance dismambiguation of ForwardedContext's _msgSender()
     * @return sender msg.data if not a meta transaction, forwarder data in metatx if it is.
     */
    function _msgData() internal view virtual override(AgentRegistryCore) returns (bytes calldata) {
        return super._msgData();
    }

    /**
     *  50
     * - 1 _disabled
     * --------------------------
     *  49 __gap
     */
    uint256[49] private __gap;
}
