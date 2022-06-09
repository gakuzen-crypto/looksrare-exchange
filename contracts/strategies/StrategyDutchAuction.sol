// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {OrderTypes} from "../libraries/OrderTypes.sol";
import {IExecutionStrategy} from "../interfaces/IExecutionStrategy.sol";

/**
 * @title StrategyDutchAuction
 * @notice Strategy to launch a Dutch Auction for a token where the price decreases linearly
 * until a specified timestamp and end price defined by the seller.
 */
contract StrategyDutchAuction is IExecutionStrategy, Ownable {
    uint256 public immutable PROTOCOL_FEE;

    // Minimum auction length in seconds
    uint256 public minimumAuctionLengthInSeconds;

    event NewMinimumAuctionLengthInSeconds(uint256 minimumAuctionLengthInSeconds);

    /**
     * @notice Constructor
     * @param _protocolFee: protocol fee (200 --> 2%, 400 --> 4%)
     */
    constructor(uint256 _protocolFee, uint256 _minimumAuctionLengthInSeconds) {
        require(_minimumAuctionLengthInSeconds >= 15 minutes, "Owner: Auction length must be >= 15 mintes");

        PROTOCOL_FEE = _protocolFee;
        minimumAuctionLengthInSeconds = _minimumAuctionLengthInSeconds;
    }

    /**
     * @notice Check whether a taker ask order can be executed against a maker bid
     * @return (whether strategy can be executed, tokenId to execute, amount of tokens to execute)
     * @dev Buyer place a bid for a dutch auction and seller decided not to wait and accept the offer before
            the offer's price is >= the current auction price.
     */
    function canExecuteTakerAsk(
        OrderTypes.TakerOrder calldata takerAsk,
        OrderTypes.MakerOrder calldata makerBid
    )
        external
        view
        override
        returns (
            bool,
            uint256,
            uint256
        )
    {
        return (
            ((makerBid.tokenId == takerAsk.tokenId) &&
                (makerBid.price == takerAsk.price) &&
                (makerBid.startTime <= block.timestamp) &&
                (makerBid.endTime >= block.timestamp)),
            makerBid.tokenId,
            makerBid.amount
        );
    }

    /**
     * @notice Check whether a taker bid order can be executed against a maker ask
     * @return (whether strategy can be executed, tokenId to execute, amount of tokens to execute)
     * @dev seller created a dutch auction and buyer executed on-chain transaction to purchase the NFT
     */
    function canExecuteTakerBid(
        OrderTypes.TakerOrder calldata takerBid,
        OrderTypes.MakerOrder calldata makerAsk
    )
        external
        view
        override
        returns (
            bool,
            uint256,
            uint256
        )
    {
        (uint256 startPrice, uint256 auctionEndTime) = abi.decode(makerAsk.params, (uint256, uint256));
        uint256 endPrice = makerAsk.price;
        uint256 auctionStartTime = makerAsk.startTime;

        // Underflow checks and auction length check
        require(
            auctionEndTime >= (auctionStartTime + minimumAuctionLengthInSeconds),
            "Dutch Auction: Length must be longer"
        );

        require(startPrice > endPrice, "Dutch Auction: Start price must be greater than end price");

        uint256 currentAuctionPrice = startPrice -
            (((startPrice - endPrice) * (block.timestamp - auctionStartTime)) /
                (auctionEndTime - auctionStartTime));

        return (
            ((makerAsk.tokenId == takerBid.tokenId) &&
                (makerAsk.startTime <= block.timestamp) &&
                (makerAsk.endTime >= block.timestamp) && // end time as it can transit into regular listing
                (takerBid.price >= currentAuctionPrice)),
            makerAsk.tokenId,
            makerAsk.amount
        );
    }

    /**
     * @notice Check whether a maker bid order can be executed against a maker ask
     * @return (whether strategy can be executed, tokenId to execute, amount of tokens to execute)
     * @dev seller created a dutch auction and buyer placed a bid. NFT price eventually dropped until 
            bid price and platform matches the order.
     */
    function canExecuteMakerOrder(
        OrderTypes.MakerOrder calldata makerBid,
        OrderTypes.MakerOrder calldata makerAsk
    )
        external
        view
        override
        returns (
            bool,
            uint256,
            uint256
        )
    {
        (uint256 startPrice, uint256 auctionEndTime) = abi.decode(makerAsk.params, (uint256, uint256));
        uint256 endPrice = makerAsk.price;
        uint256 auctionStartTime = makerAsk.startTime;

        // Underflow checks and auction length check
        require(
            auctionEndTime >= (auctionStartTime + minimumAuctionLengthInSeconds),
            "Dutch Auction: Length must be longer"
        );

        require(startPrice > endPrice, "Dutch Auction: Start price must be greater than end price");

        uint256 currentAuctionPrice = startPrice -
            (((startPrice - endPrice) * (block.timestamp - auctionStartTime)) /
                (auctionEndTime - auctionStartTime));

        return (
            ((makerAsk.collection == makerBid.collection) &&
                (makerAsk.tokenId == makerBid.tokenId) &&
                (makerAsk.startTime <= block.timestamp) &&
                (makerBid.startTime <= block.timestamp) &&
                (makerAsk.endTime >= block.timestamp) &&
                (makerBid.endTime >= block.timestamp) &&
                (makerBid.price >= currentAuctionPrice)),
            makerAsk.tokenId,
            makerAsk.amount
        );
    }

    /**
     * @notice Return protocol fee for this strategy
     * @return protocol fee
     */
    function viewProtocolFee() external view override returns (uint256) {
        return PROTOCOL_FEE;
    }

    /**
     * @notice Update minimum auction length (in seconds)
     * @param _minimumAuctionLengthInSeconds minimum auction length in seconds
     * @dev It protects against auctions that would be too short to be executed (e.g., 15 seconds)
     */
    function updateMinimumAuctionLength(uint256 _minimumAuctionLengthInSeconds) external onlyOwner {
        require(_minimumAuctionLengthInSeconds >= 15 minutes, "Owner: Auction length must be >= 15 minutes");
        minimumAuctionLengthInSeconds = _minimumAuctionLengthInSeconds;

        emit NewMinimumAuctionLengthInSeconds(_minimumAuctionLengthInSeconds);
    }
}
