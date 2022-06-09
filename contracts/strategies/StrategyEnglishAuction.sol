// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {OrderTypes} from "../libraries/OrderTypes.sol";
import {IExecutionStrategy} from "../interfaces/IExecutionStrategy.sol";

/**
 * @title StrategyEnglishAuction
 * @notice Strategy to set up an order for auction that can be taken either by an ask or
 * matched via two maker orders (bid and ask)
 */
contract StrategyEnglishAuction is IExecutionStrategy {
    uint256 public immutable PROTOCOL_FEE;

    /**
     * @notice Constructor
     * @param _protocolFee: protocol fee (200 --> 2%, 400 --> 4%)
     */
    constructor(uint256 _protocolFee) {
        PROTOCOL_FEE = _protocolFee;
    }

    /**
     * @notice Check whether a taker ask order can be executed against a maker bid
     * @return (whether strategy can be executed, tokenId to execute, amount of tokens to execute)
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
        // Seller accepts buyer's bid. Reserve price check not needed as seller accept the bid
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
     * @dev not executable for auction case
     */
    function canExecuteTakerBid(OrderTypes.TakerOrder calldata, OrderTypes.MakerOrder calldata)
        external
        pure
        override
        returns (
            bool,
            uint256,
            uint256
        )
    {
        // Not supported as buyer cannot directly purchase from an auction listing
        return (false, 0, 0);
    }

    /**
     * @notice Check whether a maker bid order can be executed against a maker ask
     * @param makerBid maker bid order
     * @param makerAsk maker ask order
     * @return (whether strategy can be executed, tokenId to execute, amount of tokens to execute)
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
        bool canExecute = (makerBid.tokenId == makerAsk.tokenId) &&
            (makerBid.collection == makerAsk.collection) &&
            (makerBid.amount == makerAsk.amount) &&
            (makerAsk.startTime <= block.timestamp) &&
            (makerBid.startTime <= block.timestamp) &&
            (makerAsk.endTime >= block.timestamp) &&
            (makerBid.endTime >= block.timestamp);

        // if param is present, reserve price should be present. Validate reserve price
        if (makerAsk.params.length > 0) {
            uint256 reservePrice = abi.decode(makerAsk.params, (uint256));
            canExecute = canExecute && (makerBid.price >= reservePrice);
        }

        return (canExecute, makerAsk.tokenId, makerAsk.amount);
    }

    /**
     * @notice Return protocol fee for this strategy
     * @return protocol fee
     */
    function viewProtocolFee() external view override returns (uint256) {
        return PROTOCOL_FEE;
    }
}
