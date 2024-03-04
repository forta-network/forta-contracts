const { DefenderRelaySigner, DefenderRelayProvider } = require('defender-relay-client/lib/ethers');
const ethers = require('ethers');

const threatOracleABI = [
    "function registerAccounts(address[] calldata accounts, string[] calldata categories, uint8[] calldata confidenceScores) external",
];
const threatOracleAddress = "0xD7A6B94ED08A67D048a9dFeFd3593240c5759f3e";

const threatOracle = new ethers.Contract(
  threatOracleAddress,
  threatOracleABI
);

// Code used in Defender UI to register account
// on the PoC ThreatOracle onchain blocklist
exports.handler = async function(params, event) {
  const payload = params.request.body;
  const alert  = payload.alert;

  const provider = new DefenderRelayProvider(event);
  const signer = new DefenderRelaySigner(event, provider, { speed: 'fast' });

  await threatOracle.connect(signer).registerAccounts(
    [alert.metadata.attackerAddress],
    [alert.findingType.toLowerCase()],
    []
  );
};
