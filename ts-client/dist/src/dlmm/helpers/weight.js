"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPriceOfBinByBinId = getPriceOfBinByBinId;
exports.toWeightDistribution = toWeightDistribution;
exports.calculateSpotDistribution = calculateSpotDistribution;
exports.calculateBidAskDistribution = calculateBidAskDistribution;
exports.calculateNormalDistribution = calculateNormalDistribution;
exports.fromWeightDistributionToAmountOneSide = fromWeightDistributionToAmountOneSide;
exports.fromWeightDistributionToAmount = fromWeightDistributionToAmount;
const anchor_1 = require("@coral-xyz/anchor");
const gaussian_1 = __importDefault(require("gaussian"));
const constants_1 = require("../constants");
const decimal_js_1 = __importDefault(require("decimal.js"));
const weightToAmounts_1 = require("./weightToAmounts");
function getPriceOfBinByBinId(binId, binStep) {
    const binStepNum = new decimal_js_1.default(binStep).div(new decimal_js_1.default(constants_1.BASIS_POINT_MAX));
    return new decimal_js_1.default(1).add(new decimal_js_1.default(binStepNum)).pow(new decimal_js_1.default(binId));
}
/// Build a gaussian distribution from the bins, with active bin as the mean.
function buildGaussianFromBins(activeBin, binIds) {
    const smallestBin = Math.min(...binIds);
    const largestBin = Math.max(...binIds);
    // Define the Gaussian distribution. The mean will be active bin when active bin is within the bin ids. Else, use left or right most bin id as the mean.
    let mean = 0;
    const isAroundActiveBin = binIds.find((bid) => bid == activeBin);
    // The liquidity will be distributed surrounding active bin
    if (isAroundActiveBin) {
        mean = activeBin;
    }
    // The liquidity will be distributed to the right side of the active bin.
    else if (activeBin < smallestBin) {
        mean = smallestBin;
    }
    // The liquidity will be distributed to the left side of the active bin.
    else {
        mean = largestBin;
    }
    const TWO_STANDARD_DEVIATION = 4;
    const stdDev = (largestBin - smallestBin) / TWO_STANDARD_DEVIATION;
    const variance = Math.max(stdDev ** 2, 1);
    return (0, gaussian_1.default)(mean, variance);
}
/// Find the probability of the bin id over the gaussian. The probability ranged from 0 - 1 and will be used as liquidity allocation for that particular bin.
function generateBinLiquidityAllocation(gaussian, binIds, invert) {
    const allocations = binIds.map((bid) => invert ? 1 / gaussian.pdf(bid) : gaussian.pdf(bid));
    const totalAllocations = allocations.reduce((acc, v) => acc + v, 0);
    // Gaussian impossible to cover 100%, normalized it to have total of 100%
    return allocations.map((a) => a / totalAllocations);
}
/// Convert liquidity allocation from 0..1 to 0..10000 bps unit. The sum of allocations must be 1. Return BPS and the loss after conversion.
function computeAllocationBps(allocations) {
    let totalAllocation = new anchor_1.BN(0);
    const bpsAllocations = [];
    for (const allocation of allocations) {
        const allocBps = new anchor_1.BN(allocation * 10000);
        bpsAllocations.push(allocBps);
        totalAllocation = totalAllocation.add(allocBps);
    }
    const pLoss = new anchor_1.BN(10000).sub(totalAllocation);
    return {
        bpsAllocations,
        pLoss,
    };
}
/** private */
function toWeightDistribution(amountX, amountY, distributions, binStep) {
    // get all quote amount
    let totalQuote = new anchor_1.BN(0);
    const precision = 1_000_000_000_000;
    const quoteDistributions = distributions.map((bin) => {
        const price = new anchor_1.BN(getPriceOfBinByBinId(bin.binId, binStep).mul(precision).floor().toString());
        const quoteValue = amountX
            .mul(new anchor_1.BN(bin.xAmountBpsOfTotal))
            .mul(new anchor_1.BN(price))
            .div(new anchor_1.BN(constants_1.BASIS_POINT_MAX))
            .div(new anchor_1.BN(precision));
        const quoteAmount = quoteValue.add(amountY.mul(new anchor_1.BN(bin.yAmountBpsOfTotal)).div(new anchor_1.BN(constants_1.BASIS_POINT_MAX)));
        totalQuote = totalQuote.add(quoteAmount);
        return {
            binId: bin.binId,
            quoteAmount,
        };
    });
    if (totalQuote.eq(new anchor_1.BN(0))) {
        return [];
    }
    const distributionWeights = quoteDistributions
        .map((bin) => {
        const weight = Math.floor(bin.quoteAmount.mul(new anchor_1.BN(65535)).div(totalQuote).toNumber());
        return {
            binId: bin.binId,
            weight,
        };
    })
        .filter((item) => item.weight > 0);
    return distributionWeights;
}
function calculateSpotDistribution(activeBin, binIds) {
    if (!binIds.includes(activeBin)) {
        const { div: dist, mod: rem } = new anchor_1.BN(10_000).divmod(new anchor_1.BN(binIds.length));
        const loss = rem.isZero() ? new anchor_1.BN(0) : new anchor_1.BN(1);
        const distributions = binIds[0] < activeBin
            ? binIds.map((binId) => ({
                binId,
                xAmountBpsOfTotal: new anchor_1.BN(0),
                yAmountBpsOfTotal: dist,
            }))
            : binIds.map((binId) => ({
                binId,
                xAmountBpsOfTotal: dist,
                yAmountBpsOfTotal: new anchor_1.BN(0),
            }));
        // Add the loss to the left most bin
        if (binIds[0] < activeBin) {
            distributions[0].yAmountBpsOfTotal.add(loss);
        }
        // Add the loss to the right most bin
        else {
            distributions[binIds.length - 1].xAmountBpsOfTotal.add(loss);
        }
        return distributions;
    }
    const binYCount = binIds.filter((binId) => binId < activeBin).length;
    const binXCount = binIds.filter((binId) => binId > activeBin).length;
    const totalYBinCapacity = binYCount + 0.5;
    const totalXBinCapacity = binXCount + 0.5;
    const yBinBps = new anchor_1.BN(10_000 / totalYBinCapacity);
    const yActiveBinBps = new anchor_1.BN(10_000).sub(yBinBps.mul(new anchor_1.BN(binYCount)));
    const xBinBps = new anchor_1.BN(10_000 / totalXBinCapacity);
    const xActiveBinBps = new anchor_1.BN(10_000).sub(xBinBps.mul(new anchor_1.BN(binXCount)));
    return binIds.map((binId) => {
        const isYBin = binId < activeBin;
        const isXBin = binId > activeBin;
        const isActiveBin = binId === activeBin;
        if (isYBin) {
            return {
                binId,
                xAmountBpsOfTotal: new anchor_1.BN(0),
                yAmountBpsOfTotal: yBinBps,
            };
        }
        if (isXBin) {
            return {
                binId,
                xAmountBpsOfTotal: xBinBps,
                yAmountBpsOfTotal: new anchor_1.BN(0),
            };
        }
        if (isActiveBin) {
            return {
                binId,
                xAmountBpsOfTotal: xActiveBinBps,
                yAmountBpsOfTotal: yActiveBinBps,
            };
        }
    });
}
function calculateBidAskDistribution(activeBin, binIds) {
    const smallestBin = Math.min(...binIds);
    const largestBin = Math.max(...binIds);
    const rightOnly = activeBin < smallestBin;
    const leftOnly = activeBin > largestBin;
    const gaussian = buildGaussianFromBins(activeBin, binIds);
    const allocations = generateBinLiquidityAllocation(gaussian, binIds, true);
    // To the right of active bin, liquidity distribution consists of only token X.
    if (rightOnly) {
        const { bpsAllocations, pLoss } = computeAllocationBps(allocations);
        const binDistributions = binIds.map((bid, idx) => ({
            binId: bid,
            xAmountBpsOfTotal: bpsAllocations[idx],
            yAmountBpsOfTotal: new anchor_1.BN(0),
        }));
        const idx = binDistributions.length - 1;
        binDistributions[idx].xAmountBpsOfTotal =
            binDistributions[idx].xAmountBpsOfTotal.add(pLoss);
        return binDistributions;
    }
    // To the left of active bin, liquidity distribution consists of only token Y.
    if (leftOnly) {
        const { bpsAllocations, pLoss } = computeAllocationBps(allocations);
        const binDistributions = binIds.map((bid, idx) => ({
            binId: bid,
            xAmountBpsOfTotal: new anchor_1.BN(0),
            yAmountBpsOfTotal: bpsAllocations[idx],
        }));
        binDistributions[0].yAmountBpsOfTotal =
            binDistributions[0].yAmountBpsOfTotal.add(pLoss);
        return binDistributions;
    }
    // Find total X, and Y bps allocations for normalization.
    const [totalXAllocation, totalYAllocation] = allocations.reduce(([xAcc, yAcc], allocation, idx) => {
        const binId = binIds[idx];
        if (binId > activeBin) {
            return [xAcc + allocation, yAcc];
        }
        else if (binId < activeBin) {
            return [xAcc, yAcc + allocation];
        }
        else {
            const half = allocation / 2;
            return [xAcc + half, yAcc + half];
        }
    }, [0, 0]);
    // Normalize and convert to BPS
    const [normXAllocations, normYAllocations] = allocations.reduce(([xAllocations, yAllocations], allocation, idx) => {
        const binId = binIds[idx];
        if (binId > activeBin) {
            const distX = new anchor_1.BN((allocation * 10000) / totalXAllocation);
            xAllocations.push(distX);
        }
        if (binId < activeBin) {
            const distY = new anchor_1.BN((allocation * 10000) / totalYAllocation);
            yAllocations.push(distY);
        }
        if (binId == activeBin) {
            const half = allocation / 2;
            const distX = new anchor_1.BN((half * 10000) / totalXAllocation);
            const distY = new anchor_1.BN((half * 10000) / totalYAllocation);
            xAllocations.push(distX);
            yAllocations.push(distY);
        }
        return [xAllocations, yAllocations];
    }, [[], []]);
    const totalXNormAllocations = normXAllocations.reduce((acc, v) => acc.add(v), new anchor_1.BN(0));
    const totalYNormAllocations = normYAllocations.reduce((acc, v) => acc.add(v), new anchor_1.BN(0));
    const xPLoss = new anchor_1.BN(10000).sub(totalXNormAllocations);
    const yPLoss = new anchor_1.BN(10000).sub(totalYNormAllocations);
    const distributions = binIds.map((binId) => {
        if (binId === activeBin) {
            return {
                binId,
                xAmountBpsOfTotal: normXAllocations.shift(),
                yAmountBpsOfTotal: normYAllocations.shift(),
            };
        }
        if (binId > activeBin) {
            return {
                binId,
                xAmountBpsOfTotal: normXAllocations.shift(),
                yAmountBpsOfTotal: new anchor_1.BN(0),
            };
        }
        if (binId < activeBin) {
            return {
                binId,
                xAmountBpsOfTotal: new anchor_1.BN(0),
                yAmountBpsOfTotal: normYAllocations.shift(),
            };
        }
    });
    if (!yPLoss.isZero()) {
        distributions[0].yAmountBpsOfTotal =
            distributions[0].yAmountBpsOfTotal.add(yPLoss);
    }
    if (!xPLoss.isZero()) {
        const last = distributions.length - 1;
        distributions[last].xAmountBpsOfTotal =
            distributions[last].xAmountBpsOfTotal.add(xPLoss);
    }
    return distributions;
}
function calculateNormalDistribution(activeBin, binIds) {
    const smallestBin = Math.min(...binIds);
    const largestBin = Math.max(...binIds);
    const rightOnly = activeBin < smallestBin;
    const leftOnly = activeBin > largestBin;
    const gaussian = buildGaussianFromBins(activeBin, binIds);
    const allocations = generateBinLiquidityAllocation(gaussian, binIds, false);
    // To the right of active bin, liquidity distribution consists of only token X.
    if (rightOnly) {
        const { bpsAllocations, pLoss } = computeAllocationBps(allocations);
        const binDistributions = binIds.map((bid, idx) => ({
            binId: bid,
            xAmountBpsOfTotal: bpsAllocations[idx],
            yAmountBpsOfTotal: new anchor_1.BN(0),
        }));
        // When contains only X token, bin closest to active bin will be index 0.
        // Add back the precision loss
        binDistributions[0].xAmountBpsOfTotal =
            binDistributions[0].xAmountBpsOfTotal.add(pLoss);
        return binDistributions;
    }
    // To the left of active bin, liquidity distribution consists of only token Y.
    if (leftOnly) {
        const { bpsAllocations, pLoss } = computeAllocationBps(allocations);
        const binDistributions = binIds.map((bid, idx) => ({
            binId: bid,
            xAmountBpsOfTotal: new anchor_1.BN(0),
            yAmountBpsOfTotal: bpsAllocations[idx],
        }));
        // When contains only Y token, bin closest to active bin will be last index.
        // Add back the precision loss
        const idx = binDistributions.length - 1;
        binDistributions[idx].yAmountBpsOfTotal =
            binDistributions[idx].yAmountBpsOfTotal.add(pLoss);
        return binDistributions;
    }
    // The liquidity distribution consists of token X and Y. Allocations from gaussian only says how much liquidity percentage per bin over the full bin range.
    // Normalize liquidity allocation percentage into X - 100%, Y - 100%.
    // Find total X, and Y bps allocations for normalization.
    const [totalXAllocation, totalYAllocation] = allocations.reduce(([xAcc, yAcc], allocation, idx) => {
        const binId = binIds[idx];
        if (binId > activeBin) {
            return [xAcc + allocation, yAcc];
        }
        else if (binId < activeBin) {
            return [xAcc, yAcc + allocation];
        }
        else {
            const half = allocation / 2;
            return [xAcc + half, yAcc + half];
        }
    }, [0, 0]);
    // Normalize and convert to BPS
    const [normXAllocations, normYAllocations] = allocations.reduce(([xAllocations, yAllocations], allocation, idx) => {
        const binId = binIds[idx];
        if (binId > activeBin) {
            const distX = new anchor_1.BN((allocation * 10000) / totalXAllocation);
            xAllocations.push(distX);
        }
        if (binId < activeBin) {
            const distY = new anchor_1.BN((allocation * 10000) / totalYAllocation);
            yAllocations.push(distY);
        }
        return [xAllocations, yAllocations];
    }, [[], []]);
    const normXActiveBinAllocation = normXAllocations.reduce((maxBps, bps) => maxBps.sub(bps), new anchor_1.BN(10_000));
    const normYActiveBinAllocation = normYAllocations.reduce((maxBps, bps) => maxBps.sub(bps), new anchor_1.BN(10_000));
    return binIds.map((binId) => {
        if (binId === activeBin) {
            return {
                binId,
                xAmountBpsOfTotal: normXActiveBinAllocation,
                yAmountBpsOfTotal: normYActiveBinAllocation,
            };
        }
        if (binId > activeBin) {
            return {
                binId,
                xAmountBpsOfTotal: normXAllocations.shift(),
                yAmountBpsOfTotal: new anchor_1.BN(0),
            };
        }
        if (binId < activeBin) {
            return {
                binId,
                xAmountBpsOfTotal: new anchor_1.BN(0),
                yAmountBpsOfTotal: normYAllocations.shift(),
            };
        }
    });
}
function fromWeightDistributionToAmountOneSide(amount, distributions, binStep, activeId, depositForY) {
    if (depositForY) {
        return (0, weightToAmounts_1.toAmountBidSide)(activeId, amount, distributions);
    }
    else {
        return (0, weightToAmounts_1.toAmountAskSide)(activeId, binStep, amount, distributions);
    }
}
function fromWeightDistributionToAmount(amountX, amountY, distributions, binStep, activeId, amountXInActiveBin, amountYInActiveBin) {
    // sort distribution
    var distributions = distributions.sort((n1, n2) => {
        return n1.binId - n2.binId;
    });
    if (distributions.length == 0) {
        return [];
    }
    // only bid side
    if (activeId > distributions[distributions.length - 1].binId) {
        let amounts = (0, weightToAmounts_1.toAmountBidSide)(activeId, amountY, distributions);
        return amounts.map((bin) => {
            return {
                binId: bin.binId,
                amountX: new anchor_1.BN(0),
                amountY: new anchor_1.BN(bin.amount.toString()),
            };
        });
    }
    // only ask side
    if (activeId < distributions[0].binId) {
        let amounts = (0, weightToAmounts_1.toAmountAskSide)(activeId, binStep, amountX, distributions);
        return amounts.map((bin) => {
            return {
                binId: bin.binId,
                amountX: new anchor_1.BN(bin.amount.toString()),
                amountY: new anchor_1.BN(0),
            };
        });
    }
    return (0, weightToAmounts_1.toAmountBothSide)(activeId, binStep, amountX, amountY, amountXInActiveBin, amountYInActiveBin, distributions);
}
