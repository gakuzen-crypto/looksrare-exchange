// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract TestERC721 is ERC721 {
    address public _owner;

    constructor() ERC721("TestERC721", "ERC721NFT") {
        _owner = msg.sender;
    }

    function mint(address to, uint256 tokenId) public {
        _mint(to, tokenId);
    }

    function admin() public view returns (address) {
        return _owner;
    }

    function owner() public view returns (address) {
        return _owner;
    }
}
