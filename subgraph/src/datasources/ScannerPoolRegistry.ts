import {
  ScannerPoolRegistered as ScannerPoolRegisteredEvent,
  ScannerPoolRegistry as ScannerPoolRegistryContract,
  ScannerUpdated as ScannerUpdatedEvent,
  ScannerEnabled as ScannerEnabledEvent,
  Transfer as TransferEvent
} from "../../generated/ScannerPoolRegistry/ScannerPoolRegistry";
import { fetchScannerPool } from "../fetch/scannerpool";
import { fetchScannode } from "../fetch/scannode";
import { fetchAccount } from "../fetch/account";
import { ScanNode, ScannerPool } from "../../generated/schema";
import { BigDecimal } from "@graphprotocol/graph-ts";

function areScannersActive(pool: ScannerPool): boolean {
  let result = false;

  if(pool.scanNodes) {
    (pool.scanNodes as string[]).forEach(nodeId => {
      const node = ScanNode.load(nodeId)
      if(node) {
        if(node.enabled) {
          result = true;
        }
      }
    })
  } 

  return result
}

export function handleScannerPoolRegistered(event: ScannerPoolRegisteredEvent): void {
  const registryAddress = event.address;
  const scannerPoolId = event.params.scannerPoolId;
  const scannerPoolRegistry = ScannerPoolRegistryContract.bind(registryAddress);
  const scannerPool = fetchScannerPool(scannerPoolId);
  let from = fetchAccount(event.transaction.from);

  const owner = scannerPoolRegistry.ownerOf(scannerPoolId);

  scannerPool.owner = owner ? owner.toHexString() : from.id;
  scannerPool.registered = scannerPoolRegistry.isRegistered(scannerPoolId);
  scannerPool.chainId = event.params.chainId.toI32();
  scannerPool.status = "Not Delegating"

  // the source of truth is the RewardsDistributorContract (defaultFeeBps())
  // this is a quick and simple way to have an expected default
  scannerPool.commission = BigDecimal.fromString("10000") // 10000 == 100%

  scannerPool.save();
}

export function handleScannerUpdated(event: ScannerUpdatedEvent): void {
  const scanNode = fetchScannode(event.params.scannerId);
  const scannerPool = fetchScannerPool(event.params.scannerPool);
  scanNode.chainId = event.params.chainId;
  scanNode.scannerPool = scannerPool.id;
  scanNode.address = scanNode.id;
  scanNode.save();
  scannerPool.save();
}

export function handleScannerEnabled(event: ScannerEnabledEvent): void {
  const scanNode = fetchScannode(event.params.scannerId);

  const nodePool = ScannerPool.load(parseInt(scanNode.scannerPool).toString());

  scanNode.enabled = event.params.enabled;
  scanNode.save();

  if(nodePool) {
    nodePool.status = areScannersActive(nodePool) ? "Delegating" : "Not Delegating";
    nodePool.save()
  }
}

export function handleTransfer(event: TransferEvent): void {
  const scannerPoolId = event.params.tokenId;
  const scannerPool = fetchScannerPool(scannerPoolId);
  scannerPool.owner = fetchAccount(event.params.to).id;
  scannerPool.save();
}
