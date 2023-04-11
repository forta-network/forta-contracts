import { BigInt } from "@graphprotocol/graph-ts";

import { Bot } from "../../generated/schema";
import { fetchAccount } from "./account";
import { Address } from "@graphprotocol/graph-ts";
import { scannerBigIntToHex } from "./scannode";

export function fetchBot(id: BigInt): Bot {
  let bot = Bot.load(scannerBigIntToHex(id));

  if (bot == null) {
    bot = new Bot(scannerBigIntToHex(id));
    bot.owner = fetchAccount(Address.zero()).id;
    bot.enabled = true;
    bot.disableFlags = 0;
    bot.metadata = "";
  }
  return bot as Bot;
}