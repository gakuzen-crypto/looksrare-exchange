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

describe("MintedExchange - matchAskWithTakerBid", function () {
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

  // TODO: buyer calling nft with call this
  describe("matchAskWithTakerBid", async () => {
    let validTakerBid: any, validMakerAsk: any;
    beforeEach(async () => {
      const currentTimestamp = await time.latest();
      validTakerBid = generateTakerOrder({ taker: alice.address, isOrderAsk: false, tokenId: 100 });
      validMakerAsk = generateMakerOrder({
        isOrderAsk: true,
        maker: bob.address,
        startTime: currentTimestamp.toString(),
        endTime: currentTimestamp.add(time.duration.hours(1)).toString(), // 1 hour later
        stratAddr: fixedPriceStrat.address,
        collectionAddr: testERC721.address,
        currencyAddr: weth.address,
        tokenId: 100,
      });
    });

    it("should validate makerAsk.isOrderAsk and !takerBid.isOrderAsk", async () => {
      for (const pair of [
        [true, true], // taker.isOrderAsk = true, makerAsk.isOrderAsk = true
        [false, false], // taker.isOrderAsk = false, makerAsk.isOrderAsk = false
      ]) {
        const takerBid = { ...validTakerBid, isOrderAsk: pair[0] };
        const makerAsk = { ...validMakerAsk, isOrderAsk: pair[1] };
        const signedMakerAsk = await signMakerOrder(bob, mintedExchange.address, makerAsk);

        await expect(mintedExchange.matchAskWithTakerBid(takerBid, signedMakerAsk)).to.revertedWith(
          "Order: Wrong sides"
        );
      }
    });

    it("should validate msg.sender is takerBid.taker", async () => {
      const takerBid = { ...validTakerBid };
      const makerAsk = { ...validMakerAsk, maker: bob.address };
      const signedMakerAsk = await signMakerOrder(bob, mintedExchange.address, makerAsk);

      // Not submitted by bob
      await expect(mintedExchange.matchAskWithTakerBid(takerBid, signedMakerAsk)).to.revertedWith(
        "Order: Taker must be the sender"
      );
    });

    it("should validate maker order - check if signer is set", async () => {
      const takerBid = { ...validTakerBid };
      const makerAsk = { ...validMakerAsk, signer: ethers.constants.AddressZero };
      const signedMakerAsk = await signMakerOrder(bob, mintedExchange.address, makerAsk);

      await expect(
        mintedExchange.connect(alice).matchAskWithTakerBid(takerBid, signedMakerAsk)
      ).to.revertedWith("Order: Invalid signer");
    });

    it("should validate maker order - check if order amount > 0", async () => {
      const takerBid = { ...validTakerBid };
      const makerAsk = { ...validMakerAsk, amount: 0 };
      const signedMakerAsk = await signMakerOrder(bob, mintedExchange.address, makerAsk);

      await expect(
        mintedExchange.connect(alice).matchAskWithTakerBid(takerBid, signedMakerAsk)
      ).to.revertedWith("Order: Amount cannot be 0");
    });

    it("should validate maker order - check if signature is valid", async () => {
      const takerBid = { ...validTakerBid };
      const makerAsk = { ...validMakerAsk };

      // Randomr r,s,v value
      const signedMakerAsk = {
        ...makerAsk,
        r: defaultAbiCoder.encode(["bytes32"], [formatBytes32String("random string")]),
        s: defaultAbiCoder.encode(["bytes32"], [formatBytes32String("random string")]),
        v: 28,
      };
      await expect(
        mintedExchange.connect(alice).matchAskWithTakerBid(takerBid, signedMakerAsk)
      ).to.revertedWith("Signature: Invalid");

      // alice sign but maker order is bob
      const aliceSignedMakerAsk = await signMakerOrder(alice, mintedExchange.address, makerAsk);
      await expect(
        mintedExchange.connect(alice).matchAskWithTakerBid(takerBid, aliceSignedMakerAsk)
      ).to.revertedWith("Signature: Invalid");
    });

    it("should validate maker order - whitelisted strategy", async () => {
      const takerBid = { ...validTakerBid };
      const makerAsk = { ...validMakerAsk, strategy: Wallet.createRandom().address };
      const signedMakerAsk = await signMakerOrder(bob, mintedExchange.address, makerAsk);

      await expect(
        mintedExchange.connect(alice).matchAskWithTakerBid(takerBid, signedMakerAsk)
      ).to.revertedWith("Strategy: Not whitelisted");
    });

    it("should reject transaction if strategy cannot execute taker bid", async () => {
      const takerBid = { ...validTakerBid, price: 100 };
      const makerAsk = { ...validMakerAsk, price: 200 };
      const signedMakerAsk = await signMakerOrder(bob, mintedExchange.address, makerAsk);

      await expect(
        mintedExchange.connect(alice).matchAskWithTakerBid(takerBid, signedMakerAsk)
      ).to.revertedWith("Strategy: Execution invalid");
    });

    describe("erc-721 nft", () => {
      beforeEach(async () => {
        // Pre-req: mint erc-721 to maker - tokenId 100
        await testERC721.mint(bob.address, 100);
        await testERC721.connect(bob).setApprovalForAll(transferManagerERC721.address, true);
      });

      it("should transfer erc-721 nft from taker to maker, nft from maker to taker", async () => {
        const takerBid = { ...validTakerBid };
        const makerAsk = { ...validMakerAsk };
        const signedMakerAsk = await signMakerOrder(bob, mintedExchange.address, makerAsk);

        // Before
        expect(await weth.balanceOf(bob.address)).to.eq(1000);
        expect(await weth.balanceOf(alice.address)).to.eq(1000);
        expect(await testERC721.ownerOf(100)).to.eq(bob.address);

        await expect(mintedExchange.connect(alice).matchAskWithTakerBid(takerBid, signedMakerAsk))
          .to.emit(mintedExchange, "TakerBid")
          .withArgs(
            await hashMakerOrder(makerAsk),
            makerAsk.nonce,
            takerBid.taker,
            makerAsk.signer,
            makerAsk.strategy,
            makerAsk.currency,
            makerAsk.collection,
            makerAsk.tokenId,
            makerAsk.amount,
            takerBid.price
          );

        // After, bob sold nft to alice for 100
        expect(await weth.balanceOf(bob.address)).to.eq(1096);
        expect(await weth.balanceOf(alice.address)).to.eq(900);
        expect(await testERC721.ownerOf(100)).to.eq(alice.address);
      });

      it("should transfer erc-721 with royalty from taker to maker, nft from maker to taker", async () => {
        await testERC721Royalty.mint(bob.address, 100);
        await testERC721Royalty.connect(bob).setApprovalForAll(transferManagerERC721.address, true);

        const takerBid = { ...validTakerBid };
        const makerAsk = { ...validMakerAsk, collection: testERC721Royalty.address };
        const signedMakerAsk = await signMakerOrder(bob, mintedExchange.address, makerAsk);

        // Before
        expect(await weth.balanceOf(owner.address)).to.eq("1000000000000000000"); // owner of the royalty nft
        expect(await weth.balanceOf(bob.address)).to.eq(1000);
        expect(await weth.balanceOf(alice.address)).to.eq(1000);
        expect(await testERC721.ownerOf(100)).to.eq(bob.address);

        await expect(mintedExchange.connect(alice).matchAskWithTakerBid(takerBid, signedMakerAsk))
          .to.emit(mintedExchange, "TakerBid")
          .withArgs(
            await hashMakerOrder(makerAsk),
            makerAsk.nonce,
            takerBid.taker,
            makerAsk.signer,
            makerAsk.strategy,
            makerAsk.currency,
            makerAsk.collection,
            makerAsk.tokenId,
            makerAsk.amount,
            takerBid.price
          );

        // After, bob sold nft to alice for 100
        expect(await weth.balanceOf(owner.address)).to.eq("1000000000000000002");
        expect(await weth.balanceOf(bob.address)).to.eq(1094);
        expect(await weth.balanceOf(alice.address)).to.eq(900);
        expect(await testERC721Royalty.ownerOf(100)).to.eq(alice.address);
      });

      it("should fail if user has cancelled order", async () => {
        const takerBid = { ...validTakerBid };
        const makerAsk = { ...validMakerAsk };
        const signedMakerAsk = await signMakerOrder(bob, mintedExchange.address, makerAsk);

        await mintedExchange.connect(bob).cancelAllOrdersForSender(100);

        await expect(
          mintedExchange.connect(alice).matchAskWithTakerBid(takerBid, signedMakerAsk)
        ).to.revertedWith("Order: Matching order expired");
      });

      it("should fail if maker no longer have the erc-721", async () => {
        const takerBid = { ...validTakerBid };
        const makerAsk = { ...validMakerAsk };
        const signedMakerAsk = await signMakerOrder(bob, mintedExchange.address, makerAsk);

        // bob transfer tokenId: 100 nft away to someone else
        testERC721.connect(bob).transferFrom(bob.address, owner.address, 100);

        await expect(
          mintedExchange.connect(alice).matchAskWithTakerBid(takerBid, signedMakerAsk)
        ).to.revertedWith("ERC721: transfer caller is not owner nor approved");
      });
    });

    describe("erc-1155 nft", () => {
      // let takerBid: any, makerAsk: any;
      beforeEach(async () => {
        // Pre-req: mint erc-1155 with id: 1 and 100 copies to maker
        await testERC1155.mint(bob.address, 1, 100);
        await testERC1155.connect(bob).setApprovalForAll(transferManagerERC1155.address, true);
      });

      it("should fail if maker do not have the amount of erc-1155 quantity", async () => {
        // Bob only have 100 copy of NFT
        const takerBid = { ...validTakerBid, tokenId: 1 };
        const makerAsk = { ...validMakerAsk, amount: 10000, tokenId: 1, collection: testERC1155.address };
        const signedMakerAsk = await signMakerOrder(bob, mintedExchange.address, makerAsk);
        await expect(
          mintedExchange.connect(alice).matchAskWithTakerBid(takerBid, signedMakerAsk)
        ).to.revertedWith("ERC1155: insufficient balance for transfer");
      });

      it("should transfer erc-1155 nft from taker to maker, nft from maker to taker", async () => {
        // Before
        expect(await weth.balanceOf(bob.address)).to.eq(1000);
        expect(await weth.balanceOf(alice.address)).to.eq(1000);
        expect(await testERC1155.balanceOf(bob.address, 1)).to.eq(100);

        // Bob selling 75 copies
        const takerBid = { ...validTakerBid, tokenId: 1 };
        const makerAsk = { ...validMakerAsk, tokenId: 1, amount: 75, collection: testERC1155.address };
        const signedMakerAsk = await signMakerOrder(bob, mintedExchange.address, makerAsk);
        await expect(mintedExchange.connect(alice).matchAskWithTakerBid(takerBid, signedMakerAsk))
          .to.emit(mintedExchange, "TakerBid")
          .withArgs(
            await hashMakerOrder(makerAsk),
            makerAsk.nonce,
            takerBid.taker,
            makerAsk.signer,
            makerAsk.strategy,
            makerAsk.currency,
            makerAsk.collection,
            makerAsk.tokenId,
            makerAsk.amount,
            takerBid.price
          );

        // After, bob sold nft to alice for 100
        expect(await weth.balanceOf(bob.address)).to.eq(1096);
        expect(await weth.balanceOf(alice.address)).to.eq(900);
        expect(await testERC1155.balanceOf(alice.address, 1)).to.eq(75);
        expect(await testERC1155.balanceOf(bob.address, 1)).to.eq(25);
      });
    });
  });
});
