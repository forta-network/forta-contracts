const multisig = '0xC0eb11fBC755D31c6FECEaAc8760ddCb88C64fE1';
/*
const vesting = {
  // start: '2021-09-01T00:00:00Z',
  cliff: '1 year',
  duration: '4 years',
  upgrader: multisig,
};
*/

const vesting = {
    // start: '2021-09-01T00:00:00Z',
    cliff: '0 year',
    duration: '30 minutes',
    upgrader: multisig,
  };

function vestedAllocation(beneficiary, etherAmount, start) {
  const vestingStart = start ?? '2021-09-01T00:00:00Z'
  const amount = ethers.utils.parseEther(etherAmount);
  return { beneficiary, amount, start: vestingStart, type: 'vesting', ...vesting };
}

module.exports = {
  admins: [ multisig ],
  minters: [ multisig ],
  whitelisters: [ multisig ],
  allocations: [
    vestedAllocation('0x13732239Cee1a2F3392C6BdCAa2865DC6D25093b',   '200000.00'),
    vestedAllocation('0x8b29986f5Eb439196bf6b8bbC902c7ad6847e6F4',   '200000.00'),
    vestedAllocation('0x598Dbe6738E0AcA4eAbc22feD2Ac737dbd13Fb8F', '16000000.00'),
    vestedAllocation('0x6c3c7839f2f58C322e35Fb5771C199d2FBf808b9', '13000000.00'),
    vestedAllocation('0x5D56635AA1883e92F6dd85F85A3ea781FFc4eDfE',   '180000.00'),
    vestedAllocation('0x526f2cAa9A0E7bD7D506591a904e7DD91a62c315',   '100000.00'),
    vestedAllocation('0x1E2B3E14148487D26923BeEcb94b251C0A09ba5D',   '303800.00'),
    vestedAllocation('0xD1419ba4Aaa2f00FB52F877bD1d8CC7708980fbe',  '2500000.00'),
    vestedAllocation('0xfBe281f98E70fFB9B880ffe09c3c34b984C3Bb8C',    '40000.00'),
    vestedAllocation('0xa0a489B906f361D9759BAA82a7953549aEDa0cc6',   '920000.00'),
    vestedAllocation('0xDfA6549f88cd9FAa49546B3177bb4F61C9B91aE9', '12000000.00'),
    vestedAllocation('0xef7a8A14B0BA86141BA8C4d132ec0f774FbF42db',   '833333.00'),
    vestedAllocation('0x2625aBd49597A9F9C0941B98Fc130a6eAa45D40d',   '833333.33'),
    vestedAllocation('0xE6DFEE0E3eF73774B9f2E115476308601f5C313A',    '40000.00'),
    vestedAllocation('0x0C199ebd4D61A28861B47792ADf200DE2b48bC82',   '500000.00'),
    vestedAllocation('0xFF303Ce91E7a43153FFEcd9dbd42C98e47640E17',  '4000000.00'),
    vestedAllocation('0xF0e4A659461a1fb29F49f275a59309C2CACf83d7',   '100000.00'),
    vestedAllocation('0xd30d1A4549b1DC011C346037DeB8B07b9D7464Ea',   '170000.00'),
    vestedAllocation('0x17EBD000c5354AcaDe95fCD63a90eb8e6d464b14',  '1000000.00'),
    vestedAllocation('0x21ba37e2483423614B560F5a1faAFF88efb3AAcE',   '426900.00'),
    vestedAllocation('0x087d22A8e72f99679DaA4C08BfeeB7E6f688E593',   '426900.00'),
    vestedAllocation('0x683e85B4679AcFD8f7B4a565D5af20a87ECe8911',    '40000.00'),
    vestedAllocation('0xF40E98Bf62b4Ff0E24F2F631AC3bcc7170099dFa', '10000000.00'),
    vestedAllocation('0xfFC4343F4E67557f6Ad1Af243EC970e7b782ede7',  '1000000.00'),
    vestedAllocation('0x25d9f2FFf747ECa0157fF1af3fdf74e2af74C93d', '30000000.00'),
    vestedAllocation('0x1C55B1691FE2342Efe1dAcbe5d133eE5e0853287',   '964000.00'),
    vestedAllocation('0x0f581388D26A7CaA84e7633980b5dBb2CEB5e054',    '36000.00'),
    vestedAllocation('0x9F58F2e5674BD676aF8FE2907BF0aD0eFE3Ff510',  '2000000.00'),
    vestedAllocation('0xC1DEA3E396288513896bfeF77ef66b2eb1Ad7626',    '40000.00'),
    vestedAllocation('0x8AAbdBFDb5516567aeeA78ABaDdc58B0a6F145E7',   '100000.00'),
    vestedAllocation('0x8A765382DdCE5249758895f9cdC2719C2eC99554',   '303800.00'),
    vestedAllocation('0xe17D2B842fF6455829d9785D1997ef55FFAA28Bf',   '100000.00'),
    vestedAllocation('0x1F5F6aE072e849c258E9cCf988Ba6aCC53592dc1',   '100000.00'),
    vestedAllocation('0x54EA190259876Fd6D507a27e4da5e257Fd08e494',  '5700000.00'),
    vestedAllocation('0x2F2754EC2bA80AbA2CA15125a1aD31675F795ecf',  '1000000.00'),
    vestedAllocation('0xf222e1A7f77505CcCA74aac31A493faf510D4c6c',   '825000.00'),
    vestedAllocation('0x805c95D060adf457BbAcac23d367f6dAe53b4588',   '500000.00'),
    vestedAllocation('0xa7F31721c66CBb9E2E0E2B29AaFC5d87137D8e79',   '250000.00'),
    vestedAllocation('0xaBd2d43D76E243793C4E7a5E3EB8dd075cA61508',    '40000.00'),
    vestedAllocation('0x182D949B2f98bed88A99A0e1eA00D651f2bDc783', '10000000.00'),
    vestedAllocation('0x6D21C2832AD1197c63638Aa63abA03feCad81b18',   '863400.00'),
    vestedAllocation('0x05F099018D2bb1b4A5E7c80E04209A6061d4D1D2',  '6349000.00'),
    vestedAllocation('0xC29Af06142138F893e3f1C1D11Aa98C3313B8C1f',  '1200000.00'),
    vestedAllocation('0xc1Fc5cA835d3107437AC6Fa959a2E385d7CCE3e8',   '100000.00'),
    vestedAllocation('0xF3359E5B89f7804c8c9283781A23133BBd979c9D',   '100000.00'),
    vestedAllocation('0x97ffe6BC362faF0127affA2A9CdC625a6746ECc3',   '833333.33'),
    vestedAllocation('0xf4E8FbF6cd208b88acC39aA39f3C4Da5aD0A9e99',   '500000.00'),
    vestedAllocation('0x1898ec6B3d007fEe7D94E71A19b93b49374987A1',    '43400.00'),
    vestedAllocation('0x5f241712169EF9521Cc04d05EfFBdF287D303cE1',    '50000000'),
    vestedAllocation('0x6CC6D78128da020ED4E2401607b0AA351417e44e',     '7000000'),
    vestedAllocation('0x7d7B43e1271B020bBf9e9eE517742696Ffda8008',     '3600000'),
    vestedAllocation('0xE6EfB93a852074D56e6a610836d34dD890944d84',     '1000000'),
    vestedAllocation('0x1512cc8DCe2394D597473c92b44707D57E1E02c7',      '220000'),
    vestedAllocation('0xf62d4936Bb61BB340a5788d5ab4e3A587dFB7f6A',      '100000'),
    vestedAllocation('0xBC6f9d0636F61d2Ef763D54b4D96334Cde48cE72',    '40000000'),
    vestedAllocation('0x9Ea114d3f9Ed56294bb0aE537B86cfC0911Ca904',     '6666667'),
    vestedAllocation('0x96AB697D0Dbd61A6068A35203cA7F090E98107cd',     '1250000'),
    vestedAllocation('0x2Eca594E41CaB2511855c5c0319e3ad4459b08dc',     '1000000'),
    vestedAllocation('0x61F270F698a0E00D9b7feee27D806b0CFC05A1d7',      '100000'),
    vestedAllocation('0x875998f98049A6E8d8Ea93c15be5B27fd4094aDA',       '50000'),
    vestedAllocation('0x446AeE9479901B30838fF442187C9C6a139d9260',           '0'), // only deploy vesting, no allocation
    vestedAllocation('0xF5Fb27b912D987B5b6e02A1B1BE0C1F0740E2c6f',           '0'), // only deploy vesting, no allocation
  ],
  allocations_29042020: [
    //vestedAllocation('0xf65eebb411211a2c0348f71d1b89646819159035',      '2500000'),
    //vestedAllocation('0x7A8b8bFC9Cf860b4EC8Ef725567048185ef6ED93',      '4000000'),
    //vestedAllocation('0x218AE10DA9695b7E38381f22685603Be605Ad371',      '205127', '2021-11-01T00:00:00Z'),
    //vestedAllocation('0xf0F5D6F95e97A207434510799E346180B81356D1',      '76000'),
    vestedAllocation('0x9b0A8A8e6B2c23d572D7145F3dA14438FEd35374',      '1', '2021-11-01T00:00:00Z'),
  ]
};
