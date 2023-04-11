import { Address, BigInt } from "@graphprotocol/graph-ts";
import { test, assert, clearStore } from "matchstick-as";
import { Bot } from "../../generated/schema";
import {
  createEnabledEvent,
  createTransferEvent,
  createUpdateEvent,
  handleAgentEnabled,
  handleAgentUpdated,
  handleTransfer,
} from "../datasources/AgentRegistry";

function bigIntToHex(id: BigInt): string {
  const idHex = id.toHex();
  if (idHex.length == 42) {
    return idHex;
  }
  const extraZeroes = 42 - idHex.length;
  return '0x' + '0'.repeat(extraZeroes) + idHex.slice(2);
}

test("Bot is added successfully to store upon transfer event ", () => {
  const mockBot = new Bot("0x0");
  mockBot.chainIds = [BigInt.fromI32(1), BigInt.fromI32(137)];
  mockBot.owner = Address.zero().toString();
  mockBot.enabled = true;
  mockBot.disableFlags = 0;
  mockBot.metadata = "";
  mockBot.save();
  const mockBotTransferEvent = createTransferEvent(
    Address.zero(),
    Address.zero(),
    BigInt.fromI32(1)
  );

  handleTransfer(mockBotTransferEvent);

  assert.fieldEquals("Bot", "0x0", "id", "0x0");
  assert.fieldEquals(
    "Bot",
    bigIntToHex(BigInt.fromI32(1)),
    "id",
    bigIntToHex(BigInt.fromI32(1))
  );
  clearStore();
});

test("Bot is updated successfully to store upon Update event ", () => {
  const mockBot = new Bot(bigIntToHex(BigInt.fromI32(1)));
  mockBot.chainIds = [BigInt.fromI32(1), BigInt.fromI32(137)];
  mockBot.owner = Address.zero().toString();
  mockBot.enabled = true;
  mockBot.disableFlags = 0;
  mockBot.metadata = "";
  mockBot.save();

  const bigIntArr: Array<BigInt> = [BigInt.fromI32(1)];
  const botUpdatedEvent = createUpdateEvent(
    BigInt.fromI32(2),
    Address.zero(),
    bigIntArr,
    "Test"
  );

  handleAgentUpdated(botUpdatedEvent);

  assert.fieldEquals(
    "Bot",
    bigIntToHex(BigInt.fromI32(1)),
    "id",
    bigIntToHex(BigInt.fromI32(1))
  );

  assert.fieldEquals("Bot", bigIntToHex(BigInt.fromI32(2)), "metadata", "Test");
});

test("Bot is successfully flaged as enabled or disabled", () => {
  const mockBot = new Bot(bigIntToHex(BigInt.fromI32(1)));
  mockBot.chainIds = [BigInt.fromI32(1), BigInt.fromI32(137)];
  mockBot.owner = Address.zero().toString();
  mockBot.enabled = true;
  mockBot.disableFlags = 0;
  mockBot.metadata = "";
  mockBot.save();

  const mockEnabledEvent = createEnabledEvent(
    BigInt.fromI32(1),
    1,
    false,
    false
  );

  handleAgentEnabled(mockEnabledEvent);

  assert.fieldEquals("Bot", mockBot.id, "enabled", "false");
});
