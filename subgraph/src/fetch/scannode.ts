import { Address, BigInt } from "@graphprotocol/graph-ts";

import { ScanNode } from "../../generated/schema";

import { fetchAccount } from "./account";

export function fetchScannode(id: BigInt): ScanNode {
  const addr = scannerBigIntToHex(id);
  let scanner = ScanNode.load(addr);
  if (scanner == null) {
    scanner = new ScanNode(addr);
    scanner.owner = fetchAccount(Address.zero()).id;
    scanner.enabled = true;
    scanner.disableFlags = 0;
    scanner.metadata = "";
  }
  return scanner as ScanNode;
}

export function scannerBigIntToHex(id: BigInt): string {
  const idHex = id.toHex();
  if (idHex.length == 42) {
    return idHex;
  }
  const extraZeroes = 42 - idHex.length;
  return '0x' + '0'.repeat(extraZeroes) + idHex.slice(2);
}
