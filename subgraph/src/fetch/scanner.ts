import {
    Address,
    BigInt,
} from '@graphprotocol/graph-ts'

import {
    Scanner,
} from '../../generated/schema'

import { fetchAccount } from './account'

export function fetchScanner(id: BigInt) : Scanner {
    let scanner = Scanner.load(id.toHex())
    if (scanner == null) {
        let account = fetchAccount(Address.fromString(id.toHex()))
        account.asScanner = id.toHex()
        account.save()

        scanner              = new Scanner(id.toHex())
        scanner.asAccount    = account.id
        scanner.enabled      = true
        scanner.disableFlags = 0
    }
    return scanner as Scanner
}