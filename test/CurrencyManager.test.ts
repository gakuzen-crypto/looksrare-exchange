import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { Contract, Wallet } from "ethers";
import { ethers } from "hardhat";

// no types declaration found
const { snapshot } = require("@openzeppelin/test-helpers");

describe("CurrencyManager", function () {
  let owner: SignerWithAddress, alice: SignerWithAddress;
  let currencyManager: Contract;
  let testSnapshot: any;

  beforeEach(async () => {
    testSnapshot = await snapshot();

    [owner, alice] = await ethers.getSigners();

    const CurrencyManager = await ethers.getContractFactory("CurrencyManager");
    currencyManager = await CurrencyManager.deploy();
  });

  afterEach(async () => {
    // Restore to not affect tests after due to advance in time
    await testSnapshot.restore();
  });

  describe("addCurrency", () => {
    it("should add currency", async () => {
      const currencyAddress = Wallet.createRandom().address; // random  currency

      // Before
      expect(await currencyManager.viewCountWhitelistedCurrencies()).to.eq(0);
      expect(await currencyManager.isCurrencyWhitelisted(currencyAddress)).to.eq(false);

      await expect(currencyManager.addCurrency(currencyAddress))
        .to.emit(currencyManager, "CurrencyWhitelisted")
        .withArgs(currencyAddress);

      expect(await currencyManager.viewCountWhitelistedCurrencies()).to.eq(1);
      expect(await currencyManager.isCurrencyWhitelisted(currencyAddress)).to.eq(true);
    });

    it("should check if currency is already whitelisted", async () => {
      const currencyAddress = Wallet.createRandom().address; // random  currency
      await currencyManager.addCurrency(currencyAddress);

      await expect(currencyManager.addCurrency(currencyAddress)).to.revertedWith(
        "Currency: Already whitelisted"
      );
    });

    it("should only allow owner", async () => {
      const currencyAddress = Wallet.createRandom().address; // random  currency
      await expect(currencyManager.connect(alice).addCurrency(currencyAddress)).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });
  });

  describe("removeCurrency", () => {
    it("should remove currency", async () => {
      const currencyAddress = Wallet.createRandom().address; // random  currency

      // Before
      await currencyManager.addCurrency(currencyAddress);
      expect(await currencyManager.viewCountWhitelistedCurrencies()).to.eq(1);
      expect(await currencyManager.isCurrencyWhitelisted(currencyAddress)).to.eq(true);

      await expect(currencyManager.removeCurrency(currencyAddress))
        .to.emit(currencyManager, "CurrencyRemoved")
        .withArgs(currencyAddress);

      // After
      expect(await currencyManager.viewCountWhitelistedCurrencies()).to.eq(0);
      expect(await currencyManager.isCurrencyWhitelisted(currencyAddress)).to.eq(false);
    });

    it("should check if currency was whitelisted", async () => {
      const currencyAddress = Wallet.createRandom().address; // random  currency
      await expect(currencyManager.removeCurrency(currencyAddress)).to.revertedWith(
        "Currency: Not whitelisted"
      );
    });

    it("should only allow owner", async () => {
      const currencyAddress = Wallet.createRandom().address; // random  currency
      await expect(currencyManager.connect(alice).removeCurrency(currencyAddress)).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });
  });

  describe("viewWhitelistedCurrencies", () => {
    it("should return empty array when no whitelisted currency", async () => {
      const [currency, size] = await currencyManager.viewWhitelistedCurrencies(0, 100);
      expect(currency.length).to.eq(0);
      expect(size).to.eq(0);
    });

    it("should return result based on cursor and size", async () => {
      const currencyAddress1 = Wallet.createRandom().address; // random  currency
      const currencyAddress2 = Wallet.createRandom().address; // random  currency
      const currencyAddress3 = Wallet.createRandom().address; // random  currency
      const currencyAddress4 = Wallet.createRandom().address; // random  currency
      await currencyManager.addCurrency(currencyAddress1);
      await currencyManager.addCurrency(currencyAddress2);
      await currencyManager.addCurrency(currencyAddress3);
      await currencyManager.addCurrency(currencyAddress4);

      // Query only first 2 item
      const [currencyList1, size1] = await currencyManager.viewWhitelistedCurrencies(0, 2);
      expect(currencyList1).to.have.members([currencyAddress1, currencyAddress2]);
      expect(size1).to.eq(2);

      // Query size is total size
      const [currencyList2, size2] = await currencyManager.viewWhitelistedCurrencies(0, 100);
      expect(currencyList2).to.have.members([
        currencyAddress1,
        currencyAddress2,
        currencyAddress3,
        currencyAddress4,
      ]);
      expect(size2).to.eq(4);

      // Cursor skip first 2 items
      const [currencyList3, size3] = await currencyManager.viewWhitelistedCurrencies(2, 100);
      expect(currencyList3).to.have.members([currencyAddress3, currencyAddress4]);
      expect(size3).to.eq(4);
    });
  });
});
