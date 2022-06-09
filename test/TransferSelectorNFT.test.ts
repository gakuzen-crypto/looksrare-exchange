import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { Contract, Wallet } from "ethers";
import { ethers } from "hardhat";

// no types declaration found
const { snapshot } = require("@openzeppelin/test-helpers");

describe("TransferSelectorNFT", function () {
  let owner: SignerWithAddress, alice: SignerWithAddress;
  let transferSelectorNFT: Contract, transferManagerERC721: Contract, transferManagerERC1155: Contract;
  let testSnapshot: any;

  beforeEach(async () => {
    testSnapshot = await snapshot();

    [owner, alice] = await ethers.getSigners();

    // Dependencies
    const nftExchange = Wallet.createRandom().address; // temp aaddress will do
    const TransferManagerERC721 = await ethers.getContractFactory("TransferManagerERC721");
    transferManagerERC721 = await TransferManagerERC721.deploy(nftExchange);

    const TransferManagerERC1155 = await ethers.getContractFactory("TransferManagerERC1155");
    transferManagerERC1155 = await TransferManagerERC1155.deploy(nftExchange);

    const TransferSelectorNFT = await ethers.getContractFactory("TransferSelectorNFT");
    transferSelectorNFT = await TransferSelectorNFT.deploy(
      transferManagerERC721.address,
      transferManagerERC1155.address
    );
  });

  afterEach(async () => {
    // Restore to not affect tests after due to advance in time
    await testSnapshot.restore();
  });

  describe("addCollectionTransferManager", () => {
    it("should check collection != address(0)", async () => {
      await expect(
        transferSelectorNFT.addCollectionTransferManager(
          ethers.constants.AddressZero,
          transferManagerERC721.address
        )
      ).to.revertedWith("Owner: Collection cannot be null address");
    });

    it("should check transferManager != address(0)", async () => {
      await expect(
        transferSelectorNFT.addCollectionTransferManager(
          Wallet.createRandom().address, // random collection address
          ethers.constants.AddressZero
        )
      ).to.revertedWith("Owner: TransferManager cannot be null address");
    });

    it("should update transfer manager for collection", async () => {
      const TestERC721 = await ethers.getContractFactory("TestERC721");
      const testERC721 = await TestERC721.connect(alice).deploy();

      await expect(
        transferSelectorNFT.addCollectionTransferManager(testERC721.address, transferManagerERC721.address)
      )
        .to.emit(transferSelectorNFT, "CollectionTransferManagerAdded")
        .withArgs(testERC721.address, transferManagerERC721.address);

      // Verify
      const transferManager = await transferSelectorNFT.checkTransferManagerForToken(testERC721.address);
      expect(transferManager).to.eq(transferManagerERC721.address);
    });
  });

  describe("removeCollectionTransferManager", () => {
    it("should check there is a transfer manager set for collection", async () => {
      await expect(
        transferSelectorNFT.removeCollectionTransferManager(transferManagerERC721.address)
      ).to.revertedWith("Owner: Collection has no transfer manager");

      await expect(
        transferSelectorNFT.removeCollectionTransferManager(ethers.constants.AddressZero)
      ).to.revertedWith("Owner: Collection has no transfer manager");
    });

    it("should remove transfer manager", async () => {
      const TestERC721 = await ethers.getContractFactory("TestERC721");
      const testERC721 = await TestERC721.connect(alice).deploy();

      // Before - setup transfer manager for collection
      const transferManagerAddr = Wallet.createRandom().address;
      await transferSelectorNFT.addCollectionTransferManager(testERC721.address, transferManagerAddr);
      const transferManagerBefore = await transferSelectorNFT.checkTransferManagerForToken(
        testERC721.address
      );
      expect(transferManagerBefore).to.eq(transferManagerAddr);

      // After - reverted back to transferManagerERC721.address
      await transferSelectorNFT.removeCollectionTransferManager(testERC721.address);
      const transferManagerAfter = await transferSelectorNFT.checkTransferManagerForToken(testERC721.address);
      expect(transferManagerAfter).to.eq(transferManagerERC721.address);
    });
  });

  describe("checkTransferManagerForToken", () => {
    it("should fallback to transfer manager 721 for ERC-721 nft", async () => {
      const TestERC721 = await ethers.getContractFactory("TestERC721");
      const testERC721 = await TestERC721.connect(alice).deploy();

      // Verify
      const transferManager = await transferSelectorNFT.checkTransferManagerForToken(testERC721.address);
      expect(transferManager).to.eq(transferManagerERC721.address);
    });

    it("should fallback to transfer manager 1155 for ERC-1155 nft", async () => {
      const TestERC1155 = await ethers.getContractFactory("TestERC1155");
      const testERC1155 = await TestERC1155.connect(alice).deploy();

      // Verify
      const transferManager = await transferSelectorNFT.checkTransferManagerForToken(testERC1155.address);
      expect(transferManager).to.eq(transferManagerERC1155.address);
    });
  });
});
