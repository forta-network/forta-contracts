import { Address, BigInt } from "@graphprotocol/graph-ts";

import { Scanner } from "../../generated/schema";

import { fetchAccount } from "./account";

export function fetchScanner(id: BigInt): Scanner {
  let scanner = Scanner.load(id.toHex());
  if (scanner == null) {
    scanner = new Scanner(id.toHex());
    scanner.owner = fetchAccount(Address.zero()).id;
    scanner.enabled = true;
    scanner.disableFlags = 0;
    scanner.metadata = "";
  }
  return scanner as Scanner;
}


