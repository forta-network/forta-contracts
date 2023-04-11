import { Address, BigInt } from "@graphprotocol/graph-ts";

import { Scanner } from "../../generated/schema";

import { fetchAccount } from "./account";
import { scannerBigIntToHex } from "./scannode";

export function fetchScanner(id: BigInt): Scanner {
  let scanner = Scanner.load(scannerBigIntToHex(id));
  if (scanner == null) {
    scanner = new Scanner(scannerBigIntToHex(id));
    scanner.owner = fetchAccount(Address.zero()).id;
    scanner.enabled = true;
    scanner.disableFlags = 0;
    scanner.metadata = "";
  }
  return scanner as Scanner;
}


