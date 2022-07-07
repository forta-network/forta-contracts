import { events, transactions } from "@amxx/graphprotocol-utils/";
import {
  AgentUpdated as AgentUpdatedEvent,
  AgentEnabled as AgentEnabledEvent,
  Transfer as TransferEvent,
} from "../../generated/AgentRegistry/AgentRegistry";
import { BotEnabled, BotTransfer, BotUpdated } from "../../generated/schema";
import { fetchAccount } from "../fetch/account";
import { fetchBot } from "../fetch/bot";
import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts";
import { newMockEvent } from "matchstick-as";

export function handleAgentUpdated(event: AgentUpdatedEvent): void {
  let bot = fetchBot(event.params.agentId);
  let account = fetchAccount(event.params.by);
  bot.chainIds = event.params.chainIds;
  bot.metadata = event.params.metadata;
  bot.save();

  const ev = new BotUpdated(events.id(event));
  ev.transaction = transactions.log(event).id;
  ev.timestamp = event.block.timestamp;
  ev.bot = bot.id;
  ev.by = account.id;
  ev.metadata = event.params.metadata;
  ev.chains = event.params.chainIds;
  ev.save();
}

export function handleTransfer(event: TransferEvent): void {
  let bot = fetchBot(event.params.tokenId);
  let from = fetchAccount(event.params.from);
  let to = fetchAccount(event.params.to);
  bot.owner = to.id;
  bot.save();

  const ev = new BotTransfer(events.id(event));

  ev.transaction = transactions.log(event).id;
  ev.timestamp = event.block.timestamp;
  ev.bot = bot.id;
  ev.from = from.id;
  ev.to = to.id;
  ev.save();
}

export function handleAgentEnabled(event: AgentEnabledEvent): void {
  let bot = fetchBot(event.params.agentId);
  let mask = 1 << event.params.permission;
  bot.disableFlags = event.params.value
    ? bot.disableFlags || mask
    : bot.disableFlags && ~mask;
  bot.enabled = event.params.enabled;
  bot.save();

  const ev = new BotEnabled(events.id(event));
  ev.transaction = transactions.log(event).id;
  ev.timestamp = event.block.timestamp;
  ev.bot = bot.id;
  ev.enabled = event.params.enabled;
  ev.permission = event.params.permission;
  ev.value = event.params.value;
}

export function createTransferEvent(
  from: Address,
  to: Address,
  tokenId: BigInt
): TransferEvent {
  const mockTransferEvent = changetype<TransferEvent>(newMockEvent());

  mockTransferEvent.parameters = [];

  const fromParam = new ethereum.EventParam(
    "from",
    ethereum.Value.fromAddress(from)
  );

  const toParam = new ethereum.EventParam("to", ethereum.Value.fromAddress(to));

  const tokenIdParam = new ethereum.EventParam(
    "tokenId",
    ethereum.Value.fromSignedBigInt(tokenId)
  );

  mockTransferEvent.parameters.push(fromParam);
  mockTransferEvent.parameters.push(toParam);
  mockTransferEvent.parameters.push(tokenIdParam);

  return mockTransferEvent;
}

export function createUpdateEvent(
  agentId: BigInt,
  by: Address,
  chainIds: BigInt[],
  metadata: string
): AgentUpdatedEvent {
  const mockUpdatedEvent = changetype<AgentUpdatedEvent>(newMockEvent());
  mockUpdatedEvent.parameters = [];
  const agentIdParam = new ethereum.EventParam(
    "agentId",
    ethereum.Value.fromSignedBigInt(agentId)
  );
  const byParam = new ethereum.EventParam("by", ethereum.Value.fromAddress(by));

  const chainIdsParam = new ethereum.EventParam(
    "chainIds",
    ethereum.Value.fromSignedBigIntArray(chainIds)
  );

  const metadataParam = new ethereum.EventParam(
    "metadata",
    ethereum.Value.fromString(metadata)
  );

  mockUpdatedEvent.parameters.push(agentIdParam);
  mockUpdatedEvent.parameters.push(byParam);
  mockUpdatedEvent.parameters.push(metadataParam);
  mockUpdatedEvent.parameters.push(chainIdsParam);

  return mockUpdatedEvent;
}

export function createEnabledEvent(
  agentId: BigInt,
  permission: i32,
  value: boolean,
  enabled: boolean
): AgentEnabledEvent {
  const mockEnabledEvent = changetype<AgentEnabledEvent>(newMockEvent());

  const agentIdParam = new ethereum.EventParam(
    "agentId",
    ethereum.Value.fromSignedBigInt(agentId)
  );

  const permissionParam = new ethereum.EventParam(
    "permission",
    ethereum.Value.fromI32(permission)
  );

  const valueParam = new ethereum.EventParam(
    "value",
    ethereum.Value.fromBoolean(value)
  );

  const enabledParam = new ethereum.EventParam(
    "enabled",
    ethereum.Value.fromBoolean(enabled)
  );

  mockEnabledEvent.parameters.push(agentIdParam);
  mockEnabledEvent.parameters.push(enabledParam);
  mockEnabledEvent.parameters.push(permissionParam);
  mockEnabledEvent.parameters.push(valueParam);

  return mockEnabledEvent;
}
