import { Address, BigInt } from "@graphprotocol/graph-ts";
import {
  ScannerPoolRegistered as ScannerPoolRegisteredEvent,
  ScannerPoolRegistry as ScannerPoolRegistryContract,
  ScannerUpdated as ScannerUpdatedEvent,
  ScannerEnabled as ScannerEnabledEvent
} from "../../generated/ScannerPoolRegistry/ScannerPoolRegistry";
import { fetchScannerPool } from "../fetch/scannerpool";
import { fetchScannode } from "../fetch/scannode";

function updateScannerPool(registryAddress: Address, id: BigInt): void {
  const scannerPoolRegistry = ScannerPoolRegistryContract.bind(registryAddress);
  const scannerPool = fetchScannerPool(id);
  scannerPool.registered = scannerPoolRegistry.isRegistered(id);
  scannerPool.save();
}

export function handleScannerPoolRegistered(event: ScannerPoolRegisteredEvent): void {
  updateScannerPool(event.address, event.params.scannerPoolId)
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