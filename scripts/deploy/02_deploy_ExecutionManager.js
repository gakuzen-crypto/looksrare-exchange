const { deployContractTransactionHashCheck } = require("../deploy_util");

/*
  yarn script:deployExecutionManager cronos-testnet3
*/

async function deployExecutionManager(envParam) {
  let numberOfBroadcastedTransaction = 0;

  console.log("--------------------- Deploying ----------------------");
  const ExecutionManager = await ethers.getContractFactory("ExecutionManager");
  const executionManager = await ExecutionManager.deploy();

  await deployContractTransactionHashCheck(executionManager);
  console.log(`✅ Done - Execution manager address: ${executionManager.address} <--- 👈 Copy Me !! 🐣`);

  numberOfBroadcastedTransaction++;
  return numberOfBroadcastedTransaction;
}

module.exports = {
  deployExecutionManager,
};
