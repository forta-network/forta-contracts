const { ethers } = require('hardhat');
const { BigNumber, utils } = ethers;

function shiftLeft(input, index) {
    var shifted = utils.arrayify(BigNumber.from(input).shl(index));
    // truncate if result of shift left is bigger than uint256
    shifted = shifted.slice(Math.max(shifted.length - 32, 0));
    return BigNumber.from(utils.hexlify(shifted));
}

function hashTypeAndSubject(subjectType, subject) {
    return BigNumber.from(utils.solidityKeccak256(['uint8', 'uint256'], [subjectType, subject]));
}

/**
 * Encode "active" and subjectType in subject by hashing them together, shifting left 9 bits,
 * setting bit 9 (to mark as active) and masking subjectType in
 */
function subjectToActive(subjectType, subject) {
    return shiftLeft(hashTypeAndSubject(subjectType, subject), 9).or(256).or(subjectType);
}

/**
 * Encode "inactive" and subjectType in subject by hashing them together, shifting left 9 bits,
 * letting bit 9 unset (to mark as inactive) and masking subjectType in
 */
function subjectToInactive(subjectType, subject) {
    return shiftLeft(hashTypeAndSubject(subjectType, subject), 9).or(subjectType);
}

/**
 * Is FortaStaking ERC1155 id representing active or inactive shareId (by checking if byte 9 is set)
 * @param {BigNumberish} sharesId
 * @returns true if active shareId, false if inactive
 */
function isActive(sharesId) {
    return BigNumber.from(sharesId).and(ethers.constants.One.shl(8)).eq(BigNumber.from(256));
}

/**
 * Extracts the subject type of the subject represented by this sharesId (masked as last 8 bits)
 * @param {BigNumberish} sharesId
 * @returns Uint8 subject
 */
function subjectTypeOfShares(sharesId) {
    const sharesIdBytes = utils.arrayify(BigNumber.from(sharesId));
    return BigNumber.from(sharesIdBytes[sharesIdBytes.length() - 1]);
}

module.exports = {
    subjectToActive,
    subjectToInactive,
    isActive,
    subjectTypeOfShares,
};
