import { Address } from "@graphprotocol/graph-ts";

import { Account } from "../../generated/schema";

export function fetchAccount(address: Address): Account {
  let account = Account.load(address.toHex());

  if(!account) {
    account = new Account(address.toHex())
  }
  account.save();
  return account;
}

export function addressToHex(id: Address): string {
  const idHex = id.toHex();
  if (idHex.length == 42) {
    return idHex;
  }
  const extraZeroes = 42 - idHex.length;
  return '0x' + '0'.repeat(extraZeroes) + idHex.slice(2);
}
