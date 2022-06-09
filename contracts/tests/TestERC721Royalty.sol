// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Royalty.sol";
import "../interfaces/IOwnable.sol";

contract TestERC721Royalty is ERC721Royalty {
    /** Royalty fee expressed in basis point, defaults to 2 % of the sale price */
    uint96 ROYALTY_FEE_DEFAULT = 200;
    address public _owner;

    constructor() ERC721("TestERC721Royalty", "RoyalNFT") {
        _setDefaultRoyalty(_msgSender(), ROYALTY_FEE_DEFAULT);
        _owner = _msgSender();
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
