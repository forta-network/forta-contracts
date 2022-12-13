import { Address, BigInt } from "@graphprotocol/graph-ts";
import {
  ScannerPoolRegistered as ScannerPoolRegisteredEvent,
  ScannerPoolRegistry as ScannerPoolRegistryContract
} from "../../generated/ScannerPoolRegistry/ScannerPoolRegistry";
import { fetchScannerPool } from "../fetch/scannerpool";

function updateScannerPool(registryAddress: Address, id: BigInt): void {
  const scannerPoolRegistry = ScannerPoolRegistryContract.bind(registryAddress);
  const scannerPool = fetchScannerPool(id);
  scannerPool.registered = scannerPoolRegistry.isRegistered(id);
  scannerPool.save();
}

export function handleScannerPoolRegistered(event: ScannerPoolRegisteredEvent): void {
  updateScannerPool(event.address, event.params.scannerPoolId)
}