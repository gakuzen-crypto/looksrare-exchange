import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { Contract, Wallet } from "ethers";
import { ethers } from "hardhat";

// no types declaration found
const { snapshot } = require("@openzeppelin/test-helpers");

describe("ExecutionManager", function () {
  let owner: SignerWithAddress, alice: SignerWithAddress;
  let executionManager: Contract;
  let testSnapshot: any;

  beforeEach(async () => {
    testSnapshot = await snapshot();

    [owner, alice] = await ethers.getSigners();

    const ExecutionManager = await ethers.getContractFactory("ExecutionManager");
    executionManager = await ExecutionManager.deploy();
  });

  afterEach(async () => {
    // Restore to not affect tests after due to advance in time
    await testSnapshot.restore();
  });

  describe("addStrategy", () => {
    it("should add strategy", async () => {
      const stratAddress = Wallet.createRandom().address; // random  currency

      // Before
      expect(await executionManager.viewCountWhitelistedStrategies()).to.eq(0);
      expect(await executionManager.isStrategyWhitelisted(stratAddress)).to.eq(false);

      await expect(executionManager.addStrategy(stratAddress))
        .to.emit(executionManager, "StrategyWhitelisted")
        .withArgs(stratAddress);

      expect(await executionManager.viewCountWhitelistedStrategies()).to.eq(1);
      expect(await executionManager.isStrategyWhitelisted(stratAddress)).to.eq(true);
    });

    it("should check if currency is already whitelisted", async () => {
      const stratAddress = Wallet.createRandom().address; // random  currency
      await executionManager.addStrategy(stratAddress);

      await expect(executionManager.addStrategy(stratAddress)).to.revertedWith(
        "Strategy: Already whitelisted"
      );
    });

    it("should only allow owner", async () => {
      const stratAddress = Wallet.createRandom().address; // random  currency
      await expect(executionManager.connect(alice).addStrategy(stratAddress)).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });
  });

  describe("removeStrategy", () => {
    it("should remove currency", async () => {
      const stratAddress = Wallet.createRandom().address; // random  currency

      // Before
      await executionManager.addStrategy(stratAddress);
      expect(await executionManager.viewCountWhitelistedStrategies()).to.eq(1);
      expect(await executionManager.isStrategyWhitelisted(stratAddress)).to.eq(true);

      await expect(executionManager.removeStrategy(stratAddress))
        .to.emit(executionManager, "StrategyRemoved")
        .withArgs(stratAddress);

      // After
      expect(await executionManager.viewCountWhitelistedStrategies()).to.eq(0);
      expect(await executionManager.isStrategyWhitelisted(stratAddress)).to.eq(false);
    });

    it("should check if currency was whitelisted", async () => {
      const stratAddress = Wallet.createRandom().address; // random  currency
      await expect(executionManager.removeStrategy(stratAddress)).to.revertedWith(
        "Strategy: Not whitelisted"
      );
    });

    it("should only allow owner", async () => {
      const stratAddress = Wallet.createRandom().address; // random  currency
      await expect(executionManager.connect(alice).removeStrategy(stratAddress)).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });
  });

  describe("viewWhitelistedStrategies", () => {
    it("should return empty array when no whitelisted currency", async () => {
      const [currency, size] = await executionManager.viewWhitelistedStrategies(0, 100);
      expect(currency.length).to.eq(0);
      expect(size).to.eq(0);
    });

    it("should return result based on cursor and size", async () => {
      const stratAddress1 = Wallet.createRandom().address; // random  currency
      const stratAddress2 = Wallet.createRandom().address; // random  currency
      const stratAddress3 = Wallet.createRandom().address; // random  currency
      const stratAddress4 = Wallet.createRandom().address; // random  currency
      await executionManager.addStrategy(stratAddress1);
      await executionManager.addStrategy(stratAddress2);
      await executionManager.addStrategy(stratAddress3);
      await executionManager.addStrategy(stratAddress4);

      // Query only first 2 item
      const [stratList1, size1] = await executionManager.viewWhitelistedStrategies(0, 2);
      expect(stratList1).to.have.members([stratAddress1, stratAddress2]);
      expect(size1).to.eq(2);

      // Query size is total size
      const [stratList2, size2] = await executionManager.viewWhitelistedStrategies(0, 100);
      expect(stratList2).to.have.members([stratAddress1, stratAddress2, stratAddress3, stratAddress4]);
      expect(size2).to.eq(4);

      // Cursor skip first 2 items
      const [stratList3, size3] = await executionManager.viewWhitelistedStrategies(2, 100);
      expect(stratList3).to.have.members([stratAddress3, stratAddress4]);
      expect(size3).to.eq(4);
    });
  });
});
