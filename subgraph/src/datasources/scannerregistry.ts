import eventId from "../utils/event";
import transactionLog from "../utils/transaction";
import {
  ScannerUpdated as ScannerUpdatedEvent,
  Transfer as TransferEvent,
  ScannerEnabled as ScannerEnabledEvent,
  ScannerRegistry as ScannerRegistryContract,
  ManagerEnabled as ManagerEnabledEvent,
  StakeControllerUpdated as StakeControllerUpdatedEvent,
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
import { fetchStakeThreshold } from "../fetch/stakethreshold";

export function handleScannerUpdated(event: ScannerUpdatedEvent): void {
  let scanner = fetchScanner(event.params.scannerId);
  scanner.metadata = event.params.metadata;
  scanner.chainId = event.params.chainId;
  scanner.save();

  const ev = new ScannerUpdated(eventId(event));
  ev.transaction = transactionLog(event).id;
  ev.timestamp = event.block.timestamp;
  ev.scanner = scanner.id;
  ev.metadata = event.params.metadata;
  ev.chainId = event.params.chainId;
  ev.save();
}

export function handleTransfer(event: TransferEvent): void {
  let scanner = fetchScanner(event.params.tokenId);
  let from = fetchAccount(event.params.from.toHex());
  let to = fetchAccount(event.params.to.toHex());
  scanner.owner = to.id;
  scanner.save();

  const ev = new ScannerTransfer(eventId(event));
  ev.transaction = transactionLog(event).id;
  ev.timestamp = event.block.timestamp;
  ev.scanner = scanner.id;
  ev.from = from.id;
  ev.to = to.id;
  ev.save();
}

export function handleManagerEnabled(event: ManagerEnabledEvent): void {
  let scanner = fetchScanner(event.params.scannerId);
  let account = fetchAccount(event.params.manager.toHex());

  let scannerManager = new ScannerManager(
    scanner.id.concat("/").concat(account.id)
  );

  scannerManager.scanner = scanner.id;
  scannerManager.account = account.id;
  scannerManager.active = event.params.enabled;
  scannerManager.save();

  let ev = new ScannerManagerEnabled(eventId(event));
  ev.transaction = transactionLog(event).id;
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

  let ev = new ScannerEnabled(eventId(event));
  ev.transaction = transactionLog(event).id;
  ev.timestamp = event.block.timestamp;
  ev.scanner = scanner.id;
  ev.enabled = event.params.enabled;
  ev.permission = event.params.permission;
  ev.value = event.params.value;
  ev.save();
}
