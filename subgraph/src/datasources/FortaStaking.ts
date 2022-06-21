import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts";
import { newMockEvent } from "matchstick-as";
import {
  StakeDeposited as StakeDepositedEvent,
  Rewarded as RewardedEvent,
  Slashed as SlashedEvent,
  Froze as FrozeEvent,
  FortaStaking as FortaStakingContract,
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

export function handleStakeDeposited(event: StakeDepositedEvent): void {
  let subject = Subject.load(event.params.subject.toHex());
  let staker = new Staker(event.params.account.toHex());
  let stake = new Stake(events.id(event));
  const fortaStaking = FortaStakingContract.bind(event.address);

  if (subject == null) {
    subject = new Subject(event.params.subject.toHex());
    subject.isFrozen = false;
    subject.slashedTotal = 0;
  }
  subject.activeStake = fortaStaking.activeStakeFor(
    event.params.subjectType,
    event.params.subject
  );
  subject.inactiveStake = fortaStaking.inactiveStakeFor(
    event.params.subjectType,
    event.params.subject
  );
  subject.inactiveShares = fortaStaking.inactiveSharesOf(
    event.params.subjectType,
    event.params.subject,
    event.params.account
  );
  subject.activeShares = fortaStaking.sharesOf(
    event.params.subjectType,
    event.params.subject,
    event.params.account
  );
  subject.subjectType = event.params.subjectType;
  stake.subjectId = event.params.subject.toHex();
  stake.subjectType = event.params.subjectType;
  stake.isActive = true;
  stake.staker = event.params.account.toHex();
  stake.stake = event.params.amount;
  stake.shares = fortaStaking.sharesOf(
    event.params.subjectType,
    event.params.subject,
    event.params.account
  );
  subject.save();
  staker.save();
  stake.save();
  const stakeDepositedEvent = new StakeDepositEvent(events.id(event));
  stakeDepositedEvent.transaction = transactions.log(event).id;
  stakeDepositedEvent.timestamp = event.block.timestamp;
  stakeDepositedEvent.stake = stake.id;
  stakeDepositedEvent.subject = subject.id;
  stakeDepositedEvent.save();
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
