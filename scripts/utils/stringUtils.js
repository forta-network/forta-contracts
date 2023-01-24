/*********************************************************************************************************************
 *                                                        Strings                                                       *
 *********************************************************************************************************************/

const kebabize = (str) => {
    return str
        .split('')
        .map((letter, idx) => {
            return letter.toUpperCase() === letter ? `${idx !== 0 ? '-' : ''}${letter.toLowerCase()}` : letter;
        })
        .join('');
};

const camelize = (s) => s.replace(/-./g, (x) => x[1].toUpperCase());
const upperCaseFirst = (s) => s.replace(/^[a-z,A-Z]/, (x) => x[0].toUpperCase());

function removeVersionFromContractName(contractName) {
    return contractName.replace(/([_0-9]*)/g, '');
}
/**
 * Kebabizes contract name to use as key, leaving out the version part at the end if it exists.
 */
function kebabizeContractName(contractName) {
    const nameVersion = contractName.replace(/([^_0-9]*)/g, '');
    if (nameVersion) {
        return `${kebabize(removeVersionFromContractName(contractName))}`;
    } else {
        return kebabize(contractName);
    }
}

module.exports = {
    kebabize,
    camelize,
    upperCaseFirst,
    kebabizeContractName,
    removeVersionFromContractName,
};
