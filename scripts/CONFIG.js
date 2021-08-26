module.exports = {
  admins: [ '0x9c566D5005E7e96ED964dec9cB7477F246A37A09' ],
  minters: [ '0x84b181aE72FDF63Ed5c77B9058D990761Bb3dc44' ],
  whitelisters: [ '0xE6241CfD983cA709b34DCEb3428360C982B0e02B' ],
  allocations: [
    { beneficiary: '0xEA0C7eE97F3cF1Bb1404488f67adaB1c3C9F15dC', amount: ethers.utils.parseEther('100'), type: 'direct' },
    { beneficiary: '0x60bd5176809828Bd93411BdE9854eEA2d2CEDccf', amount: ethers.utils.parseEther('100'), type: 'direct' },
    { beneficiary: '0x60bd5176809828Bd93411BdE9854eEA2d2CEDccf', amount: ethers.utils.parseEther('100'), type: 'vesting', start: '2021-09-01T00:00:00Z', cliff: '1 year', end: '2025-09-01T00:00:00Z', upgrader: '0x9c566D5005E7e96ED964dec9cB7477F246A37A09' },
    { beneficiary: '0x603851E164947391aBD62EF98bDA93e206bfBe16', amount: ethers.utils.parseEther('100'), type: 'vesting', start: '2021-09-01T00:00:00Z', cliff: '1 year', end: '2025-09-01T00:00:00Z', upgrader: '0x9c566D5005E7e96ED964dec9cB7477F246A37A09' },
    { beneficiary: '0x70ad015c653e9D455Edf43128aCcDa10a094b605', amount: ethers.utils.parseEther('100'), type: 'vesting', start: '2021-09-01T00:00:00Z', cliff: '1 year', end: '2025-09-01T00:00:00Z', upgrader: '0x9c566D5005E7e96ED964dec9cB7477F246A37A09' },
    { beneficiary: '0xFd5771b6adbBAEED5bc5858dE3ed38A274d8c109', amount: ethers.utils.parseEther('100'), type: 'vesting', start: '2021-09-01T00:00:00Z', cliff: '1 year', end: '2025-09-01T00:00:00Z'                                                         },
  ],
}