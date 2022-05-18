import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";

import { Account } from "../../generated/schema";

export function fetchAccount(address: Bytes): Account {
  let account = new Account(address);
  account.save();
  return account;
}
