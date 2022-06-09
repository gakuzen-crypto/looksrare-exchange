// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

contract TestERC1155 is ERC1155 {
    uint256 public constant GOLD = 0;
    address public _owner;

    constructor() ERC1155("tokenUri") {
        _owner = msg.sender;

        _mint(msg.sender, GOLD, 10, "");
    }

    function mint(
        address to,
        uint256 id,
        uint256 amount
    ) public {
        _mint(to, id, amount, "");
    }

    function admin() public view returns (address) {
        return _owner;
    }

    function owner() public view returns (address) {
        return _owner;
    }
}
