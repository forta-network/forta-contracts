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

    mapping(uint256 => EnumerableSet.UintSet) private scannerToAgents;
    mapping(uint256 => EnumerableSet.UintSet) private agentToScanners;

    event Link(uint256 agentId, uint256 scannerId, bool enable);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address forwarder) initializer ForwardedContext(forwarder) {}

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

    function agentRegistry() public view returns (AgentRegistry) {
        return _agents;
    }

    function scannerRegistry() public view returns (ScannerRegistry) {
        return _scanners;
    }

    function agentsFor(uint256 scannerId) public view returns (uint256) {
        return scannerToAgents[scannerId].length();
    }

    function scannersFor(uint256 agentId) public view returns (uint256) {
        return agentToScanners[agentId].length();
    }

    function agentsAt(uint256 scannerId, uint256 pos) public view returns (uint256) {
        return scannerToAgents[scannerId].at(pos);
    }

    function agentRefAt(uint256 scannerId, uint256 pos) external view returns (uint256 agentId, bool enabled, uint256 version, string memory metadata, uint256[] memory chainIds) {
        agentId = agentsAt(scannerId, pos);
        enabled = _agents.isEnabled(agentId);
        (version, metadata, chainIds) = _agents.getAgent(agentId);
    }

    function scannersAt(uint256 agentId, uint256 pos) public view returns (uint256) {
        return agentToScanners[agentId].at(pos);
    }

    function scannerRefAt(uint256 agentId, uint256 pos) external view returns (uint256 scannerId, bool enabled) {
        scannerId = agentsAt(agentId, pos);
        enabled   = _scanners.isEnabled(agentId);
    }

    function link(uint256 agentId, uint256 scannerId) public onlyRole(DISPATCHER_ROLE) {
        require(_agents.ownerOf(agentId) != address(0), "Dispatch: invalid agent id");
        require(_scanners.ownerOf(scannerId) != address(0), "Dispatch: invalid scanner id");

        scannerToAgents[scannerId].add(agentId);
        agentToScanners[agentId].add(scannerId);

        emit Link(agentId, scannerId, true);
    }

    function unlink(uint256 agentId, uint256 scannerId) public onlyRole(DISPATCHER_ROLE) {
        require(_agents.ownerOf(agentId) != address(0), "Dispatch: invalid agent id");
        require(_scanners.ownerOf(scannerId) != address(0), "Dispatch: invalid scanner id");

        scannerToAgents[scannerId].remove(agentId);
        agentToScanners[agentId].remove(scannerId);

        emit Link(agentId, scannerId, false);
    }

    function setAgentRegistry(address newAgentRegistry) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _agents = AgentRegistry(newAgentRegistry);
    }

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
        uint256[] memory version = new uint256[](agents.length);
        bool[]    memory enabled = new bool[](agents.length);

        for (uint256 i = 0; i < agents.length; ++i) {
            (version[i],,) = _agents.getAgent(agents[i]);
            enabled[i]     = _agents.isEnabled(agents[i]);
        }

        return (
            agents.length,
            keccak256(abi.encodePacked(agents, version, enabled))
        );
    }

    uint256[48] private __gap;
}
