import { Address, BigInt, ethereum, crypto, ByteArray, log, store } from "@graphprotocol/graph-ts";
import { newMockEvent } from "matchstick-as";
import {
  StakeDeposited as StakeDepositedEvent,
  Rewarded as RewardedEvent,
  Slashed as SlashedEvent,
  Froze as FrozeEvent,
  FortaStaking as FortaStakingContract,
  WithdrawalInitiated,
  WithdrawalExecuted,
  TransferSingle as TransferSingleEvent,
} from "../../generated/FortaStaking/FortaStaking";
import {
  Reward,
  SharesID,
  Slash,
  Stake,
  StakeDepositEvent,
  WithdrawalExecutedEvent,
  Staker,
  Subject,
  AggregateTotalStake,
  AggregateActiveStake,
  Account,
  WithdrawalInitiatedEvent,
} from "../../generated/schema";
import { fetchAccount } from "../fetch/account";

import { events, transactions } from "@amxx/graphprotocol-utils/";
import { fetchScannerPool } from "../fetch/scannerpool";
import { formatSubjectId } from "./utils";

function hexToDec(s: string): string {
  var i: i32, j: i32, digits: i32[] = [0], carry: i32;
  for (i = 0; i < s.length; i += 1) {
      carry = parseInt(s.charAt(i), 16) as i32;
      for (j = 0; j < digits.length; j += 1) {
          digits[j] = digits[j] * 16 + carry;
          carry = Math.trunc(digits[j] / 10) as i32;
          digits[j] %= 10;
      }
      while (carry > 0) {
          digits.push(carry % 10);
          carry = Math.trunc(carry / 10) as i32;
      }
  }
  return digits.reverse().join('');
}

export function addressToHex(id: Address): string {
  const idHex = id.toHex();
  if (idHex.length == 42) {
    return idHex;
  }
  const extraZeroes = 42 - idHex.length;
  return '0x' + '0'.repeat(extraZeroes) + idHex.slice(2);
}

function getSubjectTypePrefix(subjectType: number): string {
  if(subjectType == 3) return '0x11'
  if(subjectType == 2) return '0x10'
  if(subjectType == 1) return '0x01'
  return '0x00'
}

function findStakeInactiveShares(_subjectType: i32, _subject: BigInt, _staker: Address): BigInt | null {
  const _subjectId = formatSubjectId(_subject, _subjectType);
  const _stakerId = addressToHex(_staker);

  const previousStake = Stake.load(getStakeId(_subjectId,_stakerId,_subjectType.toString()));

  if(!previousStake) {
    return null
  }

  return previousStake.inactiveShares;
}

function getActiveSharesId(_subjectType: i32, _subject: BigInt): string {
  const tupleArray: Array<ethereum.Value> = [
    ethereum.Value.fromUnsignedBigInt(_subject),
  ]
  const tuple = changetype<ethereum.Tuple>(tupleArray);
  const encoded = ethereum.encode(ethereum.Value.fromTuple(tuple))!
  const subjectHex = encoded.toHex();
  const subjectPrefix = getSubjectTypePrefix(_subjectType)
  const subjectPack = subjectPrefix + subjectHex.slice(2);
  const _subjectPackHash = crypto.keccak256(ByteArray.fromHexString(subjectPack));
  const subjectPackHash = BigInt.fromString(hexToDec(_subjectPackHash.toHex().slice(2)));
  let mask256 = BigInt.zero();
  for (let i=0; i<256; i++) mask256 = mask256.leftShift(1).bitOr(BigInt.fromI32(1));
  const activeSharesId = subjectPackHash.leftShift(9).bitAnd(mask256).bitOr(BigInt.fromI32(256)).bitOr(BigInt.fromI32(_subjectType))
  return activeSharesId.toString();
}

export function getStakeId(subjectId: string, stakerId: string, subjectType: string): string {
  return subjectType + subjectId + stakerId;
}

function updateAggregateStake(stakerId: string, prevStakeTotalShares: BigInt , prevStateInActiveShares: BigInt , updatedStakeTotalShares: BigInt, updatedStakeInActiveShares: BigInt): void {


  const previousActiveStake = prevStakeTotalShares.minus(prevStateInActiveShares);
  const updatedActiveStake = updatedStakeTotalShares.minus(updatedStakeInActiveShares);


  const activeStakeDif = updatedActiveStake.minus(previousActiveStake);
  const totalStakeDif = updatedStakeTotalShares.minus(prevStakeTotalShares);

   let aggregateTotalStake = AggregateTotalStake.load(stakerId);
   let aggregateActiveStake = AggregateActiveStake.load(stakerId);

   if(!aggregateTotalStake) {
    aggregateTotalStake = new AggregateTotalStake(stakerId);
    aggregateTotalStake.totalStake = BigInt.fromI64(0);
   }

   if(!aggregateActiveStake) {
    aggregateActiveStake = new AggregateActiveStake(stakerId);
    aggregateActiveStake.activeStake = BigInt.fromI64(0);
   }

   aggregateTotalStake.totalStake = aggregateTotalStake.totalStake.plus(totalStakeDif)
   aggregateActiveStake.activeStake = aggregateActiveStake.activeStake.plus(activeStakeDif)

   aggregateTotalStake.staker = stakerId
   aggregateActiveStake.staker = stakerId


   aggregateTotalStake.save()
   aggregateActiveStake.save()
}

function updateStake(
  _stakingContractAddress: Address,
  _subjectType: i32,
  _subject: BigInt,
  _staker: Address): string {

  const _subjectId = formatSubjectId(_subject, _subjectType);
  const _stakerId = addressToHex(_staker);
  let subject = Subject.load(_subjectId);
  let stake = Stake.load(getStakeId(_subjectId,_stakerId,_subjectType.toString()));
  let staker = Staker.load(_stakerId);
  const account = fetchAccount(_staker);
  const nodePool = fetchScannerPool(_subject);

  const fortaStaking = FortaStakingContract.bind(_stakingContractAddress);

  if (subject == null) {
    const activeSharesId = getActiveSharesId(_subjectType, _subject);
    subject = new Subject(_subjectId);
    subject.isFrozen = false;
    subject.slashedTotal = 0;
    subject.activeSharesId = activeSharesId;
    subject.subjectType = _subjectType;
    subject.subjectId = _subject;
    let sharesId = new SharesID(activeSharesId);
    sharesId.subject = _subjectId;
    sharesId.save();
  }
  subject.activeStake = fortaStaking.activeStakeFor(
    _subjectType,
    _subject
  );
  subject.inactiveStake = fortaStaking.inactiveStakeFor(
    _subjectType,
    _subject
  );
  subject.activeShares = fortaStaking.totalShares(
    _subjectType,
    _subject
  );
  subject.inactiveShares = fortaStaking.totalInactiveShares(
    _subjectType,
    _subject
  );

  if (staker == null) {
    staker = new Staker(_stakerId);
  }

  if (stake == null) {
    stake = new Stake(getStakeId(_subjectId,_stakerId,_subjectType.toString()));
  }

  const prevStakeTotalShares: BigInt = stake.shares ? stake.shares as BigInt : BigInt.fromI32(0);
  const prevStateInActiveShares: BigInt = stake.inactiveShares ? stake.inactiveShares as BigInt : BigInt.fromI32(0);

  // Scanner pool owner or delegation
  if(_subjectType === 2 || _subjectType === 3) {
    // Check existing pools
    // Add new pool to Staker if it isn't already there
    const currentPools = staker.nodePools;


    if(!currentPools) {
      staker.nodePools = [nodePool.id]
    } else if (!currentPools.includes(nodePool.id)) {
      currentPools.push(nodePool.id);
      staker.nodePools = currentPools;
    }

    if(nodePool.registered) {
      // Check node pool for existing stakers
      // Add staker if it isn't already there
      const currentStakers = nodePool.stakers;

      if(!currentStakers) {
        nodePool.stakers = [staker.id]
      } else if (!currentStakers.includes(staker.id)) {
        currentStakers.push(staker.id);
        nodePool.stakers = currentStakers;
      }

      nodePool.save()
    }

  }

  stake.subject = _subjectId;
  stake.isActive = true;
  stake.staker = _stakerId;
  stake.shares = fortaStaking.sharesOf(
    _subjectType,
    _subject,
    _staker
  );
  stake.inactiveShares = fortaStaking.inactiveSharesOf(
    _subjectType,
    _subject,
    _staker
  );

  const updatedStakeTotalShares: BigInt = stake.shares ? stake.shares as BigInt : BigInt.fromI32(0);
  const updatedStateInActiveShares: BigInt = stake.inactiveShares ? stake.inactiveShares as BigInt: BigInt.fromI32(0);

  updateAggregateStake(_stakerId, prevStakeTotalShares, prevStateInActiveShares, updatedStakeTotalShares, updatedStateInActiveShares)

  staker.account = _stakerId;

  subject.save();
  stake.save();
  staker.save();
  account.save();

  return getStakeId(_subjectId,_stakerId,_subjectType.toString());
}

export function handleStakeDeposited(event: StakeDepositedEvent): void {

  const stakeId = updateStake(
    event.address,
    event.params.subjectType,
    event.params.subject,
    event.params.account,
  );

  const stakeDepositedEvent = new StakeDepositEvent(events.id(event));
  stakeDepositedEvent.transaction = transactions.log(event).id;
  stakeDepositedEvent.timestamp = event.block.timestamp;
  stakeDepositedEvent.stake = stakeId;
  stakeDepositedEvent.subject = formatSubjectId(event.params.subject, event.params.subjectType);
  stakeDepositedEvent.amount = event.params.amount;
  stakeDepositedEvent.save();
}

export function handleWithdrawalInitiated(event: WithdrawalInitiated): void {
  // Find number of inactive shares stored on stake entity before update
  const _staker = event.params.account;
  const _subjectType = event.params.subjectType;
  const _subject = event.params.subject

  const previousInactiveShares = findStakeInactiveShares(_subjectType, _subject, _staker)

  const stakeId = updateStake(
    event.address,
    _subjectType,
    _subject,
    _staker,
  );

  const currentStake = Stake.load(stakeId) as Stake;

  const currentInActiveShares = currentStake.inactiveShares;

  // With a withdrawal the number of inactive shares should increase

  const withdrawalInitiatedEvent = new WithdrawalInitiatedEvent(events.id(event));
  withdrawalInitiatedEvent.transaction = transactions.log(event).id;
  withdrawalInitiatedEvent.timestamp = event.block.timestamp;
  withdrawalInitiatedEvent.stake = stakeId;
  withdrawalInitiatedEvent.subject = formatSubjectId(event.params.subject, event.params.subjectType);

    if(previousInactiveShares) {
      withdrawalInitiatedEvent.amount = (currentInActiveShares as BigInt).minus(previousInactiveShares)
    } else {
      withdrawalInitiatedEvent.amount = (currentInActiveShares as BigInt)
    }

  withdrawalInitiatedEvent.save();

  // Place pending withdrawals as a queue
  const currentPendingQueue = currentStake.pendingWithdrawalQueue;

  if(currentPendingQueue) {
    currentPendingQueue.push(withdrawalInitiatedEvent.id)
    currentStake.pendingWithdrawalQueue = currentPendingQueue;
  } else {
    currentStake.pendingWithdrawalQueue = [withdrawalInitiatedEvent.id]
  }

  currentStake.save()
}

export function handleWithdrawalExecuted(event: WithdrawalExecuted): void {
  const stakeId = updateStake(
    event.address,
    event.params.subjectType,
    event.params.subject,
    event.params.account,
  );

  // Look up oldest pending withdrawal (with the same subject and subject type) and get amount from there
  const currentStake = Stake.load(stakeId) as Stake;

  const pendingWithdrawalQueue = currentStake.pendingWithdrawalQueue as string[];
  const oldestPendingWithdrawal = pendingWithdrawalQueue[0];

  // Remove the oldest pending withdrawal
  currentStake.pendingWithdrawalQueue = pendingWithdrawalQueue.slice(1);
  currentStake.save();

  const withdrawalInitiatedEvent = WithdrawalInitiatedEvent.load(oldestPendingWithdrawal) as WithdrawalInitiatedEvent;

  const withdrawalExecutedEvent = new WithdrawalExecutedEvent(events.id(event));
  withdrawalExecutedEvent.transaction = transactions.log(event).id;
  withdrawalExecutedEvent.timestamp = event.block.timestamp;
  withdrawalExecutedEvent.stake = stakeId;
  withdrawalExecutedEvent.subject = formatSubjectId(event.params.subject, event.params.subjectType);
  withdrawalExecutedEvent.amount = withdrawalInitiatedEvent.amount;
  withdrawalExecutedEvent.save();
}

export function handleRewarded(event: RewardedEvent): void {
  let reward = new Reward(
    event.params.from.toHex() +
      "-" +
      event.params.subject.toHex() +
      "-" +
      event.params.subjectType.toString()
  );
  reward.subjectType = event.params.subjectType;
  reward.subjectId = formatSubjectId(event.params.subject, event.params.subjectType);
  reward.staker = event.params.from.toHex();
  reward.save();
}

export function handleSlashed(event: SlashedEvent): void {
  let slash = new Slash(
    event.params.by.toHex() +
      "-" +
      event.params.subject.toHex() +
      "-" +
      event.params.subjectType.toString()
  );
  slash.subjectType = event.params.subjectType;
  slash.subjectId = event.params.subject.toHex();
  slash.by = fetchAccount(event.params.by).id;
  slash.save();
  let subject = Subject.load(event.params.subject.toHex());
  if (!subject) {
    subject = new Subject(event.params.subject.toHex());
    subject.slashedTotal = 1;
    subject.save();
  }
  if (subject) {
    subject.slashedTotal++;
    subject.save();
  }
}

export function handleFroze(event: FrozeEvent): void {
  let subject = Subject.load(event.params.subject.toHex());
  if (subject == null) {
    subject = new Subject(event.params.subject.toHex());
    subject.isFrozen = false;
    subject.slashedTotal = 0;
  }
  subject.isFrozen = event.params.isFrozen;
  subject.save();
}

export function handleTransferSingle(event: TransferSingleEvent): void {
  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
  let sharesId = SharesID.load(event.params.id.toString());

  // Update withdrawal executed event with value

  if(event.params.to.toHex() != ZERO_ADDRESS) {
    const account = Account.load(event.params.to.toString()) // Get account of receiver


    if(account && account.staker) {
      const staker =  Staker.load(account.staker as string);
      if(staker) {
        for(let i = 0; i < staker.stakes.length; i++) {
          const stake = Stake.load(staker.stakes[i]);

          if(stake) {
            const events = stake.withdrawalExecutedEvents;

            if(events) {
              for(let j = 0; j < events.length; j++) {
                const withdrawalEvent = WithdrawalExecutedEvent.load(events[j]);
                if(withdrawalEvent && withdrawalEvent.timestamp === event.block.timestamp) {
                  log.info(`Updating withdrawal event with value`,[])
                  withdrawalEvent.amount = event.params.value
                  withdrawalEvent.save()
                }
              }
            }
          }
        }
      }
    }
  }

  if (sharesId) {
    let subject = Subject.load(sharesId.subject);
    if(subject && subject.subjectId) {
      const _subjectId: BigInt | null = subject.subjectId;
      const subjectId: BigInt = _subjectId ? _subjectId : BigInt.zero();
      if (
        !subjectId.isZero() &&
        event.params.from.toHex() != ZERO_ADDRESS &&
        event.params.to.toHex() != ZERO_ADDRESS
      ) {
        updateStake(
          event.address,
          subject.subjectType,
          subjectId,
          event.params.from,
        );
        updateStake(
          event.address,
          subject.subjectType,
          subjectId,
          event.params.to,
        );
      }
    }
  }
}

export function createStakeDepositedEvent(
  subjectType: i32,
  subject: BigInt,
  account: Address,
  amount: BigInt
): StakeDepositedEvent {
  const mockStakeDepostied = changetype<StakeDepositedEvent>(newMockEvent());
  mockStakeDepostied.parameters = [];

  const subjectTypeParam = new ethereum.EventParam(
    "subjectType",
    ethereum.Value.fromI32(subjectType)
  );

  const subjectParam = new ethereum.EventParam(
    "subject",
    ethereum.Value.fromUnsignedBigInt(subject)
  );

  const accountParam = new ethereum.EventParam(
    "account",
    ethereum.Value.fromAddress(account)
  );

  const amountParam = new ethereum.EventParam(
    "amount",
    ethereum.Value.fromSignedBigInt(amount)
  );

  mockStakeDepostied.parameters.push(subjectTypeParam);
  mockStakeDepostied.parameters.push(subjectParam);
  mockStakeDepostied.parameters.push(accountParam);
  mockStakeDepostied.parameters.push(amountParam);
  return mockStakeDepostied;
}

export function createRewardEvent(
  subjectType: i32,
  subject: BigInt,
  from: Address,
  value: BigInt
): RewardedEvent {
  const mockRewardedEvent = changetype<RewardedEvent>(newMockEvent());
  mockRewardedEvent.parameters = [];

  const subjectTypeParam = new ethereum.EventParam(
    "subjectType",
    ethereum.Value.fromI32(subjectType)
  );

  const subjectParam = new ethereum.EventParam(
    "subject",
    ethereum.Value.fromUnsignedBigInt(subject)
  );

  const fromParam = new ethereum.EventParam(
    "from",
    ethereum.Value.fromAddress(from)
  );

  const valueParam = new ethereum.EventParam(
    "value",
    ethereum.Value.fromSignedBigInt(value)
  );

  mockRewardedEvent.parameters.push(subjectTypeParam);
  mockRewardedEvent.parameters.push(subjectParam);
  mockRewardedEvent.parameters.push(fromParam);
  mockRewardedEvent.parameters.push(valueParam);

  return mockRewardedEvent;
}

export function createSlashedEvent(
  subjectType: i32,
  subject: BigInt,
  by: Address,
  value: BigInt
): SlashedEvent {
  const mockSlashedEvent = changetype<SlashedEvent>(newMockEvent());

  const subjectTypeParam = new ethereum.EventParam(
    "subjectType",
    ethereum.Value.fromI32(subjectType)
  );

  const subjectParam = new ethereum.EventParam(
    "subject",
    ethereum.Value.fromUnsignedBigInt(subject)
  );

  const byParam = new ethereum.EventParam("by", ethereum.Value.fromAddress(by));

  const valueParam = new ethereum.EventParam(
    "value",
    ethereum.Value.fromSignedBigInt(value)
  );

  mockSlashedEvent.parameters.push(subjectTypeParam);
  mockSlashedEvent.parameters.push(subjectParam);
  mockSlashedEvent.parameters.push(byParam);
  mockSlashedEvent.parameters.push(valueParam);
  return mockSlashedEvent;
}

export function createFrozeEvent(
  subjectType: i32,
  subject: BigInt,
  by: Address,
  isFrozen: boolean
): FrozeEvent {
  const mockFrozeEvent = changetype<FrozeEvent>(newMockEvent());

  mockFrozeEvent.parameters = [];
  const subjectTypeParam = new ethereum.EventParam(
    "subjectType",
    ethereum.Value.fromI32(subjectType)
  );

  const subjectParam = new ethereum.EventParam(
    "subject",
    ethereum.Value.fromUnsignedBigInt(subject)
  );

  const byParam = new ethereum.EventParam("by", ethereum.Value.fromAddress(by));

  const isFrozenParam = new ethereum.EventParam(
    "isFrozen",
    ethereum.Value.fromBoolean(isFrozen)
  );

  mockFrozeEvent.parameters.push(subjectTypeParam);
  mockFrozeEvent.parameters.push(subjectParam);
  mockFrozeEvent.parameters.push(byParam);
  mockFrozeEvent.parameters.push(isFrozenParam);

  return mockFrozeEvent;
}
