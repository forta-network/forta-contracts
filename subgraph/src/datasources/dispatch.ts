import {
    Link,
    LinkEnabled,
} from '../../generated/schema'

import {
    Link as LinkEvent,
} from '../../generated/Dispatch/Dispatch'

import {
    events,
    transactions,
} from '@amxx/graphprotocol-utils'

import { fetchAccount } from '../fetch/account'
import { fetchAgent   } from '../fetch/agent'
import { fetchScanner } from '../fetch/scanner'

export function handleLink(event: LinkEvent): void {
    let agent    = fetchAgent(event.params.agentId)
    let scanner  = fetchAgent(event.params.scannerId)
    let link     = new Link(agent.id.concat('/').concat(scanner.id))
    link.agent   = agent.id
    link.scanner = scanner.id
    link.active  = event.params.enable
    link.save()

    let ev = new LinkEnabled(events.id(event))
    ev.transaction = transactions.log(event).id
    ev.timestamp   = event.block.timestamp
    ev.agent       = agent.id
    ev.scanner     = scanner.id
    ev.link        = link.id
    ev.enabled     = event.params.enable
    ev.save()
}