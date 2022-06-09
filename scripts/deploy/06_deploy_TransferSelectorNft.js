const {
  deployContractTransactionHashCheck,
  validateAddress,
  broadcastTransactionHashChecking,
} = require("../deploy_util");

/*
  yarn script:deployTransferSelectorNft cronos-testnet3
*/

async function deployTransferSelectorNft(envParam) {
  const { config } = envParam;
  const { mintedExchangeAddr } = config;

  let numberOfBroadcastedTransaction = 0;

  console.log("----------------- Manual Filled Config Checking ------------------");
  validateAddress("Minted Exchange Address", mintedExchangeAddr);

  console.log("--------------------- Deploying ----------------------");

  const TransferManagerERC721 = await ethers.getContractFactory("TransferManagerERC721");
  const transferManagerERC721 = await TransferManagerERC721.deploy(mintedExchangeAddr);
  await deployContractTransactionHashCheck(transferManagerERC721);
  console.log(
    `✅ Done - transferManagerERC721 deployed at: ${transferManagerERC721.address} <--- 👈 Copy Me !! 🐣`
  );
  numberOfBroadcastedTransaction++;

  const TransferManagerERC1155 = await ethers.getContractFactory("TransferManagerERC1155");
  const transferManagerERC1155 = await TransferManagerERC1155.deploy(mintedExchangeAddr);
  await deployContractTransactionHashCheck(transferManagerERC1155);
  console.log(
    `✅ Done - transferManagerERC1155 deployed at: ${transferManagerERC1155.address} <--- 👈 Copy Me !! 🐣`
  );
  numberOfBroadcastedTransaction++;

  const TransferSelectorNFT = await ethers.getContractFactory("TransferSelectorNFT");
  const transferSelectorNFT = await TransferSelectorNFT.deploy(
    transferManagerERC721.address,
    transferManagerERC1155.address
  );
  await deployContractTransactionHashCheck(transferSelectorNFT);
  console.log(
    `✅ Done - transferSelectorNFT deployed at: ${transferSelectorNFT.address} <--- 👈 Copy Me !! 🐣`
  );
  numberOfBroadcastedTransaction++;

  // Deploy first and in the future will add to a collection through
  // TransferSelectorNFT.addCollectionTransferManager(address collection, tfNonCompliant721);
  const TransferManagerNonCompliantERC721 = await ethers.getContractFactory(
    "TransferManagerNonCompliantERC721"
  );
  const tfNonCompliant721 = await TransferManagerNonCompliantERC721.deploy(mintedExchangeAddr);
  await deployContractTransactionHashCheck(tfNonCompliant721);
  console.log(`✅ Done - tfNonCompliant721 deployed at: ${tfNonCompliant721.address} <--- 👈 Copy Me !! 🐣`);
  numberOfBroadcastedTransaction++;

  // Update minted exchange transfer selector nft
  const mintedExchange = await ethers.getContractAt("MintedExchange", mintedExchangeAddr, envParam.deployer);
  const tx = await mintedExchange.updateTransferSelectorNFT(transferSelectorNFT.address);
  await broadcastTransactionHashChecking(tx);
  console.log(
    `✅ Done - transferSelectorNFT: ${transferSelectorNFT} added to exchange: ${mintedExchangeAddr} <--- 👈 Copy Me !! 🐣`
  );

  return numberOfBroadcastedTransaction;
}

module.exports = {
  deployTransferSelectorNft,
};
