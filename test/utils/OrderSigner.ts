import { ethers } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { _TypedDataEncoder } from "@ethersproject/hash";
import { BigNumber, BigNumberish } from "ethers";

/**
 * /!\ This type is used for the signature and should perfectly match the object signed by the user
 * Do not update unless the contract has been updated
 */
export interface MakerOrder {
  isOrderAsk: boolean; // true --> ask / false --> bid
  signer: string; // signer address of the maker order
  collection: string; // collection address
  price: BigNumberish;
  tokenId: BigNumberish; // id of the token
  amount: BigNumberish; // amount of tokens to sell/purchase (must be 1 for ERC721, 1+ for ERC1155)
  strategy: string; // strategy for trade execution (e.g., DutchAuction, StandardSaleForFixedPrice)
  currency: string; // currency address
  nonce: BigNumberish; // order nonce (must be unique unless new maker order is meant to override existing one e.g., lower ask price)
  startTime: BigNumberish; // startTime in timestamp
  endTime: BigNumberish; // endTime in timestamp
  minPercentageToAsk: BigNumberish;
  params: string; // params (e.g., price, target account for private sale)
}

export async function signMakerOrder(signer: SignerWithAddress, verifier: string, order: MakerOrder) {
  const chainId = BigNumber.from(await signer.getChainId());
  const domain = {
    name: "MintedExchange",
    version: "1",
    chainId,
    verifyingContract: verifier,
  };
  const types = {
    MakerOrder: [
      { name: "isOrderAsk", type: "bool" },
      { name: "signer", type: "address" },
      { name: "collection", type: "address" },
      { name: "price", type: "uint256" },
      { name: "tokenId", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "strategy", type: "address" },
      { name: "currency", type: "address" },
      { name: "nonce", type: "uint256" },
      { name: "startTime", type: "uint256" },
      { name: "endTime", type: "uint256" },
      { name: "minPercentageToAsk", type: "uint256" },
      { name: "params", type: "bytes" },
    ],
  };

  const rawSignature = await signer._signTypedData(domain, types, order);
  const signature = ethers.utils.splitSignature(rawSignature);
  return {
    ...order,
    r: signature.r,
    s: signature.s,
    v: signature.v,
  };
}
