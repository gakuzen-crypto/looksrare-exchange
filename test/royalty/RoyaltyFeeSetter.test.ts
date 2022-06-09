import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { Contract } from "ethers";
import { ethers } from "hardhat";

// no types declaration found
const { snapshot } = require("@openzeppelin/test-helpers");

describe("RoyaltyFeeSetter", function () {
  let owner: SignerWithAddress, alice: SignerWithAddress, bob: SignerWithAddress;
  let royaltyFeeRegistry: Contract, royaltyFeeSetter: Contract;
  let testSnapshot: any;

  // Alice owner
  let testERC721Royalty: Contract, testERC721: Contract;

  beforeEach(async () => {
    testSnapshot = await snapshot();

    [owner, alice, bob] = await ethers.getSigners();

    const royalyFeeLimit = 9500; // LooksRare set 9500 as limit
    const RoyaltyFeeRegistry = await ethers.getContractFactory("RoyaltyFeeRegistry");
    royaltyFeeRegistry = await RoyaltyFeeRegistry.deploy(royalyFeeLimit);

    const RoyaltyFeeSetter = await ethers.getContractFactory("RoyaltyFeeSetter");
    royaltyFeeSetter = await RoyaltyFeeSetter.deploy(royaltyFeeRegistry.address);

    // transfer royalty fee rgistry to owner
    await royaltyFeeRegistry.transferOwnership(royaltyFeeSetter.address);

    // Alice owner
    const TestERC721Royalty = await ethers.getContractFactory("TestERC721Royalty");
    testERC721Royalty = await TestERC721Royalty.connect(alice).deploy();

    const TestERC721 = await ethers.getContractFactory("TestERC721");
    testERC721 = await TestERC721.connect(alice).deploy();
  });

  afterEach(async () => {
    // Restore to not affect tests after due to advance in time
    await testSnapshot.restore();
  });

  describe("updateRoyaltyInfoForCollectionIfAdmin", () => {
    it("should throw error if collection support erc-2981", async () => {
      await expect(
        royaltyFeeSetter.updateRoyaltyInfoForCollectionIfAdmin(
          testERC721Royalty.address,
          alice.address,
          alice.address,
          1000
        )
      ).to.revertedWith("Admin: Must not be ERC2981");
    });

    it("should check if owner is the collection creator", async () => {
      await expect(
        royaltyFeeSetter.updateRoyaltyInfoForCollectionIfAdmin(
          testERC721.address,
          alice.address,
          alice.address,
          1000
        )
      ).to.revertedWith("Admin: Not the admin");
    });

    it("should update royalty information", async () => {
      // Before update royalty info
      const [setter, reciever, fee] = await royaltyFeeRegistry.royaltyFeeInfoCollection(testERC721.address);
      expect(setter).to.eq(ethers.constants.AddressZero);
      expect(reciever).to.eq(ethers.constants.AddressZero);
      expect(fee).to.eq(0);

      // Update royalty info
      await royaltyFeeSetter
        .connect(alice)
        .updateRoyaltyInfoForCollectionIfAdmin(testERC721.address, alice.address, alice.address, 1000);

      // After upadte royalty info
      const [setterAfter, recieverAfter, feeAfter] = await royaltyFeeRegistry.royaltyFeeInfoCollection(
        testERC721.address
      );
      expect(setterAfter).to.eq(alice.address);
      expect(recieverAfter).to.eq(alice.address);
      expect(feeAfter).to.eq(1000);
    });
  });

  describe("updateRoyaltyInfoForCollectionIfOwner", () => {
    it("should throw error if collection support erc-2981", async () => {
      await expect(
        royaltyFeeSetter.updateRoyaltyInfoForCollectionIfOwner(
          testERC721Royalty.address,
          alice.address,
          alice.address,
          1000
        )
      ).to.revertedWith("Owner: Must not be ERC2981");
    });

    it("should check if owner is the collection owner", async () => {
      await expect(
        royaltyFeeSetter.updateRoyaltyInfoForCollectionIfOwner(
          testERC721.address,
          alice.address,
          alice.address,
          1000
        )
      ).to.revertedWith("Owner: Not the owner");
    });

    it("should update royalty information", async () => {
      // Before update royalty info
      const [setter, reciever, fee] = await royaltyFeeRegistry.royaltyFeeInfoCollection(testERC721.address);
      expect(setter).to.eq(ethers.constants.AddressZero);
      expect(reciever).to.eq(ethers.constants.AddressZero);
      expect(fee).to.eq(0);

      // Update royalty info
      await royaltyFeeSetter
        .connect(alice)
        .updateRoyaltyInfoForCollectionIfOwner(testERC721.address, alice.address, alice.address, 1000);

      // After upadte royalty info
      const [setterAfter, recieverAfter, feeAfter] = await royaltyFeeRegistry.royaltyFeeInfoCollection(
        testERC721.address
      );
      expect(setterAfter).to.eq(alice.address);
      expect(recieverAfter).to.eq(alice.address);
      expect(feeAfter).to.eq(1000);
    });
  });

  describe("updateRoyaltyInfoForCollectionIfSetter", () => {
    beforeEach(async () => {
      // Set bob as the setter
      await royaltyFeeSetter
        .connect(alice)
        .updateRoyaltyInfoForCollectionIfOwner(testERC721.address, bob.address, alice.address, 1000);
    });

    it("should check only setter can update", async () => {
      // Alice is owner of collection
      await expect(
        royaltyFeeSetter
          .connect(alice)
          .updateRoyaltyInfoForCollectionIfSetter(testERC721.address, alice.address, alice.address, 1000)
      ).to.revertedWith("Setter: Not the setter");
    });

    it("should update royalty information", async () => {
      // Before update royalty info
      const [setter, reciever, fee] = await royaltyFeeRegistry.royaltyFeeInfoCollection(testERC721.address);
      expect(setter).to.eq(bob.address);
      expect(reciever).to.eq(alice.address);
      expect(fee).to.eq(1000);

      // Update royalty info
      await royaltyFeeSetter
        .connect(bob)
        .updateRoyaltyInfoForCollectionIfSetter(testERC721.address, owner.address, owner.address, 0);

      // After upadte royalty info
      const [setterAfter, recieverAfter, feeAfter] = await royaltyFeeRegistry.royaltyFeeInfoCollection(
        testERC721.address
      );
      expect(setterAfter).to.eq(owner.address);
      expect(recieverAfter).to.eq(owner.address);
      expect(feeAfter).to.eq(0);
    });
  });

  describe("updateRoyaltyInfoForCollection", () => {
    it("should only allow owner", async () => {
      await expect(
        royaltyFeeSetter
          .connect(alice)
          .updateRoyaltyInfoForCollection(testERC721.address, alice.address, alice.address, 1000)
      ).to.revertedWith("Ownable: caller is not the owner");
    });

    it("should update the royalty info", async () => {
      // Before update royalty info
      const [setter, reciever, fee] = await royaltyFeeRegistry.royaltyFeeInfoCollection(testERC721.address);
      expect(setter).to.eq(ethers.constants.AddressZero);
      expect(reciever).to.eq(ethers.constants.AddressZero);
      expect(fee).to.eq(0);

      // Update royalty info
      await royaltyFeeSetter.updateRoyaltyInfoForCollection(
        testERC721.address,
        alice.address,
        alice.address,
        1000
      );

      // After upadte royalty info
      const [setterAfter, recieverAfter, feeAfter] = await royaltyFeeRegistry.royaltyFeeInfoCollection(
        testERC721.address
      );
      expect(setterAfter).to.eq(alice.address);
      expect(recieverAfter).to.eq(alice.address);
      expect(feeAfter).to.eq(1000);
    });
  });

  describe("updateOwnerOfRoyaltyFeeRegistry", () => {
    it("should check only owner", async () => {
      await royaltyFeeSetter.updateRoyaltyInfoForCollection(
        testERC721.address,
        alice.address,
        alice.address,
        1000
      );
    });

    it("should transfer ownership", async () => {
      expect(await royaltyFeeRegistry.owner()).to.eq(royaltyFeeSetter.address);

      await royaltyFeeSetter.updateOwnerOfRoyaltyFeeRegistry(alice.address);

      expect(await royaltyFeeRegistry.owner()).to.eq(alice.address);
    });
  });

  describe("updateRoyaltyFeeLimit", () => {
    it("should check only owner", async () => {
      await expect(royaltyFeeSetter.connect(alice).updateRoyaltyFeeLimit(alice.address)).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should update fee limit", async () => {
      expect(await royaltyFeeRegistry.royaltyFeeLimit()).to.eq(9500);

      await royaltyFeeSetter.updateRoyaltyFeeLimit(1000);

      expect(await royaltyFeeRegistry.royaltyFeeLimit()).to.eq(1000);
    });
  });

  describe("checkForCollectionSetter", () => {
    it("should return (setter, 0) if royalty is set", async () => {
      await royaltyFeeSetter.updateRoyaltyInfoForCollection(
        testERC721.address,
        alice.address,
        alice.address,
        1000
      );

      const [address, val] = await royaltyFeeSetter.checkForCollectionSetter(testERC721.address);

      expect(address).to.eq(alice.address);
      expect(val).to.eq(0);
    });

    it("should return (address 0, 1) for erc-2981 support", async () => {
      const [address, val] = await royaltyFeeSetter.checkForCollectionSetter(testERC721Royalty.address);

      expect(address).to.eq(ethers.constants.AddressZero);
      expect(val).to.eq(1);
    });

    it("should return (setter, 2) for collection with owner()", async () => {
      const [address, val] = await royaltyFeeSetter.checkForCollectionSetter(testERC721.address);

      expect(address).to.eq(alice.address);
      expect(val).to.eq(2);
    });

    it("should return (setter, 4) for collection without owner() and admin()", async () => {
      const ERC721 = await ethers.getContractFactory("ERC721");
      const erc721 = await ERC721.connect(alice).deploy("NFT", "N");

      const [address, val] = await royaltyFeeSetter.checkForCollectionSetter(erc721.address);

      expect(address).to.eq(ethers.constants.AddressZero);
      expect(val).to.eq(4);
    });
  });
});
