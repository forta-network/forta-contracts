import { Address, BigInt } from "@graphprotocol/graph-ts";

import { ScanNode } from "../../generated/schema";

import { fetchAccount } from "./account";

export function fetchScannode(id: BigInt): ScanNode {
  const addr = scannerBigIntToAddress(id);
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

function scannerBigIntToAddress(id: BigInt): Address {
  const idHex = id.toHex();
  if (idHex.length == 42) {
    return Address.fromString(idHex);
  }
  const extraZeroes = 42 - idHex.length;
  return Address.fromString('0x' + '0'.repeat(extraZeroes) + idHex.slice(2));
}
