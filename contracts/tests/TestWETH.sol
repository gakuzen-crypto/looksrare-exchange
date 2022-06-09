// Ref: https://github.com/Rari-Capital/solmate/blob/main/src/tokens/WETH.sol

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../interfaces/IWETH.sol";

contract TestWETH is ERC20("Wrapped Ether", "WETH") {
    event Deposit(address indexed from, uint256 amount);

    event Withdrawal(address indexed to, uint256 amount);

    constructor(uint256 amount) {
        _mint(msg.sender, amount);
    }

    function deposit() public payable virtual {
        _mint(msg.sender, msg.value);

        emit Deposit(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) public virtual {
        _burn(msg.sender, amount);

        emit Withdrawal(msg.sender, amount);

        payable(msg.sender).transfer(amount);
    }

    receive() external payable virtual {
        deposit();
    }
}
