import { Address, BigInt, ethereum, crypto, ByteArray, log } from "@graphprotocol/graph-ts";
import { newMockEvent } from "matchstick-as";
import {Rewarded as RewardedEvent } from "../../../generated/RewardsDistributor/RewardsDistributor";


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