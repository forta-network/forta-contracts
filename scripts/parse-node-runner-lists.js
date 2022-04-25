const fs = require('fs');

const funnel = require('./data/funnel2.json');

const nodes = Object.keys(funnel).map( key => funnel[key]['NODE address']).filter(x => x.startsWith('0x'));

console.log('# of nodes:', nodes.length);

fs.writeFileSync(`./scripts/data/2nodes-to-stake_${Date.now()}.json`, JSON.stringify(nodes))