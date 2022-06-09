// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {OrderTypes} from "../libraries/OrderTypes.sol";
import {IExecutionStrategy} from "../interfaces/IExecutionStrategy.sol";

/**
 * @title StrategyPrivateSale
 * @notice Strategy to set up an order that can only be executed by
 * a specific address.
 */
contract StrategyPrivateSale is IExecutionStrategy {
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
    function canExecuteTakerAsk(OrderTypes.TakerOrder calldata, OrderTypes.MakerOrder calldata)
        external
        pure
        override
        returns (
            bool,
            uint256,
            uint256
        )
    {
        return (false, 0, 0);
    }

    /**
     * @notice Check whether a taker bid order can be executed against a maker ask
     * @param takerBid taker bid order
     * @param makerAsk maker ask order
     * @return (whether strategy can be executed, tokenId to execute, amount of tokens to execute)
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
        // Retrieve target buyer
        address targetBuyer = abi.decode(makerAsk.params, (address));

        return (
            ((targetBuyer == takerBid.taker) &&
                (makerAsk.price == takerBid.price) &&
                (makerAsk.tokenId == takerBid.tokenId) &&
                (makerAsk.startTime <= block.timestamp) &&
                (makerAsk.endTime >= block.timestamp)),
            makerAsk.tokenId,
            makerAsk.amount
        );
    }

    /**
     * @notice Check whether a maker bid order can be executed against a maker ask
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
        // Retrieve target buyer
        address targetBuyer = abi.decode(makerAsk.params, (address));

        // While strategy can return true, it is unlikely to be matched by platform as this strategy will be likely at 0 fee
        return (
            ((targetBuyer == makerBid.signer) &&
                (makerAsk.price == makerBid.price) &&
                (makerAsk.collection == makerBid.collection) &&
                (makerAsk.tokenId == makerBid.tokenId) &&
                (makerAsk.amount == makerBid.amount) &&
                (makerAsk.startTime <= block.timestamp) &&
                (makerBid.startTime <= block.timestamp) &&
                (makerAsk.endTime >= block.timestamp) &&
                (makerBid.endTime >= block.timestamp)),
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
}
