import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { Contract, Wallet } from "ethers";
import { ethers } from "hardhat";
import { generateTakerOrder, generateMakerOrder } from "../utils/OrderGenerator";
import { signMakerOrder } from "../utils/OrderSigner";

// no types declaration found
const { snapshot, time } = require("@openzeppelin/test-helpers");

describe("StrategyEnglishAuction", function () {
  let owner: SignerWithAddress, alice: SignerWithAddress, bob: SignerWithAddress;
  let strategyEnglishAuction: Contract;
  let testSnapshot: any;
  let testERC721: Contract, weth: Contract;

  beforeEach(async () => {
    testSnapshot = await snapshot();

    [owner, alice, bob] = await ethers.getSigners();

    const protocolFee = 400; // 400 = 4%
    const StrategyEnglishAuction = await ethers.getContractFactory("StrategyEnglishAuction");
    strategyEnglishAuction = await StrategyEnglishAuction.deploy(protocolFee);

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
    price?: number;
    tokenId?: number;
    startTime?: string;
    endTime?: string;
    reservePrice?: number;
    collectionAddr?: string;
    amount?: number;
  }) {
    const currentTimestamp = await time.latest();
    const startTime = params.startTime ? params.startTime : currentTimestamp.toString();
    const endTime = params.endTime ? params.endTime : currentTimestamp.add(time.duration.hours(1)).toString();

    return generateMakerOrder({
      ...params,
      startTime,
      endTime,
      isOrderAsk: true,
      stratAddr: strategyEnglishAuction.address,
      collectionAddr: params.collectionAddr || testERC721.address,
      currencyAddr: weth.address,
      paramType: params.reservePrice ? ["uint256"] : [],
      paramVal: params.reservePrice ? [params.reservePrice] : [],
    });
  }

  // seller accepting offer will call this
  // function checks whether seller can accept taker's ask
  describe("canExecuteTakerAsk", () => {
    const maker = Wallet.createRandom().address;
    const taker = Wallet.createRandom().address;

    it("should match if condition matches", async () => {
      const makerBid = await getMakerOrder({ maker });
      const signedMakerBid = await signMakerOrder(alice, Wallet.createRandom().address, makerBid);

      const takerAsk = getTakerOrder({ taker });

      // Verify
      const result = await strategyEnglishAuction.canExecuteTakerAsk(takerAsk, signedMakerBid);
      expect(result[0]).to.eq(true);
      expect(result[1]).to.eq(makerBid.tokenId);
      expect(result[2]).to.eq(makerBid.amount);
    });

    it("should not match if tokenId differs between makerBid and takerAsk", async () => {
      const makerBid = await getMakerOrder({ maker, tokenId: 1000 });
      const signedMakerBid = await signMakerOrder(alice, Wallet.createRandom().address, makerBid);

      const takerAsk = getTakerOrder({ taker });

      // Verify
      const result = await strategyEnglishAuction.canExecuteTakerAsk(takerAsk, signedMakerBid);
      expect(result[0]).to.eq(false);
    });

    it("should not match if price differs between makerBid and takerAsk", async () => {
      const makerBid = await getMakerOrder({ maker, price: 1000 });
      const signedMakerBid = await signMakerOrder(alice, Wallet.createRandom().address, makerBid);

      // seller/taker (msg.sender) then accept the offer
      const takerAsk = getTakerOrder({ taker });

      // Verify
      const result = await strategyEnglishAuction.canExecuteTakerAsk(takerAsk, signedMakerBid);
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
      const result = await strategyEnglishAuction.canExecuteTakerAsk(takerAsk, signedMakerBid);
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
      const result = await strategyEnglishAuction.canExecuteTakerAsk(takerAsk, signedMakerBid);
      expect(result[0]).to.eq(false);
    });
  });

  // buyer buying nft will call smart contract and this function be invoked
  // function checks whether taker's bid can be executed against maker's bid
  describe("canExecuteTakerBid", () => {
    it("should not match", async () => {
      // should always return false as this strategy is meant for
      // 1. seller submit maker order for his/her nft to be sold at auction
      // 2. buyer submit maker order as a bid
      // 3. Bakcend matches both maker order
      // or
      // 1. seller submit maker order for his/her nft to be sold at auction
      // 2. buyer submit maker order as a bid
      // 3. Seller submit takerAsk with buyer's maker order

      // seller/maker create the sell order first
      const maker = Wallet.createRandom().address;
      const currentTimestamp = await time.latest();
      const makerAsk = await getMakerOrder({
        maker,
        startTime: currentTimestamp.toString(),
        endTime: currentTimestamp.add(time.duration.hours(1)).toString(), // 1 hour later
      });
      const signedMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);

      // buyer/taker (msg.sender) then buy the NFT
      const taker = Wallet.createRandom().address;
      const takerBid = getTakerOrder({ taker });

      // Verify
      const result = await strategyEnglishAuction.canExecuteTakerBid(takerBid, signedMakerAsk);
      expect(result[0]).to.eq(false);
    });
  });

  describe("canExecuteMakerOrder", () => {
    it("should match if reserve price is not set", async () => {
      // the seller who created teh auction
      const ask = Wallet.createRandom().address;
      const makerAsk = await getMakerOrder({ maker: ask });
      const signedMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);

      // the buyer who bidded
      const bid = Wallet.createRandom().address;
      const makerBid = await getMakerOrder({ maker: bid });
      const signedMakerBid = await signMakerOrder(bob, Wallet.createRandom().address, makerBid);

      // Verify
      const result = await strategyEnglishAuction.canExecuteMakerOrder(signedMakerBid, signedMakerAsk);
      expect(result[0]).to.eq(true);
      expect(result[1]).to.eq(makerAsk.tokenId);
      expect(result[2]).to.eq(makerAsk.amount);
    });

    it("should match if makerBid price is equal to reserve price", async () => {
      // the seller who created the auction
      const ask = Wallet.createRandom().address;
      const makerAsk = await getMakerOrder({ maker: ask, reservePrice: 200 });
      const signedMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);

      // buyer bidded at reserve price
      const bid = Wallet.createRandom().address;
      const makerBid = await getMakerOrder({ maker: bid, price: 200 });
      const signedMakerBid = await signMakerOrder(bob, Wallet.createRandom().address, makerBid);

      // Verify
      const result = await strategyEnglishAuction.canExecuteMakerOrder(signedMakerBid, signedMakerAsk);
      expect(result[0]).to.eq(true);
      expect(result[1]).to.eq(makerAsk.tokenId);
      expect(result[2]).to.eq(makerAsk.amount);
    });

    it("should match if makerBid price is higher than reserve price", async () => {
      // the seller who created teh auction
      const ask = Wallet.createRandom().address;
      const makerAsk = await getMakerOrder({ maker: ask, reservePrice: 200 });
      const signedMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);

      // Buyer bidded at higher than reserve price
      const bid = Wallet.createRandom().address;
      const makerBid = await getMakerOrder({ maker: bid, price: 201 });
      const signedMakerBid = await signMakerOrder(bob, Wallet.createRandom().address, makerBid);

      // Verify
      const result = await strategyEnglishAuction.canExecuteMakerOrder(signedMakerBid, signedMakerAsk);
      expect(result[0]).to.eq(true);
    });

    it("should not match if collection is different", async () => {
      // the seller who created teh auction
      const ask = Wallet.createRandom().address;
      const makerAsk = await getMakerOrder({ maker: ask, collectionAddr: Wallet.createRandom().address });
      const signedMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);

      // Buyer bidded at higher than reserve price
      const bid = Wallet.createRandom().address;
      const makerBid = await getMakerOrder({ maker: bid });
      const signedMakerBid = await signMakerOrder(bob, Wallet.createRandom().address, makerBid);

      // Verify
      const result = await strategyEnglishAuction.canExecuteMakerOrder(signedMakerBid, signedMakerAsk);
      expect(result[0]).to.eq(false);
    });

    it("should not match if amount is different", async () => {
      // the seller who created teh auction
      const ask = Wallet.createRandom().address;
      const makerAsk = await getMakerOrder({ maker: ask, amount: 10 });
      const signedMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);

      // Buyer bidded at higher than reserve price
      const bid = Wallet.createRandom().address;
      const makerBid = await getMakerOrder({ maker: bid, amount: 4 });
      const signedMakerBid = await signMakerOrder(bob, Wallet.createRandom().address, makerBid);

      // Verify
      const result = await strategyEnglishAuction.canExecuteMakerOrder(signedMakerBid, signedMakerAsk);
      expect(result[0]).to.eq(false);
    });

    it("should not match if bid is below reserve price", async () => {
      // the seller who created teh auction
      const ask = Wallet.createRandom().address;
      const makerAsk = await getMakerOrder({ maker: ask, reservePrice: 200 });
      const signedMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);

      // Buyer bidded at higher than reserve price
      const bid = Wallet.createRandom().address;
      const makerBid = await getMakerOrder({ maker: bid, price: 199 });
      const signedMakerBid = await signMakerOrder(bob, Wallet.createRandom().address, makerBid);

      // Verify
      const result = await strategyEnglishAuction.canExecuteMakerOrder(signedMakerBid, signedMakerAsk);
      expect(result[0]).to.eq(false);
    });

    it("should not match if tokenId does not match between maker orders", async () => {
      // the seller who created teh auction
      const ask = Wallet.createRandom().address;
      const makerAsk = await getMakerOrder({ maker: ask, tokenId: 200 });
      const signedMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);

      // Buyer bidded at higher than reserve price
      const bid = Wallet.createRandom().address;
      const makerBid = await getMakerOrder({ maker: bid, tokenId: 100 });
      const signedMakerBid = await signMakerOrder(bob, Wallet.createRandom().address, makerBid);

      // Verify
      const result = await strategyEnglishAuction.canExecuteMakerOrder(signedMakerBid, signedMakerAsk);
      expect(result[0]).to.eq(false);
    });

    it("should not match if makerAsk.startTime has not started", async () => {
      const currentTimestamp = await time.latest();

      // the seller who created the auction, but to start 1 hour later
      const ask = Wallet.createRandom().address;
      const makerAsk = await getMakerOrder({
        maker: ask,
        startTime: currentTimestamp.add(time.duration.hours(1)).toString(), // start 1 hour later
        endTime: currentTimestamp.add(time.duration.hours(1)).toString(),
      });
      const signedMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);

      // Buyer bidded at higher than reserve price
      const bid = Wallet.createRandom().address;
      const makerBid = await getMakerOrder({
        maker: bid,
        startTime: currentTimestamp.toString(),
        endTime: currentTimestamp.add(time.duration.hours(1)).toString(),
      });
      const signedMakerBid = await signMakerOrder(bob, Wallet.createRandom().address, makerBid);

      // Verify
      const result = await strategyEnglishAuction.canExecuteMakerOrder(signedMakerBid, signedMakerAsk);
      expect(result[0]).to.eq(false);
    });

    it("should not match if makerAsk.endTime has already ended", async () => {
      const currentTimestamp = await time.latest();

      // the seller who created the auction, but to start 1 hour later
      const ask = Wallet.createRandom().address;
      const makerAsk = await getMakerOrder({
        maker: ask,
        startTime: currentTimestamp.toString(),
        endTime: currentTimestamp.sub(time.duration.hours(1)).toString(), // ended
      });
      const signedMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);

      // Buyer bidded at higher than reserve price
      const bid = Wallet.createRandom().address;
      const makerBid = await getMakerOrder({
        maker: bid,
        startTime: currentTimestamp.toString(),
        endTime: currentTimestamp.add(time.duration.hours(1)).toString(),
      });
      const signedMakerBid = await signMakerOrder(bob, Wallet.createRandom().address, makerBid);
      // Verify
      const result = await strategyEnglishAuction.canExecuteMakerOrder(signedMakerBid, signedMakerAsk);
      expect(result[0]).to.eq(false);
    });
  });
});
