const impls = require('../.openzeppelin/unknown-31337.json').impls;
const DEBUG = require('debug')('storage-2-table');
const fs = require('fs');

const isFileInHere = (item, name) => {
    const regex = new RegExp(`/${name}.sol`, 'g');
    return item.layout.storage.find((x) => regex.test(x.src)) !== undefined;
};

const findHash = (name, impls) => {
    return Object.keys(impls).find((hash) => isFileInHere(impls[hash], name));
};

function typeSize(typeLabel, storageTypes) {
    //console.log(typeLabel)
    if (typeLabel.includes('t_array')) {
        if (typeLabel.includes('dyn_storage')) {
            return 1;
        } else if (typeLabel.includes('_storage')) {
            return Number(typeLabel.replace(/.*\)/, '').replace(/_storage/, ''));
        }
    } else if (typeLabel.startsWith('t_struct')) {
        // TODO: support nested structs and static arrays?
        if (storageTypes[typeLabel].members) {
            if (typeof storageTypes[typeLabel].members === 'object') {
                // This should be an array but this happened?
                return Object.keys(storageTypes[typeLabel].members).length;
            } else {
                return storageTypes[typeLabel].members.length;
            }
        } else {
            return 1;
        }
    } else {
        return 1;
    }
    throw new Error(`unsupported label ${typeLabel}`);
}

function storageMemberToRow(member, storageTypes) {
    return {
        row: `| ${member.contract} | ${member.label} | ${typeSize(member.type, storageTypes)} |`,
        size: typeSize(member.type, storageTypes),
    };
}

function printStorageMember(x, storageTypes) {
    //console.log(x.contract);
    //console.log(x.label);
    //console.log(typeSize(x.type, storageTypes))
    console.log(storageMemberToRow(x, storageTypes));
}

// eslint-disable-next-line no-unused-vars
function printStorageLayout(layout) {
    for (const item of layout.storage) {
        printStorageMember(item, layout.types);
    }
}

function storageLayoutToRows(layout) {
    const rows = layout.storage.map((x) => storageMemberToRow(x, layout.types));
    const total = rows.reduce((prev, next) => {
        return (prev.size ?? prev) + (next.size ?? 0);
    });
    rows.push({
        row: `|  | total | ${total} |`,
        size: total,
    });
    return rows;
}

const emptyRowIfUndefined = (row) => row ?? '|  |  |  |';

// eslint-disable-next-line no-irregular-whitespace
const header = `| BEFORE |   |   |   | AFTER |   |  |
| -- | -- | -- | -- | -- | -- | -- |`;

const OLD_LAYOUT_CONTRACT = '';
const NEW_LAYOUT_CONTRACT = '';

async function main(config = {}) {
    const oldContractName = config.old ?? OLD_LAYOUT_CONTRACT;
    DEBUG(oldContractName);
    const oldLayout = impls[findHash(oldContractName, impls)]?.layout;
    const originalRows = storageLayoutToRows(oldLayout).map((x) => x.row);
    DEBUG(oldLayout);
    DEBUG('--------------------------');
    DEBUG(originalRows);
    DEBUG('--------------------------');

    const newContractName = config.new ?? NEW_LAYOUT_CONTRACT;
    const newLayout = impls[findHash(newContractName, impls)]?.layout;
    const laterRows = storageLayoutToRows(newLayout).map((x) => x.row);
    DEBUG(newContractName);
    DEBUG(newLayout);
    DEBUG('--------------------------');
    DEBUG(laterRows);
    const size = Math.max(originalRows.length, laterRows.length);

    console.log(header);
    let data = header;
    for (let i = 0; i < size; i++) {
        data += '\n';
        data += `${emptyRowIfUndefined(originalRows[i])} ${emptyRowIfUndefined(laterRows[i])}`;
        console.log(`${emptyRowIfUndefined(originalRows[i])} ${emptyRowIfUndefined(laterRows[i])}`);
    }
    fs.writeFileSync(`./layout-compare/${oldContractName}-${newContractName}.md`, data);
}

module.exports = main;

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}
