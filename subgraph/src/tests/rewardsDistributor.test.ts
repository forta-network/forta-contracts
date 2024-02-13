import { Address, BigDecimal, BigInt, ethereum } from "@graphprotocol/graph-ts";
import { describe, test, assert, beforeEach, clearStore, log, createMockedFunction, logStore } from "matchstick-as";
import { NodePoolRewardMetaData, ScannerPool, Staker } from "../../generated/schema";
import { createMockRewardEvent, handleRewardEvent } from "../datasources/RewardsDistributor";


// Address of rewards distributor
let contractAddress = Address.fromString(
  "0xd2863157539b1D11F39ce23fC4834B62082F6874"
);

const mockPoolOwner = "0x123";
const mockPoolId = "1";

const mockDelegatorStakerIdOne = "0x07232Fce4ae9673500B8158CeA2D7D95b60bCF73";
const mockDelegatorStakerIdTwo = "0xA16081F360e3847006dB660bae1c6d1b2e17eC2A";

let mockNodePool: ScannerPool;
let delegatorOne: Staker;
let delegatorTwo: Staker;


beforeEach(() => {
  clearStore();

  mockNodePool = new ScannerPool(mockPoolId);
  mockNodePool.stakers = [];
  mockNodePool.owner = mockPoolOwner;
  mockNodePool.stakeAllocated = BigInt.fromI32(100);
  mockNodePool.stakeOwnedAllocated = BigInt.fromI32(100);
  mockNodePool.stakeOwned = BigInt.fromI32(100);
  mockNodePool.stakeDelegated = BigInt.fromI32(0);
  mockNodePool.registered = true;
  mockNodePool.commission = BigDecimal.fromString("3");
  mockNodePool.commissionSinceEpoch = 4;
  mockNodePool.oldCommission = BigDecimal.fromString("3");
  mockNodePool.chainId = 1;
  mockNodePool.apyForLastEpoch = BigDecimal.fromString("0");

  const latestRewardMetaData = new NodePoolRewardMetaData(`${mockNodePool.id}-latest-reward-metadata`);
  latestRewardMetaData.epochNumber = BigInt.zero();
  latestRewardMetaData.nodePoolId = mockPoolId;
  latestRewardMetaData.totalDelegatorStakesAtStartOfEpoch = BigInt.zero();
  latestRewardMetaData.save();

  const previousRewardMetaData = new NodePoolRewardMetaData(`${mockPoolId}-previous-reward-metadata`);
  latestRewardMetaData.epochNumber = BigInt.zero();
  latestRewardMetaData.nodePoolId = mockPoolId;
  latestRewardMetaData.totalDelegatorStakesAtStartOfEpoch = BigInt.zero();
  previousRewardMetaData.save();

  mockNodePool.latestRewardMetaData = latestRewardMetaData.id;
  mockNodePool.previousRewardMetaData = previousRewardMetaData.id;

  mockNodePool.save();
});

describe("Rewards distributor", () => {

  const truncateApy = (apy: string): string => {
    const wholeIntApy = apy.toString().split(".")[0];
    const fractionalApy = apy.toString().split(".")[1];

    return `${wholeIntApy}${fractionalApy.charAt(0) === "0" ? "" : `.${fractionalApy.substr(0, 2)}`}`;
  };

  test("should handle a reward event for a node owner with zero previous rewards and add it to correct scannerPool entity", () => {
    // Given
    const reward = BigInt.fromI32(5);
    const mockRewardedEvent = createMockRewardEvent(2, BigInt.fromString(mockNodePool.id), reward, BigInt.fromI32(2770));
    mockRewardedEvent.address = contractAddress;

    // When
    handleRewardEvent(mockRewardedEvent);

    const updatedPool = ScannerPool.load(mockPoolId);
    const rewardedEvent = ((updatedPool as ScannerPool).rewardedEvents) as string [];

    // Expect
    assert.assertTrue(rewardedEvent.length === 1);
  });


  test("should handle a reward event on a pool with zero delegators and return a 0% APY value", () => {
    const reward = BigInt.fromI32(5);
    const mockRewardedEvent = createMockRewardEvent(2, BigInt.fromString(mockNodePool.id), reward, BigInt.fromI32(2770));
    mockRewardedEvent.address = contractAddress;

    handleRewardEvent(mockRewardedEvent);

    const updatedScanner = ScannerPool.load(mockPoolId);
    const actualValue = updatedScanner ? updatedScanner.apyForLastEpoch : null;

    if (actualValue) {
      assert.fieldEquals("ScannerPool", mockPoolId, "apyForLastEpoch", BigDecimal.fromString("0").toString());
    } else {
      throw new Error("Node pool should have a 0% apy value");
    }
  });

  test("should handle a reward event on a pool with one delegator and return the correct APY", () => {
    //Given
    delegatorOne = new Staker(mockDelegatorStakerIdOne);
    delegatorOne.account = mockDelegatorStakerIdOne;
    delegatorOne.nodePools = [mockPoolId];
    delegatorOne.save();

    // Half of stake is delegated
    mockNodePool.stakeAllocated = BigInt.fromI32(5000);
    mockNodePool.stakeOwnedAllocated = BigInt.fromI32(2500);
    mockNodePool.stakers = [delegatorOne.id];

    const latestRewardMetaData = new NodePoolRewardMetaData(`${mockNodePool.id}-latest-reward-metadata`);
    latestRewardMetaData.epochNumber = BigInt.fromI32(2770);
    latestRewardMetaData.nodePoolId = mockPoolId;
    latestRewardMetaData.totalDelegatorStakesAtStartOfEpoch = BigInt.fromI32(2500);
    latestRewardMetaData.save();

    const previousRewardMetaData = new NodePoolRewardMetaData(`${mockPoolId}-previous-reward-metadata`);
    latestRewardMetaData.epochNumber = BigInt.fromI32(2769);
    latestRewardMetaData.nodePoolId = mockPoolId;
    latestRewardMetaData.totalDelegatorStakesAtStartOfEpoch = BigInt.fromI32(2500);
    previousRewardMetaData.save();

    mockNodePool.latestRewardMetaData = latestRewardMetaData.id;
    mockNodePool.previousRewardMetaData = previousRewardMetaData.id;

    mockNodePool.save();

    const totalDelegateStakeInEpoch = mockNodePool.stakeAllocated.minus(mockNodePool.stakeOwnedAllocated);

    const reward = BigInt.fromI32(150);
    const delegateReward = BigInt.fromI32(75);
    const epoch = BigInt.fromI32(2770);

    const mockRewardedEvent = createMockRewardEvent(2, BigInt.fromString(mockNodePool.id), reward, epoch);
    mockRewardedEvent.address = contractAddress;

    createMockedFunction(
      contractAddress,
      "availableReward",
      "availableReward(uint8,uint256,uint256,address):(uint256)"
    ).withArgs([
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(3)), // ensure subjectType is delegators
      ethereum.Value.fromUnsignedBigInt(BigInt.fromString(mockNodePool.id)),
      ethereum.Value.fromUnsignedBigInt(epoch),
      ethereum.Value.fromAddress(Address.fromString(delegatorOne.account))
    ]).returns([ethereum.Value.fromUnsignedBigInt(delegateReward)]);

    // When
    handleRewardEvent(mockRewardedEvent);

    const expectedApy = `${((parseFloat((BigDecimal.fromString("1").plus(delegateReward.toBigDecimal().div(totalDelegateStakeInEpoch.toBigDecimal()))).toString()) ** 52) - 1) * 100}`;

    const truncatedApy = BigDecimal.fromString(truncateApy(expectedApy));

    // Expect
    assert.fieldEquals("ScannerPool", mockPoolId, "apyForLastEpoch", truncatedApy.toString());
  });

  test("should handle a reward event on a pool with multiple delegators and return the correct APY", () => {
    //Given
    delegatorOne = new Staker(mockDelegatorStakerIdOne);
    delegatorOne.account = mockDelegatorStakerIdOne;
    delegatorOne.nodePools = [mockPoolId];
    delegatorOne.save();

    delegatorTwo = new Staker(mockDelegatorStakerIdTwo);
    delegatorTwo.account = mockDelegatorStakerIdTwo;
    delegatorTwo.nodePools = [mockPoolId];
    delegatorTwo.save();

    // Half of stake is delegated
    mockNodePool.stakeAllocated = BigInt.fromI32(5000);
    mockNodePool.stakeOwnedAllocated = BigInt.fromI32(2500);
    mockNodePool.stakers = [delegatorOne.id, delegatorTwo.id];

    const latestRewardMetaData = new NodePoolRewardMetaData(`${mockNodePool.id}-latest-reward-metadata`);
    latestRewardMetaData.epochNumber = BigInt.fromI32(2770);
    latestRewardMetaData.nodePoolId = mockPoolId;
    latestRewardMetaData.totalDelegatorStakesAtStartOfEpoch = BigInt.fromI32(2500);
    latestRewardMetaData.save();

    const previousRewardMetaData = new NodePoolRewardMetaData(`${mockPoolId}-previous-reward-metadata`);
    latestRewardMetaData.epochNumber = BigInt.fromI32(2769);
    latestRewardMetaData.nodePoolId = mockPoolId;
    latestRewardMetaData.totalDelegatorStakesAtStartOfEpoch = BigInt.fromI32(2500);
    previousRewardMetaData.save();

    mockNodePool.latestRewardMetaData = latestRewardMetaData.id;
    mockNodePool.previousRewardMetaData = previousRewardMetaData.id;

    mockNodePool.save();

    const totalDelegateStakeInEpoch = mockNodePool.stakeAllocated.minus(mockNodePool.stakeOwnedAllocated);

    const reward = BigInt.fromI32(200);
    const delegateOneReward = BigInt.fromI32(75);
    const delegateTwoReward = BigInt.fromI32(25);
    const epoch = BigInt.fromI32(2770);

    const mockRewardedEvent = createMockRewardEvent(2, BigInt.fromString(mockNodePool.id), reward, epoch);
    mockRewardedEvent.address = contractAddress;

    createMockedFunction(
      contractAddress,
      "availableReward",
      "availableReward(uint8,uint256,uint256,address):(uint256)"
    ).withArgs([
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(3)), // ensure subjectType is delegators
      ethereum.Value.fromUnsignedBigInt(BigInt.fromString(mockNodePool.id)),
      ethereum.Value.fromUnsignedBigInt(epoch),
      ethereum.Value.fromAddress(Address.fromString(delegatorOne.account))
    ]).returns([ethereum.Value.fromUnsignedBigInt(delegateOneReward)]); // Mock delegator 1 rewards

    createMockedFunction(
      contractAddress,
      "availableReward",
      "availableReward(uint8,uint256,uint256,address):(uint256)"
    ).withArgs([
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(3)), // ensure subjectType is delegators
      ethereum.Value.fromUnsignedBigInt(BigInt.fromString(mockNodePool.id)),
      ethereum.Value.fromUnsignedBigInt(epoch),
      ethereum.Value.fromAddress(Address.fromString(delegatorTwo.account))
    ]).returns([ethereum.Value.fromUnsignedBigInt(delegateTwoReward)]); // Mock delegator 2 rewards

    // When
    handleRewardEvent(mockRewardedEvent);

    const delegateReward = delegateOneReward.plus(delegateTwoReward);

    const expectedApy = `${((parseFloat((BigDecimal.fromString("1").plus(delegateReward.toBigDecimal().div(totalDelegateStakeInEpoch.toBigDecimal()))).toString()) ** 52) - 1) * 100}`;

    const truncatedApy = BigDecimal.fromString(truncateApy(expectedApy));
    // Expect
    assert.fieldEquals("ScannerPool", mockPoolId, "apyForLastEpoch", truncatedApy.toString());
  });
});
