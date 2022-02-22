// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "../BaseComponentUpgradeable.sol";
import "../agents/AgentRegistry.sol";
import "../scanners/ScannerRegistry.sol";

contract Dispatch is BaseComponentUpgradeable {
    using EnumerableSet for EnumerableSet.UintSet;

    AgentRegistry   private _agents;
    ScannerRegistry private _scanners;

    string public constant version = "0.1.1";

    mapping(uint256 => EnumerableSet.UintSet) private scannerToAgents;
    mapping(uint256 => EnumerableSet.UintSet) private agentToScanners;

    event Link(uint256 agentId, uint256 scannerId, bool enable);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address forwarder) initializer ForwardedContext(forwarder) {}

    /**
     * @notice Initializer method, access point to initialize inheritance tree.
     * @param __manager address of AccessManager.
     * @param __router address of Router.
     * @param __agents address of AgentRegistry.
     * @param __scanners address of ScannerRegistry.
     */
    function initialize(
        address __manager,
        address __router,
        address __agents,
        address __scanners
    ) public initializer {
        __AccessManaged_init(__manager);
        __Routed_init(__router);
        _agents   = AgentRegistry(__agents);
        _scanners = ScannerRegistry(__scanners);
    }

    /**
    * @notice Getter for AgentRegistry.
    * @return AgentRegistry.
    */
    function agentRegistry() public view returns (AgentRegistry) {
        return _agents;
    }

    /**
    * @notice Getter for ScannerRegistry.
    * @return ScannerRegistry.
    */
    function scannerRegistry() public view returns (ScannerRegistry) {
        return _scanners;
    }

    /**
    * @notice Get total agents linked to a scanner.
    * @dev helper for external iteration.
    * @param scannerId ERC1155 token id of the scanner.
    * @return total agents linked to a scanner
    */
    function agentsFor(uint256 scannerId) public view returns (uint256) {
        return scannerToAgents[scannerId].length();
    }

    /**
    * @notice Get total scanners where an agent is running in.
    * @dev helper for external iteration.
    * @param agentId ERC1155 token id of the agent.
    * @return total scanners running an scanner
    */
    function scannersFor(uint256 agentId) public view returns (uint256) {
        return agentToScanners[agentId].length();
    }

    /**
    * @notice Get agentId linked to a scanner in certain position.  
    * @dev helper for external iteration.
    * @param scannerId ERC1155 token id of the scanner.
    * @param pos index for iteration.
    * @return ERC1155 token id of the agent. 
    */
    function agentsAt(uint256 scannerId, uint256 pos) public view returns (uint256) {
        return scannerToAgents[scannerId].at(pos);
    }

    /**
    * @notice Get data of an agent linked to a scanner at a certain position.  
    * @dev helper for external iteration.
    * @param scannerId ERC1155 token id of the scanner.
    * @param pos index for iteration.
    * @return agentId ERC1155 token id of the agent. 
    * @return enabled bool if agent is enabled, false otherwise.
    * @return agentVersion agent version number.
    * @return metadata IPFS pointer for agent metadata
    * @return chainIds ordered
    */
    function agentRefAt(uint256 scannerId, uint256 pos) external view returns (uint256 agentId, bool enabled, uint256 agentVersion, string memory metadata, uint256[] memory chainIds) {
        agentId = agentsAt(scannerId, pos);
        enabled = _agents.isEnabled(agentId);
        (agentVersion, metadata, chainIds) = _agents.getAgent(agentId);
    }

    /**
    * @notice Get scannerId running an agent at a certain position.  
    * @dev helper for external iteration.
    * @param agentId ERC1155 token id of the scanner.
    * @param pos index for iteration.
    * @return ERC1155 token id of the scanner. 
    */
    function scannersAt(uint256 agentId, uint256 pos) public view returns (uint256) {
        return agentToScanners[agentId].at(pos);
    }

    /**
    * @notice Get data of ascanner running an agent at a certain position.  
    * @dev helper for external iteration.
    * @param agentId ERC1155 token id of the agent.
    * @param pos index for iteration.
    * @return scannerId ERC1155 token id of the scanner. 
    * @return enabled bool if scanner is enabled, false otherwise.
    */
    function scannerRefAt(uint256 agentId, uint256 pos) external view returns (uint256 scannerId, bool enabled) {
        scannerId = scannersAt(agentId, pos);
        enabled   = _scanners.isEnabled(agentId);
    }

    /**
     * @notice Assigns the job of running an agent to a scanner.
     * @dev currently only allowed for DISPATCHER_ROLE (Assigner software).
     * @dev emits Link(agentId, scannerId, true) event.
     * @param agentId ERC1155 token id of the agent.
     * @param scannerId ERC1155 token id of the scanner.
     */
    function link(uint256 agentId, uint256 scannerId) public onlyRole(DISPATCHER_ROLE) {
        require(_agents.isEnabled(agentId), "Dispatch: Agent disabled");
        require(_scanners.isEnabled(scannerId), "Dispatch: Scanner disabled");

        scannerToAgents[scannerId].add(agentId);
        agentToScanners[agentId].add(scannerId);

        emit Link(agentId, scannerId, true);
    }

    /**
     * @notice Unassigns the job of running an agent to a scanner.
     * @dev currently only allowed for DISPATCHER_ROLE (Assigner software).
     * @dev emits Link(agentId, scannerId, false) event.
     * @param agentId ERC1155 token id of the agent.
     * @param scannerId ERC1155 token id of the scanner.
     */
    function unlink(uint256 agentId, uint256 scannerId) public onlyRole(DISPATCHER_ROLE) {
        require(_agents.isCreated(agentId), "Dispatch: invalid agent id");
        require(_scanners.isRegistered(scannerId), "Dispatch: invalid scanner id");

        scannerToAgents[scannerId].remove(agentId);
        agentToScanners[agentId].remove(scannerId);

        emit Link(agentId, scannerId, false);
    }

    /**
     * @notice Sets agent registry address.
     * @dev only DEFAULT_ADMIN_ROLE (governance).
     * @param newAgentRegistry agent of the new AgentRegistry.
     */
    function setAgentRegistry(address newAgentRegistry) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _agents = AgentRegistry(newAgentRegistry);
    }

    /**
     * @notice Sets scanner registry address.
     * @dev only DEFAULT_ADMIN_ROLE (governance).
     * @param newScannerRegistry agent of the new ScannerRegistry.
     */
    function setScannerRegistry(address newScannerRegistry) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _scanners = ScannerRegistry(newScannerRegistry);
    }

    function agentHash(uint256 agentId) external view returns (uint256 length, bytes32 manifest) {
        uint256[] memory scanners = agentToScanners[agentId].values();
        bool[]    memory enabled = new bool[](scanners.length);

        for (uint256 i = 0; i < scanners.length; ++i) {
            enabled[i] = _scanners.isEnabled(scanners[i]);
        }

        return (
            scanners.length,
            keccak256(abi.encodePacked(scanners, enabled))
        );
    }

    function scannerHash(uint256 scannerId) external view returns (uint256 length, bytes32 manifest) {
        uint256[] memory agents  = scannerToAgents[scannerId].values();
        uint256[] memory agentVersion = new uint256[](agents.length);
        bool[]    memory enabled = new bool[](agents.length);

        for (uint256 i = 0; i < agents.length; ++i) {
            (agentVersion[i],,) = _agents.getAgent(agents[i]);
            enabled[i]     = _agents.isEnabled(agents[i]);
        }

        return (
            agents.length,
            keccak256(abi.encodePacked(agents, agentVersion, enabled))
        );
    }

    uint256[48] private __gap;
}
