import { Address, BigInt } from "@graphprotocol/graph-ts";

import { ScanNode } from "../../generated/schema";

import { fetchAccount } from "./account";

export function fetchScannode(id: BigInt): ScanNode {
  const addr = Address.fromBigInt(id);
  let scanner = ScanNode.load(addr.toHex());
  if (scanner == null) {
    scanner = new ScanNode(addr.toHex());
    scanner.owner = fetchAccount(Address.zero()).id;
    scanner.enabled = true;
    scanner.disableFlags = 0;
    scanner.metadata = "";
  }
  return scanner as ScanNode;
}
