import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { Contract, Wallet } from "ethers";
import { ethers } from "hardhat";

// no types declaration found
const { snapshot, time } = require("@openzeppelin/test-helpers");

/**
 * For any test around the below, pls see tests/mintedExchange
 * - matchAskWithTakerBidUsingETHAndWETH
 * - matchAskWithTakerBid
 * - matchBidWithTakerAsk
 */

describe("MintedExchange", () => {
  let owner: SignerWithAddress, alice: SignerWithAddress, bob: SignerWithAddress;
  let mintedExchange: Contract, fixedPriceStrat: Contract;
  let transferManagerERC721: Contract, transferManagerERC1155: Contract;
  let testSnapshot: any;
  let testERC721: Contract, testERC1155: Contract, weth: Contract;
  let feeRecipient: string, protocolFee: number;

  const ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000";

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
    const royalyFeeLimit = 9500; // LooksRare set 9500 as limit
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

  describe("cancelAllOrdersForSender", () => {
    it("should update userMinNonce", async () => {
      await expect(mintedExchange.connect(alice).cancelAllOrdersForSender(100))
        .to.emit(mintedExchange, "CancelAllOrders")
        .withArgs(alice.address, 100);

      expect(await mintedExchange.userMinOrderNonce(alice.address)).to.eq(100);
    });

    it("should check max cancel nonce less than 500000 increment", async () => {
      await expect(mintedExchange.cancelAllOrdersForSender(500000)).to.revertedWith(
        "Cancel: Cannot cancel more orders"
      );
    });

    it("should not be able to cancel previously cancelled nonce", async () => {
      await mintedExchange.cancelAllOrdersForSender(100);

      await expect(mintedExchange.cancelAllOrdersForSender(100)).to.revertedWith(
        "Cancel: Order nonce lower than current"
      );
    });
  });

  describe("cancelMultipleMakerOrders", () => {
    it("should cancel nonce", async () => {
      await expect(mintedExchange.connect(alice).cancelMultipleMakerOrders([1, 3, 5]))
        .to.emit(mintedExchange, "CancelMultipleOrders")
        .withArgs(alice.address, [1, 3, 5]);

      expect(await mintedExchange.isUserOrderNonceExecutedOrCancelled(alice.address, 1)).to.eq(true);
      expect(await mintedExchange.isUserOrderNonceExecutedOrCancelled(alice.address, 3)).to.eq(true);
      expect(await mintedExchange.isUserOrderNonceExecutedOrCancelled(alice.address, 5)).to.eq(true);
    });

    it("should check array not empty", async () => {
      await expect(mintedExchange.cancelMultipleMakerOrders([])).to.revertedWith("Cancel: Cannot be empty");
    });

    it("should not be able to cancel previously cancelled nonce", async () => {
      // set min nonce as 100
      await mintedExchange.cancelAllOrdersForSender(100);

      // cancel below min nonce
      await expect(mintedExchange.cancelMultipleMakerOrders([80])).to.revertedWith(
        "Cancel: Order nonce lower than current"
      );
    });
  });

  describe("updateCurrencyManager", () => {
    const newManager = Wallet.createRandom().address;

    it("should update currency manager", async () => {
      await expect(mintedExchange.updateCurrencyManager(newManager))
        .to.emit(mintedExchange, "NewCurrencyManager")
        .withArgs(newManager);

      expect(await mintedExchange.currencyManager()).to.eq(newManager);
    });

    it("should check new currency manager is not address(0)", async () => {
      await expect(mintedExchange.updateCurrencyManager(ethers.constants.AddressZero)).to.revertedWith(
        "Owner: Cannot be null address"
      );
    });

    it("should only allow admin", async () => {
      await expect(mintedExchange.connect(alice).updateCurrencyManager(newManager)).to.revertedWith(
        `AccessControl: account ${alice.address.toLowerCase()} is missing role ${ADMIN_ROLE}`
      );
    });
  });

  describe("updateExecutionManager", () => {
    const newManager = Wallet.createRandom().address;

    it("should update execution manager", async () => {
      await expect(mintedExchange.updateExecutionManager(newManager))
        .to.emit(mintedExchange, "NewExecutionManager")
        .withArgs(newManager);

      expect(await mintedExchange.executionManager()).to.eq(newManager);
    });

    it("should check new execution manager is not address(0)", async () => {
      await expect(mintedExchange.updateExecutionManager(ethers.constants.AddressZero)).to.revertedWith(
        "Owner: Cannot be null address"
      );
    });

    it("should only allow admin", async () => {
      await expect(mintedExchange.connect(alice).updateExecutionManager(newManager)).to.revertedWith(
        `AccessControl: account ${alice.address.toLowerCase()} is missing role ${ADMIN_ROLE}`
      );
    });
  });

  describe("updateProtocolFeeRecipient", () => {
    const newRecipient = Wallet.createRandom().address;

    it("should update protocol fee recipient", async () => {
      await expect(mintedExchange.updateProtocolFeeRecipient(newRecipient))
        .to.emit(mintedExchange, "NewProtocolFeeRecipient")
        .withArgs(newRecipient);

      expect(await mintedExchange.protocolFeeRecipient()).to.eq(newRecipient);
    });

    it("should only allow admin", async () => {
      await expect(mintedExchange.connect(alice).updateProtocolFeeRecipient(newRecipient)).to.revertedWith(
        `AccessControl: account ${alice.address.toLowerCase()} is missing role ${ADMIN_ROLE}`
      );
    });
  });

  describe("updateRoyaltyFeeManager", () => {
    it("should update royalty fee manager", async () => {
      const newManager = Wallet.createRandom().address;
      await expect(mintedExchange.updateRoyaltyFeeManager(newManager))
        .to.emit(mintedExchange, "NewRoyaltyFeeManager")
        .withArgs(newManager);

      expect(await mintedExchange.royaltyFeeManager()).to.eq(newManager);
    });

    it("should check new royalty fee is not address(0)", async () => {
      await expect(mintedExchange.updateRoyaltyFeeManager(ethers.constants.AddressZero)).to.revertedWith(
        "Owner: Cannot be null address"
      );
    });

    it("should only allow admin", async () => {
      await expect(
        mintedExchange.connect(alice).updateRoyaltyFeeManager(ethers.constants.AddressZero)
      ).to.revertedWith(
        `AccessControl: account ${alice.address.toLowerCase()} is missing role ${ADMIN_ROLE}`
      );
    });
  });

  describe("updateTransferSelectorNFT", () => {
    const newTransferSelectorNFT = Wallet.createRandom().address;

    it("should update transfer selector nft", async () => {
      await expect(mintedExchange.updateTransferSelectorNFT(newTransferSelectorNFT))
        .to.emit(mintedExchange, "NewTransferSelectorNFT")
        .withArgs(newTransferSelectorNFT);

      expect(await mintedExchange.transferSelectorNFT()).to.eq(newTransferSelectorNFT);
    });

    it("should check transfer selector nft is not address(0)", async () => {
      await expect(mintedExchange.updateTransferSelectorNFT(ethers.constants.AddressZero)).to.revertedWith(
        "Owner: Cannot be null address"
      );
    });

    it("should only allow admin", async () => {
      await expect(
        mintedExchange.connect(alice).updateTransferSelectorNFT(newTransferSelectorNFT)
      ).to.revertedWith(
        `AccessControl: account ${alice.address.toLowerCase()} is missing role ${ADMIN_ROLE}`
      );
    });
  });

  describe("toggleMatchMakerOrderBeta", () => {
    it("should toggle beta", async () => {
      const isMatchMakerOrderBeta = await mintedExchange.isMatchMakerOrderBeta();
      expect(isMatchMakerOrderBeta).to.eq(true);

      await mintedExchange.toggleMatchMakerOrderBeta();
      expect(await mintedExchange.isMatchMakerOrderBeta()).to.eq(!isMatchMakerOrderBeta);
    });

    it("should only allow admin", async () => {
      await expect(mintedExchange.connect(alice).toggleMatchMakerOrderBeta()).to.revertedWith(
        `AccessControl: account ${alice.address.toLowerCase()} is missing role ${ADMIN_ROLE}`
      );
    });
  });
});
