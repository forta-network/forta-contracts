import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts";
import {
  assert,
  clearStore,
  test,
  createMockedFunction,
  logStore,
} from "matchstick-as";
import {
  createFrozeEvent,
  createRewardEvent,
  createSlashedEvent,
  createStakeDepositedEvent,
  handleFroze,
  handleRewarded,
  handleSlashed,
  handleStakeDeposited,
} from "../datasources/FortaStaking";

import eventId from "../utils/event";

test("It should handle stake depostied", () => {
  const mockStakeDepostied = createStakeDepositedEvent(
    1234,
    BigInt.fromI32(Address.zero().toI32()),
    Address.zero(),
    BigInt.fromI32(10)
  );

  let contractAddress = Address.fromString(
    "0xd2863157539b1D11F39ce23fC4834B62082F6874"
  );

  mockStakeDepostied.address = contractAddress;
  const expectedResult = BigInt.fromI32(5);

  createMockedFunction(
    contractAddress,
    "activeStakeFor",
    "activeStakeFor(uint8,uint256):(uint256)"
  )
    .withArgs([
      ethereum.Value.fromUnsignedBigInt(BigInt.fromString("1234")),
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(Address.zero().toI32())),
    ])
    .returns([ethereum.Value.fromSignedBigInt(expectedResult)]);

  createMockedFunction(
    contractAddress,
    "inactiveStakeFor",
    "inactiveStakeFor(uint8,uint256):(uint256)"
  )
    .withArgs([
      ethereum.Value.fromUnsignedBigInt(BigInt.fromString("1234")),
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(Address.zero().toI32())),
    ])
    .returns([ethereum.Value.fromSignedBigInt(expectedResult)]);

  createMockedFunction(
    contractAddress,
    "inactiveSharesOf",
    "inactiveSharesOf(uint8,uint256,address):(uint256)"
  )
    .withArgs([
      ethereum.Value.fromUnsignedBigInt(BigInt.fromString("1234")),
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(Address.zero().toI32())),
      ethereum.Value.fromAddress(Address.zero()),
    ])
    .returns([ethereum.Value.fromSignedBigInt(expectedResult)]);

  createMockedFunction(
    contractAddress,
    "sharesOf",
    "sharesOf(uint8,uint256,address):(uint256)"
  )
    .withArgs([
      ethereum.Value.fromUnsignedBigInt(BigInt.fromString("1234")),
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(Address.zero().toI32())),
      ethereum.Value.fromAddress(Address.zero()),
    ])
    .returns([ethereum.Value.fromSignedBigInt(expectedResult)]);
  handleStakeDeposited(mockStakeDepostied);

  assert.fieldEquals(
    "Subject",
    BigInt.fromI32(Address.zero().toI32()).toHex(),
    "id",
    BigInt.fromI32(Address.zero().toI32()).toHex()
  );

  assert.fieldEquals(
    "Staker",
    Address.zero().toHex(),
    "id",
    Address.zero().toHex()
  );

  assert.fieldEquals(
    "Stake",
    mockStakeDepostied.block.number
      .toHex()
      .concat("-")
      .concat(mockStakeDepostied.logIndex.toHex()),
    "id",
    mockStakeDepostied.block.number
      .toHex()
      .concat("-")
      .concat(mockStakeDepostied.logIndex.toHex())
  );
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
    eventId(mockRewardedEvent),
    "id",
    eventId(mockRewardedEvent)
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
    eventId(mockSlashedEvent),
    "id",
    eventId(mockSlashedEvent)
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
