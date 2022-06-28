import { events, transactions } from "@amxx/graphprotocol-utils/";
import {
  ScannerUpdated as ScannerUpdatedEvent,
  Transfer as TransferEvent,
  ScannerEnabled as ScannerEnabledEvent,
  ManagerEnabled as ManagerEnabledEvent,
} from "../../generated/ScannerRegistry/ScannerRegistry";
import {
  ScannerEnabled,
  ScannerManager,
  ScannerManagerEnabled,
  ScannerTransfer,
  ScannerUpdated,
} from "../../generated/schema";
import { fetchAccount } from "../fetch/account";
import { fetchScanner } from "../fetch/scanner";
import { newMockEvent } from "matchstick-as";
import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts";

export function handleScannerUpdated(event: ScannerUpdatedEvent): void {
  let scanner = fetchScanner(event.params.scannerId);
  scanner.metadata = event.params.metadata;
  scanner.chainId = event.params.chainId;
  scanner.save();

  const ev = new ScannerUpdated(events.id(event));
  ev.transaction = transactions.log(event).id;
  ev.timestamp = event.block.timestamp;
  ev.scanner = scanner.id;
  ev.metadata = event.params.metadata;
  ev.chainId = event.params.chainId;
  ev.save();
}

export function handleTransfer(event: TransferEvent): void {
  let scanner = fetchScanner(event.params.tokenId);
  let from = fetchAccount(event.params.from);
  let to = fetchAccount(event.params.to);
  scanner.owner = to.id;
  scanner.save();

  const ev = new ScannerTransfer(events.id(event));
  ev.transaction = transactions.log(event).id;
  ev.timestamp = event.block.timestamp;
  ev.scanner = scanner.id;
  ev.from = from.id;
  ev.to = to.id;
  ev.save();
}

export function handleManagerEnabled(event: ManagerEnabledEvent): void {
  let scanner = fetchScanner(event.params.scannerId);
  let account = fetchAccount(event.params.manager);

  let scannerManager = new ScannerManager(
    scanner.id.concat("/").concat(account.id)
  );

  scannerManager.scanner = scanner.id;
  scannerManager.account = account.id;
  scannerManager.active = event.params.enabled;
  scannerManager.save();

  const ev = new ScannerManagerEnabled(events.id(event));
  ev.transaction = transactions.log(event).id;
  ev.timestamp = event.block.timestamp;
  ev.scanner = scanner.id;
  ev.manager = account.id;
  ev.scannermanager = scannerManager.id;
  ev.enabled = event.params.enabled;
  ev.save();
}

export function handleScannerEnabled(event: ScannerEnabledEvent): void {
  let scanner = fetchScanner(event.params.scannerId);
  let mask = 1 << event.params.permission;

  scanner.disableFlags = event.params.value
    ? scanner.disableFlags || mask
    : scanner.disableFlags && ~mask;

  scanner.enabled = event.params.enabled;
  scanner.save();

  const ev = new ScannerEnabled(events.id(event));
  ev.transaction = transactions.log(event).id;
  ev.timestamp = event.block.timestamp;
  ev.scanner = scanner.id;
  ev.enabled = event.params.enabled;
  ev.permission = event.params.permission;
  ev.value = event.params.value;
  ev.save();
}

export function createTransferEvent(
  from: Address,
  to: Address,
  tokenId: BigInt
): TransferEvent {
  const mockTransferEvent = changetype<TransferEvent>(newMockEvent());

  mockTransferEvent.parameters = [];

  const fromParam = new ethereum.EventParam(
    "from",
    ethereum.Value.fromAddress(from)
  );

  const toParam = new ethereum.EventParam("to", ethereum.Value.fromAddress(to));

  const tokenIdParam = new ethereum.EventParam(
    "tokenId",
    ethereum.Value.fromSignedBigInt(tokenId)
  );

  mockTransferEvent.parameters.push(fromParam);
  mockTransferEvent.parameters.push(toParam);
  mockTransferEvent.parameters.push(tokenIdParam);

  return mockTransferEvent;
}

export function createScannerUpdatedEvent(
  scannerId: BigInt,
  chainId: BigInt,
  metadata: string
): ScannerUpdatedEvent {
  const mockUpdatedEvent = changetype<ScannerUpdatedEvent>(newMockEvent());
  mockUpdatedEvent.parameters = [];

  const scannerIdParam = new ethereum.EventParam(
    "scannerId",
    ethereum.Value.fromSignedBigInt(scannerId)
  );

  const chainIdParam = new ethereum.EventParam(
    "chainId",
    ethereum.Value.fromSignedBigInt(chainId)
  );

  const metadataParam = new ethereum.EventParam(
    "metadata",
    ethereum.Value.fromString(metadata)
  );

  mockUpdatedEvent.parameters.push(scannerIdParam);
  mockUpdatedEvent.parameters.push(chainIdParam);
  mockUpdatedEvent.parameters.push(metadataParam);

  return mockUpdatedEvent;
}

export function createManagerEnabledEvent(
  scannerId: BigInt,
  manager: Address,
  enabled: boolean
): ManagerEnabledEvent {
  const mockManagerEnabledEvent = changetype<ManagerEnabledEvent>(
    newMockEvent()
  );

  mockManagerEnabledEvent.parameters = [];

  const scannerIdParam = new ethereum.EventParam(
    "scannerId",
    ethereum.Value.fromSignedBigInt(scannerId)
  );

  const managerParam = new ethereum.EventParam(
    "manager",
    ethereum.Value.fromAddress(manager)
  );

  const enabledParam = new ethereum.EventParam(
    "enabled",
    ethereum.Value.fromBoolean(enabled)
  );

  mockManagerEnabledEvent.parameters.push(scannerIdParam);
  mockManagerEnabledEvent.parameters.push(managerParam);
  mockManagerEnabledEvent.parameters.push(enabledParam);

  return mockManagerEnabledEvent;
}

export function createScannerEnabledEvent(
  scannerId: BigInt,
  enabled: boolean,
  permission: i32,
  value: boolean
): ScannerEnabledEvent {
  const mockScannerEnabled = changetype<ScannerEnabledEvent>(newMockEvent());

  mockScannerEnabled.parameters = [];
  const scannerIdParam = new ethereum.EventParam(
    "scannerId",
    ethereum.Value.fromSignedBigInt(scannerId)
  );

  const permissionParam = new ethereum.EventParam(
    "permission",
    ethereum.Value.fromI32(permission)
  );

  const valueParam = new ethereum.EventParam(
    "value",
    ethereum.Value.fromBoolean(value)
  );

  const enabledParam = new ethereum.EventParam(
    "enabled",
    ethereum.Value.fromBoolean(enabled)
  );

  mockScannerEnabled.parameters.push(scannerIdParam);
  mockScannerEnabled.parameters.push(enabledParam);
  mockScannerEnabled.parameters.push(permissionParam);
  mockScannerEnabled.parameters.push(valueParam);

  return mockScannerEnabled;
}
