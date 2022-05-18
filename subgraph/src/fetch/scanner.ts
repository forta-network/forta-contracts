import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";

import { Scanner } from "../../generated/schema";

import { fetchAccount } from "./account";

export function fetchScanner(id: Bytes): Scanner {
  let scanner = Scanner.load(id.toHex());
  if (scanner == null) {
    let account = fetchAccount(id);
    account.asScanner = id.toHex();
    account.save();

    scanner = new Scanner(id.toHex());
    scanner.asAccount = account.id;
    scanner.owner = fetchAccount(Address.zero()).id;
    scanner.enabled = true;
    scanner.disableFlags = 0;
    scanner.metadata = "";
  }
  return scanner as Scanner;
}
