const {
  broadcastTransactionHashChecking,
  deployContractTransactionHashCheck,
  validateAddress,
} = require("../deploy_util");

/*
  yarn script:deployRoyalty cronos-testnet3
*/

async function deployRoyalty(envParam) {
  const { config } = envParam;
  const { royaltyFeeLimit, executionManagerAddr } = config;

  let numberOfBroadcastedTransaction = 0;

  console.log("----------------- Manual Filled Config Checking ------------------");
  validateAddress("Execution Manager Address", executionManagerAddr);
  if (royaltyFeeLimit == null) {
    throw new Error("Royalty fee limit must be set");
  }
  console.log(`Max fee is ${royaltyFeeLimit / 100}%`);

  console.log("--------------------- Deploying ----------------------");

  const RoyaltyFeeRegistry = await ethers.getContractFactory("RoyaltyFeeRegistry");
  const royaltyFeeRegistry = await RoyaltyFeeRegistry.deploy(royaltyFeeLimit);
  await deployContractTransactionHashCheck(royaltyFeeRegistry);
  console.log(
    `✅ Done - RoyaltyFeeRegistry deployed at: ${royaltyFeeRegistry.address} <--- 👈 Copy Me !! 🐣`
  );
  numberOfBroadcastedTransaction++;

  const RoyaltyFeeSetter = await ethers.getContractFactory("RoyaltyFeeSetter");
  const royaltyFeeSetter = await RoyaltyFeeSetter.deploy(royaltyFeeRegistry.address);
  await deployContractTransactionHashCheck(royaltyFeeSetter);
  console.log(`✅ Done - RoyaltyFeeSetter deployed at: ${royaltyFeeSetter.address} <--- 👈 Copy Me !! 🐣`);
  numberOfBroadcastedTransaction++;

  const tx = await royaltyFeeRegistry.transferOwnership(royaltyFeeSetter.address);
  await broadcastTransactionHashChecking(tx);
  console.log(`✅ Done - RoyaltyFeeSetter new owner is RoyaltyFeeSetter `);
  numberOfBroadcastedTransaction++;

  const RoyaltyFeeManager = await ethers.getContractFactory("RoyaltyFeeManager");
  const royaltyFeeManager = await RoyaltyFeeManager.deploy(royaltyFeeRegistry.address);
  await deployContractTransactionHashCheck(royaltyFeeSetter);
  console.log(`✅ Done - RoyaltyFeeManager deployed at: ${royaltyFeeManager.address} <--- 👈 Copy Me !! 🐣`);
  numberOfBroadcastedTransaction++;

  return numberOfBroadcastedTransaction;
}

module.exports = {
  deployRoyalty,
};
