import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { Contract } from "ethers";
import { ethers } from "hardhat";

// no types declaration found
const { snapshot } = require("@openzeppelin/test-helpers");

describe("RoyaltyFeeRegistry", function () {
  let owner: SignerWithAddress, alice: SignerWithAddress;
  let royaltyFeeRegistry: Contract;
  let testSnapshot: any;

  beforeEach(async () => {
    testSnapshot = await snapshot();

    [owner, alice] = await ethers.getSigners();

    const royalyFeeLimit = 9500; // as a ref: LooksRare set 9500 as limit
    const RoyaltyFeeRegistry = await ethers.getContractFactory("RoyaltyFeeRegistry");
    royaltyFeeRegistry = await RoyaltyFeeRegistry.deploy(royalyFeeLimit);
  });

  afterEach(async () => {
    // Restore to not affect tests after due to advance in time
    await testSnapshot.restore();
  });

  describe("updateRoyaltyFeeLimit", () => {
    it("should only allow owner to update", async () => {
      await expect(royaltyFeeRegistry.connect(alice).updateRoyaltyFeeLimit(1000)).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should update royalty limit", async () => {
      await expect(royaltyFeeRegistry.updateRoyaltyFeeLimit(1000))
        .to.emit(royaltyFeeRegistry, "NewRoyaltyFeeLimit")
        .withArgs(1000);

      expect(await royaltyFeeRegistry.royaltyFeeLimit()).to.eq(1000);
    });

    it("should check royalty limit is below 9500 (95%)", async () => {
      await expect(royaltyFeeRegistry.updateRoyaltyFeeLimit(9501)).to.revertedWith(
        "Owner: Royalty fee limit too high"
      );
    });
  });

  describe("updateRoyaltyInfoForCollection", () => {
    it("should check for only owner", async () => {
      const TestERC721 = await ethers.getContractFactory("TestERC721");
      const testERC721 = await TestERC721.connect(alice).deploy();

      await expect(
        royaltyFeeRegistry
          .connect(alice)
          .updateRoyaltyInfoForCollection(testERC721.address, alice.address, alice.address, 1000)
      ).to.revertedWith("Ownable: caller is not the owner");
    });

    it("should update royalty fee information", async () => {
      const TestERC721 = await ethers.getContractFactory("TestERC721");
      const testERC721 = await TestERC721.connect(alice).deploy();

      const [setter, reciever, fee] = await royaltyFeeRegistry.royaltyFeeInfoCollection(testERC721.address);
      expect(setter).to.eq(ethers.constants.AddressZero);
      expect(reciever).to.eq(ethers.constants.AddressZero);
      expect(fee).to.eq(0);

      await royaltyFeeRegistry.updateRoyaltyInfoForCollection(
        testERC721.address,
        alice.address,
        alice.address,
        1000
      );
      // After update royalty info
      const [setterAfter, recieverAfter, feeAfter] = await royaltyFeeRegistry.royaltyFeeInfoCollection(
        testERC721.address
      );
      expect(setterAfter).to.eq(alice.address);
      expect(recieverAfter).to.eq(alice.address);
      expect(feeAfter).to.eq(1000);
    });
  });

  describe("royaltyInfo", () => {
    it("should return reciever and correct amount", async () => {
      const TestERC721 = await ethers.getContractFactory("TestERC721");
      const testERC721 = await TestERC721.connect(alice).deploy();

      await royaltyFeeRegistry.updateRoyaltyInfoForCollection(
        testERC721.address,
        alice.address,
        alice.address,
        1000 // 10%
      );

      const amount = 1000;
      const [collectionAddress, royaltyAmt] = await royaltyFeeRegistry.royaltyInfo(
        testERC721.address,
        amount
      );
      expect(collectionAddress).to.eq(alice.address);
      expect(royaltyAmt).to.eq(amount * 0.1);
    });

    it("should handle when royalty info is not set", async () => {
      const TestERC721 = await ethers.getContractFactory("TestERC721");
      const testERC721 = await TestERC721.connect(alice).deploy();

      const amount = 1000;
      const [collectionAddress, royaltyAmt] = await royaltyFeeRegistry.royaltyInfo(
        testERC721.address,
        amount
      );

      expect(collectionAddress).to.eq(ethers.constants.AddressZero);
      expect(royaltyAmt).to.eq(0);
    });
  });

  describe("royaltyFeeInfoCollection", async () => {
    it("should handle when royalty info is not set", async () => {
      const TestERC721 = await ethers.getContractFactory("TestERC721");
      const testERC721 = await TestERC721.connect(alice).deploy();

      const [setter, rciever, fee] = await royaltyFeeRegistry.royaltyFeeInfoCollection(testERC721.address);
      expect(setter).to.eq(ethers.constants.AddressZero);
      expect(rciever).to.eq(ethers.constants.AddressZero);
      expect(fee).to.eq(0);
    });
  });
});
