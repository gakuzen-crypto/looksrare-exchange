const { deployContractTransactionHashCheck, validateAddress } = require("../deploy_util");

/*
  yarn script:deployMintedExchange cronos-testnet3
*/

async function deployMintedExchange(envParam) {
  const { config, chainName } = envParam;
  const { currencyManagerAddr, executionManagerAddr, royaltyFeeManagerAddr, feeRecipentAddr } = config;

  const wrappedNativeAddr = chainName === "cronos" ? config.wcroAddress : config.wethAddress;
  let numberOfBroadcastedTransaction = 0;

  console.log("----------------- Manual Filled Config Checking ------------------");
  validateAddress("Currency Manager Address", currencyManagerAddr);
  validateAddress("Execution Manager Address", executionManagerAddr);
  validateAddress("Royalty Fee Manager Address", royaltyFeeManagerAddr);
  validateAddress("Wrapped native token Address", wrappedNativeAddr);
  validateAddress("Fee Recipient Address", feeRecipentAddr);

  console.log("--------------------- Deploying ----------------------");
  const MintedExchange = await ethers.getContractFactory("MintedExchange");
  const mintedExchange = await MintedExchange.deploy(
    currencyManagerAddr,
    executionManagerAddr,
    royaltyFeeManagerAddr,
    wrappedNativeAddr,
    feeRecipentAddr
  );

  await deployContractTransactionHashCheck(mintedExchange);
  console.log(`✅ Done - Minted Exchange address: ${mintedExchange.address} <--- 👈 Copy Me !! 🐣`);

  numberOfBroadcastedTransaction++;
  return numberOfBroadcastedTransaction;
}

module.exports = {
  deployMintedExchange,
};
