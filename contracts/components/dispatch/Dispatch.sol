// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "../BaseComponentUpgradeable.sol";
import "../agents/AgentRegistry.sol";
import "../scanners/ScannerRegistry.sol";
import "../scanner_pools/ScannerPoolRegistry.sol";

contract Dispatch is BaseComponentUpgradeable {
    using EnumerableSet for EnumerableSet.UintSet;

    string public constant version = "0.1.5";

    AgentRegistry private _agents;
    /// @custom:oz-renamed-from _scanners
    ScannerRegistry private _scanners_deprecated;
    mapping(uint256 => EnumerableSet.UintSet) private scannerToAgents;
    mapping(uint256 => EnumerableSet.UintSet) private agentToScanners;

    ScannerPoolRegistry private _scannerPools;

    error Disabled(string name);
    error InvalidId(string name, uint256 id);

    event SetAgentRegistry(address registry);
    event SetScannerRegistry(address registry);
    event SetScannerPoolRegistry(address registry);
    event AlreadyLinked(uint256 agentId, uint256 scannerId, bool enable);
    event Link(uint256 agentId, uint256 scannerId, bool enable);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address forwarder) initializer ForwardedContext(forwarder) {}

    /**
     * @notice Initializer method, access point to initialize inheritance tree.
     * @param __manager address of AccessManager.
     * @param __agents address of AgentRegistry.
     * @param __scanners address of ScannerRegistry.
     * @param __scannerPools address of ScannerPoolRegistry.
     */
    function initialize(
        address __manager,
        address __agents,
        address __scanners,
        address __scannerPools
    ) public initializer {
        __BaseComponentUpgradeable_init(__manager);
        _setAgentRegistry(__agents);
        _setScannerRegistry(__scanners);
        _setScannerPoolRegistry(__scannerPools);
    }

    function agentRegistry() public view returns (AgentRegistry) {
        return _agents;
    }

    function scannerRegistry() public view returns (ScannerRegistry) {
        return _scanners_deprecated;
    }

    function scannerPoolRegistry() public view returns (ScannerPoolRegistry) {
        return _scannerPools;
    }

    /**
     * @notice Get total agents linked to a scanner.
     * @dev helper for external iteration.
     * @param scannerId address of the scanner converted to uint256
     * @return total agents linked to a scanner
     */
    function numAgentsFor(uint256 scannerId) public view returns (uint256) {
        return scannerToAgents[scannerId].length();
    }

    /**
     * @notice Get total scanners where an agent is running in.
     * @dev helper for external iteration.
     * @param agentId ERC721 token id of the agent.
     * @return total scanners running an scanner
     */
    function numScannersFor(uint256 agentId) public view returns (uint256) {
        return agentToScanners[agentId].length();
    }

    /**
     * @notice Get agentId linked to a scanner in certain position.
     * @dev helper for external iteration.
     * @param scannerId address of the scanner converted to uint256
     * @param pos index for iteration.
     * @return ERC721 token id of the agent.
     */
    function agentAt(uint256 scannerId, uint256 pos) public view returns (uint256) {
        return scannerToAgents[scannerId].at(pos);
    }

    /**
     * @notice Get data of an agent linked to a scanner at a certain position.
     * @dev helper for external iteration.
     * @param scannerId address of the scanner converted to uint256
     * @param pos index for iteration.
     * @return registered bool if agent exists, false otherwise.
     * @return owner address.
     * @return agentId ERC721 token id of the agent.
     * @return agentVersion agent version number.
     * @return metadata IPFS pointer for agent metadata.
     * @return chainIds ordered array of chainId were the agent wants to run.
     * @return enabled bool if agent is enabled, false otherwise.
     * @return disabledFlags 0 if not disabled, Permission that disabled the scnner otherwise.
     */
    function agentRefAt(uint256 scannerId, uint256 pos)
        external
        view
        returns (
            bool registered,
            address owner,
            uint256 agentId,
            uint256 agentVersion,
            string memory metadata,
            uint256[] memory chainIds,
            bool enabled,
            uint256 disabledFlags
        )
    {
        agentId = agentAt(scannerId, pos);
        (registered, owner, agentVersion, metadata, chainIds, enabled, disabledFlags) = _agents.getAgentState(agentId);
        return (registered, owner, agentId, agentVersion, metadata, chainIds, enabled, disabledFlags);
    }

    /**
     * @notice Get scannerId running an agent at a certain position.
     * @dev helper for external iteration.
     * @param agentId ERC721 token id of the scanner.
     * @param pos index for iteration.
     * @return ERC721 token id of the scanner.
     */
    function scannerAt(uint256 agentId, uint256 pos) public view returns (uint256) {
        return agentToScanners[agentId].at(pos);
    }

    /**
     * @notice Get data of ascanner running an agent at a certain position.
     * @dev helper for external iteration.
     * @param agentId ERC721 token id of the agent.
     * @param pos index for iteration.
     * @return registered true if scanner is registered.
     * @return scannerId ERC721 token id of the scanner.
     * @return owner address.
     * @return chainId that the scanner monitors.
     * @return metadata IPFS pointer for agent metadata.
     * @return operational true if scanner is not disabled and staked over min, false otherwise.
     * @return disabled true if disabled by ScannerPool or scanner itself.
     */
    function scannerRefAt(uint256 agentId, uint256 pos)
        external
        view
        returns (
            bool registered,
            uint256 scannerId,
            address owner,
            uint256 chainId,
            string memory metadata,
            bool operational,
            bool disabled
        )
    {
        scannerId = scannerAt(agentId, pos);
        (registered, owner, chainId, metadata, operational, disabled) = _getScannerState(scannerId);
        return (registered, scannerId, owner, chainId, metadata, operational, disabled);
    }

    /// Returns true if scanner and agents are linked, false otherwise.
    function areTheyLinked(uint256 agentId, uint256 scannerId) external view returns (bool) {
        return scannerToAgents[scannerId].contains(agentId) && agentToScanners[agentId].contains(scannerId);
    }

    /**
     * @notice Assigns the job of running an agent to a scanner.
     * @dev currently only allowed for DISPATCHER_ROLE (Assigner software).
     * @dev emits Link(agentId, scannerId, true) event.
     * @param agentId ERC721 token id of the agent.
     * @param scannerId address of the scanner converted to uint256
     */
    function link(uint256 agentId, uint256 scannerId) public onlyRole(DISPATCHER_ROLE) {
        if (!_agents.isEnabled(agentId)) revert Disabled("Agent");
        if (!_isScannerOperational(scannerId)) revert Disabled("Scanner");

        if (!scannerToAgents[scannerId].add(agentId) || !agentToScanners[agentId].add(scannerId)) {
            emit AlreadyLinked(agentId, scannerId, true);
        } else {
            emit Link(agentId, scannerId, true);
        }
    }

    /**
     * @notice Unassigns the job of running an agent to a scanner.
     * @dev currently only allowed for DISPATCHER_ROLE (Assigner software).
     * @dev emits Link(agentId, scannerId, false) event.
     * @param agentId ERC721 token id of the agent.
     * @param scannerId address of the scanner converted to uint256
     */
    function unlink(uint256 agentId, uint256 scannerId) public onlyRole(DISPATCHER_ROLE) {
        if (!_agents.isRegistered(agentId)) revert InvalidId("Agent", agentId);
        if (!_isScannerRegistered(scannerId)) revert InvalidId("Scanner", scannerId);

        if (!scannerToAgents[scannerId].remove(agentId) || !agentToScanners[agentId].remove(scannerId)) {
            emit AlreadyLinked(agentId, scannerId, false);
        } else {
            emit Link(agentId, scannerId, false);
        }
    }

    /**
     * @notice Sets agent registry address.
     * @dev only DEFAULT_ADMIN_ROLE (governance).
     * @param newAgentRegistry agent of the new AgentRegistry.
     */
    function setAgentRegistry(address newAgentRegistry) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _setAgentRegistry(newAgentRegistry);
    }

    function _setAgentRegistry(address newAgentRegistry) private {
        if (newAgentRegistry == address(0)) revert ZeroAddress("newAgentRegistry");
        _agents = AgentRegistry(newAgentRegistry);
        emit SetAgentRegistry(newAgentRegistry);
    }

    /**
     * @notice Sets scanner registry address.
     * @dev only DEFAULT_ADMIN_ROLE (governance).
     * @param newScannerRegistry agent of the new ScannerRegistry.
     */
    function setScannerRegistry(address newScannerRegistry) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _setScannerRegistry(newScannerRegistry);
    }

    function _setScannerRegistry(address newScannerRegistry) private {
        if (newScannerRegistry == address(0)) revert ZeroAddress("newScannerRegistry");
        _scanners_deprecated = ScannerRegistry(newScannerRegistry);
        emit SetScannerRegistry(newScannerRegistry);
    }

    /**
     * @notice Sets ScannerPool registry address.
     * @dev only DEFAULT_ADMIN_ROLE (governance).
     * @param newScannerPoolRegistry agent of the new ScannerRegistry.
     */
    function setScannerPoolRegistry(address newScannerPoolRegistry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setScannerPoolRegistry(newScannerPoolRegistry);
    }

    function _setScannerPoolRegistry(address newScannerPoolRegistry) private {
        if (newScannerPoolRegistry == address(0)) revert ZeroAddress("newScannerPoolRegistry");
        _scannerPools = ScannerPoolRegistry(newScannerPoolRegistry);
        emit SetScannerPoolRegistry(newScannerPoolRegistry);
    }

    /**
     * Method to hash the amount of scanners an agent is running in, and their status
     * @dev method marked for deprecation in next version.
     */
    function agentHash(uint256 agentId) external view returns (uint256 length, bytes32 manifest) {
        uint256[] memory scanners = agentToScanners[agentId].values();
        bool[] memory enabled = new bool[](scanners.length);

        for (uint256 i = 0; i < scanners.length; i++) {
            enabled[i] = _isScannerOperational(scanners[i]);
        }

        return (scanners.length, keccak256(abi.encodePacked(scanners, enabled)));
    }

    /**
     * @dev method used by Scanner Node software to know if their list of assigned agents has changed,
     * their enabled state or version has changed so they can start managing changes
     * (loading new agent images, removing not assigned agents, updating agents...).
     * @param scannerId address of the scanner converted to uint256
     * @return length amount of agents.
     * @return manifest keccak256 of list of agents, list of agentVersion and list of enabled states.
     */
    function scannerHash(uint256 scannerId) external view returns (uint256 length, bytes32 manifest) {
        uint256[] memory agents = scannerToAgents[scannerId].values();
        uint256[] memory agentVersion = new uint256[](agents.length);
        bool[] memory enabled = new bool[](agents.length);

        for (uint256 i = 0; i < agents.length; i++) {
            (, , agentVersion[i], , ) = _agents.getAgent(agents[i]);
            enabled[i] = _agents.isEnabled(agents[i]);
        }

        return (agents.length, keccak256(abi.encodePacked(agents, agentVersion, enabled)));
    }

    function _isScannerOperational(uint256 scannerId) internal view returns (bool) {
        if (_scanners_deprecated.hasMigrationEnded()) {
            return _scannerPools.isScannerOperational(address(uint160(scannerId)));
        } else {
            return _scanners_deprecated.isEnabled(scannerId);
        }
    }

    function _isScannerRegistered(uint256 scannerId) internal view returns (bool) {
        if (_scanners_deprecated.hasMigrationEnded()) {
            return _scannerPools.isScannerRegistered(address(uint160(scannerId)));
        } else {
            return _scanners_deprecated.isRegistered(scannerId);
        }
    }

    function _getScannerState(uint256 scannerId)
        internal
        view
        returns (
            bool registered,
            address owner,
            uint256 chainId,
            string memory metadata,
            bool operational,
            bool disabled
        )
    {
        if (_scanners_deprecated.hasMigrationEnded()) {
            return _scannerPools.getScannerState(address(uint160(scannerId)));
        } else {
            uint256 disabledFlags;
            (registered, owner, chainId, metadata, operational, disabledFlags) = _scanners_deprecated.getScannerState(scannerId);
            return (registered, owner, chainId, metadata, operational, disabledFlags != 0);
        }
    }

    /**
     *  50
     *   1 _agents;
     *   1 _scanners_deprecated;
     *   1 scannerToAgents
     *   1 agentToScanners
     *  48 (mistakenly deployed with 48 in version 0.1.4, so we start counting here again. This contract is the last of its inheritance chain, so it's fine.)
     * - 1 _scannerPools
     * --------------------------
     *  47 __gap
     */
    uint256[47] private __gap;
}
