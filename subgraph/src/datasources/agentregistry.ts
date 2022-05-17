import eventId from "../utils/event";
import transactionLog from "../utils/transaction";
import {
  AgentUpdated as AgentUpdatedEvent,
  AgentEnabled as AgentEnabledEvent,
  Transfer as TransferEvent,
  AgentRegistry as AgentRegistryContract,
} from "../../generated/AgentRegistry/AgentRegistry";
import {
  Bot,
  BotEnabled,
  BotTransfer,
  BotUpdated,
} from "../../generated/schema";
import { fetchAccount } from "../fetch/account";

import { fetchBot } from "../fetch/bot";

export function handleAgentUpdated(event: AgentUpdatedEvent): void {
  let bot = fetchBot(event.params.agentId);
  let account = fetchAccount(event.params.by.toHex());
  bot.chainIds = event.params.chainIds;
  bot.metadata = event.params.metadata;
  bot.save();

  const ev = new BotUpdated(eventId(event));
  ev.transaction = transactionLog(event).id;
  ev.timestamp = event.block.timestamp;
  ev.bot = bot.id;
  ev.by = account.id;
  ev.metadata = event.params.metadata;
  ev.chains = event.params.chainIds;
  ev.save();
}

export function handleTransfer(event: TransferEvent): void {
  let bot = fetchBot(event.params.tokenId);
  let from = fetchAccount(event.params.from.toHex());
  let to = fetchAccount(event.params.to.toHex());
  bot.owner = to.id;
  bot.save();

  const ev = new BotTransfer(eventId(event));
  ev.transaction = transactionLog(event).id;
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

  const ev = new BotEnabled(eventId(event));
  ev.transaction = transactionLog(event).id;
  ev.timestamp = event.block.timestamp;
  ev.bot = bot.id;
  ev.enabled = event.params.enabled;
  ev.permission = event.params.permission;
  ev.value = event.params.value;
}
