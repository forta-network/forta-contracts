import { BigDecimal, BigInt, log } from "@graphprotocol/graph-ts";
import {SetDelegationFee as SetDelegationFeeEvent, Rewarded as RewardedDistributedEvent } from "../../generated/RewardsDistributor/RewardsDistributor";
import { ScannerPool, Subject, RewardEvent } from "../../generated/schema";
import { formatSubjectId } from "./utils";
import { events, transactions } from "@amxx/graphprotocol-utils";



function updateScannerPoolComission(subjectId: string, subjectType: i32, fee: BigInt, epochNumber: BigInt): void {
  // If subject type is node pool
  if(subjectType === 2) {
    const scannerPool = ScannerPool.load(subjectId);
    if(scannerPool) {
      scannerPool.oldCommission = scannerPool.commission;
      scannerPool.commission = BigDecimal.fromString(fee.toString());
      scannerPool.commissionSinceEpoch = epochNumber.toI32();
      scannerPool.save();
    }
  }
}


export function handleSetDelegationFee(event: SetDelegationFeeEvent): void {
  const subjectId = formatSubjectId(event.params.subject, event.params.subjectType);
  const subjectType = event.params.subjectType;
  const epochNumber = event.params.epochNumber;
  updateScannerPoolComission(subjectId, subjectType ,event.params.feeBps, epochNumber);
}

// Handler for when unclaimed rewards are distributed
export function handleRewardEvent(event: RewardedDistributedEvent): void {
  const subjectId = formatSubjectId(event.params.subject, event.params.subjectType);
  const epochNumber = event.params.epochNumber;
  const amount = event.params.amount;

  const subject = Subject.load(subjectId);

  if(subject) {
    const rewardedEvent = new RewardEvent(events.id(event));
    rewardedEvent.subject = subjectId;
    rewardedEvent.amount = amount;
    rewardedEvent.epochNumber = epochNumber.toI32();
    rewardedEvent.transaction = transactions.log(event).id;
    rewardedEvent.timestamp = event.block.timestamp;
    rewardedEvent.save();
  } else {
    log.warning(`Failed to save reward event because could not find subject type from transaction {}`, [event.transaction.hash.toHexString()])
  }
}