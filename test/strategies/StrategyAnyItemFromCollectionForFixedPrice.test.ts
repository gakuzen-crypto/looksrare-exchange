import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { Contract, Wallet } from "ethers";
import { ethers } from "hardhat";
import { generateTakerOrder, generateMakerOrder } from "../utils/OrderGenerator";
import { signMakerOrder } from "../utils/OrderSigner";

// no types declaration found
const { snapshot, time } = require("@openzeppelin/test-helpers");

describe("StrategyAnyItemFromCollectionForFixedPrice", function () {
  let owner: SignerWithAddress, alice: SignerWithAddress, bob: SignerWithAddress;
  let strategyAnyItemFromCollectionForFixedPrice: Contract;
  let testSnapshot: any;
  let testERC721: Contract, weth: Contract;

  beforeEach(async () => {
    testSnapshot = await snapshot();

    [owner, alice, bob] = await ethers.getSigners();

    const protocolFee = 400; // 400 = 4%
    const StrategyAnyItemFromCollectionForFixedPrice = await ethers.getContractFactory(
      "StrategyAnyItemFromCollectionForFixedPrice"
    );
    strategyAnyItemFromCollectionForFixedPrice = await StrategyAnyItemFromCollectionForFixedPrice.deploy(
      protocolFee
    );

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

  function getMakerOrder(params: {
    maker: string;
    price?: number;
    tokenId?: number;
    startTime: string;
    endTime: string;
  }) {
    return generateMakerOrder({
      ...params,
      isOrderAsk: true,
      stratAddr: strategyAnyItemFromCollectionForFixedPrice.address,
      collectionAddr: testERC721.address,
      currencyAddr: weth.address,
    });
  }

  // seller accepting bid or offer will call smart contract and this function be invoked
  // function checks whether seller can accept taker's ask
  describe("canExecuteTakerAsk", () => {
    it("should match even if tokenID difers", async () => {
      // maker/buyer making an offer for any nft in this collection
      const maker = Wallet.createRandom().address;
      const currentTimestamp = await time.latest();
      const makerBid = getMakerOrder({
        maker,
        tokenId: 900,
        startTime: currentTimestamp.toString(),
        endTime: currentTimestamp.add(time.duration.hours(1)).toString(), // 1 hour later
      });
      const signedMakerBid = await signMakerOrder(alice, Wallet.createRandom().address, makerBid);

      // taker/seller (msg.sender) then accept the offer/bid
      const taker = Wallet.createRandom().address;
      const takerAsk = getTakerBid({ taker, tokenId: 100 });

      // Verify
      const result = await strategyAnyItemFromCollectionForFixedPrice.canExecuteTakerAsk(
        takerAsk,
        signedMakerBid
      );
      expect(result[0]).to.eq(true);
      expect(result[1]).to.eq(takerAsk.tokenId);
      expect(result[2]).to.eq(makerBid.amount);
    });

    it("should not match if maker and taker price differ", async () => {
      // maker/buyer making an offer for any nft in this collection
      const maker = Wallet.createRandom().address;
      const currentTimestamp = await time.latest();
      const makerBid = getMakerOrder({
        maker,
        price: 1000,
        startTime: currentTimestamp.toString(),
        endTime: currentTimestamp.add(time.duration.hours(1)).toString(), // 1 hour later
      });
      const signedMakerBid = await signMakerOrder(alice, Wallet.createRandom().address, makerBid);

      // taker/seller (msg.sender) then accept the offer/bid
      const taker = Wallet.createRandom().address;
      const takerAsk = getTakerBid({ taker, price: 500 });

      // Verify
      const result = await strategyAnyItemFromCollectionForFixedPrice.canExecuteTakerAsk(
        takerAsk,
        signedMakerBid
      );
      expect(result[0]).to.eq(false);
    });

    it("should not match if maker start time is after block timestamp", async () => {
      // maker/buyer making an offer for any nft in this collection
      const maker = Wallet.createRandom().address;
      const currentTimestamp = await time.latest();
      const makerBid = getMakerOrder({
        maker,
        startTime: currentTimestamp.add(time.duration.hours(1)).toString(), // 1 hour later
        endTime: currentTimestamp.add(time.duration.hours(2)).toString(), //21 hour later
      });
      const signedMakerBid = await signMakerOrder(alice, Wallet.createRandom().address, makerBid);

      // taker/seller (msg.sender) then accept the offer/bid
      const taker = Wallet.createRandom().address;
      const takerAsk = getTakerBid({ taker });

      // Verify
      const result = await strategyAnyItemFromCollectionForFixedPrice.canExecuteTakerAsk(
        takerAsk,
        signedMakerBid
      );
      expect(result[0]).to.eq(false);
    });

    it("should not match if maker end time is before block timestamp", async () => {
      // maker/buyer making an offer for any nft in this collection
      const maker = Wallet.createRandom().address;
      const currentTimestamp = await time.latest();
      const makerBid = getMakerOrder({
        maker,
        startTime: currentTimestamp.sub(time.duration.hours(2)).toString(), // 2 hour prior
        endTime: currentTimestamp.sub(time.duration.hours(1)).toString(), // 1 hour prior
      });
      const signedMakerBid = await signMakerOrder(alice, Wallet.createRandom().address, makerBid);

      // taker/seller (msg.sender) then accept the offer/bid
      const taker = Wallet.createRandom().address;
      const takerAsk = getTakerBid({ taker });

      // Verify
      const result = await strategyAnyItemFromCollectionForFixedPrice.canExecuteTakerAsk(
        takerAsk,
        signedMakerBid
      );
      expect(result[0]).to.eq(false);
    });
  });

  // buyer buying nft will call smart contract and this function be invoked
  // function checks whether taker's bid can be executed against maker's bid
  describe("canExecuteTakerBid", () => {
    it("should return (false, 0, 0) even if condition matches", async () => {
      // should always return false as this strategy is not meant for buyer as the taker
      // it is meant
      // 1. buyer submit maker bid for all collection in nft
      // 2. seller submit taker ask to sell his nft

      // buyer/taker (msg.sender) then buy the NFT
      const taker = Wallet.createRandom().address;
      const takerBid = getTakerBid({ taker });

      // seller/maker create the sell order first
      const maker = Wallet.createRandom().address;
      const currentTimestamp = await time.latest();
      const makerAsk = getMakerOrder({
        maker,
        startTime: currentTimestamp.toString(),
        endTime: currentTimestamp.add(time.duration.hours(1)).toString(), // 1 hour later
      });
      const signedMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);

      // Verify
      const result = await strategyAnyItemFromCollectionForFixedPrice.canExecuteTakerBid(
        takerBid,
        signedMakerAsk
      );
      expect(result[0]).to.eq(false);
      expect(result[1]).to.eq(0);
      expect(result[2]).to.eq(0);
    });
  });

  describe("canExecuteMakerOrder", () => {
    it("should return (false, 0, 0) even if condition matches", async () => {
      const currentTimestamp = await time.latest();

      // Seller create an order
      const makerAsk = getMakerOrder({
        maker: Wallet.createRandom().address,
        startTime: currentTimestamp.toString(),
        endTime: currentTimestamp.add(time.duration.hours(1)).toString(), // 1 hour later
      });
      const signedMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);

      const makerBid = getMakerOrder({
        maker: Wallet.createRandom().address,
        startTime: currentTimestamp.toString(),
        endTime: currentTimestamp.add(time.duration.hours(1)).toString(), // 1 hour later
      });
      const signedMakerBid = await signMakerOrder(bob, Wallet.createRandom().address, makerAsk);

      // Verify
      const result = await strategyAnyItemFromCollectionForFixedPrice.canExecuteMakerOrder(
        signedMakerBid,
        signedMakerAsk
      );

      expect(result[0]).to.eq(false);
      expect(result[1]).to.eq(0);
      expect(result[2]).to.eq(0);
    });
  });
});
