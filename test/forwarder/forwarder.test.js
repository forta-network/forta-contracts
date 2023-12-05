const { ethers } = require('hardhat');
const { expect } = require('chai');
const { prepare } = require('../fixture');

// Skipped since removing forwarder/metatx functionality
describe.skip('Forwarder', function () {
    prepare();

    describe('forward transactions', async function () {
        let domain, types, defaultRequest, grantee;
        before(async function () {
            const { chainId } = await ethers.provider.getNetwork();

            domain = {
                name: 'Forwarder',
                version: '1',
                chainId: chainId,
                verifyingContract: this.contracts.forwarder.address,
            };
            types = {
                ForwardRequest: [
                    { name: 'from', type: 'address' },
                    { name: 'to', type: 'address' },
                    { name: 'value', type: 'uint256' },
                    { name: 'gas', type: 'uint256' },
                    { name: 'nonce', type: 'uint256' },
                    { name: 'deadline', type: 'uint256' },
                    { name: 'data', type: 'bytes' },
                ],
            };
            defaultRequest = {
                from: this.accounts.admin.address,
                to: ethers.constants.AddressZero,
                value: 0,
                gas: 0,
                nonce: 0,
                deadline: ethers.constants.MaxUint256,
                data: '0x',
            };
            grantee = ethers.Wallet.createRandom();
        });
        it('forwards correctly', async function () {
            // Gas the relayer will forward to the external contract to execute grantRole. Tx gasLimit is estimated by ethers.js
            const gas = await this.contracts.access.estimateGas.grantRole(this.roles.STAKING_ADMIN, grantee.address);
            const { data } = await this.contracts.access.populateTransaction.grantRole(this.roles.STAKING_ADMIN, grantee.address);

            const forwardRequest = {
                ...defaultRequest,
                to: this.contracts.access.address,
                gas: gas,
                data: data,
            };
            const signature = await this.accounts.admin._signTypedData(domain, types, forwardRequest);

            await expect(this.contracts.forwarder.connect(this.accounts.other).execute(forwardRequest, signature)).to.emit(this.contracts.access, 'RoleGranted');
        });

        it('fails if deadline is already passed', async function () {
            // Gas the relayer will forward to the external contract to execute grantRole. Tx gasLimit is estimated by ethers.js
            const gas = await this.contracts.access.estimateGas.grantRole(this.roles.STAKING_ADMIN, grantee.address);
            const { data } = await this.contracts.access.populateTransaction.grantRole(this.roles.STAKING_ADMIN, grantee.address);
            const { timestamp } = await ethers.provider.getBlock('latest');

            const forwardRequest = {
                ...defaultRequest,
                to: this.contracts.access.address,
                gas: gas,
                deadline: timestamp - 10000,
                data: data,
            };
            const signature = await this.accounts.admin._signTypedData(domain, types, forwardRequest);
            await expect(this.contracts.forwarder.connect(this.accounts.other).execute(forwardRequest, signature)).to.be.revertedWith('DeadlineExpired()');
        });

        it('fails if there is signature mismatch', async function () {
            // Gas the relayer will forward to the external contract to execute grantRole. Tx gasLimit is estimated by ethers.js
            const gas = await this.contracts.access.estimateGas.grantRole(this.roles.STAKING_ADMIN, grantee.address);
            const { data } = await this.contracts.access.populateTransaction.grantRole(this.roles.STAKING_ADMIN, grantee.address);

            const forwardRequest = {
                ...defaultRequest,
                to: this.contracts.access.address,
                gas: gas,
                data: data,
            };
            const differentForwardRequest = {
                ...forwardRequest,
                value: 1,
            };
            const diffSignature = await this.accounts.admin._signTypedData(domain, types, differentForwardRequest);

            await expect(this.contracts.forwarder.connect(this.accounts.other).execute(forwardRequest, diffSignature)).to.be.revertedWith('SignatureDoesNotMatch()');
        });

        it('consumes all gas on failure', async function () {
            const gasCallee = await this.contracts.access.estimateGas.grantRole(this.roles.STAKING_ADMIN, grantee.address);
            const { data } = await this.contracts.access.populateTransaction.grantRole(this.roles.STAKING_ADMIN, grantee.address);

            const forwardRequest = {
                ...defaultRequest,
                to: this.contracts.access.address,
                gas: gasCallee,
                data: data,
            };

            const signature = await this.accounts.admin._signTypedData(domain, types, forwardRequest);
            const gasCallerCallee = await this.contracts.forwarder.estimateGas.execute(forwardRequest, signature);
            const notEnoughGasForCallee = gasCallerCallee.sub(gasCallee.div(64));
            // To check for thrown exceptions for invalid opcodes, waffle checks that the error message
            // returned by rpc includes 'error' and revertReason.
            // If not, it considers you check for thrown 'invalid opcode' if you don't pass a revertReason
            // https://github.com/EthWorks/Waffle/blob/3f46a6c8093cb9edb1a68c3ba15c4b4499ad595d/waffle-chai/src/matchers/revertedWith.ts#L32
            await expect(this.contracts.forwarder.connect(this.accounts.other).execute(forwardRequest, signature, { gasLimit: notEnoughGasForCallee })).to.be.reverted;
        });

        it('invalid nonce protection', async function () {
            const forwardRequest = { ...defaultRequest, nonce: 1 };
            const signature = await this.accounts.admin._signTypedData(domain, types, forwardRequest);

            await expect(this.contracts.forwarder.connect(this.accounts.other).execute(forwardRequest, signature)).to.be.revertedWith('InvalidNonce(1)');
        });

        it('replay protection', async function () {
            const forwardRequest = defaultRequest;
            const signature = await this.accounts.admin._signTypedData(domain, types, forwardRequest);

            await expect(this.contracts.forwarder.connect(this.accounts.other).execute(forwardRequest, signature)).to.be.not.reverted;

            await expect(this.contracts.forwarder.connect(this.accounts.other).execute(forwardRequest, signature)).to.be.revertedWith('InvalidNonce(0)');
        });

        it('nonce is updated', async function () {
            {
                const forwardRequest = defaultRequest;
                const signature = await this.accounts.admin._signTypedData(domain, types, forwardRequest);

                await expect(this.contracts.forwarder.connect(this.accounts.other).execute(forwardRequest, signature))
                    .to.emit(this.contracts.forwarder, 'NonceUsed')
                    .withArgs(this.accounts.admin.address, 0, 0);
            }
            {
                const forwardRequest = { ...defaultRequest, nonce: 1 };
                const signature = await this.accounts.admin._signTypedData(domain, types, forwardRequest);

                await expect(this.contracts.forwarder.connect(this.accounts.other).execute(forwardRequest, signature))
                    .to.emit(this.contracts.forwarder, 'NonceUsed')
                    .withArgs(this.accounts.admin.address, 0, 1);
            }
        });

        it('out of order relaying', async function () {
            const forwardRequest1a = { ...defaultRequest, nonce: 0 };
            const forwardRequest1b = { ...defaultRequest, nonce: 1 };
            const forwardRequest2a = { ...defaultRequest, nonce: ethers.BigNumber.from(1).shl(128).add(0) };
            const forwardRequest2b = { ...defaultRequest, nonce: ethers.BigNumber.from(1).shl(128).add(1) };
            const signature1a = await this.accounts.admin._signTypedData(domain, types, forwardRequest1a);
            const signature1b = await this.accounts.admin._signTypedData(domain, types, forwardRequest1b);
            const signature2a = await this.accounts.admin._signTypedData(domain, types, forwardRequest2a);
            const signature2b = await this.accounts.admin._signTypedData(domain, types, forwardRequest2b);

            await expect(this.contracts.forwarder.connect(this.accounts.other).execute(forwardRequest1a, signature1a))
                .to.emit(this.contracts.forwarder, 'NonceUsed')
                .withArgs(this.accounts.admin.address, 0, 0);

            await expect(this.contracts.forwarder.connect(this.accounts.other).execute(forwardRequest2a, signature2a))
                .to.emit(this.contracts.forwarder, 'NonceUsed')
                .withArgs(this.accounts.admin.address, 1, 0);

            await expect(this.contracts.forwarder.connect(this.accounts.other).execute(forwardRequest2b, signature2b))
                .to.emit(this.contracts.forwarder, 'NonceUsed')
                .withArgs(this.accounts.admin.address, 1, 1);

            await expect(this.contracts.forwarder.connect(this.accounts.other).execute(forwardRequest1b, signature1b))
                .to.emit(this.contracts.forwarder, 'NonceUsed')
                .withArgs(this.accounts.admin.address, 0, 1);
        });
    });
});
