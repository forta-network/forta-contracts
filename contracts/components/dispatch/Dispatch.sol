// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

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

    function numAgentsFor(uint256 scannerId) public view returns (uint256) {
        return scannerToAgents[scannerId].length();
    }

    function numScannersFor(uint256 agentId) public view returns (uint256) {
        return agentToScanners[agentId].length();
    }

    function agentAt(uint256 scannerId, uint256 pos) public view returns (uint256) {
        return scannerToAgents[scannerId].at(pos);
    }

    function agentRefAt(uint256 scannerId, uint256 pos) external view returns (uint256 agentId, bool enabled, uint256 agentVersion, string memory metadata, uint256[] memory chainIds) {
        agentId = agentAt(scannerId, pos);
        enabled = _agents.isEnabled(agentId);
        (agentVersion, metadata, chainIds) = _agents.getAgent(agentId);
    }

    function scannerAt(uint256 agentId, uint256 pos) public view returns (uint256) {
        return agentToScanners[agentId].at(pos);
    }

    function scannerRefAt(uint256 agentId, uint256 pos) external view returns (uint256 scannerId, bool enabled) {
        scannerId = scannerAt(agentId, pos);
        enabled   = _scanners.isEnabled(agentId);
    }

    function link(uint256 agentId, uint256 scannerId) public onlyRole(DISPATCHER_ROLE) {
        require(_agents.isEnabled(agentId), "Dispatch: Agent disabled");
        require(_scanners.isEnabled(scannerId), "Dispatch: Scanner disabled");

        require(scannerToAgents[scannerId].add(agentId), "Dispatch: Agent already linked");
        require(agentToScanners[agentId].add(scannerId), "Dispatch: Scanner already linked");

        emit Link(agentId, scannerId, true);
    }

    function unlink(uint256 agentId, uint256 scannerId) public onlyRole(DISPATCHER_ROLE) {
        require(_agents.isCreated(agentId), "Dispatch: invalid agent id");
        require(_scanners.isRegistered(scannerId), "Dispatch: invalid scanner id");

        require(scannerToAgents[scannerId].remove(agentId), "Dispatch: Agent already unlinked");
        require(agentToScanners[agentId].remove(scannerId), "Dispatch: Scanner already unlinked");

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
