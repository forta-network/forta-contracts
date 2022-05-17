import { BigInt } from "@graphprotocol/graph-ts";
import {
  StakeDeposited as StakeDepositedEvent,
  Rewarded as RewardedEvent,
  Slashed as SlashedEvent,
  Froze as FrozeEvent,
  FortaStaking as FortaStakingContract,
} from "../../generated/FortaStaking/FortaStaking";
import { Reward, Slash, Stake, Staker, Subject } from "../../generated/schema";

import eventId from "../utils/event";

export function handleStakeDeposited(event: StakeDepositedEvent): void {
  let subject = Subject.load(event.params.subject.toHex());
  let staker = Staker.load(event.params.account.toHex());
  let stake = Stake.load(eventId(event));
  const fortaStaking = FortaStakingContract.bind(event.address);

  if (!subject) {
    subject = new Subject(event.params.subject.toHex());
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

    subject.isFrozen = false;

    subject.subjectType = event.params.subjectType;
    subject.save();
  }

  if (!staker) {
    staker = new Staker(event.params.account.toHex());
    staker.save();
  }
  if (!stake) {
    stake = new Stake(eventId(event));
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
    stake.save();
  }
}

export function handleRewarded(event: RewardedEvent): void {
  let reward = new Reward(eventId(event));
  reward.subjectType = event.params.subjectType;
  reward.subjectId = event.params.subject.toHex();
  reward.staker = event.params.from.toHex();
}

export function handleSlashed(event: SlashedEvent): void {
  let slash = new Slash(eventId(event));
  slash.subjectType = event.params.subjectType;
  slash.subjectId = event.params.subject.toHex();
  slash.by = event.params.by.toHex();
  slash.save();
  let subject = Subject.load(event.params.subject.toHex());
  if (subject) {
    let slashedTotal = subject.slashedTotal;
    slashedTotal++;
    subject.slashedTotal = slashedTotal;
    subject.save();
  }
}

export function handleFroze(event: FrozeEvent): void {
  let subject = Subject.load(event.params.subject.toHex());
  if (subject) {
    subject.isFrozen = event.params.isFrozen;
    subject.save();
  }
}
