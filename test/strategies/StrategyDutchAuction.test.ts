import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { Contract, Wallet } from "ethers";
import { ethers } from "hardhat";
import {
  generateTakerOrder,
  generateMakerOrder,
  PRICE as DEFAULT_ENDING_PRICE,
} from "../utils/OrderGenerator";
import { signMakerOrder } from "../utils/OrderSigner";

// no types declaration found
const { snapshot, time } = require("@openzeppelin/test-helpers");

describe("StrategyDutchAuction", function () {
  let owner: SignerWithAddress, alice: SignerWithAddress, bob: SignerWithAddress;
  let strategyDutchAuction: Contract;
  let testSnapshot: any;
  let testERC721: Contract, weth: Contract;
  let minAuctionLengthInSecs: any;

  beforeEach(async () => {
    testSnapshot = await snapshot();

    [owner, alice, bob] = await ethers.getSigners();

    const protocolFee = 400; // 400 = 4%
    minAuctionLengthInSecs = 3600; // 3600 = 1 hour
    const StrategyDutchAuction = await ethers.getContractFactory("StrategyDutchAuction");
    strategyDutchAuction = await StrategyDutchAuction.deploy(protocolFee, minAuctionLengthInSecs);

    const TestERC721 = await ethers.getContractFactory("TestERC721");
    testERC721 = await TestERC721.deploy();

    const WETH = await ethers.getContractFactory("TestERC20");
    weth = await WETH.deploy("Wrapped Ether", "WETH", ethers.constants.WeiPerEther);
  });

  afterEach(async () => {
    // Restore to not affect tests after due to advance in time
    await testSnapshot.restore();
  });

  function getTakerOrder(params: { taker: string; price?: number; tokenId?: number }) {
    return generateTakerOrder({ ...params, paramType: [], paramVal: [] });
  }

  async function getMakerOrder(params: {
    maker: string;
    price?: number; // dutch auction ending price
    tokenId?: number;
    startTime?: string;
    endTime?: string;
    startPrice?: number;
    auctionEndTime?: string;
    collectionAddr?: string;
    amount?: number;
  }) {
    const currentTimestamp = await time.latest();
    const startTime = params.startTime ? params.startTime : currentTimestamp.toString();
    const endTime = params.endTime ? params.endTime : currentTimestamp.add(time.duration.hours(1)).toString();

    if ((params.auctionEndTime && !params.startPrice) || (!params.auctionEndTime && params.startPrice)) {
      throw new Error("both fields must be true or false");
    }

    return generateMakerOrder({
      ...params,
      startTime,
      price: params.price || 100,
      endTime,
      isOrderAsk: true,
      stratAddr: strategyDutchAuction.address,
      collectionAddr: params.collectionAddr || testERC721.address,
      currencyAddr: weth.address,
      paramType: params.startPrice ? ["uint256", "uint256"] : [],
      paramVal: params.startPrice ? [params.startPrice, params.auctionEndTime] : [],
    });
  }

  describe("canExecuteTakerAsk", () => {
    const maker = Wallet.createRandom().address;
    const taker = Wallet.createRandom().address;

    it("should match if condition matches", async () => {
      const makerBid = await getMakerOrder({ maker, price: 100 });
      const signedMakerBid = await signMakerOrder(alice, Wallet.createRandom().address, makerBid);

      const takerAsk = getTakerOrder({ taker });

      // Verify
      const result = await strategyDutchAuction.canExecuteTakerAsk(takerAsk, signedMakerBid);
      expect(result[0]).to.eq(true);
      expect(result[1]).to.eq(makerBid.tokenId);
      expect(result[2]).to.eq(makerBid.amount);
    });

    it("should not match if tokenId differs between makerBid and takerAsk", async () => {
      const makerBid = await getMakerOrder({ maker, tokenId: 1000 });
      const signedMakerBid = await signMakerOrder(alice, Wallet.createRandom().address, makerBid);

      const takerAsk = getTakerOrder({ taker });

      // Verify
      const result = await strategyDutchAuction.canExecuteTakerAsk(takerAsk, signedMakerBid);
      expect(result[0]).to.eq(false);
    });

    it("should not match if price differs between makerBid and takerAsk", async () => {
      const makerBid = await getMakerOrder({ maker, price: 1000 });
      const signedMakerBid = await signMakerOrder(alice, Wallet.createRandom().address, makerBid);

      // seller/taker (msg.sender) then accept the offer
      const takerAsk = getTakerOrder({ taker });

      // Verify
      const result = await strategyDutchAuction.canExecuteTakerAsk(takerAsk, signedMakerBid);
      expect(result[0]).to.eq(false);
    });

    it("should not match if makerBid.startTime has not started", async () => {
      const currentTimestamp = await time.latest();

      const makerBid = await getMakerOrder({
        maker,
        startTime: currentTimestamp.add(time.duration.hours(1)).toString(),
      });
      const signedMakerBid = await signMakerOrder(alice, Wallet.createRandom().address, makerBid);

      const takerAsk = getTakerOrder({ taker });

      // Verify
      const result = await strategyDutchAuction.canExecuteTakerAsk(takerAsk, signedMakerBid);
      expect(result[0]).to.eq(false);
    });

    it("should not match if makerBid.endTime has already ended", async () => {
      // buyer/maker creating a bid/offer
      const currentTimestamp = await time.latest();
      const makerBid = await getMakerOrder({
        maker,
        startTime: currentTimestamp.toString(),
        endTime: currentTimestamp.sub(time.duration.days(1)).toString(), // 1 day earlier
      });
      const signedMakerBid = await signMakerOrder(alice, Wallet.createRandom().address, makerBid);

      // seller/taker (msg.sender) then accept the offer
      const takerAsk = getTakerOrder({ taker });

      // Verify
      const result = await strategyDutchAuction.canExecuteTakerAsk(takerAsk, signedMakerBid);
      expect(result[0]).to.eq(false);
    });
  });

  describe("canExecuteTakerBid", () => {
    const maker = Wallet.createRandom().address;
    const taker = Wallet.createRandom().address;

    it("should match if bid price is equal to startPrice", async () => {
      const currentTimestamp = await time.latest();
      const endTime = currentTimestamp.add(time.duration.hours(1));

      const takerBid = getTakerOrder({ taker, price: 200 });
      const makerAsk = await getMakerOrder({
        maker,
        startPrice: 200,
        startTime: currentTimestamp.toString(),
        auctionEndTime: endTime.toString(),
      });
      const signedMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);

      // Verify
      const result = await strategyDutchAuction.canExecuteTakerBid(takerBid, signedMakerAsk);
      expect(result[0]).to.eq(true);
      expect(result[1]).to.eq(makerAsk.tokenId);
      expect(result[2]).to.eq(makerAsk.amount);
    });

    describe("should validate bidPrice with auctionPrice", () => {
      let startTime: any, makerAsk: any, signedMakerAsk: any;

      beforeEach(async () => {
        const currentTimestamp = await time.latest();
        startTime = currentTimestamp.add(time.duration.hours(1));

        makerAsk = await getMakerOrder({
          maker,
          startTime: startTime.toString(),
          startPrice: 300,
          price: 100, // ending price
          endTime: startTime.add(time.duration.hours(24)).toString(), // 1 day later
          auctionEndTime: startTime.add(time.duration.hours(24)).toString(),
        });
        signedMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);
      });

      it("should pass when bidPrice = auctionPrice", async () => {
        const takerBid = getTakerOrder({ taker, price: 200 }); // auctionPrice is 200 at this point
        await time.increaseTo(startTime.add(time.duration.hours(12))); // mid point

        const result = await strategyDutchAuction.canExecuteTakerBid(takerBid, signedMakerAsk);
        expect(result[0]).to.eq(true);
        expect(result[1]).to.eq(makerAsk.tokenId);
        expect(result[2]).to.eq(makerAsk.amount);
      });

      it("should pass when bidPrice > auctionPrice", async () => {
        const takerBid = getTakerOrder({ taker, price: 201 }); // auctionPrice is 200 at this point
        await time.increaseTo(startTime.add(time.duration.hours(12))); // mid point

        const result = await strategyDutchAuction.canExecuteTakerBid(takerBid, signedMakerAsk);
        expect(result[0]).to.eq(true);
      });

      it("should not match when bidPrice < auctionPrice", async () => {
        const takerBid = getTakerOrder({ taker, price: 199 }); // auctionPrice is 200 at this point
        await time.increaseTo(startTime.add(time.duration.hours(12))); // mid point

        const result = await strategyDutchAuction.canExecuteTakerBid(takerBid, signedMakerAsk);
        expect(result[0]).to.eq(false);
      });
    });

    it("should not match when auctionEndTime is less than buffer required", async () => {
      const currentTimestamp = await time.latest();

      const takerBid = getTakerOrder({ taker, price: 100 });
      const makerAsk = await getMakerOrder({
        maker,
        startPrice: 100,
        startTime: currentTimestamp.toString(),
        auctionEndTime: currentTimestamp.add(time.duration.minutes(1)).toString(),
      });
      const signedMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);

      await expect(strategyDutchAuction.canExecuteTakerBid(takerBid, signedMakerAsk)).to.revertedWith(
        "Dutch Auction: Length must be longer"
      );
    });

    it("should not match when startPrice is less than endPrice", async () => {
      const currentTimestamp = await time.latest();
      const takerBid = getTakerOrder({ taker, price: 100 });
      const makerAsk = await getMakerOrder({
        maker,
        startPrice: 100,
        price: 150, // ending price
        startTime: currentTimestamp.toString(),
        auctionEndTime: currentTimestamp.add(time.duration.hours(1)).toString(),
      });
      const signedMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);

      await expect(strategyDutchAuction.canExecuteTakerBid(takerBid, signedMakerAsk)).to.revertedWith(
        "Dutch Auction: Start price must be greater than end price"
      );
    });

    it("should not match if tokenId does not match", async () => {
      const currentTimestamp = await time.latest();

      const takerBid = getTakerOrder({ taker, tokenId: 100 });
      const makerAsk = await getMakerOrder({
        maker,
        tokenId: 200,
        startPrice: DEFAULT_ENDING_PRICE + 100,
        auctionEndTime: currentTimestamp.add(time.duration.hours(1)).toString(),
      });
      const signedMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);

      const result = await strategyDutchAuction.canExecuteTakerBid(takerBid, signedMakerAsk);
      expect(result[0]).to.eq(false);
    });

    it("should not match if makerAsk.startTime has not started", async () => {
      const currentTimestamp = await time.latest();

      const takerBid = getTakerOrder({ taker });
      const makerAsk = await getMakerOrder({
        maker,
        startTime: currentTimestamp.add(time.duration.hours(1)).toString(),
        startPrice: DEFAULT_ENDING_PRICE + 100,
        endTime: currentTimestamp.add(time.duration.days(1)).toString(),
        auctionEndTime: currentTimestamp.add(time.duration.days(1)).toString(),
      });
      const signedMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);

      // reverted as this computation (block.timestamp - auctionStartTime) result in negative
      await expect(strategyDutchAuction.canExecuteTakerBid(takerBid, signedMakerAsk)).to.be.reverted;
    });

    it("should not match if makerAsk.endTime has already ended", async () => {
      const currentTimestamp = await time.latest();

      const takerBid = getTakerOrder({ taker });
      const makerAsk = await getMakerOrder({
        maker,
        endTime: currentTimestamp.sub(time.duration.hours(1)).toString(),
        startPrice: DEFAULT_ENDING_PRICE + 100,
        auctionEndTime: currentTimestamp.add(time.duration.hours(1)).toString(),
      });
      const signedMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);

      const result = await strategyDutchAuction.canExecuteTakerBid(takerBid, signedMakerAsk);
      expect(result[0]).to.eq(false);
    });
  });

  describe("canExecuteMakerOrder", () => {
    const maker = Wallet.createRandom().address;
    const taker = Wallet.createRandom().address;

    it("should match if bid price is equal to startPrice", async () => {
      const currentTimestamp = await time.latest();

      const makerBid = await getMakerOrder({ maker: taker, price: 200 });
      const signedMakerBid = await signMakerOrder(alice, Wallet.createRandom().address, makerBid);

      const makerAsk = await getMakerOrder({
        maker,
        startPrice: 200,
        price: 100, // end price
        auctionEndTime: currentTimestamp.add(time.duration.hours(1)).toString(),
      });
      const signedMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);

      // Verify
      const result = await strategyDutchAuction.canExecuteMakerOrder(signedMakerBid, signedMakerAsk);
      expect(result[0]).to.eq(true);
      expect(result[1]).to.eq(makerAsk.tokenId);
      expect(result[2]).to.eq(makerAsk.amount);
    });

    describe("should validate bidPrice with auctionPrice", () => {
      let startTime: any, endTime: any, makerAsk: any, signedMakerAsk: any;

      beforeEach(async () => {
        const currentTimestamp = await time.latest();
        startTime = currentTimestamp.add(time.duration.hours(1));
        endTime = startTime.add(time.duration.hours(24));

        makerAsk = await getMakerOrder({
          maker,
          startTime: startTime.toString(),
          startPrice: 300,
          price: 100, // ending price
          endTime: endTime.toString(), // 1 day later
          auctionEndTime: endTime.toString(),
        });
        signedMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);
      });

      it("should pass when bidPrice = auctionPrice", async () => {
        const makerBid = await getMakerOrder({ maker: taker, price: 200, endTime: endTime.toString() });
        const signedMakerBid = await signMakerOrder(alice, Wallet.createRandom().address, makerBid);

        await time.increaseTo(startTime.add(time.duration.hours(12))); // mid point

        const result = await strategyDutchAuction.canExecuteMakerOrder(signedMakerBid, signedMakerAsk);
        expect(result[0]).to.eq(true);
        expect(result[1]).to.eq(makerAsk.tokenId);
        expect(result[2]).to.eq(makerAsk.amount);
      });

      it("should pass when bidPrice > auctionPrice", async () => {
        const makerBid = await getMakerOrder({ maker: taker, price: 201, endTime: endTime.toString() });
        const signedMakerBid = await signMakerOrder(alice, Wallet.createRandom().address, makerBid);

        await time.increaseTo(startTime.add(time.duration.hours(12))); // mid point

        const result = await strategyDutchAuction.canExecuteMakerOrder(signedMakerBid, signedMakerAsk);
        expect(result[0]).to.eq(true);
      });

      it("should not match when bidPrice < auctionPrice", async () => {
        const makerBid = await getMakerOrder({ maker: taker, price: 199, endTime: endTime.toString() });
        const signedMakerBid = await signMakerOrder(alice, Wallet.createRandom().address, makerBid);

        await time.increaseTo(startTime.add(time.duration.hours(12))); // mid point

        const result = await strategyDutchAuction.canExecuteMakerOrder(signedMakerBid, signedMakerAsk);
        expect(result[0]).to.eq(false);
      });
    });

    it("should not match if auction endTime ends too early", async () => {
      const currentTimestamp = await time.latest();

      const makerBid = await getMakerOrder({ maker: taker, price: 200 });
      const signedMakerBid = await signMakerOrder(alice, Wallet.createRandom().address, makerBid);

      const makerAsk = await getMakerOrder({
        maker,
        startPrice: 200,
        price: 100, // end price
        auctionEndTime: currentTimestamp.add(time.duration.minutes(1)).toString(), // min 15 minutes
      });
      const signedMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);

      await expect(strategyDutchAuction.canExecuteMakerOrder(signedMakerBid, signedMakerAsk)).to.revertedWith(
        "Dutch Auction: Length must be longer"
      );
    });

    it("should not match if start price is less than endPrice", async () => {
      const currentTimestamp = await time.latest();

      const makerBid = await getMakerOrder({ maker: taker, price: 200 });
      const signedMakerBid = await signMakerOrder(alice, Wallet.createRandom().address, makerBid);

      const makerAsk = await getMakerOrder({
        maker,
        startPrice: 100,
        price: 100, // end price
        auctionEndTime: currentTimestamp.add(time.duration.days(1)).toString(),
      });
      const signedMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);

      await expect(strategyDutchAuction.canExecuteMakerOrder(signedMakerBid, signedMakerAsk)).to.revertedWith(
        "Dutch Auction: Start price must be greater than end price"
      );
    });

    it("should not match if collection between maker order does not match", async () => {
      const currentTimestamp = await time.latest();

      const makerBid = await getMakerOrder({ maker: taker, collectionAddr: Wallet.createRandom().address });
      const signedMakerBid = await signMakerOrder(alice, Wallet.createRandom().address, makerBid);

      const makerAsk = await getMakerOrder({
        maker,
        collectionAddr: Wallet.createRandom().address,
        startPrice: 200,
        auctionEndTime: currentTimestamp.add(time.duration.days(1)).toString(),
      });
      const signedMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);

      const result = await strategyDutchAuction.canExecuteMakerOrder(signedMakerBid, signedMakerAsk);
      expect(result[0]).to.eq(false);
    });

    it("should not match if tokenId between maker order does not match", async () => {
      const currentTimestamp = await time.latest();

      const makerBid = await getMakerOrder({ maker: taker, tokenId: 100 });
      const signedMakerBid = await signMakerOrder(alice, Wallet.createRandom().address, makerBid);

      const makerAsk = await getMakerOrder({
        maker,
        tokenId: 200,
        startPrice: 200,
        auctionEndTime: currentTimestamp.add(time.duration.days(1)).toString(),
      });
      const signedMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);

      const result = await strategyDutchAuction.canExecuteMakerOrder(signedMakerBid, signedMakerAsk);
      expect(result[0]).to.eq(false);
    });

    describe("should not match if start time has not started", () => {
      let currentTimestamp: any;

      this.beforeEach(async () => {
        currentTimestamp = await time.latest();
      });

      it("when makerBid.startTime has not started", async () => {
        const makerBid = await getMakerOrder({
          maker: taker,
          startTime: currentTimestamp.add(time.duration.minutes(1)).toString(),
        });
        const signedMakerBid = await signMakerOrder(alice, Wallet.createRandom().address, makerBid);

        const makerAsk = await getMakerOrder({
          maker,
          startPrice: 300,
          auctionEndTime: currentTimestamp.add(time.duration.days(1)).toString(),
        });
        const signedMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);

        const result = await strategyDutchAuction.canExecuteMakerOrder(signedMakerBid, signedMakerAsk);
        expect(result[0]).to.eq(false);
      });

      it("when makerAsk.startTime has not started", async () => {
        const makerBid = await getMakerOrder({ maker: taker });
        const signedMakerBid = await signMakerOrder(alice, Wallet.createRandom().address, makerBid);

        const makerAsk = await getMakerOrder({
          maker,
          startTime: currentTimestamp.add(time.duration.minutes(1)).toString(),
          startPrice: 300,
          auctionEndTime: currentTimestamp.add(time.duration.days(1)).toString(),
        });
        const signedMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);

        // reverted as this computation (block.timestamp - auctionStartTime) result in negative
        await expect(strategyDutchAuction.canExecuteMakerOrder(signedMakerBid, signedMakerAsk)).to.be
          .reverted;
      });
    });

    describe("should not match if endTime has ended", () => {
      let currentTimestamp: any;

      this.beforeEach(async () => {
        currentTimestamp = await time.latest();
      });

      it("when makerBid.endTime has ended", async () => {
        const makerBid = await getMakerOrder({
          maker: taker,
          endTime: currentTimestamp.sub(time.duration.minutes(1)).toString(),
        });
        const signedMakerBid = await signMakerOrder(alice, Wallet.createRandom().address, makerBid);

        const makerAsk = await getMakerOrder({
          maker,
          startPrice: 300,
          auctionEndTime: currentTimestamp.add(time.duration.days(1)).toString(),
        });
        const signedMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);

        const result = await strategyDutchAuction.canExecuteMakerOrder(signedMakerBid, signedMakerAsk);
        expect(result[0]).to.eq(false);
      });

      it("when makerAsk.endTime has ended", async () => {
        const makerBid = await getMakerOrder({ maker: taker });
        const signedMakerBid = await signMakerOrder(alice, Wallet.createRandom().address, makerBid);

        const makerAsk = await getMakerOrder({
          maker,
          startPrice: 300,
          endTime: currentTimestamp.sub(time.duration.minutes(1)).toString(),
          auctionEndTime: currentTimestamp.add(time.duration.days(1)).toString(),
        });
        const signedMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);

        const result = await strategyDutchAuction.canExecuteMakerOrder(signedMakerBid, signedMakerAsk);
        expect(result[0]).to.eq(false);
      });
    });
  });

  describe("updateMinimumAuctionLength", () => {
    it("should update minimumAuctionLengthInSeconds", async () => {
      const minimumAuctionLengthInSeconds = await strategyDutchAuction.minimumAuctionLengthInSeconds();
      expect(minimumAuctionLengthInSeconds).to.eq(minAuctionLengthInSecs);

      await expect(strategyDutchAuction.updateMinimumAuctionLength(86400))
        .to.emit(strategyDutchAuction, "NewMinimumAuctionLengthInSeconds")
        .withArgs(86400);

      expect(await strategyDutchAuction.minimumAuctionLengthInSeconds()).to.eq(86400);
    });

    it("should check _minimumAuctionLengthInSeconds >= 15 minutes", async () => {
      await expect(strategyDutchAuction.updateMinimumAuctionLength(100)).to.revertedWith(
        "Owner: Auction length must be >= 15 minutes"
      );
    });
  });
});
