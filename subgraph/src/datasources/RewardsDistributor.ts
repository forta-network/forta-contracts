import { Address, BigDecimal, BigInt } from "@graphprotocol/graph-ts";
import {SetDelegationFee as SetDelegationFeeEvent } from "../../generated/RewardsDistributor/RewardsDistributor";
import { ScannerPool, Subject } from "../../generated/schema";

function formatSubjectId(subjectId: BigInt, subjectType: i32): string {
  return subjectType === 2 ? subjectId.toBigDecimal().toString() : subjectId.toHexString();
}

function updateScannerPoolComission(subjectId: string, subjectType: i32, fee: BigInt): void {
  
  // If subject type is node pool
  if(subjectType === 2) {
    const scannerPool = ScannerPool.load(subjectId);
    if(scannerPool) {
      scannerPool.commission = BigDecimal.fromString(fee.toString());
      scannerPool.save();
    }
  }
}


export function handleSetDelegationFee(event: SetDelegationFeeEvent): void {
  const subjectId = formatSubjectId(event.params.subject, event.params.subjectType);
  const subjectType = event.params.subjectType;
  
  updateScannerPoolComission(subjectId, subjectType ,event.params.feeBps);
}