import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { Contract, Wallet } from "ethers";
import { ethers } from "hardhat";
import { generateMakerOrder } from "../utils/OrderGenerator";
import { signMakerOrder } from "../utils/OrderSigner";
import { defaultAbiCoder, formatBytes32String } from "ethers/lib/utils";
import { hashMakerOrder } from "../utils/OrderHash";

// no types declaration found
const { snapshot, time } = require("@openzeppelin/test-helpers");

describe("mintedExchange - matchMakerOrders", function () {
  let owner: SignerWithAddress, alice: SignerWithAddress, bob: SignerWithAddress;
  let mintedExchange: Contract, englishAuctionStrat: Contract;
  let transferManagerERC721: Contract, transferManagerERC1155: Contract, testERC721Royalty: Contract;
  let testSnapshot: any;
  let testERC721: Contract, testERC1155: Contract, weth: Contract;
  let feeRecipient: string, protocolFee: number;

  beforeEach(async () => {
    testSnapshot = await snapshot();

    [owner, alice, bob] = await ethers.getSigners();

    // 1. CurrencyManager dependency
    const CurrencyManager = await ethers.getContractFactory("CurrencyManager");
    const currencyManager = await CurrencyManager.deploy();

    const WETH = await ethers.getContractFactory("TestWETH");
    weth = await WETH.deploy(ethers.constants.WeiPerEther); // 1 eth to owner
    await currencyManager.addCurrency(weth.address);

    // 2. ExecutionManager dependency
    const ExecutionManager = await ethers.getContractFactory("ExecutionManager");
    const executionManager = await ExecutionManager.deploy();

    protocolFee = 400; // 400 = 4%
    const EnglishAuctionStrat = await ethers.getContractFactory("StrategyEnglishAuction");
    englishAuctionStrat = await EnglishAuctionStrat.deploy(protocolFee);
    await executionManager.addStrategy(englishAuctionStrat.address);

    // 3. Royalty dependency
    const royalyFeeLimit = 9500; // as a ref: LooksRare set 9500 as limit
    const RoyaltyFeeRegistry = await ethers.getContractFactory("RoyaltyFeeRegistry");
    const royaltyFeeRegistry = await RoyaltyFeeRegistry.deploy(royalyFeeLimit);
    const RoyaltyFeeSetter = await ethers.getContractFactory("RoyaltyFeeSetter");
    const royaltyFeeSetter = await RoyaltyFeeSetter.deploy(royaltyFeeRegistry.address);
    // transfer royalty fee registry to owner
    await royaltyFeeRegistry.transferOwnership(royaltyFeeSetter.address);
    const RoyaltyFeeManager = await ethers.getContractFactory("RoyaltyFeeManager");
    const royaltyFeeManager = await RoyaltyFeeManager.deploy(royaltyFeeRegistry.address);

    // 4. protcol fee recipient
    feeRecipient = Wallet.createRandom().address;

    const MintedExchange = await ethers.getContractFactory("MintedExchange");
    mintedExchange = await MintedExchange.deploy(
      currencyManager.address,
      executionManager.address,
      royaltyFeeManager.address,
      weth.address,
      feeRecipient
    );

    // 5. Set transferSelectorNFT
    const TransferManagerERC721 = await ethers.getContractFactory("TransferManagerERC721");
    transferManagerERC721 = await TransferManagerERC721.deploy(mintedExchange.address);
    const TransferManagerERC1155 = await ethers.getContractFactory("TransferManagerERC1155");
    transferManagerERC1155 = await TransferManagerERC1155.deploy(mintedExchange.address);
    const TransferSelectorNFT = await ethers.getContractFactory("TransferSelectorNFT");
    const transferSelectorNFT = await TransferSelectorNFT.deploy(
      transferManagerERC721.address,
      transferManagerERC1155.address
    );
    await mintedExchange.updateTransferSelectorNFT(transferSelectorNFT.address);

    const TestERC721 = await ethers.getContractFactory("TestERC721");
    testERC721 = await TestERC721.deploy();
    const TestERC1155 = await ethers.getContractFactory("TestERC1155");
    testERC1155 = await TestERC1155.deploy();
    const TestERC721Royalty = await ethers.getContractFactory("TestERC721Royalty");
    testERC721Royalty = await TestERC721Royalty.deploy();

    // Post setup - grant some WETH to both alice/bob
    await weth.connect(alice).deposit({ value: 1000 });
    await weth.connect(alice).approve(mintedExchange.address, ethers.constants.MaxUint256);
    await weth.connect(bob).deposit({ value: 1000 });
    await weth.connect(bob).approve(mintedExchange.address, ethers.constants.MaxUint256);

    // provide the owner with the role to call onlyMatchMakerRoleOrNotBeta
    const MATCH_MAKER_ORDERS_ROLE = ethers.utils.id("MATCH_MAKER_ORDERS_ROLE");
    await mintedExchange.grantRole(MATCH_MAKER_ORDERS_ROLE, owner.address);
  });

  afterEach(async () => {
    // Restore to not affect tests after due to advance in time
    await testSnapshot.restore();
  });

  // TODO: seller accepting an offer will call this
  describe("matchMakerOrders", async () => {
    let validMakerAsk: any, validMakerBid: any;
    beforeEach(async () => {
      const currentTimestamp = await time.latest();

      validMakerAsk = generateMakerOrder({
        isOrderAsk: true,
        maker: alice.address,
        startTime: currentTimestamp.toString(),
        endTime: currentTimestamp.add(time.duration.hours(1)).toString(), // 1 hour later
        stratAddr: englishAuctionStrat.address,
        collectionAddr: testERC721.address,
        currencyAddr: weth.address,
        paramVal: [100], // reserve price
        paramType: ["uint256"],
      });

      validMakerBid = generateMakerOrder({
        isOrderAsk: false,
        maker: bob.address,
        startTime: currentTimestamp.toString(),
        endTime: currentTimestamp.add(time.duration.hours(1)).toString(), // 1 hour later
        stratAddr: englishAuctionStrat.address,
        collectionAddr: testERC721.address,
        currencyAddr: weth.address,
        price: 100,
      });
    });

    it("should only allow user with MATCH_MAKER_ORDERS_ROLE", async () => {
      const signedMakerBid = await signMakerOrder(bob, mintedExchange.address, validMakerBid);
      const signedMakerAsk = await signMakerOrder(alice, mintedExchange.address, validMakerBid);

      await expect(
        mintedExchange.connect(alice).matchMakerOrders(signedMakerBid, signedMakerAsk)
      ).to.revertedWith("MintedExchange: no permission to call match maker order");
    });

    it("should validate !makerBid.isOrderAsk and makerAsk.isOrderAsk", async () => {
      // function expects makerBid.isOrderAsk = false and makerAsk.isOrderAsk = true
      for (const pair of [
        [true, true], // makerBid.isOrderAsk = true, makerAsk.isOrderAsk = true
        [false, false], // makerBid.isOrderAsk = false, makerAsk.isOrderAsk = false
      ]) {
        const makerAsk = { ...validMakerAsk, isOrderAsk: pair[0] };
        const makerBid = { ...validMakerBid, isOrderAsk: pair[1] };

        const signedMakerBid = await signMakerOrder(bob, mintedExchange.address, makerBid);
        const signedMakerAsk = await signMakerOrder(alice, mintedExchange.address, makerAsk);

        await expect(mintedExchange.matchMakerOrders(signedMakerBid, signedMakerAsk)).to.revertedWith(
          "Order: Wrong sides"
        );
      }
    });

    it("should validate maker order - signer is set", async () => {
      const signedValidMakerBid = await signMakerOrder(bob, mintedExchange.address, validMakerBid);
      const signedValidMakerAsk = await signMakerOrder(alice, mintedExchange.address, validMakerAsk);

      const invalidMakerBid = { ...validMakerBid, signer: ethers.constants.AddressZero };
      const invalidMakerAsk = { ...validMakerAsk, signer: ethers.constants.AddressZero };
      const signedInvalidMakerBid = await signMakerOrder(bob, mintedExchange.address, invalidMakerBid);
      const signedInvalidMakerAsk = await signMakerOrder(alice, mintedExchange.address, invalidMakerAsk);

      await expect(
        mintedExchange.matchMakerOrders(signedValidMakerBid, signedInvalidMakerAsk)
      ).to.revertedWith("Order: Invalid signer");

      await expect(
        mintedExchange.matchMakerOrders(signedInvalidMakerBid, signedValidMakerAsk)
      ).to.revertedWith("Order: Invalid signer");
    });

    it("should validate maker order - amount > 0", async () => {
      const signedValidMakerBid = await signMakerOrder(bob, mintedExchange.address, validMakerBid);
      const signedValidMakerAsk = await signMakerOrder(alice, mintedExchange.address, validMakerAsk);

      const invalidMakerBid = { ...validMakerBid, amount: 0 };
      const invalidMakerAsk = { ...validMakerAsk, amount: 0 };
      const signedInvalidMakerBid = await signMakerOrder(bob, mintedExchange.address, invalidMakerBid);
      const signedInvalidMakerAsk = await signMakerOrder(alice, mintedExchange.address, invalidMakerAsk);

      await expect(
        mintedExchange.matchMakerOrders(signedValidMakerBid, signedInvalidMakerAsk)
      ).to.revertedWith("Order: Amount cannot be 0");

      await expect(
        mintedExchange.matchMakerOrders(signedInvalidMakerBid, signedValidMakerAsk)
      ).to.revertedWith("Order: Amount cannot be 0");
    });

    it("should validate maker order - if signature is valid", async () => {
      const signedValidMakerBid = await signMakerOrder(bob, mintedExchange.address, validMakerBid);
      const signedValidMakerAsk = await signMakerOrder(alice, mintedExchange.address, validMakerAsk);

      const r = defaultAbiCoder.encode(["bytes32"], [formatBytes32String("random string")]);
      const s = defaultAbiCoder.encode(["bytes32"], [formatBytes32String("random string")]);
      const v = 28;

      const signedInvalidMakerBid = { ...validMakerBid, r, s, v };
      const signedInvalidMakerAsk = { ...validMakerAsk, r, s, v };

      await expect(
        mintedExchange.matchMakerOrders(signedValidMakerBid, signedInvalidMakerAsk)
      ).to.revertedWith("Signature: Invalid");

      await expect(
        mintedExchange.matchMakerOrders(signedInvalidMakerBid, signedValidMakerAsk)
      ).to.revertedWith("Signature: Invalid");
    });

    it("should validate maker order - whitelisted currency", async () => {
      const signedValidMakerBid = await signMakerOrder(bob, mintedExchange.address, validMakerBid);
      const signedValidMakerAsk = await signMakerOrder(alice, mintedExchange.address, validMakerAsk);

      const invalidMakerBid = { ...validMakerBid, currency: Wallet.createRandom().address };
      const invalidMakerAsk = { ...validMakerAsk, currency: Wallet.createRandom().address };
      const signedInvalidMakerBid = await signMakerOrder(bob, mintedExchange.address, invalidMakerBid);
      const signedInvalidMakerAsk = await signMakerOrder(alice, mintedExchange.address, invalidMakerAsk);

      await expect(
        mintedExchange.matchMakerOrders(signedValidMakerBid, signedInvalidMakerAsk)
      ).to.revertedWith("Currency: Not whitelisted");

      await expect(
        mintedExchange.matchMakerOrders(signedInvalidMakerBid, signedValidMakerAsk)
      ).to.revertedWith("Currency: Not whitelisted");
    });

    it("should validate maker order - whitelisted strategy", async () => {
      const signedValidMakerBid = await signMakerOrder(bob, mintedExchange.address, validMakerBid);
      const signedValidMakerAsk = await signMakerOrder(alice, mintedExchange.address, validMakerAsk);

      const invalidMakerBid = { ...validMakerBid, strategy: Wallet.createRandom().address };
      const invalidMakerAsk = { ...validMakerAsk, strategy: Wallet.createRandom().address };
      const signedInvalidMakerBid = await signMakerOrder(bob, mintedExchange.address, invalidMakerBid);
      const signedInvalidMakerAsk = await signMakerOrder(alice, mintedExchange.address, invalidMakerAsk);

      await expect(
        mintedExchange.matchMakerOrders(signedValidMakerBid, signedInvalidMakerAsk)
      ).to.revertedWith("Strategy: Not whitelisted");

      await expect(
        mintedExchange.matchMakerOrders(signedInvalidMakerBid, signedValidMakerAsk)
      ).to.revertedWith("Strategy: Not whitelisted");
    });

    describe("erc-721 nft", () => {
      beforeEach(async () => {
        // Pre-req: mint erc-721 to maker - tokenId 100
        await testERC721.mint(alice.address, 100); // alice is the seller
        await testERC721.connect(alice).setApprovalForAll(transferManagerERC721.address, true);
      });

      it("should fail if taker no longer have the erc-721", async () => {
        const makerAsk = { ...validMakerAsk, tokenId: 100 }; // maker creating an auction
        const makerBid = { ...validMakerBid, tokenId: 100 }; // buyer placing a bid

        const signedMakerBid = await signMakerOrder(bob, mintedExchange.address, makerBid);
        const signedMakerAsk = await signMakerOrder(alice, mintedExchange.address, makerAsk);

        // Alice transfer tokenId: 100 nft away to someone else
        await testERC721.connect(alice).transferFrom(alice.address, owner.address, 100);

        await expect(mintedExchange.matchMakerOrders(signedMakerBid, signedMakerAsk)).to.revertedWith(
          "ERC721: transfer caller is not owner nor approved"
        );
      });

      it("should fail if makerBid has cancelled order", async () => {
        const makerAsk = { ...validMakerAsk, tokenId: 100 }; // maker creating an auction
        const makerBid = { ...validMakerBid, tokenId: 100 }; // buyer placing a bid

        const signedMakerBid = await signMakerOrder(bob, mintedExchange.address, makerBid);
        const signedMakerAsk = await signMakerOrder(alice, mintedExchange.address, makerAsk);

        // makerBid cancelled
        await mintedExchange.connect(bob).cancelMultipleMakerOrders([makerBid.nonce]);

        await expect(mintedExchange.matchMakerOrders(signedMakerBid, signedMakerAsk)).to.revertedWith(
          "Order: Matching order expired"
        );
      });

      it("should fail if makerAsk has cancelled order", async () => {
        const makerAsk = { ...validMakerAsk, tokenId: 100 }; // maker creating an auction
        const makerBid = { ...validMakerBid, tokenId: 100 }; // buyer placing a bid

        const signedMakerBid = await signMakerOrder(bob, mintedExchange.address, makerBid);
        const signedMakerAsk = await signMakerOrder(alice, mintedExchange.address, makerAsk);

        // makerBid cancelled
        await mintedExchange.connect(alice).cancelMultipleMakerOrders([makerAsk.nonce]);

        await expect(mintedExchange.matchMakerOrders(signedMakerBid, signedMakerAsk)).to.revertedWith(
          "Order: Matching order expired"
        );
      });

      it("should transfer erc-721 nft from taker to maker, nft from maker to taker", async () => {
        const makerAsk = { ...validMakerAsk, tokenId: 100 }; // maker creating an auction
        const makerBid = { ...validMakerBid, tokenId: 100 }; // buyer placing a bid

        const signedMakerBid = await signMakerOrder(bob, mintedExchange.address, makerBid);
        const signedMakerAsk = await signMakerOrder(alice, mintedExchange.address, makerAsk);

        // Before
        expect(await weth.balanceOf(alice.address)).to.eq(1000);
        expect(await weth.balanceOf(bob.address)).to.eq(1000);
        expect(await testERC721.ownerOf(100)).to.eq(alice.address);

        await expect(mintedExchange.matchMakerOrders(signedMakerBid, signedMakerAsk))
          .to.emit(mintedExchange, "MakerMatch")
          .withArgs(
            await hashMakerOrder(signedMakerAsk),
            signedMakerBid.nonce,
            signedMakerAsk.nonce,
            signedMakerBid.signer,
            signedMakerAsk.signer,
            signedMakerBid.strategy,
            signedMakerBid.currency,
            signedMakerBid.collection,
            signedMakerBid.tokenId,
            signedMakerBid.amount,
            signedMakerBid.price
          );

        // After, alice sold nft to bob for 100
        expect(await weth.balanceOf(alice.address)).to.eq(1096);
        expect(await weth.balanceOf(bob.address)).to.eq(900);
        expect(await testERC721.ownerOf(100)).to.eq(bob.address);
      });

      it("should transfer erc-721 with royalty from taker to maker, nft from maker to taker", async () => {
        await testERC721Royalty.mint(alice.address, 100);
        await testERC721Royalty.connect(alice).setApprovalForAll(transferManagerERC721.address, true);

        const makerAsk = { ...validMakerAsk, tokenId: 100, collection: testERC721Royalty.address }; // maker creating an auction
        const makerBid = { ...validMakerBid, tokenId: 100, collection: testERC721Royalty.address }; // buyer placing a bid

        const signedMakerBid = await signMakerOrder(bob, mintedExchange.address, makerBid);
        const signedMakerAsk = await signMakerOrder(alice, mintedExchange.address, makerAsk);

        // Before
        expect(await weth.balanceOf(owner.address)).to.eq("1000000000000000000"); // owner of the royalty nft
        expect(await weth.balanceOf(alice.address)).to.eq(1000);
        expect(await weth.balanceOf(bob.address)).to.eq(1000);
        expect(await testERC721Royalty.ownerOf(100)).to.eq(alice.address);

        await expect(mintedExchange.matchMakerOrders(signedMakerBid, signedMakerAsk))
          .to.emit(mintedExchange, "MakerMatch")
          .withArgs(
            await hashMakerOrder(signedMakerAsk),
            signedMakerBid.nonce,
            signedMakerAsk.nonce,
            signedMakerBid.signer,
            signedMakerAsk.signer,
            signedMakerBid.strategy,
            signedMakerBid.currency,
            signedMakerBid.collection,
            signedMakerBid.tokenId,
            signedMakerBid.amount,
            signedMakerBid.price
          );

        // After, alice sold nft to bob for 100
        expect(await weth.balanceOf(owner.address)).to.eq("1000000000000000002");
        expect(await weth.balanceOf(alice.address)).to.eq(1094);
        expect(await weth.balanceOf(bob.address)).to.eq(900);
        expect(await testERC721Royalty.ownerOf(100)).to.eq(bob.address);
      });
    });

    describe("erc-1155 nft", () => {
      beforeEach(async () => {
        // Pre-req: mint erc-1155 with id: 1 and 100 copies to maker
        await testERC1155.mint(alice.address, 1, 100);
        await testERC1155.connect(alice).setApprovalForAll(transferManagerERC1155.address, true);
      });

      it("should fail if taker do not have the amount of erc-1155 quantity", async () => {
        // seller only have 100 copies
        const makerAsk = { ...validMakerAsk, tokenId: 1, collection: testERC1155.address, amount: 1000 }; // maker creating an auction
        const makerBid = { ...validMakerBid, tokenId: 1, collection: testERC1155.address, amount: 1000 }; // buyer placing a bid

        const signedMakerBid = await signMakerOrder(bob, mintedExchange.address, makerBid);
        const signedMakerAsk = await signMakerOrder(alice, mintedExchange.address, makerAsk);

        await expect(mintedExchange.matchMakerOrders(signedMakerBid, signedMakerAsk)).to.revertedWith(
          "ERC1155: insufficient balance for transfer"
        );
      });

      it("should transfer erc-1155 nft from taker to maker, nft from maker to taker", async () => {
        // seller only have 100 copies
        const makerAsk = { ...validMakerAsk, tokenId: 1, collection: testERC1155.address, amount: 75 }; // maker creating an auction
        const makerBid = { ...validMakerBid, tokenId: 1, collection: testERC1155.address, amount: 75 }; // buyer placing a bid

        const signedMakerBid = await signMakerOrder(bob, mintedExchange.address, makerBid);
        const signedMakerAsk = await signMakerOrder(alice, mintedExchange.address, makerAsk);

        // Before
        expect(await weth.balanceOf(bob.address)).to.eq(1000);
        expect(await weth.balanceOf(alice.address)).to.eq(1000);
        expect(await testERC1155.balanceOf(alice.address, 1)).to.eq(100);

        await expect(mintedExchange.matchMakerOrders(signedMakerBid, signedMakerAsk))
          .to.emit(mintedExchange, "MakerMatch")
          .withArgs(
            await hashMakerOrder(signedMakerAsk),
            signedMakerBid.nonce,
            signedMakerAsk.nonce,
            signedMakerBid.signer,
            signedMakerAsk.signer,
            signedMakerBid.strategy,
            signedMakerBid.currency,
            signedMakerBid.collection,
            signedMakerBid.tokenId,
            signedMakerBid.amount,
            signedMakerBid.price
          );

        // After, alice sold 75 nft to bob for 100
        expect(await weth.balanceOf(alice.address)).to.eq(1096);
        expect(await weth.balanceOf(bob.address)).to.eq(900);
        expect(await testERC1155.balanceOf(bob.address, 1)).to.eq(75);
        expect(await testERC1155.balanceOf(alice.address, 1)).to.eq(25);
      });
    });
  });
});
