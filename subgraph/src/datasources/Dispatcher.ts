import { events, transactions } from "@amxx/graphprotocol-utils/";
import { Link as LinkEvent } from "../../generated/Dispatcher/Dispatcher";
import { Link, LinkEnabled } from "../../generated/schema";
import { fetchBot } from "../fetch/bot";
import { fetchScanner } from "../fetch/scanner";
import { BigInt } from "@graphprotocol/graph-ts";
import { newMockEvent } from "matchstick-as";
import { ethereum } from "@graphprotocol/graph-ts";

export function handleLink(event: LinkEvent): void {
  let bot = fetchBot(event.params.agentId);
  let scanner = fetchScanner(event.params.scannerId);
  let link = new Link(bot.id.concat("/").concat(scanner.id));
  link.bot = bot.id;
  link.scanner = scanner.id;
  link.active = event.params.enable;
  link.save();

  let ev = new LinkEnabled(events.id(event));
  ev.transaction = transactions.log(event).id;
  ev.timestamp = event.block.timestamp;
  ev.bot = bot.id;
  ev.scanner = scanner.id;
  ev.link = link.id;
  ev.enabled = event.params.enable;
  ev.save();
}

export function createLinkEvent(
  agentId: BigInt,
  scannerId: BigInt,
  enable: boolean
): LinkEvent {
  const mockLinkEvent = changetype<LinkEvent>(newMockEvent());
  mockLinkEvent.parameters = [];

  const agentIdParam = new ethereum.EventParam(
    "agentId",
    ethereum.Value.fromSignedBigInt(agentId)
  );

  const scannerIdParam = new ethereum.EventParam(
    "scannerId",
    ethereum.Value.fromSignedBigInt(scannerId)
  );

  const enableParam = new ethereum.EventParam(
    "enable",
    ethereum.Value.fromBoolean(enable)
  );

  mockLinkEvent.parameters.push(agentIdParam);
  mockLinkEvent.parameters.push(scannerIdParam);
  mockLinkEvent.parameters.push(enableParam);
  return mockLinkEvent;
}
