import { Address, BigDecimal, BigInt, ethereum, log } from "@graphprotocol/graph-ts";
import {
  SetDelegationFee as SetDelegationFeeEvent,
  Rewarded as RewardedDistributedEvent, 
  RewardsDistributor as RewardsDistributorContract, 
  ClaimedRewards as ClaimedRewardEvent} from "../../generated/RewardsDistributor/RewardsDistributor";
import { ScannerPool, Subject, RewardEvent, Staker, RewardClaimedEvent, NodePoolRewardMetaData } from "../../generated/schema";
import { formatSubjectId } from "./utils";
import { events, transactions } from "@amxx/graphprotocol-utils";
import { newMockEvent } from "matchstick-as";



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

const calculatePoolAPYInEpoch = (rewardsDistributorAddress: Address,subjectId: string, subjectType: number, epoch: BigInt): BigDecimal | null => {

  // If not a node pool
  if(subjectType !== 2) return null

  const nodePool = ScannerPool.load(subjectId);

  if(!nodePool || !nodePool.stakers) return null

  const latestRewardMetaData = NodePoolRewardMetaData.load(nodePool.latestRewardMetaData);

  if(!latestRewardMetaData) return null

  const totalDelegatorStakesAtStartOfEpoch = latestRewardMetaData.totalDelegatorStakesAtStartOfEpoch;
  if(!totalDelegatorStakesAtStartOfEpoch) return null
  if(totalDelegatorStakesAtStartOfEpoch.equals(BigInt.fromI32(0))) return null;

  
  const rewardDistributor = RewardsDistributorContract.bind(rewardsDistributorAddress);
  let totalDelegateRewards: BigInt = BigInt.fromI32(0);

  const nodePoolStakers: string[] = nodePool.stakers as string[]
  
  // Find all delegators in pool
  for(let id = 0; id < nodePoolStakers.length; id++) {
    const stakerId = (nodePool.stakers as string[])[id]
    const staker = Staker.load(stakerId)

    if(staker && staker.account !== nodePool.owner) {
      // Check avalible rewards for thesse delegators at given epoch and sum them
      const delegateRewardResult = rewardDistributor.try_availableReward(3, BigInt.fromString(subjectId), epoch ,Address.fromString(staker.account));

      // Add to totalDelegateRewards for current epoch
      if(!delegateRewardResult.reverted) {
        totalDelegateRewards = totalDelegateRewards.plus(delegateRewardResult.value);
      }
    } 
  }

  // No APY for nodePools with no delegator rewards
  if(totalDelegateRewards.equals(BigInt.fromI32(0))) return null;


  // Calculate APY as string
  const totalDelegateStakeInEpoch = latestRewardMetaData.totalDelegatorStakesAtStartOfEpoch;

  if(!totalDelegateStakeInEpoch) return null;

  if(totalDelegateStakeInEpoch.equals(BigInt.fromI32(0))) return null;

  // APY Pool_i = ({ 1 + ( LastEpochRewardsForDelegators_i / LastEpochDelegatorsTotalStake_i )} ^ 52) - 1
  const apy = ((parseFloat((BigDecimal.fromString("1").plus(totalDelegateRewards.toBigDecimal().div(totalDelegateStakeInEpoch.toBigDecimal()))).toString()) ** 52) - 1) * 100;

  const wholeIntApy = apy.toString().split(".")[0]
  const fractionalApy = apy.toString().split(".")[1]

  const truncatedApy = BigDecimal.fromString(`${wholeIntApy}${fractionalApy.charAt(0) === "0" ? "" : `.${fractionalApy.substr(0,2)}`}`)

  nodePool.apyForLastEpoch = truncatedApy
  return truncatedApy
}

const updateNodePoolLatestRewardMetaData = (nodePool: ScannerPool, latestEpochNumber: BigInt): boolean => {
  const totalDelegateRewardAtStartOfCurrentEpoch = nodePool.stakeAllocated.minus(nodePool.stakeOwnedAllocated);

  const latestRewardMetaData = NodePoolRewardMetaData.load(nodePool.latestRewardMetaData);
  const previousRewardMetaData = NodePoolRewardMetaData.load(nodePool.previousRewardMetaData);

  // Update previous metadata with latest meta data then update latest meta data
  if(previousRewardMetaData && latestRewardMetaData) {
    previousRewardMetaData.epochNumber = latestRewardMetaData.epochNumber;
    previousRewardMetaData.nodePoolId = nodePool.id;
    previousRewardMetaData.totalDelegatorStakesAtStartOfEpoch = latestRewardMetaData.totalDelegatorStakesAtStartOfEpoch;
    previousRewardMetaData.save();

    latestRewardMetaData.epochNumber = latestEpochNumber;
    latestRewardMetaData.nodePoolId = nodePool.id;
    latestRewardMetaData.totalDelegatorStakesAtStartOfEpoch = totalDelegateRewardAtStartOfCurrentEpoch;
    latestRewardMetaData.save();
  }

  // Need to return a value so that the calling handler waits for this function to execute (handlers aren't promise based in this assemblyscript)
  return true;
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


  const nodePool = ScannerPool.load(subjectId);

  if(nodePool) {
    const apy = calculatePoolAPYInEpoch(rewardDistributorAddress, subjectId, subjectType, epochNumber)
    const rewardedEvent = new RewardEvent(events.id(event));
    rewardedEvent.subject = subjectId;
    rewardedEvent.amount = amount;
    rewardedEvent.epochNumber = epochNumber.toI32();
    rewardedEvent.transaction = transactions.log(event).id;
    rewardedEvent.timestamp = event.block.timestamp;
    rewardedEvent.apyForLastEpoch = apy ? apy : BigDecimal.fromString("0");

    rewardedEvent.save();

    nodePool.apyForLastEpoch = apy ? apy : BigDecimal.fromString("0");
    
    const pastRewardEvents: string[]  = nodePool.rewardedEvents ? nodePool.rewardedEvents as string[] : []
    pastRewardEvents.push(rewardedEvent.id)

    nodePool.rewardedEvents = pastRewardEvents

    updateNodePoolLatestRewardMetaData(nodePool, epochNumber);
    nodePool.save()
  } else {
    log.warning(`Failed to save reward event because could not find subject type from transaction {}`, [event.transaction.hash.toHexString()])
  }
}

export function handleClaimedRewards(event: ClaimedRewardEvent): void {
  const claimedRewardEvent = new RewardClaimedEvent(events.id(event))
  claimedRewardEvent.subject = formatSubjectId(event.params.subject, event.params.subjectType);
  claimedRewardEvent.epochNumber = event.params.epochNumber;
  claimedRewardEvent.to = event.params.to.toHexString();
  claimedRewardEvent.transaction = transactions.log(event).id;
  claimedRewardEvent.timestamp = event.block.timestamp;
  claimedRewardEvent.value = event.params.value;

  claimedRewardEvent.save();
}

export function createMockRewardEvent(
  subjectType: i32,
  subject: BigInt,
  amount: BigInt,
  epochNumber: BigInt
): RewardedDistributedEvent {
  const mockRewardedEvent = changetype<RewardedDistributedEvent>(newMockEvent());
  mockRewardedEvent.parameters = [];

  const subjectTypeParam = new ethereum.EventParam(
    "subjectType",
    ethereum.Value.fromI32(subjectType)
  );

  const subjectParam = new ethereum.EventParam(
    "subject",
    ethereum.Value.fromUnsignedBigInt(subject)
  );

  const accountParam = new ethereum.EventParam(
    "amount",
    ethereum.Value.fromUnsignedBigInt(amount)
  );

  const epochParam = new ethereum.EventParam(
    "epochNumber",
    ethereum.Value.fromUnsignedBigInt(epochNumber)
  );

  mockRewardedEvent.parameters.push(subjectTypeParam);
  mockRewardedEvent.parameters.push(subjectParam);
  mockRewardedEvent.parameters.push(accountParam);
  mockRewardedEvent.parameters.push(epochParam);

  return mockRewardedEvent;
}

export function createMockClaimedRewardEvent(
  subjectType: i32,
  subject: BigInt,
  value: BigInt,
  to: Address,
  epochNumber: BigInt,
  timestamp: BigInt
): ClaimedRewardEvent {
  const mockClaimedRewardedEvent = changetype<ClaimedRewardEvent>(newMockEvent());
  mockClaimedRewardedEvent.parameters = [];

  const subjectTypeParam = new ethereum.EventParam(
    "subjectType",
    ethereum.Value.fromI32(subjectType)
  );

  const subjectParam = new ethereum.EventParam(
    "subject",
    ethereum.Value.fromUnsignedBigInt(subject)
  );

  const valueParam = new ethereum.EventParam(
    "value",
    ethereum.Value.fromUnsignedBigInt(value)
  );

  const epochParam = new ethereum.EventParam(
    "epochNumber",
    ethereum.Value.fromUnsignedBigInt(epochNumber)
  );

  const toParam = new ethereum.EventParam(
    "to",
    ethereum.Value.fromAddress(to)
  );

  const timeStamp = new ethereum.EventParam(
    "timestamp",
    ethereum.Value.fromUnsignedBigInt(timestamp)
  );

  mockClaimedRewardedEvent.parameters.push(subjectTypeParam);
  mockClaimedRewardedEvent.parameters.push(subjectParam);
  mockClaimedRewardedEvent.parameters.push(valueParam);
  mockClaimedRewardedEvent.parameters.push(epochParam);
  mockClaimedRewardedEvent.parameters.push(toParam);
  mockClaimedRewardedEvent.parameters.push(timeStamp);

  return mockClaimedRewardedEvent;
}
