const { ethers, upgrades } = require('hardhat');
const DEBUG                = require('debug')('forta');
const impls = require('../.openzeppelin/unknown-31337.json').impls;

const isFileInHere = (item, name) => {
    const regex = new RegExp(`\/${name}.sol`, 'g')
    return item.layout.storage.find(x => regex.test(x.src)) !== undefined;
}

const findHash = (name, impls) => {
    return Object.keys(impls).find(hash => isFileInHere(impls[hash], name))
}

const storageAgentRegistry_0_1_1 = impls[findHash('AgentRegistry_0_1_1', impls)]?.layout;
const storageAgentRegistry = impls[findHash('AgentRegistry', impls)]?.layout;

const storageScannerRegistry_0_1_0 = impls[findHash('ScannerRegistry_0_1_0', impls)]?.layout;
const storageScannerRegistry = impls[findHash('ScannerRegistry', impls)]?.layout;

function typeSize(typeLabel, storageTypes) {
    //console.log(typeLabel)
    if (typeLabel.includes('t_array')) {
        if(typeLabel.includes('dyn_storage')) {
            return 1
        } else if(typeLabel.includes('_storage')) {
            return Number(typeLabel.replace(/.*\)/, '').replace(/_storage/,''))
        }
    } else if(typeLabel.startsWith('t_struct')) {
        // TODO: support nested structs and static arrays?
        if (storageTypes[typeLabel].members) {
            if (typeof storageTypes[typeLabel].members === 'object') {
                // This should be an array but this happened?
                return Object.keys(storageTypes[typeLabel].members).length
            } else {
                return storageTypes[typeLabel].members.length
            }
        } else {
            return 1
        }
    } else {
        return 1;
    }
    throw new Error(`unsupported label ${typeLabel}`)
}

function storageMemberToRow(member, storageTypes) {
    return {
        row: `| ${member.contract} | ${member.label} | ${typeSize(member.type, storageTypes)} |`,
        size: typeSize(member.type, storageTypes)
    }
}

function printStorageMember(x, storageTypes) {
    //console.log(x.contract);
    //console.log(x.label);
    //console.log(typeSize(x.type, storageTypes))
    console.log(storageMemberToRow(x, storageTypes))
}

function printStorageLayout(layout) {
    for (const item of layout.storage) {
        printStorageMember(item, layout.types)
    }
}

function storageLayoutToRows(layout) {
    const rows = layout.storage.map(x => storageMemberToRow(x, layout.types))
    const total = rows.reduce((prev, next) => {
        return (prev.size ?? prev) + (next.size ?? 0)
    })
    rows.push( {
        row: `|  | total | ${total} |`,
        size: total
    })
    return rows
}

const emptyRowIfUndefined = (row) => row ?? '|  |  |  |'

const header = `| BEFORE |   |   |   | AFTER |   |  |
| -- | -- | -- | -- | -- | -- | -- |`

const printAgentRegistries = () => {

}

async function main() {
    
    console.log('AgentRegistry_0_1_1')
    const originalRows = storageLayoutToRows(storageAgentRegistry_0_1_1).map(x => x.row)
    console.log('---------------------------------')
    console.log('AgentRegistry')
    const laterRows = storageLayoutToRows(storageAgentRegistry).map(x => x.row)
    console.log('---------------------------------')
    const size = Math.max(originalRows.length, laterRows.length)
    console.log(size)
    console.log(header)
    for (var i = 0; i < size; i++) {
        console.log(`${emptyRowIfUndefined(originalRows[i])} ${emptyRowIfUndefined(laterRows[i])}`)
    }
    /*
    
    console.log('ScannerRegistry_0_1_0 ')
    const originalRows = storageLayoutToRows(storageScannerRegistry_0_1_0).map(x => x.row)
    console.log('---------------------------------')
    console.log('ScannerRegistry')
    const laterRows = storageLayoutToRows(storageScannerRegistry).map(x => x.row)
    console.log('---------------------------------')
    const size = Math.max(originalRows.length, laterRows.length)
    console.log(size)
    console.log(header)
    for (var i = 0; i < size; i++) {
        console.log(`${emptyRowIfUndefined(originalRows[i])} ${emptyRowIfUndefined(laterRows[i])}`)
    }
    */
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
