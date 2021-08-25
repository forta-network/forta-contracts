const { ethers, upgrades } = require('hardhat');
const { NonceManager } = require('@ethersproject/experimental');

const { expect, assert } = require('chai');

/*********************************************************************************************************************
 *                                                  Array utilities                                                  *
 *********************************************************************************************************************/
Array.range = function(n) {
  return Array(n).fill().map((_, i) => i);
}

Array.prototype.unique = function(op = x => x) {
  return this.filter((obj, i) => this.findIndex(entry => op(obj) === op(entry)) === i);
}

Array.prototype.chunk = function(size) {
  return Array.range(Math.ceil(this.length / size)).map(i => this.slice(i * size, i * size + size))
}

/*********************************************************************************************************************
 *                                                  Async safe Conf                                                  *
 *********************************************************************************************************************/
const Conf = require('conf');
const pLimit = require('p-limit');

class AsyncConf extends Conf {
  constructor(conf) {
    super(conf);
    this.limit = pLimit(1);
  }

  get(key) {
    return this.limit(() => super.get(key));
  }

  set(key, value) {
    return this.limit(() => super.set(key, value));
  }

  async getFallback(key, fallback) {
    const value = await this.get(key) || await fallback();
    await this.set(key, value);
    return value;
  }

  async expect(key, value) {
    const fromCache = await this.get(key);
    if (fromCache) {
      assert.deepEqual(value, fromCache);
      return false;
    } else {
      await this.set(key, value);
      return true;
    }
  }
}

/*********************************************************************************************************************
 *                                                    Convertion                                                     *
 *********************************************************************************************************************/
function dateToTimestamp(...params) {
  return (new Date(...params)).getTime() / 1000 | 0
}

function durationToSeconds(duration) {
  const durationPattern = /^(\d+) +(second|minute|hour|day|week|month|year)s?$/;
  const match = duration.match(durationPattern);

  if (!match) {
    throw new Error(`Bad duration format (${durationPattern.source})`);
  }

  const second = 1;
  const minute = 60 * second;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;
  const seconds = { second, minute, hour, day, week, month, year };

  const value = parseFloat(match[1]);
  return value * seconds[match[2]];
}

/*********************************************************************************************************************
 *                                                Blockchain helpers                                                 *
 *********************************************************************************************************************/
async function tryFetchContract(cache, key, contract, args = []) {
  return cache.getFallback(
    key,
    () => contract.deploy(...args).then(instance => instance.deployed()).then(({ address }) => address)
  ).then(address => contract.attach(address));
}

async function tryFetchProxy(cache, key, contract, args = [], kind = 'uups') {
  return cache.getFallback(
    key,
    () => upgrades.deployProxy(contract, args, { kind }).then(instance => instance.deployed()).then(({ address }) => address)
  ).then(address => contract.attach(address));
}









const CONFIG = {
  admins: [ '0x9c566D5005E7e96ED964dec9cB7477F246A37A09' ],
  minters: [ '0x84b181aE72FDF63Ed5c77B9058D990761Bb3dc44' ],
  whitelisters: [ '0xE6241CfD983cA709b34DCEb3428360C982B0e02B' ],
  allocations: [
    { beneficiary: '0xEA0C7eE97F3cF1Bb1404488f67adaB1c3C9F15dC', amount: '100', type: 'direct' },
    { beneficiary: '0x60bd5176809828Bd93411BdE9854eEA2d2CEDccf', amount: '100', type: 'direct' },
    { beneficiary: '0x60bd5176809828Bd93411BdE9854eEA2d2CEDccf', amount: '100', type: 'vesting', start: '2021-09-01T00:00:00Z', cliff: '1 year', end: '2025-09-01T00:00:00Z', upgrader: '0x9c566D5005E7e96ED964dec9cB7477F246A37A09' },
    { beneficiary: '0x603851E164947391aBD62EF98bDA93e206bfBe16', amount: '100', type: 'vesting', start: '2021-09-01T00:00:00Z', cliff: '1 year', end: '2025-09-01T00:00:00Z', upgrader: '0x9c566D5005E7e96ED964dec9cB7477F246A37A09' },
    { beneficiary: '0x70ad015c653e9D455Edf43128aCcDa10a094b605', amount: '100', type: 'vesting', start: '2021-09-01T00:00:00Z', cliff: '1 year', end: '2025-09-01T00:00:00Z', upgrader: '0x9c566D5005E7e96ED964dec9cB7477F246A37A09' },
    { beneficiary: '0xFd5771b6adbBAEED5bc5858dE3ed38A274d8c109', amount: '100', type: 'vesting', start: '2021-09-01T00:00:00Z', cliff: '1 year', end: '2025-09-01T00:00:00Z', upgrader: '0x9c566D5005E7e96ED964dec9cB7477F246A37A09' },
  ],
}














const TXLimiter = pLimit(4); // maximum 4 simulatenous transactions

function executeInBatchAndWait({ target, relayer, batchsize = 16 }, calldatas) {
  return Promise.all(calldatas)
    .then(calldatas => Promise.all(calldatas.filter(Boolean).chunk(batchsize).map(batch => // split calldatas in chunks of length 'batchsize'
      TXLimiter(() => relayer.relay(target, batch)) // send batch through the relayer using TXLimiter
    )))
    .then(txs => Promise.all(txs.map(tx => tx.wait()))); // wait for all tx to be mined
}

function grantRole(contract, role, account) {
  return contract.hasRole(role, account).then(hasRole => hasRole ? null : contract.interface.encodeFunctionData('grantRole', [ role, account ]));
}

function renounceRole(contract, role, account) {
  return contract.hasRole(role, account).then(hasRole => hasRole ? contract.interface.encodeFunctionData('renounceRole', [ role, account ]): null);
}

function mint(contract, account, amount) {
  return contract.balanceOf(account).then(balance => balance.isZero() ? contract.interface.encodeFunctionData('mint', [ account, amount ]): null);
}








async function main() {

  // wrap signers in NonceManager to avoid nonce issues during concurent tx construction
  const [ deployer ] = await ethers.getSigners().then(signers => signers.map(signer => new NonceManager(signer)));
  deployer.address = await deployer.getAddress();
  const { name, chainId } = await deployer.provider.getNetwork();

  console.log(`Network:  ${name} (${chainId})`);
  console.log(`Deployer: ${deployer.address}`);

  // Loading contract artefacts
  const Forta         = await ethers.getContractFactory('Forta').then(contract => contract.connect(deployer));
  const VestingWallet = await ethers.getContractFactory('VestingWallet').then(contract => contract.connect(deployer));
  const BatchRelayer  = await ethers.getContractFactory('BatchRelayer').then(contract => contract.connect(deployer));

  // Preparing cache and transaction limiter
  const CACHE = new AsyncConf({ cwd: __dirname, configName: `.cache-${chainId}` });

  await CACHE.expect('deployer', deployer.address);
  await CACHE.expect('CONFIG', JSON.stringify(CONFIG));

  /*******************************************************************************************************************
   *                                                  Sanity check                                                   *
   *******************************************************************************************************************/
  try {
    assert(CONFIG.admins.length);
    assert(CONFIG.admins.every(ethers.utils.getAddress));
    assert(CONFIG.minters.every(ethers.utils.getAddress));
    assert(CONFIG.whitelisters.every(ethers.utils.getAddress));
    assert(CONFIG.allocations.every(({ beneficiary    }) => ethers.utils.getAddress(beneficiary)));
    assert(CONFIG.allocations.every(({ amount         }) => ethers.BigNumber.from(amount)));
    assert(CONFIG.allocations.every(({ type           }) => [ 'direct', 'vesting' ].includes(type)));
    assert(CONFIG.allocations.every(({ type, upgrader }) => type !== 'vesting' || type !== 'vesting' || upgrader == undefined || ethers.utils.getAddress(upgrader)));
    assert(CONFIG.allocations.every(({ type, start    }) => type !== 'vesting' || dateToTimestamp(start)));
    assert(CONFIG.allocations.every(({ type, cliff    }) => type !== 'vesting' || durationToSeconds(cliff)));
    assert(CONFIG.allocations.every(({ type, end      }) => type !== 'vesting' || dateToTimestamp(end)));
    assert(CONFIG.allocations.map(({ type, beneficiary }) => [ type, beneficiary.toLocaleLowerCase() ].join()).every((key, i, array) => array.indexOf(key) === i));
  } catch (e) {
    console.error('ERROR: sanity check failled');
    process.exit(1);
  }

  /*******************************************************************************************************************
   *                                                  Deploy token                                                   *
   *******************************************************************************************************************/
  console.log('[0/7] Deploy relayer...');
  const relayer = await tryFetchContract(
    CACHE,
    'relayer',
    BatchRelayer,
  );
  console.log(`Relayer address: ${relayer.address}`);
  console.log('[0/7] done.');

  /*******************************************************************************************************************
   *                                                  Deploy token                                                   *
   *******************************************************************************************************************/
  console.log('[1/7] Deploy token...');
  const forta = await tryFetchProxy(
    CACHE,
    'forta',
    Forta,
    [ relayer.address ],
    'uups',
  );
  console.log(`Forta address: ${forta.address}`);
  console.log('[1/7] done.');

  const ADMIN_ROLE       = await forta.ADMIN_ROLE();
  const MINTER_ROLE      = await forta.MINTER_ROLE();
  const WHITELISTER_ROLE = await forta.WHITELISTER_ROLE();
  const WHITELIST_ROLE   = await forta.WHITELIST_ROLE();

  /*******************************************************************************************************************
   *                                             Deploy vesting wallets                                              *
   *******************************************************************************************************************/
  console.log('[2/7] Deploy vesting wallets...');
  const vesting = await Promise.all(
    CONFIG.allocations
    .filter(({ type }) => type == 'vesting')
    .map(async allocation => TXLimiter(() => {
      const beneficiary = allocation.beneficiary;
      const admin       = allocation.upgrader || ethers.constants.AddressZero;
      const start       = dateToTimestamp(allocation.start);
      const cliff       = durationToSeconds(allocation.cliff);
      const end         = dateToTimestamp(allocation.end);
      const duration    = end - start;

      return tryFetchProxy(
        CACHE,
        `vesting-${allocation.beneficiary}`,
        VestingWallet,
        [ beneficiary, admin, start, cliff, duration ],
        'uups',
      ).then(result => {
        console.log(`VestingWallet for ${allocation.beneficiary} deployed to ${result.address}`);
        return [ allocation.beneficiary, result ];
      });
    }))
  ).then(Object.fromEntries);
  console.log('[2/7] done.');


  /*****************************************************************************************************************
   *                                 Everything is deployed, lets rock and roll !                                  *
   *****************************************************************************************************************/
  switch(await CACHE.get('step') || 3) {
    // Setup relayer permissions
    case 3:
      assert(await forta.hasRole(ADMIN_ROLE, relayer.address));

      console.log('[3/7] Setup relayer permissions...');
      await executeInBatchAndWait({ target: forta.address, relayer }, [].concat(
        grantRole(forta, MINTER_ROLE, relayer.address),
        grantRole(forta, WHITELISTER_ROLE, relayer.address),
        ));
        console.log('[3/7] done.');
        await CACHE.set('step', 4);

    // Grant role
    case 4:
      assert(await forta.hasRole(MINTER_ROLE,      relayer.address));

      console.log('[4/7] Setup roles...');
      await executeInBatchAndWait({ target: forta.address, relayer }, [].concat(
        // set admins
        CONFIG.admins.map(address => grantRole(forta, ADMIN_ROLE, address)),
        // set minters
        CONFIG.minters.map(address => grantRole(forta, MINTER_ROLE, address)),
        // set whitelisters
        CONFIG.whitelisters.map(address => grantRole(forta, WHITELISTER_ROLE, address)),
        // whitelist all beneficiary
        CONFIG.allocations.map(({ beneficiary }) => beneficiary).unique().map(address => grantRole(forta, WHITELIST_ROLE, address)),
        // whitelist all vesting wallets
        Object.values(vesting).map(({ address }) => grantRole(forta, WHITELIST_ROLE, address)),
      ));
      console.log('[4/7] done.');
      await CACHE.set('step', 5);

    // Mint vested tokens
    case 5:
      assert(await forta.hasRole(WHITELISTER_ROLE, relayer.address));

      console.log('[5/7] Mint vested allocations...');
      await executeInBatchAndWait({ target: forta.address, relayer }, [].concat(
        CONFIG.allocations.filter(({ type }) => type == 'direct' ).map(allocation => mint(forta,         allocation.beneficiary,          allocation.amount)),
        CONFIG.allocations.filter(({ type }) => type == 'vesting').map(allocation => mint(forta, vesting[allocation.beneficiary].address, allocation.amount)),
      ));
      console.log('[5/7] done.');
      await CACHE.set('step', 6);

    // Cleanup relayer permissions
    case 6:
      console.log('[6/7] Cleanup relayer permissions...');
      await executeInBatchAndWait({ target: forta.address, relayer }, [].concat(
        renounceRole(forta, ADMIN_ROLE, relayer.address),
        renounceRole(forta, MINTER_ROLE, relayer.address),
        renounceRole(forta, WHITELISTER_ROLE, relayer.address),
      ));
      console.log('[6/7] done.');
      await CACHE.set('step', 7);
  }

  /*******************************************************************************************************************
   *                                             Post deployment checks                                              *
   *******************************************************************************************************************/
  console.log('[7/7] Running post deployment checks...');
  // permissions
  assert(Promise.all([].concat(
                                          ({ role: ADMIN_ROLE,       address: deployer.address,       value: false }),
                                          ({ role: ADMIN_ROLE,       address: relayer.address,        value: false }),
                                          ({ role: MINTER_ROLE,      address: deployer.address,       value: false }),
                                          ({ role: MINTER_ROLE,      address: relayer.address,        value: false }),
                                          ({ role: WHITELISTER_ROLE, address: deployer.address,       value: false }),
                                          ({ role: WHITELISTER_ROLE, address: relayer.address,        value: false }),
    CONFIG.admins.map(address          => ({ role: ADMIN_ROLE,       address,                         value: true  })),
    CONFIG.minters.map(address         => ({ role: MINTER_ROLE,      address,                         value: true  })),
    CONFIG.whitelisters.map(address    => ({ role: WHITELISTER_ROLE, address,                         value: true  })),
    CONFIG.allocations.map(allocation  => ({ role: MINTER_ROLE,      address: allocation.beneficiary, value: true  })),
    Object.values(vesting).map(vesting => ({ role: MINTER_ROLE,      address: vesting.address,        value: true  })),
  ).map(({ role, address, value }) => forta.hasRole(role, address).then(result => result === value))).then(results => results.every(Boolean)));
  // vesting config
  for (const allocation of Object.values(CONFIG.allocations)) {
    switch(allocation.type) {
      case 'direct':
        assert.equal(await forta.balanceOf(allocation.beneficiary), allocation.amount);
        break;
      case 'vesting':
        const beneficiary = allocation.beneficiary;
        const admin       = allocation.upgrader || ethers.constants.AddressZero;
        const start       = dateToTimestamp(allocation.start);
        const cliff       = durationToSeconds(allocation.cliff);
        const end         = dateToTimestamp(allocation.end);
        const duration    = end - start;
        const contract    = vesting[beneficiary];
        assert.equal(await forta.balanceOf(contract.address), allocation.amount);
        assert.equal(await contract.beneficiary(),            beneficiary);
        assert.equal(await contract.owner(),                  admin);
        assert.equal(await contract.start(),                  start);
        assert.equal(await contract.cliff(),                  cliff);
        assert.equal(await contract.duration(),               end - start);
        break;
    }
  }
  console.log('[7/7] done.');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
