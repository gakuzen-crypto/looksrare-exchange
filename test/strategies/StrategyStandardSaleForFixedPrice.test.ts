import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { Contract, Wallet } from "ethers";
import { ethers } from "hardhat";
import { generateTakerOrder, generateMakerOrder } from "../utils/OrderGenerator";
import { signMakerOrder } from "../utils/OrderSigner";

// no types declaration found
const { snapshot, time } = require("@openzeppelin/test-helpers");

describe("StrategyStandardSaleForFixedPrice", function () {
  let owner: SignerWithAddress, alice: SignerWithAddress, bob: SignerWithAddress;
  let strategyStandardSaleForFixedPrice: Contract;
  let testSnapshot: any;
  let testERC721: Contract, weth: Contract;

  beforeEach(async () => {
    testSnapshot = await snapshot();

    [owner, alice, bob] = await ethers.getSigners();

    const protocolFee = 400; // 400 = 4%
    const StrategyStandardSaleForFixedPrice = await ethers.getContractFactory(
      "StrategyStandardSaleForFixedPrice"
    );
    strategyStandardSaleForFixedPrice = await StrategyStandardSaleForFixedPrice.deploy(protocolFee);

    const TestERC721 = await ethers.getContractFactory("TestERC721");
    testERC721 = await TestERC721.deploy();

    const WETH = await ethers.getContractFactory("TestERC20");
    weth = await WETH.deploy("Wrapped Ether", "WETH", ethers.constants.WeiPerEther);
  });

  afterEach(async () => {
    // Restore to not affect tests after due to advance in time
    await testSnapshot.restore();
  });

  function getTakerBid(params: { taker: string; price?: number; tokenId?: number }) {
    return generateTakerOrder({ ...params, paramType: [], paramVal: [] });
  }

  async function getMakerOrder(params: {
    maker: string;
    price?: number;
    tokenId?: number;
    startTime?: string;
    endTime?: string;
    collectionAddr?: string;
  }) {
    const currentTimestamp = await time.latest();
    const startTime = params.startTime ? params.startTime : currentTimestamp.toString();
    const endTime = params.endTime ? params.endTime : currentTimestamp.add(time.duration.hours(1)).toString();

    return generateMakerOrder({
      ...params,
      startTime,
      endTime,
      isOrderAsk: true,
      stratAddr: strategyStandardSaleForFixedPrice.address,
      collectionAddr: params.collectionAddr || testERC721.address,
      currencyAddr: weth.address,
    });
  }

  // seller accepting offer will call this
  // function checks whether seller can accept taker's ask
  describe("canExecuteTakerAsk", () => {
    it("should match if condition matches", async () => {
      // maker/buyer making an offer/bid
      const maker = Wallet.createRandom().address;
      const makerBid = await getMakerOrder({ maker });
      const signedMakerBid = await signMakerOrder(alice, Wallet.createRandom().address, makerBid);

      // taker/seller (msg.sender) then accept the offer/bid
      const taker = Wallet.createRandom().address;
      const takerAsk = getTakerBid({ taker });

      // Verify
      const result = await strategyStandardSaleForFixedPrice.canExecuteTakerAsk(takerAsk, signedMakerBid);
      expect(result[0]).to.eq(true);
      expect(result[1]).to.eq(makerBid.tokenId);
      expect(result[2]).to.eq(makerBid.amount);
    });

    it("should not match if maker and taker price differ", async () => {
      // maker/buyer making an offer/bid
      const maker = Wallet.createRandom().address;
      const makerBid = await getMakerOrder({ maker, price: 1000 });
      const signedMakerBid = await signMakerOrder(alice, Wallet.createRandom().address, makerBid);

      // taker/seller (msg.sender) then accept the offer/bid
      const taker = Wallet.createRandom().address;
      const takerAsk = getTakerBid({ taker, price: 500 });

      // Verify
      const result = await strategyStandardSaleForFixedPrice.canExecuteTakerAsk(takerAsk, signedMakerBid);
      expect(result[0]).to.eq(false);
    });

    it("should not match if maker and taker tokenId differ", async () => {
      // maker/buyer making an offer/bid
      const maker = Wallet.createRandom().address;
      const makerBid = await getMakerOrder({ maker, tokenId: 1000 });
      const signedMakerBid = await signMakerOrder(alice, Wallet.createRandom().address, makerBid);

      // taker/seller (msg.sender) then accept the offer/bid
      const taker = Wallet.createRandom().address;
      const takerAsk = getTakerBid({ taker, tokenId: 500 });

      // Verify
      const result = await strategyStandardSaleForFixedPrice.canExecuteTakerAsk(takerAsk, signedMakerBid);
      expect(result[0]).to.eq(false);
    });

    it("should not match if maker start time is after block timestamp", async () => {
      // maker/buyer making an offer/bid
      const maker = Wallet.createRandom().address;
      const currentTimestamp = await time.latest();
      const makerBid = await getMakerOrder({
        maker,
        startTime: currentTimestamp.add(time.duration.hours(1)).toString(), // 1 hour later
        endTime: currentTimestamp.add(time.duration.hours(2)).toString(), //21 hour later
      });
      const signedMakerBid = await signMakerOrder(alice, Wallet.createRandom().address, makerBid);

      // taker/seller (msg.sender) then accept the offer/bid
      const taker = Wallet.createRandom().address;
      const takerAsk = getTakerBid({ taker });

      // Verify
      const result = await strategyStandardSaleForFixedPrice.canExecuteTakerAsk(takerAsk, signedMakerBid);
      expect(result[0]).to.eq(false);
    });

    it("should not match if maker end time is before block timestamp", async () => {
      // maker/buyer making an offer/bid
      const maker = Wallet.createRandom().address;
      const currentTimestamp = await time.latest();
      const makerBid = await getMakerOrder({
        maker,
        startTime: currentTimestamp.sub(time.duration.hours(2)).toString(), // 2 hour prior
        endTime: currentTimestamp.sub(time.duration.hours(1)).toString(), // 1 hour prior
      });
      const signedMakerBid = await signMakerOrder(alice, Wallet.createRandom().address, makerBid);

      // taker/seller (msg.sender) then accept the offer/bid
      const taker = Wallet.createRandom().address;
      const takerAsk = getTakerBid({ taker });

      // Verify
      const result = await strategyStandardSaleForFixedPrice.canExecuteTakerAsk(takerAsk, signedMakerBid);
      expect(result[0]).to.eq(false);
    });
  });

  // buyer buying nft will call smart contract and this function be invoked
  // function checks whether taker's bid can be executed against maker's bid
  describe("canExecuteTakerBid", () => {
    it("should match if condition matches", async () => {
      // seller/maker create the sell order first
      const maker = Wallet.createRandom().address;
      const makerAsk = await getMakerOrder({ maker });
      const signedMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);

      // buyer/taker (msg.sender) then buy the NFT
      const taker = Wallet.createRandom().address;
      const takerBid = getTakerBid({ taker });

      // Verify
      const result = await strategyStandardSaleForFixedPrice.canExecuteTakerBid(takerBid, signedMakerAsk);
      expect(result[0]).to.eq(true);
      expect(result[1]).to.eq(makerAsk.tokenId);
      expect(result[2]).to.eq(makerAsk.amount);
    });

    it("should not match if maker and taker price differ", async () => {
      // seller/maker create the sell order first
      const maker = Wallet.createRandom().address;
      const makerAsk = await getMakerOrder({ maker, price: 2000 });
      const signedMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);

      // buyer/taker (msg.sender) then buy the NFT
      const taker = Wallet.createRandom().address;
      const takerBid = getTakerBid({ taker, price: 1000 });

      // Verify
      const result = await strategyStandardSaleForFixedPrice.canExecuteTakerBid(takerBid, signedMakerAsk);
      expect(result[0]).to.eq(false);
    });

    it("should not match if maker and taker tokenId differ", async () => {
      // seller/maker create the sell order first
      const maker = Wallet.createRandom().address;
      const makerAsk = await getMakerOrder({ maker, tokenId: 900 });
      const signedMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);

      // buyer/taker (msg.sender) then buy the NFT
      const taker = Wallet.createRandom().address;
      const takerBid = getTakerBid({ taker, tokenId: 800 });

      // Verify
      const result = await strategyStandardSaleForFixedPrice.canExecuteTakerBid(takerBid, signedMakerAsk);
      expect(result[0]).to.eq(false);
    });

    it("should not match if maker start time is after block timestamp", async () => {
      // seller/maker create the sell order first
      const maker = Wallet.createRandom().address;
      const currentTimestamp = await time.latest();
      const makerAsk = await getMakerOrder({
        maker,
        startTime: currentTimestamp.add(time.duration.hours(1)).toString(), // 1 hour later
        endTime: currentTimestamp.add(time.duration.hours(1)).toString(), // 1 hour later
      });
      const signedMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);

      // buyer/taker (msg.sender) then buy the NFT
      const taker = Wallet.createRandom().address;
      const takerBid = getTakerBid({ taker });

      // Verify
      const result = await strategyStandardSaleForFixedPrice.canExecuteTakerBid(takerBid, signedMakerAsk);
      expect(result[0]).to.eq(false);
    });

    it("should not match if maker end time is before block timestamp", async () => {
      // seller/maker create the sell order first
      const maker = Wallet.createRandom().address;
      const currentTimestamp = await time.latest();
      const makerAsk = await getMakerOrder({
        maker,
        startTime: currentTimestamp.sub(time.duration.hours(2)).toString(), // 2 hour prior
        endTime: currentTimestamp.sub(time.duration.hours(1)).toString(), // 1 hour prior
      });
      const signedMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);

      // buyer/taker (msg.sender) then buy the NFT
      const taker = Wallet.createRandom().address;
      const takerBid = getTakerBid({ taker });

      // Verify
      const result = await strategyStandardSaleForFixedPrice.canExecuteTakerBid(takerBid, signedMakerAsk);
      expect(result[0]).to.eq(false);
    });
  });

  describe("canExecuteTakerBid", () => {
    const maker = Wallet.createRandom().address;
    const taker = Wallet.createRandom().address;

    it("should match if condition matches", async () => {
      const makerAsk = await getMakerOrder({ maker });
      const sMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);

      const makerBid = await getMakerOrder({ maker: taker });
      const sMakerBid = await signMakerOrder(bob, Wallet.createRandom().address, makerBid);

      // Verify
      const result = await strategyStandardSaleForFixedPrice.canExecuteMakerOrder(sMakerBid, sMakerAsk);
      expect(result[0]).to.eq(true);
      expect(result[1]).to.eq(makerAsk.tokenId);
      expect(result[2]).to.eq(makerAsk.amount);
    });

    it("should check if price matches", async () => {
      const makerAsk = await getMakerOrder({ maker, price: 200 });
      const sMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);

      const makerBid = await getMakerOrder({ maker: taker, price: 100 });
      const sMakerBid = await signMakerOrder(bob, Wallet.createRandom().address, makerBid);

      // Verify
      const result = await strategyStandardSaleForFixedPrice.canExecuteMakerOrder(sMakerBid, sMakerAsk);
      expect(result[0]).to.eq(false);
    });

    it("should check if collection matches", async () => {
      const makerAsk = await getMakerOrder({ maker, collectionAddr: Wallet.createRandom().address });
      const sMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);

      const makerBid = await getMakerOrder({ maker: taker });
      const sMakerBid = await signMakerOrder(bob, Wallet.createRandom().address, makerBid);

      // Verify
      const result = await strategyStandardSaleForFixedPrice.canExecuteMakerOrder(sMakerBid, sMakerAsk);
      expect(result[0]).to.eq(false);
    });

    it("should check if tokenId matches", async () => {
      const makerAsk = await getMakerOrder({ maker, tokenId: 10 });
      const sMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);

      const makerBid = await getMakerOrder({ maker: taker, tokenId: 11 });
      const sMakerBid = await signMakerOrder(bob, Wallet.createRandom().address, makerBid);

      // Verify
      const result = await strategyStandardSaleForFixedPrice.canExecuteMakerOrder(sMakerBid, sMakerAsk);
      expect(result[0]).to.eq(false);
    });

    it("should check if startTime is before block timestamp", async () => {
      const currentTimestamp = await time.latest();

      const makerAsk = await getMakerOrder({ maker, tokenId: 10 });
      const invalidMakerAsk = await getMakerOrder({
        maker,
        tokenId: 10,
        startTime: currentTimestamp.add(time.duration.hours(1)).toString(),
      });
      const sValidMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);
      const sInvalidMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, invalidMakerAsk);

      const makerBid = await getMakerOrder({ maker: taker });
      const invalidMakerBid = await getMakerOrder({
        maker: taker,
        startTime: currentTimestamp.add(time.duration.hours(1)).toString(),
      });
      const sValidMakerBid = await signMakerOrder(bob, Wallet.createRandom().address, makerBid);
      const sInalidMakerBid = await signMakerOrder(bob, Wallet.createRandom().address, invalidMakerBid);

      // Verify
      const result1 = await strategyStandardSaleForFixedPrice.canExecuteMakerOrder(
        sValidMakerBid,
        sInvalidMakerAsk
      );
      expect(result1[0]).to.eq(false);

      const result2 = await strategyStandardSaleForFixedPrice.canExecuteMakerOrder(
        sInalidMakerBid,
        sValidMakerAsk
      );
      expect(result2[0]).to.eq(false);
    });

    it("should check if endTime is before block timestamp", async () => {
      const currentTimestamp = await time.latest();

      const makerAsk = await getMakerOrder({ maker, tokenId: 10 });
      const invalidMakerAsk = await getMakerOrder({
        maker,
        tokenId: 10,
        endTime: currentTimestamp.sub(time.duration.hours(1)).toString(),
      });
      const sValidMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);
      const sInvalidMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, invalidMakerAsk);

      const makerBid = await getMakerOrder({ maker: taker });
      const invalidMakerBid = await getMakerOrder({
        maker: taker,
        endTime: currentTimestamp.sub(time.duration.hours(1)).toString(),
      });
      const sValidMakerBid = await signMakerOrder(bob, Wallet.createRandom().address, makerBid);
      const sInalidMakerBid = await signMakerOrder(bob, Wallet.createRandom().address, invalidMakerBid);

      // Verify
      const result1 = await strategyStandardSaleForFixedPrice.canExecuteMakerOrder(
        sValidMakerBid,
        sInvalidMakerAsk
      );
      expect(result1[0]).to.eq(false);

      const result2 = await strategyStandardSaleForFixedPrice.canExecuteMakerOrder(
        sInalidMakerBid,
        sValidMakerAsk
      );
      expect(result2[0]).to.eq(false);
    });
  });
});
