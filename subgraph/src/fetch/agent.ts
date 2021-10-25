import {
    BigInt,
} from '@graphprotocol/graph-ts'

import {
    Agent,
} from '../../generated/schema'

export function fetchAgent(id: BigInt) : Agent {
    let agent = Agent.load(id.toHex())
    if (agent == null) {
        agent              = new Agent(id.toHex())
        agent.enabled      = true
        agent.disableFlags = 0
        agent.metadata     = ""
        agent.chains       = []
    }
    return agent as Agent
}