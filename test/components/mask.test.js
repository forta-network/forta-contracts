const { ethers } = require('hardhat');
const { expect, assert } = require('chai');
const { prepare } = require('../fixture');

describe('Mask', function () {
  prepare();
  let mask
  beforeEach(async function () {
    const Mask = await ethers.getContractFactory("Mask");
    mask = await Mask.deploy();
    await mask.deployed();
  });

  it('register', async function () {
    await mask.mask(true, 2, "123456789" )
    const masked = await mask.masked()
    console.log(masked.toString())
    console.log(ethers.utils.hexValue(masked.toNumber()))
    //assert(false)
  });
"111010110111100110100010101"
"11101011011110011010001010100"
"1110101101111001101000101"
});
