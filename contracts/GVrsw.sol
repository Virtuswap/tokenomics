// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

contract GVrsw is ERC20 {
    address public immutable minter;

    constructor(address _minter) ERC20('Governance Virtuswap', 'gVRSW') {
        minter = _minter;
    }

    function mint(address to, uint256 amount) public {
        require(msg.sender == minter, 'Only minter');
        _mint(to, amount);
    }
}
