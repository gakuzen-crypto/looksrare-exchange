import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { Contract, Wallet } from "ethers";
import { ethers } from "hardhat";

// no types declaration found
const { snapshot } = require("@openzeppelin/test-helpers");

describe("RoyaltyFeeManager", function () {
  let owner: SignerWithAddress, alice: SignerWithAddress, bob: SignerWithAddress;
  let royaltyFeeManager: Contract, royaltyFeeSetter: Contract;
  let testSnapshot: any;

  beforeEach(async () => {
    testSnapshot = await snapshot();

    [owner, alice, bob] = await ethers.getSigners();

    // Dependencies
    const royalyFeeLimit = 9500; // as a ref: LooksRare set 9500 as limit
    const RoyaltyFeeRegistry = await ethers.getContractFactory("RoyaltyFeeRegistry");
    const royaltyFeeRegistry = await RoyaltyFeeRegistry.deploy(royalyFeeLimit);

    const RoyaltyFeeSetter = await ethers.getContractFactory("RoyaltyFeeSetter");
    royaltyFeeSetter = await RoyaltyFeeSetter.deploy(royaltyFeeRegistry.address);

    // transfer royalty fee registry to owner
    await royaltyFeeRegistry.transferOwnership(royaltyFeeSetter.address);

    const RoyaltyFeeManager = await ethers.getContractFactory("RoyaltyFeeManager");
    royaltyFeeManager = await RoyaltyFeeManager.deploy(royaltyFeeRegistry.address);
  });

  afterEach(async () => {
    // Restore to not affect tests after due to advance in time
    await testSnapshot.restore();
  });

  describe("calculateRoyaltyFeeAndGetRecipient", () => {
    it("should handle when no royalty info set and non-erc2981 NFT", async () => {
      const TestERC721 = await ethers.getContractFactory("TestERC721");
      const testERC721 = await TestERC721.connect(alice).deploy();

      const [reciever, royaltyAmt] = await royaltyFeeManager.calculateRoyaltyFeeAndGetRecipient(
        testERC721.address,
        10,
        1000
      );

      expect(reciever).to.eq(ethers.constants.AddressZero);
      expect(royaltyAmt).to.eq(0);
    });

    it("should handle when no royalty info set and erc2981 NFT", async () => {
      const TestERC721Royalty = await ethers.getContractFactory("TestERC721Royalty");
      const testERC721Royalty = await TestERC721Royalty.connect(alice).deploy();

      const [reciever, royaltyAmt] = await royaltyFeeManager.calculateRoyaltyFeeAndGetRecipient(
        testERC721Royalty.address,
        10,
        1000
      );

      expect(reciever).to.eq(alice.address);
      expect(royaltyAmt).to.eq(1000 * 0.02);
    });

    it("should handle when royalty info is set", async () => {
      const TestERC721 = await ethers.getContractFactory("TestERC721");
      const testERC721 = await TestERC721.connect(alice).deploy();

      // Set to 10%
      await royaltyFeeSetter.connect(alice).updateRoyaltyInfoForCollectionIfOwner(
        testERC721.address,
        alice.address,
        bob.address, // new reciever
        1000 // 1000 = 10%
      );

      const [reciever, royaltyAmt] = await royaltyFeeManager.calculateRoyaltyFeeAndGetRecipient(
        testERC721.address,
        10, // tokenId
        1000 // amt
      );

      expect(reciever).to.eq(bob.address);
      expect(royaltyAmt).to.eq(1000 * 0.1);
    });
  });
});
