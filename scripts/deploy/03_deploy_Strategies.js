const {
  broadcastTransactionHashChecking,
  deployContractTransactionHashCheck,
  validateAddress,
} = require("../deploy_util");

/*
  yarn script:deployStrategies cronos-testnet3
*/

/**
 * Deploy strategy and add them to execution manager.
 */

const DUTCH_ACTION_MIN_SECONDS = 900; // 15mins, likely won't change
const DEPLOY_STRATEGIES = [
  "StrategyStandardSaleForFixedPrice",
  "StrategyAnyItemFromCollectionForFixedPrice",
  "StrategyPrivateSale",
  "StrategyEnglishAuction",
  "StrategyDutchAuction",
];

async function deployStrategies(envParam) {
  const { config } = envParam;
  const { protocolFee, executionManagerAddr } = config;

  let numberOfBroadcastedTransaction = 0;

  console.log("----------------- Manual Filled Config Checking ------------------");
  validateAddress("Execution Manager Address", executionManagerAddr);
  if (protocolFee == null) {
    throw new Error("protocol fee must be set");
  }
  console.log(`Protocol fee is ${protocolFee / 100}%`);

  console.log("--------------------- Deploying ----------------------");

  const executionManager = await ethers.getContractAt(
    "ExecutionManager",
    executionManagerAddr,
    envParam.deployer
  );

  for (const strategyContract of DEPLOY_STRATEGIES) {
    const Strat = await ethers.getContractFactory(strategyContract);

    // Handle different constructor
    let strat;
    if (strategyContract === "StrategyDutchAuction") {
      strat = await Strat.deploy(protocolFee, DUTCH_ACTION_MIN_SECONDS);
    } else {
      strat = await Strat.deploy(protocolFee);
    }

    await deployContractTransactionHashCheck(strat);
    console.log(`✅ Done - ${strategyContract} deployed at: ${strat.address} <--- 👈 Copy Me !! 🐣`);
    numberOfBroadcastedTransaction++;

    const txn = await executionManager.addStrategy(strat.address);
    await broadcastTransactionHashChecking(txn);
    console.log(`✅ Done - ${strategyContract} added to Execution Manager ${executionManagerAddr}`);
    numberOfBroadcastedTransaction++;
  }

  return numberOfBroadcastedTransaction;
}

module.exports = {
  deployStrategies,
};
