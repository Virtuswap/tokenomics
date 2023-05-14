// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

import {SD59x18, sd, unwrap, exp, UNIT, ZERO} from "@prb/math/src/SD59x18.sol";

/**
 * @title EmissionMath
 * @notice A library for calculating emission rates for Virtuswap Tokenomics
 * @dev This library provides functions for calculating the algorithmic emission, project emission, and compound rate based on time elapsed.
 * You can learn more in Virtuswap Tokenomics Whitepaper
 */
library EmissionMath {
    SD59x18 public constant V = SD59x18.wrap(3.4723183693e18);
    SD59x18 public constant v = SD59x18.wrap(-5.847184793e9);
    uint128 public constant TOTAL_ALGO_EMISSION = 500000000 * 1e18;
    uint128 public constant TEN_YEARS = (365 * 8 + 366 * 2) * 24 * 60 * 60;

    /**
     * @notice Calculates the amount of algorithmic emission between two timestamps
     * @param _t0 The timestamp of the start of the period
     * @param _t1 The timestamp of the end of the period
     * @return amount The amount of algorithmic emission for the period
     */
    function calculateAlgorithmicEmission(
        uint256 _t0,
        uint256 _t1
    ) internal pure returns (uint128 amount) {
        amount = (
            _t0 >= _t1
                ? 0
                : (
                    _t1 >= TEN_YEARS
                        ? TOTAL_ALGO_EMISSION
                        : _calculateEmission(_t1, ZERO)
                ) -
                    (
                        _t0 >= TEN_YEARS
                            ? TOTAL_ALGO_EMISSION
                            : _calculateEmission(_t0, ZERO)
                    )
        );
    }

    /**
     * @notice Calculates the compound rate between two timestamps
     * @param _t0 The timestamp of the start of the period
     * @param _t1 The timestamp of the end of the period
     * @param _r The compound rate
     * @return amount The amount of compound rate for the period
     */
    function calculateCompoundRate(
        uint256 _t0,
        uint256 _t1,
        SD59x18 _r
    ) internal pure returns (uint128 amount) {
        amount = (
            _t0 >= _t1
                ? 0
                : (
                    _t1 >= TEN_YEARS
                        ? _calculateEmission(TEN_YEARS, _r)
                        : _calculateEmission(_t1, _r)
                ) -
                    (
                        _t0 >= TEN_YEARS
                            ? _calculateEmission(TEN_YEARS, _r)
                            : _calculateEmission(_t0, _r)
                    )
        );
    }

    /**
     * @dev Calculates the emission amount based on the elapsed time and the compound rate.
     * @param _t Elapsed time since the start of the emission period, in seconds.
     * @param _r Compound rate, expressed as a fixed-point decimal with 18 decimal places.
     * @return amount The emission amount, expressed as a 128-bit unsigned integer.
     */
    function _calculateEmission(
        uint256 _t,
        SD59x18 _r
    ) private pure returns (uint128 amount) {
        amount = uint128(
            uint256(
                unwrap(
                    V
                        .mul(
                            exp(_r.add(v).mul(sd(int256(_t) * 1e18))).sub(UNIT)
                        )
                        .div(_r.add(v))
                )
            )
        );
    }
}
