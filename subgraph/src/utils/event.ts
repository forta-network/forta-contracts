import { ethereum } from "@graphprotocol/graph-ts";

export default function id(event: ethereum.Event): string {
  return event.block.number.toHex().concat("-").concat(event.logIndex.toHex());
}
