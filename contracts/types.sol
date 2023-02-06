// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import {SD59x18} from '@prb/math/src/SD59x18.sol';

struct Stake {
    uint256 startTs;
    uint256 lockDuration;
    SD59x18 discountFactor;
    uint256 amount;
}
