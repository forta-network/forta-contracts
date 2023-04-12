import { Address, BigDecimal, BigInt } from "@graphprotocol/graph-ts";

import { ScannerPool } from "../../generated/schema";
import { scannerBigIntToHex } from "./scannode";

export function fetchScannerPool(id: BigInt): ScannerPool {
  
  let scannerPool = ScannerPool.load(scannerBigIntToHex(id));
  if (scannerPool == null) {
    scannerPool = new ScannerPool(scannerBigIntToHex(id));
    scannerPool.registered = false;
    scannerPool.chainId = 1;
    scannerPool.apr = BigDecimal.zero();
    scannerPool.oldCommission = BigDecimal.zero();
    scannerPool.commission = BigDecimal.zero();
    scannerPool.commissionSinceEpoch = 0;
    scannerPool.status = "";
    scannerPool.stakeOwned = BigInt.zero();
    scannerPool.stakeDelegated = BigInt.zero();
    scannerPool.stakeAllocated = BigInt.zero();
    scannerPool.stakeOwnedAllocated = BigInt.zero();
    scannerPool.apyForLastEpoch = BigDecimal.fromString("0");
    scannerPool.owner = "";
  }
  return scannerPool as ScannerPool;
}
