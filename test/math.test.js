const { ethers } = require('hardhat');
const { expect } = require('chai');

describe('Math', function () {
    it('fullmath', async function () {
        const FullMath = await ethers.getContractFactory('MathMock');
        const fullMath = await FullMath.deploy();
        await fullMath.deployed();
        console.log(fullMath)
        expect(await fullMath.mulDiv('243884504142359919500000000000000000', '1000000000000000000', '1000000000000000000000000000000000000000000000000000000')).to.equal(
            '243884504142359919500000000000000000000000000000000000000000000000000000'
        );
    });
});
