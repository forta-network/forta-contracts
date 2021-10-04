import {
    ScannerManager,
    ScannerTransfer,
    ScannerManagerEnabled,
    ScannerEnabled,
} from '../../generated/schema'

import {
    ManagerEnabled as ManagerEnabledEvent,
    ScannerEnabled as ScannerEnabledEvent,
    Transfer       as TransferEvent,
} from '../../generated/ScannerRegistry/ScannerRegistry'

import {
    events,
    transactions,
} from '@amxx/graphprotocol-utils'

import { fetchAccount } from '../fetch/account'
import { fetchScanner } from '../fetch/scanner'

export function handleTransfer(event: TransferEvent): void {
    let from    = fetchAccount(event.params.from)
    let to      = fetchAccount(event.params.to)
    let scanner = fetchScanner(event.params.tokenId)
    scanner.owner = to.id
    scanner.save()

    let ev = new ScannerTransfer(events.id(event))
    ev.transaction = transactions.log(event).id
    ev.timestamp   = event.block.timestamp
    ev.scanner     = scanner.id
    ev.from        = from.id
    ev.to          = to.id
    ev.save()
}

export function handleManagerEnabled(event: ManagerEnabledEvent): void {
    let scanner = fetchScanner(event.params.scannerId)
    let account = fetchAccount(event.params.manager)

    let scannermanager = new ScannerManager(scanner.id.concat('/').concat(account.id))
    scannermanager.scanner = scanner.id
    scannermanager.account = account.id
    scannermanager.active = event.params.enabled
    scannermanager.save()

    let ev = new ScannerManagerEnabled(events.id(event))
    ev.transaction    = transactions.log(event).id
    ev.timestamp      = event.block.timestamp
    ev.scanner        = scanner.id
    ev.manager        = account.id
    ev.scannermanager = scannermanager.id
    ev.enabled        = event.params.enabled
    ev.save()
}

export function handleScannerEnabled(event: ScannerEnabledEvent): void {
    let scanner = fetchScanner(event.params.scannerId)
    let mask  = 1 << event.params.permission

    scanner.disableFlags = event.params.value
        ? scanner.disableFlags || mask
        : scanner.disableFlags && ~mask

    scanner.enabled = event.params.enabled
    scanner.save()

    let ev = new ScannerEnabled(events.id(event))
    ev.transaction = transactions.log(event).id
    ev.timestamp   = event.block.timestamp
    ev.scanner     = scanner.id
    ev.enabled     = event.params.enabled
    ev.permission  = event.params.permission
    ev.value       = event.params.value
    ev.save()
}
