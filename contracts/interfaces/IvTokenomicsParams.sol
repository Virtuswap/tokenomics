// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import {SD59x18} from '@prb/math/src/SD59x18.sol';

interface IvTokenomicsParams {
    function updateParams(
        SD59x18 _r,
        SD59x18 _b,
        SD59x18 _alpha,
        SD59x18 _beta,
        SD59x18 _gamma
    ) external;

    function r() external view returns (SD59x18);

    function b() external view returns (SD59x18);

    function alpha() external view returns (SD59x18);

    function beta() external view returns (SD59x18);

    function gamma() external view returns (SD59x18);
}