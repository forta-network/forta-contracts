import { Address, BigInt } from "@graphprotocol/graph-ts";

import { ScanNode } from "../../generated/schema";

import { fetchAccount } from "./account";

export function fetchScannode(id: BigInt): ScanNode {
  let scanner = ScanNode.load(id.toHex());
  if (scanner == null) {
    scanner = new ScanNode(id.toHex());
    scanner.owner = fetchAccount(Address.zero()).id;
    scanner.enabled = true;
    scanner.disableFlags = 0;
    scanner.metadata = "";
  }
  return scanner as ScanNode;
}
