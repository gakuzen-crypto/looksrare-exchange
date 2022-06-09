// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/**
 * Example of old-school NFT which doesn't support safeTransferFrom
 * ref: https://etherscan.io/address/0x06012c8cf97bead5deae237070f9587f8e7a266d#code
 */
contract TestNonCompliantERC721 is ERC721 {
    address public _owner;

    constructor() ERC721("NonCompliantERC721", "ERC721NC") {
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

    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenId
    ) public virtual override {
        require(false, "function not suported");
    }
}
