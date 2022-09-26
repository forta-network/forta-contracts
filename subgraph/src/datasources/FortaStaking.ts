import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts";
import { newMockEvent } from "matchstick-as";
import {
  StakeDeposited as StakeDepositedEvent,
  Rewarded as RewardedEvent,
  Slashed as SlashedEvent,
  Froze as FrozeEvent,
  FortaStaking as FortaStakingContract,
  WithdrawalInitiated,
  WithdrawalExecuted,
} from "../../generated/FortaStaking/FortaStaking";
import {
  Reward,
  Slash,
  Stake,
  StakeDepositEvent,
  Staker,
  Subject,
} from "../../generated/schema";
import { fetchAccount } from "../fetch/account";

import { events, transactions } from "@amxx/graphprotocol-utils/";

function updateStake(
  _stakingContractAddress: Address,
  _subjectType: i32,
  _subject: BigInt,
  _staker: Address): string {
  const _subjectId = _subject.toHex();
  const _stakerId = _staker.toHex();
  let subject = Subject.load(_subjectId);
  let stake = Stake.load(_subjectId + _stakerId);
  let staker = Staker.load(_stakerId);
  const fortaStaking = FortaStakingContract.bind(_stakingContractAddress);

  if (subject == null) {
    subject = new Subject(_subjectId);
    subject.isFrozen = false;
    subject.slashedTotal = 0;
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
  subject.subjectType = _subjectType;

  if (staker == null) {
    staker = new Staker(_stakerId);
  }

  if (stake == null) {
    stake = new Stake(_subjectId + _stakerId);
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
  subject.save();
  stake.save();
  staker.save();
  return _subjectId + _stakerId;
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
  stakeDepositedEvent.subject = event.params.subject.toHex();
  stakeDepositedEvent.save();
}

export function handleWithdrawalInitiated(event: WithdrawalInitiated): void {
  updateStake(
    event.address,
    event.params.subjectType,
    event.params.subject,
    event.params.account,
  );
}

export function handleWithdrawalExecuted(event: WithdrawalExecuted): void {
  updateStake(
    event.address,
    event.params.subjectType,
    event.params.subject,
    event.params.account,
  );
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
  reward.subjectId = event.params.subject.toHex();
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
