const {
  deployContractTransactionHashCheck,
  broadcastTransactionHashChecking,
  validateAddress,
} = require("../deploy_util");

/*
  yarn script:deployCurrencyManager cronos-testnet3
*/

async function deployCurrencyManager(envParam) {
  const { config } = envParam;
  const { whitelistCurrencyAddr } = config;

  let numberOfBroadcastedTransaction = 0;

  console.log("----------------- Manual Filled Config Checking ------------------");
  validateAddress("Whitelisted (should be weth or wcro) Address", whitelistCurrencyAddr);

  console.log("--------------------- Deploying ----------------------");
  const CurrencyManager = await ethers.getContractFactory("CurrencyManager");
  const currencyManager = await CurrencyManager.deploy();

  await deployContractTransactionHashCheck(currencyManager);
  console.log(`✅ Done - Currency manager address: ${currencyManager.address} <--- 👈 Copy Me !! 🐣`);
  numberOfBroadcastedTransaction++;

  // Should only be WCRO or WETH and likely never to add new currency anytime soon
  const txn = await currencyManager.addCurrency(whitelistCurrencyAddr);
  await broadcastTransactionHashChecking(txn);
  console.log(`✅ Done - Currency: ${whitelistCurrencyAddr} added to currency manager 🐣`);
  numberOfBroadcastedTransaction++;

  return numberOfBroadcastedTransaction;
}

module.exports = {
  deployCurrencyManager,
};
