const fs = require('fs');
const path = require('path');

function* walkSync(dir) {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
        if (file.isDirectory()) {
            yield* walkSync(path.join(dir, file.name));
        } else {
            yield path.join(dir, file.name);
        }
    }
}

function createNonExistantDir(outputDir) {
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir);
    }
}

function createNonExistantDirForFile(file) {
    const path = file.split('/');
    path.pop();
    path[0] = '/';
    const incrementalPath = [];
    for (const pathComponent of path) {
        incrementalPath.push(pathComponent);
        createNonExistantDir(incrementalPath.reduce((prev, curr) => `${prev}/${curr}`));
    }
}

async function main() {
    const artifactsDir = path.join(__dirname, '../', 'artifacts', 'contracts');

    for (const filePath of walkSync(artifactsDir)) {
        if (filePath.includes('.dbg.') || !filePath.includes('.json')) {
            continue;
        }
        const abi = require(filePath).abi;
        const abiWithoutErrors = abi.filter((item) => item.type !== 'error');
        const outputFile = filePath.replace('artifacts', '.abis-no-errors');
        createNonExistantDirForFile(outputFile);
        fs.writeFileSync(outputFile, JSON.stringify(abiWithoutErrors));
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
