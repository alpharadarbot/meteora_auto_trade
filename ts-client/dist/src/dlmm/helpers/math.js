"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Rounding = void 0;
exports.mulShr = mulShr;
exports.shlDiv = shlDiv;
exports.mulDiv = mulDiv;
exports.computeBaseFactorFromFeeBps = computeBaseFactorFromFeeBps;
exports.getQPriceFromId = getQPriceFromId;
exports.findSwappableMinMaxBinId = findSwappableMinMaxBinId;
exports.getC = getC;
exports.distributeAmountToCompressedBinsByRatio = distributeAmountToCompressedBinsByRatio;
exports.getPositionCount = getPositionCount;
exports.compressBinAmount = compressBinAmount;
exports.generateAmountForBinRange = generateAmountForBinRange;
exports.generateBinAmount = generateBinAmount;
const anchor_1 = require("@coral-xyz/anchor");
const constants_1 = require("../constants");
const decimal_js_1 = __importDefault(require("decimal.js"));
const u64xu64_math_1 = require("./u64xu64_math");
const weight_1 = require("./weight");
var Rounding;
(function (Rounding) {
    Rounding[Rounding["Up"] = 0] = "Up";
    Rounding[Rounding["Down"] = 1] = "Down";
})(Rounding || (exports.Rounding = Rounding = {}));
function mulShr(x, y, offset, rounding) {
    const denominator = new anchor_1.BN(1).shln(offset);
    return mulDiv(x, y, denominator, rounding);
}
function shlDiv(x, y, offset, rounding) {
    const scale = new anchor_1.BN(1).shln(offset);
    return mulDiv(x, scale, y, rounding);
}
function mulDiv(x, y, denominator, rounding) {
    const { div, mod } = x.mul(y).divmod(denominator);
    if (rounding == Rounding.Up && !mod.isZero()) {
        return div.add(new anchor_1.BN(1));
    }
    return div;
}
function computeBaseFactorFromFeeBps(binStep, feeBps) {
    const U16_MAX = 65535;
    const computedBaseFactor = (feeBps.toNumber() * constants_1.BASIS_POINT_MAX) / binStep.toNumber();
    // Sanity check
    const computedBaseFactorFloor = Math.floor(computedBaseFactor);
    if (computedBaseFactor != computedBaseFactorFloor) {
        if (computedBaseFactorFloor >= U16_MAX) {
            throw "base factor for the give fee bps overflow u16";
        }
        if (computedBaseFactorFloor == 0) {
            throw "base factor for the give fee bps underflow";
        }
        if (computedBaseFactor % 1 != 0) {
            throw "couldn't compute base factor for the exact fee bps";
        }
    }
    return new anchor_1.BN(computedBaseFactor);
}
function getQPriceFromId(binId, binStep) {
    const bps = binStep.shln(constants_1.SCALE_OFFSET).div(new anchor_1.BN(constants_1.BASIS_POINT_MAX));
    const base = u64xu64_math_1.ONE.add(bps);
    return (0, u64xu64_math_1.pow)(base, binId);
}
function findSwappableMinMaxBinId(binStep) {
    const base = 1 + binStep.toNumber() / constants_1.BASIS_POINT_MAX;
    const maxQPriceSupported = new decimal_js_1.default("18446744073709551615");
    const n = maxQPriceSupported.log(10).div(new decimal_js_1.default(base).log(10)).floor();
    let minBinId = new anchor_1.BN(n.neg().toString());
    let maxBinId = new anchor_1.BN(n.toString());
    let minQPrice = new anchor_1.BN(1);
    let maxQPrice = new anchor_1.BN("340282366920938463463374607431768211455");
    while (true) {
        const qPrice = getQPriceFromId(minBinId, binStep);
        if (qPrice.gt(minQPrice) && !qPrice.isZero()) {
            break;
        }
        else {
            minBinId = minBinId.add(new anchor_1.BN(1));
        }
    }
    while (true) {
        const qPrice = getQPriceFromId(maxBinId, binStep);
        if (qPrice.lt(maxQPrice) && !qPrice.isZero()) {
            break;
        }
        else {
            maxBinId = maxBinId.sub(new anchor_1.BN(1));
        }
    }
    return {
        minBinId,
        maxBinId,
    };
}
function getC(amount, binStep, binId, baseTokenDecimal, quoteTokenDecimal, minPrice, maxPrice, k) {
    const currentPricePerLamport = new decimal_js_1.default(1 + binStep / 10000).pow(binId.toNumber());
    const currentPricePerToken = currentPricePerLamport.mul(new decimal_js_1.default(10 ** (baseTokenDecimal - quoteTokenDecimal)));
    const priceRange = maxPrice.sub(minPrice);
    const currentPriceDeltaFromMin = currentPricePerToken.sub(new decimal_js_1.default(minPrice));
    const c = new decimal_js_1.default(amount.toString()).mul(currentPriceDeltaFromMin.div(priceRange).pow(k));
    return c.floor();
}
function distributeAmountToCompressedBinsByRatio(compressedBinAmount, uncompressedAmount, multiplier, binCapAmount) {
    const newCompressedBinAmount = new Map();
    let totalCompressedAmount = new anchor_1.BN(0);
    for (const compressedAmount of compressedBinAmount.values()) {
        totalCompressedAmount = totalCompressedAmount.add(compressedAmount);
    }
    let totalDepositedAmount = new anchor_1.BN(0);
    for (const [binId, compressedAmount] of compressedBinAmount.entries()) {
        const depositAmount = compressedAmount
            .mul(uncompressedAmount)
            .div(totalCompressedAmount);
        let compressedDepositAmount = depositAmount.div(multiplier);
        let newCompressedAmount = compressedAmount.add(compressedDepositAmount);
        if (newCompressedAmount.gt(binCapAmount)) {
            compressedDepositAmount = compressedDepositAmount.sub(newCompressedAmount.sub(binCapAmount));
            newCompressedAmount = binCapAmount;
        }
        newCompressedBinAmount.set(binId, newCompressedAmount);
        totalDepositedAmount = totalDepositedAmount.add(compressedDepositAmount.mul(multiplier));
    }
    const loss = uncompressedAmount.sub(totalDepositedAmount);
    return {
        newCompressedBinAmount,
        loss,
    };
}
function getPositionCount(minBinId, maxBinId) {
    const binDelta = maxBinId.sub(minBinId);
    const positionCount = binDelta.div(constants_1.MAX_BIN_PER_POSITION);
    return positionCount.add(new anchor_1.BN(1));
}
function compressBinAmount(binAmount, multiplier) {
    const compressedBinAmount = new Map();
    let totalAmount = new anchor_1.BN(0);
    let compressionLoss = new anchor_1.BN(0);
    for (const [binId, amount] of binAmount) {
        totalAmount = totalAmount.add(amount);
        const compressedAmount = amount.div(multiplier);
        compressedBinAmount.set(binId, compressedAmount);
        let loss = amount.sub(compressedAmount.mul(multiplier));
        compressionLoss = compressionLoss.add(loss);
    }
    return {
        compressedBinAmount,
        compressionLoss,
    };
}
function generateAmountForBinRange(amount, binStep, tokenXDecimal, tokenYDecimal, minBinId, maxBinId, k) {
    const toTokenMultiplier = new decimal_js_1.default(10 ** (tokenXDecimal - tokenYDecimal));
    const minPrice = (0, weight_1.getPriceOfBinByBinId)(minBinId.toNumber(), binStep).mul(toTokenMultiplier);
    const maxPrice = (0, weight_1.getPriceOfBinByBinId)(maxBinId.toNumber(), binStep).mul(toTokenMultiplier);
    const binAmounts = new Map();
    for (let i = minBinId.toNumber(); i < maxBinId.toNumber(); i++) {
        const binAmount = generateBinAmount(amount, binStep, new anchor_1.BN(i), tokenXDecimal, tokenYDecimal, minPrice, maxPrice, k);
        binAmounts.set(i, binAmount);
    }
    return binAmounts;
}
function generateBinAmount(amount, binStep, binId, tokenXDecimal, tokenYDecimal, minPrice, maxPrice, k) {
    const c1 = getC(amount, binStep, binId.add(new anchor_1.BN(1)), tokenXDecimal, tokenYDecimal, minPrice, maxPrice, k);
    const c0 = getC(amount, binStep, binId, tokenXDecimal, tokenYDecimal, minPrice, maxPrice, k);
    return new anchor_1.BN(c1.sub(c0).floor().toString());
}
