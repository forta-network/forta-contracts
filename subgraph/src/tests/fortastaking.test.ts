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
    "totalShares",
    "totalShares(uint8,uint256):(uint256)"
  )
    .withArgs([
      ethereum.Value.fromUnsignedBigInt(BigInt.fromString("1234")),
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(Address.zero().toI32())),
    ])
    .returns([ethereum.Value.fromSignedBigInt(expectedResult)]);

  createMockedFunction(
    contractAddress,
    "totalInactiveShares",
    "totalInactiveShares(uint8,uint256):(uint256)"
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
    events.id(mockStakeDepostied),
    "id",
    getStakeId(mockStakeDepostied.params.subject.toHex(), mockStakeDepostied.params.account.toHex())
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
