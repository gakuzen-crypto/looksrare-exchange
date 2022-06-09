module.exports = {
  ...require("./01_deploy_CurrencyManager"),
  ...require("./02_deploy_ExecutionManager"),
  ...require("./03_deploy_Strategies"),
  ...require("./04_deploy_Royalty"),
  ...require("./05_deploy_MintedExchange"),
  ...require("./06_deploy_TransferSelectorNft"),
};
