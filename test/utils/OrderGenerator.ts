import { ParamType } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { defaultAbiCoder, formatBytes32String } from "ethers/lib/utils";
import { MakerOrder } from "./OrderSigner";

// constant variable for maker bid and taker ask
export const TOKEN_ID = 888,
  PRICE = 100,
  AMT_TOKEN = 1;

export type SolidityType = "bool" | "address" | "uint256" | "bytes" | "bytes32" | "bytes32[]";

export function generateTakerOrder(params: {
  isOrderAsk?: boolean; // true --> ask / false --> bid
  taker: string;
  price?: number;
  tokenId?: number;
  paramType?: SolidityType[];
  paramVal?: any[];
}) {
  const { paramType, paramVal } = params;
  if (paramType && paramVal && paramType.length !== paramVal.length) {
    throw new Error("type and value length mistmatch");
  }

  return {
    isOrderAsk: params.isOrderAsk === null ? true : params.isOrderAsk,
    taker: params.taker, // taker address
    price: params.price || PRICE, // price of the token
    tokenId: params.tokenId || TOKEN_ID, // which tokenId
    minPercentageToAsk: 9000,
    params: defaultAbiCoder.encode(params.paramType || [], params.paramVal || []),
  };
}

export function generateMakerOrder(params: {
  isOrderAsk?: boolean; // true --> ask / false --> bid
  maker: string;
  price?: number;
  tokenId?: number;
  startTime: string;
  endTime: string;
  stratAddr: string;
  collectionAddr: string;
  currencyAddr: string;
  amount?: number;
  paramType?: SolidityType[];
  paramVal?: any[];
}): MakerOrder {
  const { paramType, paramVal } = params;
  if (paramType && paramVal && paramType.length !== paramVal.length) {
    throw new Error("type and value length mistmatch");
  }

  return {
    isOrderAsk: params.isOrderAsk == null ? true : params.isOrderAsk,
    signer: params.maker,
    collection: params.collectionAddr,
    price: params.price || PRICE,
    tokenId: params.tokenId || TOKEN_ID,
    amount: params.amount || AMT_TOKEN,
    strategy: params.stratAddr,
    currency: params.currencyAddr,
    nonce: 1,
    startTime: params.startTime,
    endTime: params.endTime,
    minPercentageToAsk: 9000,
    params: defaultAbiCoder.encode(params.paramType || [], params.paramVal || []),
  };
}
