import { Transaction } from "@amxx/graphprotocol-utils/generated/schema";
import { ethereum } from "@graphprotocol/graph-ts";

export default function log(event: ethereum.Event): Transaction {
  let tx = new Transaction(event.transaction.hash.toHex());
  tx.timestamp = event.block.timestamp;
  tx.blockNumber = event.block.number;
  tx.save();
  return tx;
}
