import { ethers } from "hardhat";
import { MakerOrder } from "./OrderSigner";

// // keccak256("MakerOrder(bool isOrderAsk,address signer,address collection,uint256 price,uint256 tokenId,uint256 amount,address strategy,address currency,uint256 nonce,uint256 startTime,uint256 endTime,uint256 minPercentageToAsk,bytes params)")
const MAKER_ORDER_HASH = "0x40261ade532fa1d2c7293df30aaadb9b3c616fae525a0b56d3d411c841a85028";

export async function hashMakerOrder(makerOrder: MakerOrder) {
  return await ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      [
        "bytes32",
        "bool",
        "address",
        "address",
        "uint256",
        "uint256",
        "uint256",
        "address",
        "address",
        "uint256",
        "uint256",
        "uint256",
        "uint256",
        "bytes32",
      ],
      [
        MAKER_ORDER_HASH,
        makerOrder.isOrderAsk,
        makerOrder.signer,
        makerOrder.collection,
        makerOrder.price,
        makerOrder.tokenId,
        makerOrder.amount,
        makerOrder.strategy,
        makerOrder.currency,
        makerOrder.nonce,
        makerOrder.startTime,
        makerOrder.endTime,
        makerOrder.minPercentageToAsk,
        ethers.utils.keccak256(makerOrder.params),
      ]
    )
  );
}
