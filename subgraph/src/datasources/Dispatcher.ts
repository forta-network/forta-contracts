import eventId from "../utils/event";
import transactionLog from "../utils/transaction";
import { Link as LinkEvent } from "../../generated/Dispatcher/Dispatcher";
import { Link, LinkEnabled } from "../../generated/schema";

import { fetchBot } from "../fetch/bot";
import { fetchScanner } from "../fetch/scanner";

export function handleLink(event: LinkEvent): void {
  let bot = fetchBot(event.params.agentId);
  let scanner = fetchScanner(event.params.scannerId);
  let link = new Link(bot.id.concat("/").concat(scanner.id));
  link.bot = bot.id;
  link.scanner = scanner.id;
  link.active = event.params.enable;
  link.save();

  let ev = new LinkEnabled(eventId(event));
  ev.transaction = transactionLog(event).id;
  ev.timestamp = event.block.timestamp;
  ev.bot = bot.id;
  ev.scanner = scanner.id;
  ev.link = link.id;
  ev.enabled = event.params.enable;
  ev.save();
}
