import {
    AgentTransfer,
    AgentUpdated,
    AgentEnabled,
} from '../../generated/schema'

import {
    AgentEnabled as AgentEnabledEvent,
    AgentUpdated as AgentUpdatedEvent,
    Transfer     as TransferEvent,
} from '../../generated/AgentRegistry/AgentRegistry'

import {
    events,
    transactions,
} from '@amxx/graphprotocol-utils'

import { fetchAccount } from '../fetch/account'
import { fetchAgent   } from '../fetch/agent'

export function handleTransfer(event: TransferEvent): void {
    let from  = fetchAccount(event.params.from)
    let to    = fetchAccount(event.params.to)
    let agent = fetchAgent(event.params.tokenId)
    agent.owner = to.id
    agent.save()

    let ev = new AgentTransfer(events.id(event))
    ev.transaction = transactions.log(event).id
    ev.timestamp   = event.block.timestamp
    ev.agent       = agent.id
    ev.from        = from.id
    ev.to          = to.id
    ev.save()
}

export function handleAgentUpdated(event: AgentUpdatedEvent): void {
    let agent = fetchAgent(event.params.agentId)
    agent.metadata = event.params.metadata
    agent.chains   = event.params.chainIds
    agent.save();

    let ev = new AgentUpdated(events.id(event))
    ev.transaction = transactions.log(event).id
    ev.timestamp   = event.block.timestamp
    ev.agent       = agent.id
    ev.by          = fetchAccount(event.params.by).id
    ev.metadata    = event.params.metadata
    ev.chains      = event.params.chainIds
    ev.save()
}

export function handleAgentEnabled(event: AgentEnabledEvent): void {
    let agent = fetchAgent(event.params.agentId)
    let mask  = 1 << event.params.permission

    agent.disableFlags = event.params.value
        ? agent.disableFlags || mask
        : agent.disableFlags && ~mask

    agent.enabled =event.params.enabled
    agent.save()

    let ev = new AgentEnabled(events.id(event))
    ev.transaction = transactions.log(event).id
    ev.timestamp   = event.block.timestamp
    ev.agent       = agent.id
    ev.enabled     = event.params.enabled
    ev.permission  = event.params.permission
    ev.value       = event.params.value
    ev.save()
}