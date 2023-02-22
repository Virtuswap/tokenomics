// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

contract Vrsw is ERC20 {
    constructor(
        address _minter,
        address _projectVestingWallet
    ) ERC20('Virtuswap', 'VRSW') {
        _mint(_minter, 300000000 * 10 ** decimals());
        _mint(_projectVestingWallet, 700000000 * 10 ** decimals());
    }
}
