# Forta Protocol

Contracts of the [Forta Protocol](https://forta.org/)

## Contract Versioning.

- Interface implementations previously deployed are under `_old` folders, for upgrade testing.
- Contracts no longer in use are under `_deprecated` folder.


## Deploy platform
`npx hardhat run --network <network> scripts/deploy-platform.js`

To see debug logs, we are using [debug package](https://www.npmjs.com/package/debug)

`DEBUG=* npx hardhat run --network <network> scripts/deploy-platform.js`