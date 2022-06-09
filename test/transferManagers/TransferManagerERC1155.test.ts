import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { Contract } from "ethers";
import { ethers } from "hardhat";

// no types declaration found
const { snapshot } = require("@openzeppelin/test-helpers");

describe("TransferManagerERC1155", function () {
  let owner: SignerWithAddress, alice: SignerWithAddress, bob: SignerWithAddress;
  let transferManagerERC1155: Contract;
  let testSnapshot: any;
  let testERC1155: Contract;

  beforeEach(async () => {
    testSnapshot = await snapshot();

    [owner, alice, bob] = await ethers.getSigners();

    // Assume owner is minted exchange
    const TransferManagerERC1155 = await ethers.getContractFactory("TransferManagerERC1155");
    transferManagerERC1155 = await TransferManagerERC1155.deploy(owner.address);

    const TestERC1155 = await ethers.getContractFactory("TestERC1155");
    testERC1155 = await TestERC1155.deploy();
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
        transferManagerERC1155
          .connect(alice)
          .transferNonFungibleToken(testERC1155.address, bob.address, alice.address, 100, 50)
      ).to.revertedWith("Transfer: Only Minted Exchange");
    });

    it("should transfer ERC-1155 NFT", async () => {
      // Pre-req: mint erc-1155 with id: 1 and 100 copies to maker
      await testERC1155.mint(bob.address, 1, 100);
      await testERC1155.connect(bob).setApprovalForAll(transferManagerERC1155.address, true);

      // Before
      expect(await testERC1155.balanceOf(alice.address, 1)).to.eq(0);
      expect(await testERC1155.balanceOf(bob.address, 1)).to.eq(100);

      await transferManagerERC1155.transferNonFungibleToken(
        testERC1155.address,
        bob.address,
        alice.address,
        1,
        80 // 80 copies
      );

      // After
      expect(await testERC1155.balanceOf(alice.address, 1)).to.eq(80);
      expect(await testERC1155.balanceOf(bob.address, 1)).to.eq(20);
    });
  });
});
