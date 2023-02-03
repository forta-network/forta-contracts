import { Address, BigInt } from "@graphprotocol/graph-ts";
import {
  ScannerPoolRegistered as ScannerPoolRegisteredEvent,
  ScannerPoolRegistry as ScannerPoolRegistryContract,
  ScannerUpdated as ScannerUpdatedEvent,
  ScannerEnabled as ScannerEnabledEvent
} from "../../generated/ScannerPoolRegistry/ScannerPoolRegistry";
import { fetchScannerPool } from "../fetch/scannerpool";
import { fetchScannode } from "../fetch/scannode";
import { fetchAccount } from "../fetch/account";

export function handleScannerPoolRegistered(event: ScannerPoolRegisteredEvent): void {
  const registryAddress = event.address;
  const scannerPoolId = event.params.scannerPoolId;
  const scannerPoolRegistry = ScannerPoolRegistryContract.bind(registryAddress);
  const scannerPool = fetchScannerPool(scannerPoolId);
  let to = fetchAccount(event.transaction.from);
  
  scannerPool.registered = scannerPoolRegistry.isRegistered(scannerPoolId);
  scannerPool.owner = to.id;
  scannerPool.chainId = event.params.chainId.toI32();
  scannerPool.save();
}

export function handleScannerUpdated(event: ScannerUpdatedEvent): void {
  const scanNode = fetchScannode(event.params.scannerId);
  const scannerPool = fetchScannerPool(event.params.scannerPool);
  scanNode.chainId = event.params.chainId;
  scanNode.scannerPool = scannerPool.id;
  scanNode.save();
  scannerPool.save();
}

export function handleScannerEnabled(event: ScannerEnabledEvent): void {
  const scanNode = fetchScannode(event.params.scannerId);
  scanNode.enabled = event.params.enabled;
  scanNode.save();
}