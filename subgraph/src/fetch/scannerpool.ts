import { Address, BigDecimal, BigInt } from "@graphprotocol/graph-ts";

import { ScannerPool } from "../../generated/schema";
import { fetchAccount } from "./account";

export function fetchScannerPool(id: BigInt): ScannerPool {
  
  let scannerPool = ScannerPool.load(id.toBigDecimal().toString());
  if (scannerPool == null) {
    scannerPool = new ScannerPool(id.toBigDecimal().toString());
    scannerPool.registered = false;
    scannerPool.chainId = 1;
    scannerPool.apr = BigDecimal.zero();
    scannerPool.commission = BigDecimal.zero();
    scannerPool.status = "";
    scannerPool.stakeOwned = BigInt.zero();
    scannerPool.stakeDelegated = BigInt.zero();
    scannerPool.stakeAllocated = BigInt.zero();
    scannerPool.stakeOwnedAllocated = BigInt.zero();
  }
  return scannerPool as ScannerPool;
}
