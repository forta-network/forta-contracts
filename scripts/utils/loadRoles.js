const fs = require('fs');

const loadRoles = (ethers) => {
    const rolesFileContents = fs.readFileSync('./contracts/components/Roles.sol', { encoding: 'utf8', flag: 'r' });
    const regex = /bytes32 constant [A-Z_0-9]*/g;
    const roleIds = rolesFileContents.match(regex).map((match) => match.replace('bytes32 constant ', ''));
    const roles = {};
    if (roleIds.length === 0) {
        throw new Error('No roles?');
    }
    for (const id of roleIds) {
        if (id === 'DEFAULT_ADMIN_ROLE') {
            roles[id.replace('_ROLE', '')] = ethers.constants.HashZero;
        } else {
            roles[id.replace('_ROLE', '')] = ethers.utils.id(id);
        }
    }
    //token roles
    roles.MINTER = ethers.utils.id('MINTER_ROLE');
    roles.ADMIN = ethers.utils.id('ADMIN_ROLE');
    return roles;
};

module.exports = loadRoles;
