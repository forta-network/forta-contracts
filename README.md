# Forta Protocol

Contracts of the [Forta Protocol](https://forta.org/)

## Contract Versioning.

- Interface implementations previously deployed are under `_old` folders, for upgrade testing.
- Contracts no longer in use are under `_deprecated` folder.


## Deploy platform
`npx hardhat run --network <network> scripts/deploy-platform.js`

To see debug logs, we are using [debug package](https://www.npmjs.com/package/debug)

`DEBUG=* npx hardhat run --network <network> scripts/deploy-platform.js`

## Development of upgrades.

This protocol is under active development, [so most of the components are `UUPSUpgradeable`](https://forum.openzeppelin.com/t/uups-proxies-tutorial-solidity-javascript/7786) and new implementations are deployed from time to time.

Upgrading a contract is a process with risk, storage layout collision might happen.
We follow good practices for [writing upgradeable contracts](https://docs.openzeppelin.com/upgrades-plugins/1.x/writing-upgradeable), using storage __gaps to "reserve" 50 storage slots per contract initially.
The process to develop, test and deploy new implementations are as follow:

1. Ensure that the contract inherits from `IVersioned` (if it is `BaseControllerUpgradeable` it will).
2. Bump the version accordingly.
3. Develop according to good practices, modify __gap length to accommodate new state, add comments with storage accounting in contract variables and __gap values.
4. Write an upgradeability test in `test/components/upgrades.test.js`.
4.1 Deploy an upgradeable proxy with the base implementation, found in `components/_old/<component_folder>/<ComponentName>_X_Y_Z`. 
    If not there, either:
    - Use `hardhat flattener` to generate one.
    - If the contracts is deployed and the repo is not tagged and you are not sure if the exact files are in the current commit, generate a flattened version obtained from verified contracts in relevant block explorer (Etherscan, Polyscan...) and add it.
    - Rename main component in flattened file to `<ComponentName>_X_Y_Z`.
4.2 Initialize all the state of the contract, assert the values are there.
4.3 Upgrade to the new implementation
4.4 Check the output from `upgrades-plugin`. If gap sizes changed, you may need to activate the flag `unsafeSkipStorageCheck` to deploy.
4.5 Assert the values of the state have not changed.
5. Execute the script `scripts/storageToTable` to print a markdown table of the before and after implementations 
    - You may need to execute `test/components/upgrades.test.js` with `it.only(<relevant_test>)` so both old and new implementations are present in `.openzeppelin/unknown-31337.json`. Delete delete `.openzeppelin/unknown-31337.json` before executing the test so `storageToTable` finds the correct implementations.
6. Visualize and assert that the sum of the storage reserved is the same before and after, and that the new gaps are adjusted correctly. If the test in 4.5 passes this is probably correct, if that test fails, something will not add up.
7. Write a script to deploy the upgrade and execute the initializing methods needed.
8. Add a flattened version of the deployed implementation to `components/_old/<component_folder>/<ComponentName>_X_Y_Z`.


## Exporting ABIs for software that does not support custom errors.

Forta contracts use [Solidity's Custom Errors](https://blog.soliditylang.org/2021/04/21/custom-errors/) instead of `require(<test>, '<Error String>')`.

Some other parts of the system do not support this feature in ABIs yet. To generate compatible ABIs:

1. Compile contracts
2. `npx hardhat run scripts/abis-without-custom-errors.js`
3. Check `.abis-no-errors` folder.

## Setting stake threshold.

1. Open `scripts/set-staking-threshold.js` 
2. Edit `config` object
3. Make sure the wallet in `.env` has `XXX_ADMIN_ROLE` (see `env.example` for reference`)
4. `hardhat run --network <mumbai or polygon> scripts/set-staking-threshold.js` 

# Mint and bridge TEST FORT L1 -> L2
1. Make sure the wallets in `.env` has `WHITELIST_ROLE` in Goerli and Mumbai and `MINTER_ROLE` in Goerli (see `env.example` for reference`). FORT will be sent in Mumbai to the same wallet you provided in `.env -> GOERLI_MNEMONIC`
2. Open `scripts/matic/enter.js` and edit `AMOUNT` to set the FORT to mint and bridge
3. `npx hardhat run --network goerli scripts/matic/enter.js`
4. Eventually, Polygon PoS Bridge will send the tokens to your wallet. It may take a while (10+ mins).
5. To stake, call `deposit(uint8 subjectType, uint256 subject, uint256 stakeValue)` in `FortaStaking` instance (check `scripts/.cache-80001.json -> staking -> address`)