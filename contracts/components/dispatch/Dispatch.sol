// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "../BaseComponent.sol";
import "../agents/AgentRegistry.sol";
import "../scanners/ScannerRegistry.sol";

contract Dispatch is BaseComponent {
    using EnumerableSet for EnumerableSet.UintSet;

    AgentRegistry   private _agents;
    ScannerRegistry private _scanners;

    mapping(uint256 => EnumerableSet.UintSet) private scannerToAgents;
    mapping(uint256 => EnumerableSet.UintSet) private agentToScanners;

    event Link(uint256 agentId, uint256 scannerId, bool enable);


    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

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

    function scannersAt(uint256 agentId, uint256 pos) public view returns (uint256) {
        return agentToScanners[agentId].at(pos);
    }

    function link(uint256 agentId, uint256 scannerId) public onlyRole(DISPATCHER_ROLE) {
        require(_agents.ownerOf(agentId) != address(0), "invalid agent id");
        require(_scanners.ownerOf(scannerId) != address(0), "invalid scanner id");

        scannerToAgents[scannerId].add(agentId);
        agentToScanners[agentId].add(scannerId);

        emit Link(agentId, scannerId, true);
    }

    function unlink(uint256 agentId, uint256 scannerId) public onlyRole(DISPATCHER_ROLE) {
        require(_agents.ownerOf(agentId) != address(0), "invalid agent id");
        require(_scanners.ownerOf(scannerId) != address(0), "invalid scanner id");

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

    uint256[48] private __gap;
}
