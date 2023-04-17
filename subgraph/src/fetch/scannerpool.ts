import { Address, BigDecimal, BigInt } from "@graphprotocol/graph-ts";

import { ScannerPool, NodePoolRewardMetaData } from "../../generated/schema";

export function fetchScannerPool(id: BigInt): ScannerPool {
  
  let scannerPool = ScannerPool.load(id.toBigDecimal().toString());
  if (scannerPool == null) {
    scannerPool = new ScannerPool(id.toBigDecimal().toString());
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

    const latestRewardMetaData = new NodePoolRewardMetaData(`${scannerPool.id}-latest-reward-metadata`)
    latestRewardMetaData.epochNumber = BigInt.zero();
    latestRewardMetaData.nodePoolId = id.toBigDecimal().toString();
    latestRewardMetaData.totalDelegatorStakesAtStartOfEpoch = BigInt.zero();
    latestRewardMetaData.save();

    const previousRewardMetaData = new NodePoolRewardMetaData(`${scannerPool.id}-previous-reward-metadata`)
    latestRewardMetaData.epochNumber = BigInt.zero();
    latestRewardMetaData.nodePoolId = id.toBigDecimal().toString();
    latestRewardMetaData.totalDelegatorStakesAtStartOfEpoch = BigInt.zero();
    previousRewardMetaData.save();

    scannerPool.latestRewardMetaData = latestRewardMetaData.id;
    scannerPool.previousRewardMetaData = previousRewardMetaData.id;
  }
  return scannerPool as ScannerPool;
}