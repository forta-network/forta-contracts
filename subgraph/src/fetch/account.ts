import { Address, BigInt } from "@graphprotocol/graph-ts";

import { Account } from "../../generated/schema";

export function fetchAccount(address: string): Account {
  let account = new Account(address);
  account.save();
  return account;
}
