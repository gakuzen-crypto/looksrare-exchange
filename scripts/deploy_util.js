const { getAddress, isAddress } = require("@ethersproject/address");
const hardhat = require("hardhat");
const fs = require("fs");
const BigNumber = require("bignumber.js");

const skipNonceCheck = false;

function getExtraEnvConfig(chainNetworkEnvDirectory) {
  /* if there is this repo only's env files . add them here */
  const config = JSON.parse(fs.readFileSync(`${chainNetworkEnvDirectory}/config.json`, "utf-8"));

  return {
    config,
  };
}

async function getEnvConfig() {
  console.log("----------------- Chain Status Checking ------------------");
  const chainName = hardhat.network.config.chainName;
  const chainNetwork = hardhat.network.config.chainNetwork;
  const currentBlockHeight = new BigNumber(await ethers.provider.getBlockNumber());
  const chainNetworkEnvDirectory = `env/${chainName}/${chainNetwork}`;
  console.log(`🎢 current blockHeight ${currentBlockHeight}`);

  const envParam = {
    chainName,
    chainNetwork,
    // ...require("@monacohq/dapp-env").getEnv(chainName, chainNetwork),
    currentBlockHeight,
    ...getExtraEnvConfig(chainNetworkEnvDirectory),
  };
  return envParam;
}

async function deployerStatusChecking(deployer) {
  const acountBalance = (await deployer.getBalance()).toString();
  const initialDeployerNonce = await deployer.getTransactionCount();
  console.log("Deployer Account :", {
    address: deployer.address,
    acountBalance: new BigNumber(acountBalance).dividedBy("1E18").toString(10),
    initialDeployerNonce,
  });
}

function nonceChecking(acountNonce, expectedDeployerNonce) {
  if (expectedDeployerNonce === acountNonce) {
    console.log(`✅ Deployer Account nonce check passed: ${expectedDeployerNonce}`);
  } else {
    const error = `🤔 Deployer Account nonce mismatched: ${JSON.stringify({
      acountNonce,
      expectedDeployerNonce,
    })}`;
    if (!skipNonceCheck) {
      throw new Error(error);
    }
  }
}

async function deployContractTransactionHashCheck(deployContract) {
  await deployContract.deployed();
  await transactionHashChecking(deployContract.deployTransaction);
}

async function broadcastTransactionHashChecking(transaction) {
  await transactionHashChecking(transaction);
}

async function transactionHashChecking(transaction) {
  const transactionoReceipt = await transaction.wait();
  if (hre.network.name.indexOf("ganache") >= 0) {
    console.log("Raw Transaction for Broadcast: \n  \x1b[34m", serializeTransaction(transaction), "\x1b[0m");
  }
  const gasUsed = transactionoReceipt.gasUsed;
  if (transaction.hash) {
    console.log(
      "✅ Done \x1b[36m",
      `
      - Transaction Hash: ${transaction.hash}
      - GasUsed: ${gasUsed}`,
      "\x1b[0m"
    );
  } else {
    const error = `🤔 Transaction Hash not exist: ${transaction.hash}`;
    throw new Error(error);
  }
}

function validateAddress(name, address) {
  if (!isAddress(address)) {
    throw new Error(`❌ Invalid address ${name}:${address}`);
  }
  console.log(`✅ ${name}: ${address}`);
}

function isPositiveInteger(str) {
  // Handle trailing .0
  if (str.includes(".")) return false;

  const n = new BigNumber(str);
  return n.isInteger() && n.isPositive();
}

function validateNumber(str) {
  if (!isPositiveInteger(str)) {
    throw new Error(`❌ Not a positive integer: ${str}`);
  }
  console.log(`✅ Positive integer:: ${str}`);
}

function validateStartEndBlockWithCurrentBlockHeight(startBlock, endBlock, currentBlockHeight) {
  if (new BigNumber(startBlock).isGreaterThanOrEqualTo(endBlock)) {
    throw new Error(`endBlock ${endBlock} is less then startBlock ${startBlock}`);
  }
  if (currentBlockHeight.isGreaterThanOrEqualTo(startBlock)) {
    throw new Error(`startBlock ${startBlock} is less then currentBlockHeight ${currentBlockHeight}`);
  }
  if (currentBlockHeight.isGreaterThanOrEqualTo(endBlock)) {
    throw new Error(`endBlock ${endBlock} is less then currentBlockHeight ${currentBlockHeight}`);
  }
}

function readAddressesFile(fileDirectory) {
  console.log("----------------- Addresses Config Checking ------------------");
  const addresses = JSON.parse(fs.readFileSync(fileDirectory, "utf8"));
  const checksumAddresses = {};
  for (const key of Object.keys(addresses)) {
    try {
      checksumAddresses[key] = getAddress(addresses[key]);
    } catch (err) {
      throw new Error(`❌ addresses.${key} is invalid: ${addresses[key]} - ${err}`);
    }
  }
  console.log("addresses:", checksumAddresses);
  return checksumAddresses;
}

function serializeTransaction(transaction) {
  const transactionKeys = ["to", "nonce", "gasPrice", "gasLimit", "data", "value", "chainId"];
  const tx = Object.keys(transaction).reduce((obj, key) => {
    if (transactionKeys.includes(key)) {
      obj[key] = transaction[key];
    }
    return obj;
  }, {});
  const signature = {
    r: transaction.r,
    s: transaction.s,
    v: transaction.v,
  };
  return ethers.utils.serializeTransaction(tx, signature);
}

module.exports = {
  getEnvConfig,
  deployContractTransactionHashCheck,
  broadcastTransactionHashChecking,
  transactionHashChecking,
  deployerStatusChecking,
  nonceChecking,
  validateStartEndBlockWithCurrentBlockHeight,
  readAddressesFile,
  validateAddress,
  validateNumber,
  serializeTransaction,
};
