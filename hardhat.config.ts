import { task } from "hardhat/config";
import "@nomiclabs/hardhat-waffle";

// Required for @openzeppelin/test-helpers
import "@nomiclabs/hardhat-web3";
import "solidity-coverage";

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (args, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.4",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },

  networks: {
    hardhat: {
      initialBaseFeePerGas: 0,
    },

    "cronos-testnet3": {
      chainName: "cronos",
      chainNetwork: "testnet3",
      url: "https://psta-cronos-testnet-rpc.3ona.co",
      gasPrice: 5000000000000,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    "cronos-mainnet": {
      chainName: "cronos",
      chainNetwork: "mainnet",
      url: "https://rpc.vvs.finance",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
};
