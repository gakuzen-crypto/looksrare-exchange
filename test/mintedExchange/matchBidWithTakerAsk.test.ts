import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { Contract, Wallet } from "ethers";
import { ethers } from "hardhat";
import { generateTakerOrder, generateMakerOrder } from "../utils/OrderGenerator";
import { MakerOrder, signMakerOrder } from "../utils/OrderSigner";
import { defaultAbiCoder, formatBytes32String } from "ethers/lib/utils";
import { hashMakerOrder } from "../utils/OrderHash";

// no types declaration found
const { snapshot, time } = require("@openzeppelin/test-helpers");

describe("mintedExchange - matchBidWithTakerAsk", function () {
  let owner: SignerWithAddress, alice: SignerWithAddress, bob: SignerWithAddress;
  let mintedExchange: Contract, fixedPriceStrat: Contract;
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
    const FixedPriceStrat = await ethers.getContractFactory("StrategyStandardSaleForFixedPrice");
    fixedPriceStrat = await FixedPriceStrat.deploy(protocolFee);
    await executionManager.addStrategy(fixedPriceStrat.address);

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
  });

  afterEach(async () => {
    // Restore to not affect tests after due to advance in time
    await testSnapshot.restore();
  });

  // TODO: seller accepting an offer will call this
  describe("matchAskWithTakerBid", async () => {
    let validTakerAsk: any, validMakerBid: any;
    beforeEach(async () => {
      const currentTimestamp = await time.latest();
      validTakerAsk = generateTakerOrder({ taker: alice.address, isOrderAsk: true });
      validMakerBid = generateMakerOrder({
        isOrderAsk: false,
        maker: bob.address,
        startTime: currentTimestamp.toString(),
        endTime: currentTimestamp.add(time.duration.hours(1)).toString(), // 1 hour later
        stratAddr: fixedPriceStrat.address,
        collectionAddr: testERC721.address,
        currencyAddr: weth.address,
      });
    });

    it("should validate !makerBid.isOrderAsk and takerAsk.isOrderAsk", async () => {
      // function expects makerBid.isOrderAsk = false and takerAsk.isOrderAsk = true
      for (const pair of [
        [true, true], // makerBid.isOrderAsk = true, takerAsk.isOrderAsk = true
        [false, false], // makerBid.isOrderAsk = false, takerAsk.isOrderAsk = false
      ]) {
        const takerAsk = { ...validTakerAsk, isOrderAsk: pair[0] };
        const makerBid = { ...validMakerBid, isOrderAsk: pair[1] };

        const signedMakerBid = await signMakerOrder(bob, mintedExchange.address, makerBid);

        await expect(mintedExchange.matchBidWithTakerAsk(takerAsk, signedMakerBid)).to.revertedWith(
          "Order: Wrong sides"
        );
      }
    });

    it("should validate msg.sender is takerAsk.taker", async () => {
      const takerAsk = { ...validTakerAsk };
      const makerBid = { ...validMakerBid, maker: bob.address }; // maker is bob
      const signedMakerBid = await signMakerOrder(bob, mintedExchange.address, makerBid);

      // connect as owner instead of alice
      await expect(mintedExchange.matchBidWithTakerAsk(takerAsk, signedMakerBid)).to.revertedWith(
        "Order: Taker must be the sender"
      );
    });

    it("should validate maker bid - check if signer is set", async () => {
      const takerAsk = { ...validTakerAsk };
      const makerBid = { ...validMakerBid, signer: ethers.constants.AddressZero };
      const signedMakerBid = await signMakerOrder(bob, mintedExchange.address, makerBid);

      await expect(
        mintedExchange.connect(alice).matchBidWithTakerAsk(takerAsk, signedMakerBid)
      ).to.revertedWith("Order: Invalid signer");
    });

    it("should validate maker bid - check if amount > 0", async () => {
      const takerAsk = { ...validTakerAsk };
      const makerBid = { ...validMakerBid, amount: 0 };
      const signedMakerBid = await signMakerOrder(bob, mintedExchange.address, makerBid);

      await expect(
        mintedExchange.connect(alice).matchBidWithTakerAsk(takerAsk, signedMakerBid)
      ).to.revertedWith("Order: Amount cannot be 0");
    });

    it("should validate maker bid - check if signature is valid", async () => {
      const takerAsk = { ...validTakerAsk };
      const makerBid = { ...validMakerBid };
      const signedMakerBid = {
        ...makerBid,
        r: defaultAbiCoder.encode(["bytes32"], [formatBytes32String("random string")]),
        s: defaultAbiCoder.encode(["bytes32"], [formatBytes32String("random string")]),
        v: 28,
      };

      await expect(
        mintedExchange.connect(alice).matchBidWithTakerAsk(takerAsk, signedMakerBid)
      ).to.revertedWith("Signature: Invalid");
    });

    it("should validate maker bid - whitelisted currency", async () => {
      const takerAsk = { ...validTakerAsk };
      const makerBid = { ...validMakerBid, currency: Wallet.createRandom().address };
      const signedMakerBid = await signMakerOrder(bob, mintedExchange.address, makerBid);

      await expect(
        mintedExchange.connect(alice).matchBidWithTakerAsk(takerAsk, signedMakerBid)
      ).to.revertedWith("Currency: Not whitelisted");
    });

    it("should validate maker bid - whitelisted strategy", async () => {
      const takerAsk = { ...validTakerAsk };
      const makerBid = { ...validMakerBid, strategy: Wallet.createRandom().address };
      const signedMakerBid = await signMakerOrder(bob, mintedExchange.address, makerBid);

      await expect(
        mintedExchange.connect(alice).matchBidWithTakerAsk(takerAsk, signedMakerBid)
      ).to.revertedWith("Strategy: Not whitelisted");
    });

    it("should reject transaction if strategy cannot execute taker bid", async () => {
      // Fixed price strategy require both to be the same price
      const takerAsk = { ...validTakerAsk, price: 100 };
      const makerBid = { ...validMakerBid, price: 200 };
      const signedMakerBid = await signMakerOrder(bob, mintedExchange.address, makerBid);

      await expect(
        mintedExchange.connect(alice).matchBidWithTakerAsk(takerAsk, signedMakerBid)
      ).to.revertedWith("Strategy: Execution invalid");
    });

    describe("erc-721 nft", () => {
      beforeEach(async () => {
        // Pre-req: mint erc-721 to maker - tokenId 100
        await testERC721.mint(alice.address, 100); // alice is the seller
        await testERC721.connect(alice).setApprovalForAll(transferManagerERC721.address, true);
      });

      it("should fail if taker no longer have the erc-721", async () => {
        const takerAsk = { ...validTakerAsk, tokenId: 100 }; // from msg.sender -- seller accepting offer
        const makerBid = { ...validMakerBid, tokenId: 100 }; // buyer making an offer
        const signedMakerBid = await signMakerOrder(bob, mintedExchange.address, makerBid);

        // Alice transfer tokenId: 100 nft away to someone else
        testERC721.connect(alice).transferFrom(alice.address, owner.address, 100);

        await expect(
          mintedExchange.connect(alice).matchBidWithTakerAsk(takerAsk, signedMakerBid)
        ).to.revertedWith("ERC721: transfer caller is not owner nor approved");
      });

      it("should fail if user has cancelled order", async () => {
        const takerAsk = { ...validTakerAsk, tokenId: 100 }; // from msg.sender -- seller accepting offer
        const makerBid = { ...validMakerBid, tokenId: 100 }; // buyer making an offer
        const signedMakerBid = await signMakerOrder(bob, mintedExchange.address, makerBid);

        await mintedExchange.connect(bob).cancelAllOrdersForSender(100);

        await expect(
          mintedExchange.connect(alice).matchBidWithTakerAsk(takerAsk, signedMakerBid)
        ).to.revertedWith("Order: Matching order expired");
      });

      it("should transfer erc-721 nft from taker to maker, nft from maker to taker", async () => {
        const takerAsk = { ...validTakerAsk, tokenId: 100 }; // from msg.sender -- seller accepting offer
        const makerBid = { ...validMakerBid, tokenId: 100 }; // buyer making an offer
        const signedMakerBid = await signMakerOrder(bob, mintedExchange.address, makerBid);

        // Before
        expect(await weth.balanceOf(alice.address)).to.eq(1000);
        expect(await weth.balanceOf(bob.address)).to.eq(1000);
        expect(await testERC721.ownerOf(100)).to.eq(alice.address);

        await expect(mintedExchange.connect(alice).matchBidWithTakerAsk(takerAsk, signedMakerBid))
          .to.emit(mintedExchange, "TakerAsk")
          .withArgs(
            await hashMakerOrder(signedMakerBid),
            signedMakerBid.nonce,
            takerAsk.taker,
            signedMakerBid.signer,
            signedMakerBid.strategy,
            signedMakerBid.currency,
            signedMakerBid.collection,
            signedMakerBid.tokenId,
            signedMakerBid.amount,
            takerAsk.price
          );

        // After, alice sold nft to bob for 100
        expect(await weth.balanceOf(alice.address)).to.eq(1096);
        expect(await weth.balanceOf(bob.address)).to.eq(900);
        expect(await testERC721.ownerOf(100)).to.eq(bob.address);
      });

      it("should transfer erc-721 with royalty from taker to maker, nft from maker to taker", async () => {
        await testERC721Royalty.mint(alice.address, 100);
        await testERC721Royalty.connect(alice).setApprovalForAll(transferManagerERC721.address, true);

        const takerAsk = { ...validTakerAsk, tokenId: 100 }; // from msg.sender -- seller accepting offer
        const makerBid = { ...validMakerBid, tokenId: 100, collection: testERC721Royalty.address }; // buyer making an offer
        const signedMakerBid = await signMakerOrder(bob, mintedExchange.address, makerBid);

        // Before
        expect(await weth.balanceOf(owner.address)).to.eq("1000000000000000000"); // owner of the royalty nft
        expect(await weth.balanceOf(alice.address)).to.eq(1000);
        expect(await weth.balanceOf(bob.address)).to.eq(1000);
        expect(await testERC721.ownerOf(100)).to.eq(alice.address);

        await expect(mintedExchange.connect(alice).matchBidWithTakerAsk(takerAsk, signedMakerBid))
          .to.emit(mintedExchange, "TakerAsk")
          .withArgs(
            await hashMakerOrder(signedMakerBid),
            signedMakerBid.nonce,
            takerAsk.taker,
            signedMakerBid.signer,
            signedMakerBid.strategy,
            signedMakerBid.currency,
            signedMakerBid.collection,
            signedMakerBid.tokenId,
            signedMakerBid.amount,
            takerAsk.price
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
        const takerAsk = { ...validTakerAsk, tokenId: 1 }; // from msg.sender -- seller accepting offer
        const makerBid = {
          ...validMakerBid,
          tokenId: 1,
          collection: testERC1155.address,
          amount: 1000, // alice only have 100 copies
          price: 100,
        }; // buyer making an offer

        const signedMakerBid = await signMakerOrder(bob, mintedExchange.address, makerBid);
        await expect(
          mintedExchange.connect(alice).matchBidWithTakerAsk(takerAsk, signedMakerBid)
        ).to.revertedWith("ERC1155: insufficient balance for transfer");
      });

      it("should transfer erc-1155 nft from taker to maker, nft from maker to taker", async () => {
        const takerAsk = { ...validTakerAsk, tokenId: 1 }; // from msg.sender -- seller accepting offer
        const makerBid = {
          ...validMakerBid,
          tokenId: 1,
          collection: testERC1155.address,
          amount: 75,
          price: 100,
        }; // buyer making an offer
        const signedMakerBid = await signMakerOrder(bob, mintedExchange.address, makerBid);

        // Before
        expect(await weth.balanceOf(bob.address)).to.eq(1000);
        expect(await weth.balanceOf(alice.address)).to.eq(1000);
        expect(await testERC1155.balanceOf(alice.address, 1)).to.eq(100);

        await expect(mintedExchange.connect(alice).matchBidWithTakerAsk(takerAsk, signedMakerBid))
          .to.emit(mintedExchange, "TakerAsk")
          .withArgs(
            await hashMakerOrder(signedMakerBid),
            signedMakerBid.nonce,
            takerAsk.taker,
            signedMakerBid.signer,
            signedMakerBid.strategy,
            signedMakerBid.currency,
            signedMakerBid.collection,
            signedMakerBid.tokenId,
            signedMakerBid.amount,
            takerAsk.price
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
