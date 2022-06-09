import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { Contract, Wallet } from "ethers";
import { ethers } from "hardhat";
import { generateTakerOrder, generateMakerOrder } from "../utils/OrderGenerator";
import { signMakerOrder } from "../utils/OrderSigner";

// no types declaration found
const { snapshot, time } = require("@openzeppelin/test-helpers");

describe("StrategyPrivateSale", function () {
  let owner: SignerWithAddress, alice: SignerWithAddress, bob: SignerWithAddress;
  let strategyPrivateSale: Contract;
  let testSnapshot: any;
  let testERC721: Contract, weth: Contract;

  beforeEach(async () => {
    testSnapshot = await snapshot();

    [owner, alice, bob] = await ethers.getSigners();

    const protocolFee = 400; // 400 = 4%
    const StrategyPrivateSale = await ethers.getContractFactory("StrategyPrivateSale");
    strategyPrivateSale = await StrategyPrivateSale.deploy(protocolFee);

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
    targetBuyerAddr?: string;
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
      stratAddr: strategyPrivateSale.address,
      collectionAddr: params.collectionAddr || testERC721.address,
      currencyAddr: weth.address,
      paramType: params.targetBuyerAddr ? ["address"] : [],
      paramVal: params.targetBuyerAddr ? [params.targetBuyerAddr] : [],
    });
  }

  // seller accepting offer will call this
  // function checks whether seller can accept taker's ask
  describe("canExecuteTakerAsk", () => {
    it("should return (false, 0, 0) even if condition matches", async () => {
      // should always return false as this strategy is meant for:
      // 1. seller submit maker order for his/her nft to be sold to a particular buyer
      // 2. buyer submit taker order to buy the seller's nft

      // buyer/taker (msg.sender) then buy the NFT
      const taker = Wallet.createRandom().address;
      const takerBid = getTakerBid({ taker });

      // seller/maker create the sell order first
      const maker = Wallet.createRandom().address;
      const makerAsk = await getMakerOrder({ maker, targetBuyerAddr: taker });
      const signedMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);

      // Verify
      const result = await strategyPrivateSale.canExecuteTakerAsk(takerBid, signedMakerAsk);
      expect(result[0]).to.eq(false);
      expect(result[1]).to.eq(0);
      expect(result[2]).to.eq(0);
    });
  });

  // buyer buying nft will call smart contract and this function be invoked
  // function checks whether taker's bid can be executed against maker's bid
  describe("canExecuteTakerBid", () => {
    it("should match if condition matches", async () => {
      // buyer/taker (msg.sender) then buy the NFT
      const taker = Wallet.createRandom().address;
      const takerBid = getTakerBid({ taker });

      // seller/maker create the sell order first
      const maker = Wallet.createRandom().address;
      const makerAsk = await getMakerOrder({ maker, targetBuyerAddr: taker });
      const signedMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);

      // Verify
      const result = await strategyPrivateSale.canExecuteTakerBid(takerBid, signedMakerAsk);
      expect(result[0]).to.eq(true);
      expect(result[1]).to.eq(makerAsk.tokenId);
      expect(result[2]).to.eq(makerAsk.amount);
    });

    it("should not match if target buyer differs", async () => {
      // seller/maker create the sell order first
      const maker = Wallet.createRandom().address;
      const makerAsk = await getMakerOrder({
        maker,
        targetBuyerAddr: Wallet.createRandom().address, // another buyer
      });
      const signedMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);

      // buyer/taker (msg.sender) then buy the NFT
      const taker = Wallet.createRandom().address;
      const takerBid = getTakerBid({ taker });

      // Verify
      const result = await strategyPrivateSale.canExecuteTakerBid(takerBid, signedMakerAsk);
      expect(result[0]).to.eq(false);
    });

    it("should not match if maker and taker price differ", async () => {
      // buyer/taker (msg.sender) then buy the NFT
      const taker = Wallet.createRandom().address;
      const takerBid = getTakerBid({ taker, price: 1000 });

      // seller/maker create the sell order first
      const maker = Wallet.createRandom().address;
      const makerAsk = await getMakerOrder({ maker, targetBuyerAddr: taker, price: 2000 });
      const signedMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);

      // Verify
      const result = await strategyPrivateSale.canExecuteTakerBid(takerBid, signedMakerAsk);
      expect(result[0]).to.eq(false);
    });

    it("should not match if maker and taker tokenId differ", async () => {
      // buyer/taker (msg.sender) then buy the NFT
      const taker = Wallet.createRandom().address;
      const takerBid = getTakerBid({ taker, tokenId: 800 });

      // seller/maker create the sell order first
      const maker = Wallet.createRandom().address;
      const makerAsk = await getMakerOrder({ maker, targetBuyerAddr: taker, tokenId: 900 });
      const signedMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);

      // Verify
      const result = await strategyPrivateSale.canExecuteTakerBid(takerBid, signedMakerAsk);
      expect(result[0]).to.eq(false);
    });

    it("should not match if maker start time is after block timestamp", async () => {
      // buyer/taker (msg.sender) then buy the NFT
      const taker = Wallet.createRandom().address;
      const takerBid = getTakerBid({ taker });

      // seller/maker create the sell order first
      const maker = Wallet.createRandom().address;
      const currentTimestamp = await time.latest();
      const makerAsk = await getMakerOrder({
        maker,
        targetBuyerAddr: taker,
        startTime: currentTimestamp.add(time.duration.hours(1)).toString(), // 1 hour later
        endTime: currentTimestamp.add(time.duration.hours(1)).toString(), // 1 hour later
      });
      const signedMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);

      // Verify
      const result = await strategyPrivateSale.canExecuteTakerBid(takerBid, signedMakerAsk);
      expect(result[0]).to.eq(false);
    });

    it("should not match if maker end time is before block timestamp", async () => {
      // buyer/taker (msg.sender) then buy the NFT
      const taker = Wallet.createRandom().address;
      const takerBid = getTakerBid({ taker });

      // seller/maker create the sell order first
      const maker = Wallet.createRandom().address;
      const currentTimestamp = await time.latest();
      const makerAsk = await getMakerOrder({
        maker,
        targetBuyerAddr: taker,
        startTime: currentTimestamp.sub(time.duration.hours(2)).toString(), // 2 hour prior
        endTime: currentTimestamp.sub(time.duration.hours(1)).toString(), // 1 hour prior
      });
      const signedMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);

      // Verify
      const result = await strategyPrivateSale.canExecuteTakerBid(takerBid, signedMakerAsk);
      expect(result[0]).to.eq(false);
    });
  });

  describe("canExecuteMakerOrder", () => {
    const taker = Wallet.createRandom().address;
    const maker = Wallet.createRandom().address;

    it("should match if condition matches", async () => {
      // seller/maker create the sell order first
      const makerAsk = await getMakerOrder({ maker, targetBuyerAddr: taker });
      const signedMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);

      // buyer/taker (msg.sender) then buy the NFT
      const makerBid = await getMakerOrder({ maker: taker });
      const signedMakerBid = await signMakerOrder(bob, Wallet.createRandom().address, makerBid);

      // Verify
      const result = await strategyPrivateSale.canExecuteMakerOrder(signedMakerBid, signedMakerAsk);
      expect(result[0]).to.eq(true);
      expect(result[1]).to.eq(makerAsk.tokenId);
      expect(result[2]).to.eq(makerAsk.amount);
    });

    it("should check if makerBid.signer is makerAsk", async () => {
      // seller/maker create the sell order first
      const makerAsk = await getMakerOrder({
        maker,
        targetBuyerAddr: Wallet.createRandom().address, // makerAsk target another wallet
      });
      const signedMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);

      // buyer/taker (msg.sender) then buy the NFT
      const makerBid = await getMakerOrder({ maker: taker });
      const signedMakerBid = await signMakerOrder(bob, Wallet.createRandom().address, makerBid);

      // Verify
      const result = await strategyPrivateSale.canExecuteMakerOrder(signedMakerBid, signedMakerAsk);
      expect(result[0]).to.eq(false);
    });

    it("should check if collection address matches", async () => {
      // seller/maker create the sell order first
      const makerAsk = await getMakerOrder({ maker, targetBuyerAddr: taker });
      const signedMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);

      // buyer/taker (msg.sender) then buy the NFT
      const makerBid = await getMakerOrder({
        maker: taker,
        collectionAddr: Wallet.createRandom().address, // some other collection addresss
      });
      const signedMakerBid = await signMakerOrder(bob, Wallet.createRandom().address, makerBid);

      // Verify
      const result = await strategyPrivateSale.canExecuteMakerOrder(signedMakerBid, signedMakerAsk);
      expect(result[0]).to.eq(false);
    });

    it("should check if price matches", async () => {
      // seller/maker create the sell order first
      const makerAsk = await getMakerOrder({ maker, targetBuyerAddr: taker, price: 100 });
      const signedMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);

      // buyer/taker (msg.sender) then buy the NFT
      const makerBid = await getMakerOrder({ maker: taker, price: 200 });
      const signedMakerBid = await signMakerOrder(bob, Wallet.createRandom().address, makerBid);

      // Verify
      const result = await strategyPrivateSale.canExecuteMakerOrder(signedMakerBid, signedMakerAsk);
      expect(result[0]).to.eq(false);
    });

    it("should check if tokenId matches", async () => {
      // seller/maker create the sell order first
      const makerAsk = await getMakerOrder({ maker, targetBuyerAddr: taker, tokenId: 100 });
      const signedMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);

      // buyer/taker (msg.sender) then buy the NFT
      const makerBid = await getMakerOrder({ maker: taker, tokenId: 200 });
      const signedMakerBid = await signMakerOrder(bob, Wallet.createRandom().address, makerBid);

      // Verify
      const result = await strategyPrivateSale.canExecuteMakerOrder(signedMakerBid, signedMakerAsk);
      expect(result[0]).to.eq(false);
    });

    it("should check if amount matches", async () => {
      // seller/maker create the sell order first
      const makerAsk = await getMakerOrder({ maker, targetBuyerAddr: taker, amount: 100 });
      const signedMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, makerAsk);

      // buyer/taker (msg.sender) then buy the NFT
      const makerBid = await getMakerOrder({ maker: taker, amount: 1 });
      const signedMakerBid = await signMakerOrder(bob, Wallet.createRandom().address, makerBid);

      // Verify
      const result = await strategyPrivateSale.canExecuteMakerOrder(signedMakerBid, signedMakerAsk);
      expect(result[0]).to.eq(false);
    });

    it("should check if startTime is after block timestamp", async () => {
      // seller/maker create the sell order first
      const currentTimestamp = await time.latest();

      const validMakerAsk = await getMakerOrder({ maker, targetBuyerAddr: taker });
      const InvalidmakerAsk = await getMakerOrder({
        maker,
        targetBuyerAddr: taker,
        startTime: currentTimestamp.add(time.duration.hours(1)).toString(),
      });
      const signedValidMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, validMakerAsk);
      const signedInValidMakerAsk = await signMakerOrder(
        alice,
        Wallet.createRandom().address,
        InvalidmakerAsk
      );

      // buyer/taker (msg.sender) then buy the NFT
      const validMakerBid = await getMakerOrder({ maker: taker });
      const invalidMakerBid = await getMakerOrder({
        maker: taker,
        startTime: currentTimestamp.add(time.duration.hours(1)).toString(),
      });
      const signedValidMakerBid = await signMakerOrder(bob, Wallet.createRandom().address, validMakerBid);
      const signedInvalidMakerBid = await signMakerOrder(bob, Wallet.createRandom().address, invalidMakerBid);

      // Verify
      const result1 = await strategyPrivateSale.canExecuteMakerOrder(
        signedInvalidMakerBid,
        signedValidMakerAsk
      );
      expect(result1[0]).to.eq(false);

      const result2 = await strategyPrivateSale.canExecuteMakerOrder(
        signedValidMakerBid,
        signedInValidMakerAsk
      );
      expect(result2[0]).to.eq(false);
    });

    it("should check if endTime is before blockTimestamp", async () => {
      // seller/maker create the sell order first
      const currentTimestamp = await time.latest();

      const validMakerAsk = await getMakerOrder({ maker, targetBuyerAddr: taker });
      const InvalidmakerAsk = await getMakerOrder({
        maker,
        targetBuyerAddr: taker,
        endTime: currentTimestamp.sub(time.duration.hours(1)).toString(),
      });
      const signedValidMakerAsk = await signMakerOrder(alice, Wallet.createRandom().address, validMakerAsk);
      const signedInValidMakerAsk = await signMakerOrder(
        alice,
        Wallet.createRandom().address,
        InvalidmakerAsk
      );

      // buyer/taker (msg.sender) then buy the NFT
      const validMakerBid = await getMakerOrder({ maker: taker });
      const invalidMakerBid = await getMakerOrder({
        maker: taker,
        endTime: currentTimestamp.sub(time.duration.hours(1)).toString(),
      });
      const signedValidMakerBid = await signMakerOrder(bob, Wallet.createRandom().address, validMakerBid);
      const signedInvalidMakerBid = await signMakerOrder(bob, Wallet.createRandom().address, invalidMakerBid);

      // Verify
      const result1 = await strategyPrivateSale.canExecuteMakerOrder(
        signedInvalidMakerBid,
        signedValidMakerAsk
      );
      expect(result1[0]).to.eq(false);

      const result2 = await strategyPrivateSale.canExecuteMakerOrder(
        signedValidMakerBid,
        signedInValidMakerAsk
      );
      expect(result2[0]).to.eq(false);
    });
  });
});
