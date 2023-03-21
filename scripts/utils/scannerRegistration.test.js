const { expect } = require('chai');
const { ethers } = require('ethers');
const { createERC712ScannerRegistrationToken } = require('./scannerRegistration');

describe('scanner registration utils', function () {
    it('should generate a registration token that is compatible with Forta node', async function () {
        const tokenFromNodeCli =
            'eyJyZWdpc3RyYXRpb25JbnB1dCI6eyJzY2FubmVyIjoiMHg1YmQxOWYwZTE2ODNmN2NiNWY0YjEzOGZlNmE0ZGM4Mzc5Mjc5NmU1Iiwic2Nhbm5lclBvb2xJZCI6MSwiY2hhaW5JZCI6MTM3LCJtZXRhZGF0YSI6IiIsInRpbWVzdGFtcCI6MTY3OTQxNzY3Nn0sInNpZ25hdHVyZSI6IjB4N2Y1ZTFiZTU0MzAyOGEzMTI3MGM5MzU2NTViNTAzYTIxOGZhMjIzYjYwZTlhMjVkY2NlMWYwOGYzYWIyMTYwODY3NzZhYzM5ZWVmYWM2OTRlYWVlMDdhOTcxMjIxMjgzMzA3NmQ4MDY1YjkxMDY1YzA0ZWZiMDk3NTQ1ZDMzZTMxYiJ9';
        const nodeAddress = '0x5bd19f0e1683f7cB5F4B138fE6a4DC83792796E5'.toLowerCase();
        const nodePrivateKey = '03e4e6c560cae3fc76f4344f31348b3f141ff18c5026393e846682b3f7b13039';

        const scannerRegistration = {
            scanner: nodeAddress,
            scannerPoolId: 1,
            chainId: 137,
            metadata: '',
            timestamp: 1679417676,
        };

        const token = await createERC712ScannerRegistrationToken(
            {
                chainId: 80001, // mumbai
                address: '0x9BBEBf9CB94666464D8a5978363B4943D36A05E4', // verifying contract (scanner pool reg)
            },
            scannerRegistration,
            new ethers.Wallet(nodePrivateKey)
        );
        expect(token).to.be.equal(tokenFromNodeCli);
    });
});
