const { ethers, upgrades } = require('hardhat');
const { NonceManager } = require('@ethersproject/experimental');
const { expect } = require('chai');
const Conf = require('conf');


// interface Array<T> {
//   unique<X>(array: T, op: (_: T) => X): Array<T>;
// }
Array.prototype.unique = function(op = x => x) {
  return this.filter((obj, i) => this.findIndex(entry => op(obj) === op(entry)) === i);
}

function dateToTimestamp(...params) {
  return (new Date(...params)).getTime() / 1000 | 0
}

function expectCache(cache, key, value) {
  const fromCache = cache.get(key);
  if (fromCache) {
    expect(fromCache).to.be.equal(value);
    return false;
  } else {
    cache.set(key, value);
    return true;
  }
}

async function tryFetchAddress(cache, key, gen) {
  const address = cache.get(key) || await gen();
  cache.set(key, address);
  return address;
}

async function tryFetchProxy(cache, key, contract, args = [], kind = 'uups') {
  return tryFetchAddress(
    cache,
    key,
    () => upgrades.deployProxy(contract, args, { kind }).then(instance => instance.deployed()).then(({ address }) => address)
  ).then(address => contract.attach(address));
}

function grantRole(accesscontrol, role, account) {
  return accesscontrol.hasRole(role, account).then(hasRole => hasRole ? null : accesscontrol.grantRole(role, account, { gasLimit: 60000 }));
}

function renounceRole(accesscontrol, role, account) {
  return accesscontrol.hasRole(role, account).then(hasRole => hasRole ? accesscontrol.renounceRole(role, account): null);
}





const CONFIG = {
  admins: [ '0x9c566D5005E7e96ED964dec9cB7477F246A37A09' ],
  minters: [ '0x84b181aE72FDF63Ed5c77B9058D990761Bb3dc44' ],
  whitelisters: [ '0xE6241CfD983cA709b34DCEb3428360C982B0e02B' ],
  allocations: [
    { beneficiary: '0x60bd5176809828Bd93411BdE9854eEA2d2CEDccf', amount: '100', start: '2021-09-01T00:00:00Z', end: '2025-09-01T00:00:00Z', upgrader: '0x9c566D5005E7e96ED964dec9cB7477F246A37A09' },
    { beneficiary: '0x603851E164947391aBD62EF98bDA93e206bfBe16', amount: '100', start: '2021-09-01T00:00:00Z', end: '2025-09-01T00:00:00Z', upgrader: '0x9c566D5005E7e96ED964dec9cB7477F246A37A09' },
    { beneficiary: '0x70ad015c653e9D455Edf43128aCcDa10a094b605', amount: '100', start: '2021-09-01T00:00:00Z', end: '2025-09-01T00:00:00Z', upgrader: '0x9c566D5005E7e96ED964dec9cB7477F246A37A09' },
    { beneficiary: '0xFd5771b6adbBAEED5bc5858dE3ed38A274d8c109', amount: '100', start: '2021-09-01T00:00:00Z', end: '2025-09-01T00:00:00Z', upgrader: '0x9c566D5005E7e96ED964dec9cB7477F246A37A09' },
  ],
}





async function main() {
  // wrap signers in NonceManager to avoid nonce issues during concurent tx construction
  const [ deployer ] = await ethers.getSigners().then(signers => signers.map(signer => new NonceManager(signer)));
  deployer.address = await deployer.getAddress();
  console.log(`Deployer address: ${deployer.address}`);

  const Fortify = await ethers.getContractFactory('Fortify').then(contract => contract.connect(deployer));
  const VestingWallet = await ethers.getContractFactory('VestingWallet').then(contract => contract.connect(deployer));

  const { chainId } = await deployer.provider.getNetwork();
  const cache = new Conf({ cwd: __dirname, configName: `.cache-${chainId}` });

  expectCache(cache, 'deployer', deployer.address);

  /*******************************************************************************************************************
   *                                                  Sanity check                                                   *
   *******************************************************************************************************************/
  try {
    CONFIG.admins.every(ethers.utils.getAddress);
    CONFIG.minters.every(ethers.utils.getAddress);
    CONFIG.whitelisters.every(ethers.utils.getAddress);
    CONFIG.allocations.map(({ beneficiary }) => beneficiary).every(ethers.utils.getAddress);
    CONFIG.allocations.map(({ upgrader    }) => upgrader   ).filter(Boolean).every(ethers.utils.getAddress);
    CONFIG.allocations.map(({ start       }) => start      ).every(dateToTimestamp);
    CONFIG.allocations.map(({ end         }) => end        ).every(dateToTimestamp);
    CONFIG.allocations.map(({ amount      }) => amount     ).every(ethers.BigNumber.from);
  } catch (e) {
    console.error('SANITY CHECK FAILLED');
    console.error(e);
  }

  expectCache(cache, 'CONFIG', JSON.stringify(CONFIG));

  /*******************************************************************************************************************
   *                                                  Deploy token                                                   *
   *******************************************************************************************************************/
  console.log('[1/5] Deploy token...');
  const fortify = await tryFetchProxy(
    cache,
    'fortify',
    Fortify,
    [ deployer.address ],
  );
  console.log(`Fortify address: ${fortify.address}`);
  console.log('[1/5] done.');

  /*******************************************************************************************************************
   *                                             Deploy vesting wallets                                              *
   *******************************************************************************************************************/
  console.log('[2/5] Deploy vesting wallets...');
  const vesting = await Promise.all(CONFIG.allocations.map(async (allocation, i) => {
    const beneficiary = allocation.beneficiary;
    const admin       = allocation.upgrader || ethers.constants.AddressZero;
    const start       = dateToTimestamp(allocation.start);
    const duration    = dateToTimestamp(allocation.end) - start;
    return await tryFetchProxy(
      cache,
      `vesting-${i}`,
      VestingWallet,
      [ beneficiary, admin, start, duration ],
    );
  }));
  console.log('[2/5] done.');

  const ADMIN_ROLE = await fortify.ADMIN_ROLE()
  const MINTER_ROLE = await fortify.MINTER_ROLE()
  const WHITELISTER_ROLE = await fortify.WHITELISTER_ROLE()
  const WHITELIST_ROLE = await fortify.WHITELIST_ROLE()

  if (await fortify.hasRole(ADMIN_ROLE, deployer.address)) {
    /*****************************************************************************************************************
     *                                                  Grant role                                                   *
     *****************************************************************************************************************/
    console.log('[3/5] Setup roles...');
    await Promise.all([].concat(
      grantRole(fortify, MINTER_ROLE, deployer.address),
      grantRole(fortify, WHITELISTER_ROLE, deployer.address),
      // set admins
      CONFIG.admins.map(address => grantRole(fortify, ADMIN_ROLE, address)),
      // set minters
      CONFIG.minters.map(address => grantRole(fortify, MINTER_ROLE, address)),
      // set whitelisters
      CONFIG.whitelisters.map(address => grantRole(fortify, WHITELISTER_ROLE, address)),
      // whitelist all beneficiary
      CONFIG.allocations.map(({ beneficiary }) => beneficiary).unique().map(address => grantRole(fortify, WHITELIST_ROLE, address)),
      // whitelist all vesting wallets
      vesting.map(({ address }) => grantRole(fortify, WHITELIST_ROLE, address)),
    )).then(txs => Promise.all(txs.filter(Boolean).map(tx => tx.wait())));
    console.log('[3/5] done.');

    /*****************************************************************************************************************
     *                                              Mint vested tokens                                               *
     *****************************************************************************************************************/
    console.log('[4/5] Mint vested allocations...');
    await Promise.all(CONFIG.allocations.map(async (allocation, i) => {
      // mint allocation
      const hash = cache.get(`vesting-${i}-mint`)
      if (hash) {
        // TODO: check if tx failled
      } else {
        const tx = await fortify.mint(vesting[i].address, allocation.amount);
        cache.set(`vesting-${i}-mint`, tx.hash);
        console.log(`New vesting wallet ${vesting[i].address} (${ethers.utils.formatEther(allocation.amount)} to ${allocation.beneficiary})`);
      }
    }));
    console.log('[4/5] done.');
  }

  /*******************************************************************************************************************
   *                                                     Cleanup                                                     *
   *******************************************************************************************************************/
  console.log('[5/5] Cleanup...');
  await Promise.all([
    renounceRole(fortify, ADMIN_ROLE,       deployer.address),
    renounceRole(fortify, MINTER_ROLE,      deployer.address),
    renounceRole(fortify, WHITELISTER_ROLE, deployer.address),
  ]).then(txs => Promise.all(txs.filter(Boolean).map(tx => tx.wait())));
  console.log('[5/5] done.');

  /*******************************************************************************************************************
   *                                             Post deployment checks                                              *
   *******************************************************************************************************************/
  expect(await fortify.hasRole(ADMIN_ROLE, deployer.address)).to.be.equal(false);
  expect(await fortify.hasRole(MINTER_ROLE, deployer.address)).to.be.equal(false);
  expect(await fortify.hasRole(WHITELISTER_ROLE, deployer.address)).to.be.equal(false);
  for (const address of CONFIG.admins) {
    expect(await fortify.hasRole(ADMIN_ROLE, address)).to.be.equal(true);
  }
  for (const address of CONFIG.minters) {
    expect(await fortify.hasRole(MINTER_ROLE, address)).to.be.equal(true);
  }
  for (const address of CONFIG.whitelisters) {
    expect(await fortify.hasRole(WHITELISTER_ROLE, address)).to.be.equal(true);
  }
  for (const address of CONFIG.allocations.map(({ beneficiary }) => beneficiary)) {
    expect(await fortify.hasRole(WHITELIST_ROLE, address)).to.be.equal(true);
  }
  for (const [i, allocation] of Object.entries(CONFIG.allocations)) {
    const beneficiary = allocation.beneficiary;
    const admin       = allocation.upgrader || ethers.constants.AddressZero;
    const start       = dateToTimestamp(allocation.start);
    const duration    = dateToTimestamp(allocation.end) - start;
    expect(await fortify.balanceOf(vesting[i].address)).to.be.equal(allocation.amount);
    expect(await vesting[i].beneficiary()).to.be.equal(beneficiary);
    expect(await vesting[i].owner()).to.be.equal(admin);
    expect(await vesting[i].start()).to.be.equal(start);
    expect(await vesting[i].duration()).to.be.equal(duration);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
