// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

// These are the roles used in the components of the Forta system, except
// Forta token itself, that needs to define it's own roles for consistency across chains

bytes32 constant DEFAULT_ADMIN_ROLE = bytes32(0);

// Routing
bytes32 constant ROUTER_ADMIN_ROLE = keccak256("ROUTER_ADMIN_ROLE");
// Base component
bytes32 constant ENS_MANAGER_ROLE = keccak256("ENS_MANAGER_ROLE");
bytes32 constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
// Registries
bytes32 constant AGENT_ADMIN_ROLE = keccak256("AGENT_ADMIN_ROLE");
bytes32 constant SCANNER_ADMIN_ROLE = keccak256("SCANNER_ADMIN_ROLE");
bytes32 constant SCANNER_POOL_ADMIN_ROLE = keccak256("SCANNER_POOL_ADMIN_ROLE");
bytes32 constant SCANNER_2_SCANNER_POOL_MIGRATOR_ROLE = keccak256("SCANNER_2_SCANNER_POOL_MIGRATOR_ROLE"); 
bytes32 constant DISPATCHER_ROLE = keccak256("DISPATCHER_ROLE");
bytes32 constant MIGRATION_EXECUTOR_ROLE = keccak256("MIGRATION_EXECUTOR_ROLE");

// Staking
bytes32 constant SLASHER_ROLE = keccak256("SLASHER_ROLE");
bytes32 constant SWEEPER_ROLE = keccak256("SWEEPER_ROLE");
bytes32 constant REWARDER_ROLE = keccak256("REWARDER_ROLE");
bytes32 constant SLASHING_ARBITER_ROLE = keccak256("SLASHING_ARBITER_ROLE");
bytes32 constant STAKING_CONTRACT_ROLE = keccak256("STAKING_CONTRACT_ROLE");
bytes32 constant STAKING_ADMIN_ROLE = keccak256("STAKING_ADMIN_ROLE");
bytes32 constant ALLOCATOR_CONTRACT_ROLE = keccak256("ALLOCATOR_CONTRACT_ROLE");

// Scanner Node Version
bytes32 constant SCANNER_VERSION_ROLE = keccak256("SCANNER_VERSION_ROLE");
bytes32 constant SCANNER_BETA_VERSION_ROLE = keccak256("SCANNER_BETA_VERSION_ROLE");
