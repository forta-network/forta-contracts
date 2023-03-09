import { Address, BigDecimal, BigInt, log } from "@graphprotocol/graph-ts";
import {SetDelegationFee as SetDelegationFeeEvent, Rewarded as RewardedDistributedEvent, RewardsDistributor as RewardsDistributorContract } from "../../generated/RewardsDistributor/RewardsDistributor";
import { ScannerPool, Subject, RewardEvent, Staker } from "../../generated/schema";
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

const calculatePoolAPYInEpoch = (rewardsDistributorAddress: Address,subjectId: string, subjectType: number, epoch: BigInt): string | null => {

  // If not a node pool
  if(subjectType !== 2) return null

  const nodePool = ScannerPool.load(subjectId);

  if(!nodePool || !nodePool.stakers) return null

  log.warning(`Finding delegators for nodePool {}`,[subjectId])
  
  const rewardDistributor = RewardsDistributorContract.bind(rewardsDistributorAddress);
  const delegatedStakers: Staker[] = []
  const totalDelegateRewards: BigInt = BigInt.fromI32(0);

  const nodePoolStakers: string[] = nodePool.stakers as string[]
  
  // Find all delegators in pool
  for(let id = 0; id < nodePoolStakers.length; id++) {
    const stakerId = (nodePool.stakers as string[])[id]
    const staker = Staker.load(stakerId)

    if(staker && staker.account !== nodePool.owner) {
      log.warning(`Found delegator with address:  for nodePool {}`,[staker.account,subjectId])
      // Check avalible rewards for thesse delegators at given epoch and sum them
      const delegateReward = rewardDistributor.availableReward(subjectType as i32, BigInt.fromString(subjectId), epoch ,Address.fromString(staker.account))

      delegatedStakers.push(staker)

      // Add to totalDelegateRewards for current epoch
      totalDelegateRewards.plus(delegateReward)
    } 
  }

  // No APY for nodePools with no delegator rewards
  if(totalDelegateRewards.equals(BigInt.fromI32(0))) return null;


  log.warning(`Found {} delegator FORT rewards`,[totalDelegateRewards.toI32().toString()])

  // Calculate APY as string
  const totalDelegateStakeInEpoch = nodePool.stakeAllocated.minus(nodePool.stakeOwnedAllocated);

  log.warning(`Found {} delegator stake in this epoch `,[totalDelegateStakeInEpoch.toI32.toString()])

  const apy = (1 + (totalDelegateRewards.div(totalDelegateStakeInEpoch)).toI32()) ** (52 - 1);

  nodePool.apyForLastEpoch = apy.toString();

  nodePool.save()
  return apy.toString()
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
  const subjectType = event.params.subjectType;
  const epochNumber = event.params.epochNumber;
  const amount = event.params.amount;
  const rewardDistributorAddress = event.address;

  const subject = Subject.load(subjectId);

  if(subject) {
    const apy = calculatePoolAPYInEpoch(rewardDistributorAddress, subjectId, subjectType, epochNumber)
    const rewardedEvent = new RewardEvent(events.id(event));
    rewardedEvent.subject = subjectId;
    rewardedEvent.amount = amount;
    rewardedEvent.epochNumber = epochNumber.toI32();
    rewardedEvent.transaction = transactions.log(event).id;
    rewardedEvent.timestamp = event.block.timestamp;
    rewardedEvent.apyForLastEpoch = apy;

    rewardedEvent.save();
  } else {
    log.warning(`Failed to save reward event because could not find subject type from transaction {}`, [event.transaction.hash.toHexString()])
  }
}