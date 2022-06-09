const { getEnvConfig, deployerStatusChecking, nonceChecking } = require("./deploy_util");
const ScriptFunctions = require("./index");

async function jumpToDeployFunction(envParam, scriptAction, inputs) {
  let numberOfBroadcastedTransaction = 0;
  let expectedNumberOfOnChainTransaction = 1;
  numberOfBroadcastedTransaction += await ScriptFunctions[scriptAction](envParam, inputs);
  return { numberOfBroadcastedTransaction, expectedNumberOfOnChainTransaction };
}

async function main() {
  console.log("----------------- Deployer Status Checking ------------------");
  const [deployer] = await ethers.getSigners();
  await deployerStatusChecking(deployer);
  const initialDeployerNonce = await deployer.getTransactionCount();
  const npmConfigArgv = JSON.parse(`${process.env.npm_config_argv}`);
  const [command, hardhatEnv] = npmConfigArgv.original;
  const [arg0, scriptAction, ...otherScriptParts] = command.split(":");
  const inputs = process.env.INPUTS ? process.env.INPUTS.split(",") : [];
  console.log(`Going to ${scriptAction} ... with inputs`, inputs);

  const envParam = {
    ...(await getEnvConfig()),
    deployer,
  };
  if (!scriptAction) {
    console.log(
      "\x1b[36m%s\x1b[0m",
      `scriptAction is missing!
    Try again with following pattern. 
    e.g. yarn script:<targeted-function> <hardhat-config-supported-network>
    e.g. INPUTS=<param1>,<param2>,...,<paramN> yarn script:<targeted-function> <hardhat-config-supported-network>
    `
    );
  }
  if (scriptAction.indexOf("deploy") > -1) {
    await jumpToDeployFunction(envParam, scriptAction, inputs);
  } else {
    expectedNumberOfOnChainTransaction = 0;
    await ScriptFunctions[scriptAction](envParam, inputs);
  }
  console.log(`--------------------- ${scriptAction} End ----------------------`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Script Terminated : ", error);
    process.exit(1);
  });
