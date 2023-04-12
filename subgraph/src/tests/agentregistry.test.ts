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
    BigInt.fromI32(1).toHex(),
    "id",
    BigInt.fromI32(1).toHex()
  );
  clearStore();
});

test("Bot is updated successfully to store upon Update event ", () => {
  const mockBot = new Bot(BigInt.fromI32(1).toHex());
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
    BigInt.fromI32(1).toHex(),
    "id",
    BigInt.fromI32(1).toHex(),
  );

  assert.fieldEquals("Bot", BigInt.fromI32(2).toHex(), "metadata", "Test");
});

test("Bot is successfully flaged as enabled or disabled", () => {
  const mockBot = new Bot(BigInt.fromI32(1).toHex());
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
