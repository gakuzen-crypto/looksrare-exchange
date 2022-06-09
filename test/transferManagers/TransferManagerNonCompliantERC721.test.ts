import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { Contract } from "ethers";
import { ethers } from "hardhat";

// no types declaration found
const { snapshot } = require("@openzeppelin/test-helpers");

describe("TransferManagerNonCompliantERC721", function () {
  let owner: SignerWithAddress, alice: SignerWithAddress, bob: SignerWithAddress;
  let transferManagerNonCompliantERC721: Contract;
  let testSnapshot: any;
  let testNonCompliantERC721: Contract;

  beforeEach(async () => {
    testSnapshot = await snapshot();

    [owner, alice, bob] = await ethers.getSigners();

    // Assume owner is minted exchange
    const TransferManagerNonCompliantERC721 = await ethers.getContractFactory(
      "TransferManagerNonCompliantERC721"
    );
    transferManagerNonCompliantERC721 = await TransferManagerNonCompliantERC721.deploy(owner.address);

    const TestNonCompliantERC721 = await ethers.getContractFactory("TestNonCompliantERC721");
    testNonCompliantERC721 = await TestNonCompliantERC721.deploy();
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
        transferManagerNonCompliantERC721
          .connect(alice)
          .transferNonFungibleToken(testNonCompliantERC721.address, bob.address, alice.address, 100, 0)
      ).to.revertedWith("Transfer: Only Minted Exchange");
    });

    it("should transfer ERC-721 NFT", async () => {
      // Mint erc-721 tokenId: 100 to bob
      await testNonCompliantERC721.mint(bob.address, 100);
      await testNonCompliantERC721
        .connect(bob)
        .setApprovalForAll(transferManagerNonCompliantERC721.address, true);

      // Before
      expect(await testNonCompliantERC721.ownerOf(100)).to.eq(bob.address);

      await transferManagerNonCompliantERC721.transferNonFungibleToken(
        testNonCompliantERC721.address,
        bob.address,
        alice.address,
        100,
        0
      );

      // After
      expect(await testNonCompliantERC721.ownerOf(100)).to.eq(alice.address);
    });
  });
});
