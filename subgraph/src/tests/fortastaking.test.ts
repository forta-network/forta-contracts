import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts";
import { assert, test, createMockedFunction, describe } from "matchstick-as";
import {
  createFrozeEvent,
  createRewardEvent,
  createSlashedEvent,
  createStakeDepositedEvent,
  getStakeId,
  handleFroze,
  handleRewarded,
  handleSlashed,
  handleStakeDeposited,
} from "../datasources/FortaStaking";
import { events } from "@amxx/graphprotocol-utils/src/events";

test("It should handle stake depostied", () => {
});

test("Should successfully create a reward ", () => {
  const mockRewardedEvent = createRewardEvent(
    1234,
    BigInt.fromI32(Address.zero().toI32()),
    Address.zero(),
    BigInt.fromI32(1)
  );

  handleRewarded(mockRewardedEvent);

  assert.fieldEquals(
    "Reward",
    Address.zero().toHex() +
      "-" +
      BigInt.fromI32(Address.zero().toI32()).toHex() +
      "-" +
      BigInt.fromI32(1234).toString(),
    "id",
    Address.zero().toHex() +
      "-" +
      BigInt.fromI32(Address.zero().toI32()).toHex() +
      "-" +
      BigInt.fromI32(1234).toString()
  );
});

test("Should successfully create a slash", () => {
  const mockSlashedEvent = createSlashedEvent(
    1234,
    BigInt.fromI32(Address.zero().toI32()),
    Address.zero(),
    BigInt.fromI32(2)
  );

  handleSlashed(mockSlashedEvent);

  assert.fieldEquals(
    "Slash",
    Address.zero().toHex() +
      "-" +
      BigInt.fromI32(Address.zero().toI32()).toHex() +
      "-" +
      BigInt.fromI32(1234).toString(),
    "id",
    Address.zero().toHex() +
      "-" +
      BigInt.fromI32(Address.zero().toI32()).toHex() +
      "-" +
      BigInt.fromI32(1234).toString()
  );
});

test("Should successfully handle froze event", () => {
  const mockFrozeEvent = createFrozeEvent(
    1234,
    BigInt.fromI32(Address.zero().toI32()),
    Address.zero(),
    true
  );

  handleFroze(mockFrozeEvent);

  assert.fieldEquals(
    "Subject",
    BigInt.fromI32(Address.zero().toI32()).toHex(),
    "isFrozen",
    "true"
  );
});

describe('Delegated staking', () => {
  test('should handle stake deposited event for new delegated staker', () => {

  })

  test('should handle stake deposited event for delegated staker increasing stake', () => {

  })

  test('should handle withdrawal executed event for delegated staker withdrawing stake', () => {

  })

  test('should update staker on account after stake deposited event', () => {

  })

  test('should increase staker total aggregate after stake deposited event', () => {

  })

  test('should increase staker total active aggregate after stake deposited event', () => {

  })

  test('should reduce staker total aggregate after handle withdrawal executed event', () => {

  })

  test('should reduce staker total active aggregate after handle withdrawal executed event', () => {

  })
})
