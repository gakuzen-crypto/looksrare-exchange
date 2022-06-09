import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { Contract } from "ethers";
import { ethers } from "hardhat";

// no types declaration found
const { snapshot } = require("@openzeppelin/test-helpers");

describe("TransferManagerERC721", function () {
  let owner: SignerWithAddress, alice: SignerWithAddress, bob: SignerWithAddress;
  let transferManagerERC721: Contract;
  let testSnapshot: any;
  let testERC721: Contract;

  beforeEach(async () => {
    testSnapshot = await snapshot();

    [owner, alice, bob] = await ethers.getSigners();

    // Assume owner is minted exchange
    const TransferManagerERC721 = await ethers.getContractFactory("TransferManagerERC721");
    transferManagerERC721 = await TransferManagerERC721.deploy(owner.address);

    const TestERC721 = await ethers.getContractFactory("TestERC721");
    testERC721 = await TestERC721.deploy();
  });

  afterEach(async () => {
    // Restore to not affect tests after due to advance in time
    await testSnapshot.restore();
  });

  // seller accepting bid or offer will call smart contract and this function be invoked
  // function checks whether seller can accept taker's ask
  describe("transferNonFungibleToken", () => {
    it("should check if caller is MintedExchange", async () => {
      await expect(
        transferManagerERC721
          .connect(alice)
          .transferNonFungibleToken(testERC721.address, bob.address, alice.address, 100, 0)
      ).to.revertedWith("Transfer: Only Minted Exchange");
    });

    it("should transfer ERC-721 NFT", async () => {
      // Mint erc-721 tokenId: 100 to bob
      await testERC721.mint(bob.address, 100);
      await testERC721.connect(bob).setApprovalForAll(transferManagerERC721.address, true);

      // Before
      expect(await testERC721.ownerOf(100)).to.eq(bob.address);

      await transferManagerERC721.transferNonFungibleToken(
        testERC721.address,
        bob.address,
        alice.address,
        100,
        0
      );

      // After
      expect(await testERC721.ownerOf(100)).to.eq(alice.address);
    });
  });
});
