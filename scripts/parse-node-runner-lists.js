const fs = require('fs');
const yesterdayNodes = require('./data/nodes-to-stake_1650914637350.json');
const funnel = require('./data/funnel3.json');

const nodes = Object.keys(funnel).map( key => funnel[key]['NODE address']).filter(x => x.startsWith('0x'));

const b = new Set(yesterdayNodes);
const difference = nodes.filter(x => !b.has(x))


const result = {
    'all-nodes-to-date': nodes,
    'last-batch': yesterdayNodes,
    'new-nodes': difference
}

console.log('# of nodes:', nodes.length);
console.log('# of yesterda:', yesterdayNodes.length);
console.log('# new owns:', difference.length);

fs.writeFileSync(`./scripts/data/nodes-to-stake_difference_${Date.now()}.json`, JSON.stringify(result))