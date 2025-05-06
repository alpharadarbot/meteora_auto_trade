"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isOverflowDefaultBinArrayBitmap = isOverflowDefaultBinArrayBitmap;
exports.deriveBinArrayBitmapExtension = deriveBinArrayBitmapExtension;
exports.binIdToBinArrayIndex = binIdToBinArrayIndex;
exports.getBinArrayLowerUpperBinId = getBinArrayLowerUpperBinId;
exports.isBinIdWithinBinArray = isBinIdWithinBinArray;
exports.getBinFromBinArray = getBinFromBinArray;
exports.findNextBinArrayIndexWithLiquidity = findNextBinArrayIndexWithLiquidity;
exports.findNextBinArrayWithLiquidity = findNextBinArrayWithLiquidity;
exports.getBinArraysRequiredByPositionRange = getBinArraysRequiredByPositionRange;
exports.enumerateBins = enumerateBins;
const anchor_1 = require("@coral-xyz/anchor");
const web3_js_1 = require("@solana/web3.js");
const constants_1 = require("../constants");
const types_1 = require("../types");
const constants_2 = require("../constants");
const math_1 = require("./math");
const derive_1 = require("./derive");
/** private */
function internalBitmapRange() {
    const lowerBinArrayIndex = constants_2.BIN_ARRAY_BITMAP_SIZE.neg();
    const upperBinArrayIndex = constants_2.BIN_ARRAY_BITMAP_SIZE.sub(new anchor_1.BN(1));
    return [lowerBinArrayIndex, upperBinArrayIndex];
}
function buildBitmapFromU64Arrays(u64Arrays, type) {
    const buffer = Buffer.concat(u64Arrays.map((b) => {
        return b.toArrayLike(Buffer, "le", 8);
    }));
    return new anchor_1.BN(buffer, "le");
}
function bitmapTypeDetail(type) {
    if (type == types_1.BitmapType.U1024) {
        return {
            bits: 1024,
            bytes: 1024 / 8,
        };
    }
    else {
        return {
            bits: 512,
            bytes: 512 / 8,
        };
    }
}
function mostSignificantBit(number, bitLength) {
    const highestIndex = bitLength - 1;
    if (number.isZero()) {
        return null;
    }
    for (let i = highestIndex; i >= 0; i--) {
        if (number.testn(i)) {
            return highestIndex - i;
        }
    }
    return null;
}
function leastSignificantBit(number, bitLength) {
    if (number.isZero()) {
        return null;
    }
    for (let i = 0; i < bitLength; i++) {
        if (number.testn(i)) {
            return i;
        }
    }
    return null;
}
function extensionBitmapRange() {
    return [
        constants_2.BIN_ARRAY_BITMAP_SIZE.neg().mul(constants_2.EXTENSION_BINARRAY_BITMAP_SIZE.add(new anchor_1.BN(1))),
        constants_2.BIN_ARRAY_BITMAP_SIZE.mul(constants_2.EXTENSION_BINARRAY_BITMAP_SIZE.add(new anchor_1.BN(1))).sub(new anchor_1.BN(1)),
    ];
}
function findSetBit(startIndex, endIndex, binArrayBitmapExtension) {
    const getBinArrayOffset = (binArrayIndex) => {
        return binArrayIndex.gt(new anchor_1.BN(0))
            ? binArrayIndex.mod(constants_2.BIN_ARRAY_BITMAP_SIZE)
            : binArrayIndex.add(new anchor_1.BN(1)).neg().mod(constants_2.BIN_ARRAY_BITMAP_SIZE);
    };
    const getBitmapOffset = (binArrayIndex) => {
        return binArrayIndex.gt(new anchor_1.BN(0))
            ? binArrayIndex.div(constants_2.BIN_ARRAY_BITMAP_SIZE).sub(new anchor_1.BN(1))
            : binArrayIndex
                .add(new anchor_1.BN(1))
                .neg()
                .div(constants_2.BIN_ARRAY_BITMAP_SIZE)
                .sub(new anchor_1.BN(1));
    };
    if (startIndex <= endIndex) {
        for (let i = startIndex; i <= endIndex; i++) {
            const binArrayOffset = getBinArrayOffset(new anchor_1.BN(i)).toNumber();
            const bitmapOffset = getBitmapOffset(new anchor_1.BN(i)).toNumber();
            const bitmapChunks = i > 0
                ? binArrayBitmapExtension.positiveBinArrayBitmap[bitmapOffset]
                : binArrayBitmapExtension.negativeBinArrayBitmap[bitmapOffset];
            const bitmap = buildBitmapFromU64Arrays(bitmapChunks, types_1.BitmapType.U512);
            if (bitmap.testn(binArrayOffset)) {
                return i;
            }
        }
    }
    else {
        for (let i = startIndex; i >= endIndex; i--) {
            const binArrayOffset = getBinArrayOffset(new anchor_1.BN(i)).toNumber();
            const bitmapOffset = getBitmapOffset(new anchor_1.BN(i)).toNumber();
            const bitmapChunks = i > 0
                ? binArrayBitmapExtension.positiveBinArrayBitmap[bitmapOffset]
                : binArrayBitmapExtension.negativeBinArrayBitmap[bitmapOffset];
            const bitmap = buildBitmapFromU64Arrays(bitmapChunks, types_1.BitmapType.U512);
            if (bitmap.testn(binArrayOffset)) {
                return i;
            }
        }
    }
    return null;
}
/** private */
function isOverflowDefaultBinArrayBitmap(binArrayIndex) {
    const [minBinArrayIndex, maxBinArrayIndex] = internalBitmapRange();
    return (binArrayIndex.gt(maxBinArrayIndex) || binArrayIndex.lt(minBinArrayIndex));
}
function deriveBinArrayBitmapExtension(lbPair, programId) {
    return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("bitmap"), lbPair.toBytes()], programId);
}
function binIdToBinArrayIndex(binId) {
    const { div: idx, mod } = binId.divmod(constants_1.MAX_BIN_ARRAY_SIZE);
    return binId.isNeg() && !mod.isZero() ? idx.sub(new anchor_1.BN(1)) : idx;
}
function getBinArrayLowerUpperBinId(binArrayIndex) {
    const lowerBinId = binArrayIndex.mul(constants_1.MAX_BIN_ARRAY_SIZE);
    const upperBinId = lowerBinId.add(constants_1.MAX_BIN_ARRAY_SIZE).sub(new anchor_1.BN(1));
    return [lowerBinId, upperBinId];
}
function isBinIdWithinBinArray(activeId, binArrayIndex) {
    const [lowerBinId, upperBinId] = getBinArrayLowerUpperBinId(binArrayIndex);
    return activeId.gte(lowerBinId) && activeId.lte(upperBinId);
}
function getBinFromBinArray(binId, binArray) {
    const [lowerBinId, upperBinId] = getBinArrayLowerUpperBinId(binArray.index);
    let index = 0;
    if (binId > 0) {
        index = binId - lowerBinId.toNumber();
    }
    else {
        const delta = upperBinId.toNumber() - binId;
        index = constants_1.MAX_BIN_ARRAY_SIZE.toNumber() - delta - 1;
    }
    return binArray.bins[index];
}
function findNextBinArrayIndexWithLiquidity(swapForY, activeId, lbPairState, binArrayBitmapExtension) {
    const [lowerBinArrayIndex, upperBinArrayIndex] = internalBitmapRange();
    let startBinArrayIndex = binIdToBinArrayIndex(activeId);
    while (true) {
        if (isOverflowDefaultBinArrayBitmap(startBinArrayIndex)) {
            if (binArrayBitmapExtension === null) {
                return null;
            }
            // When bin array index is negative, the MSB is smallest bin array index.
            const [minBinArrayIndex, maxBinArrayIndex] = extensionBitmapRange();
            if (startBinArrayIndex.isNeg()) {
                if (swapForY) {
                    const binArrayIndex = findSetBit(startBinArrayIndex.toNumber(), minBinArrayIndex.toNumber(), binArrayBitmapExtension);
                    if (binArrayIndex !== null) {
                        return new anchor_1.BN(binArrayIndex);
                    }
                    else {
                        return null;
                    }
                }
                else {
                    const binArrayIndex = findSetBit(startBinArrayIndex.toNumber(), constants_2.BIN_ARRAY_BITMAP_SIZE.neg().sub(new anchor_1.BN(1)).toNumber(), binArrayBitmapExtension);
                    if (binArrayIndex !== null) {
                        return new anchor_1.BN(binArrayIndex);
                    }
                    else {
                        // Move to internal bitmap
                        startBinArrayIndex = constants_2.BIN_ARRAY_BITMAP_SIZE.neg();
                    }
                }
            }
            else {
                if (swapForY) {
                    const binArrayIndex = findSetBit(startBinArrayIndex.toNumber(), constants_2.BIN_ARRAY_BITMAP_SIZE.toNumber(), binArrayBitmapExtension);
                    if (binArrayIndex !== null) {
                        return new anchor_1.BN(binArrayIndex);
                    }
                    else {
                        // Move to internal bitmap
                        startBinArrayIndex = constants_2.BIN_ARRAY_BITMAP_SIZE.sub(new anchor_1.BN(1));
                    }
                }
                else {
                    const binArrayIndex = findSetBit(startBinArrayIndex.toNumber(), maxBinArrayIndex.toNumber(), binArrayBitmapExtension);
                    if (binArrayIndex !== null) {
                        return new anchor_1.BN(binArrayIndex);
                    }
                    else {
                        return null;
                    }
                }
            }
        }
        else {
            // Internal bitmap
            const bitmapType = types_1.BitmapType.U1024;
            const bitmapDetail = bitmapTypeDetail(bitmapType);
            const offset = startBinArrayIndex.add(constants_2.BIN_ARRAY_BITMAP_SIZE);
            const bitmap = buildBitmapFromU64Arrays(lbPairState.binArrayBitmap, bitmapType);
            if (swapForY) {
                const upperBitRange = new anchor_1.BN(bitmapDetail.bits - 1).sub(offset);
                const croppedBitmap = bitmap.shln(upperBitRange.toNumber());
                const msb = mostSignificantBit(croppedBitmap, bitmapDetail.bits);
                if (msb !== null) {
                    return startBinArrayIndex.sub(new anchor_1.BN(msb));
                }
                else {
                    // Move to extension
                    startBinArrayIndex = lowerBinArrayIndex.sub(new anchor_1.BN(1));
                }
            }
            else {
                const lowerBitRange = offset;
                const croppedBitmap = bitmap.shrn(lowerBitRange.toNumber());
                const lsb = leastSignificantBit(croppedBitmap, bitmapDetail.bits);
                if (lsb !== null) {
                    return startBinArrayIndex.add(new anchor_1.BN(lsb));
                }
                else {
                    // Move to extension
                    startBinArrayIndex = upperBinArrayIndex.add(new anchor_1.BN(1));
                }
            }
        }
    }
}
function findNextBinArrayWithLiquidity(swapForY, activeBinId, lbPairState, binArrayBitmapExtension, binArrays) {
    const nearestBinArrayIndexWithLiquidity = findNextBinArrayIndexWithLiquidity(swapForY, activeBinId, lbPairState, binArrayBitmapExtension);
    if (nearestBinArrayIndexWithLiquidity == null) {
        return null;
    }
    const binArrayAccount = binArrays.find((ba) => ba.account.index.eq(nearestBinArrayIndexWithLiquidity));
    if (!binArrayAccount) {
        // Cached bin array couldn't cover more bins, partial quoted.
        return null;
    }
    return binArrayAccount;
}
/**
 * Retrieves the bin arrays required to initialize multiple positions in continuous range.
 *
 * @param {PublicKey} pair - The public key of the pair.
 * @param {BN} fromBinId - The starting bin ID.
 * @param {BN} toBinId - The ending bin ID.
 * @return {[{key: PublicKey, index: BN }]} An array of bin arrays required for the given position range.
 */
function getBinArraysRequiredByPositionRange(pair, fromBinId, toBinId, programId) {
    const [minBinId, maxBinId] = fromBinId.lt(toBinId)
        ? [fromBinId, toBinId]
        : [toBinId, fromBinId];
    const positionCount = (0, math_1.getPositionCount)(minBinId, maxBinId);
    const binArrays = new Map();
    for (let i = 0; i < positionCount.toNumber(); i++) {
        const lowerBinId = minBinId.add(constants_1.MAX_BIN_PER_POSITION.mul(new anchor_1.BN(i)));
        const lowerBinArrayIndex = binIdToBinArrayIndex(lowerBinId);
        const upperBinArrayIndex = lowerBinArrayIndex.add(new anchor_1.BN(1));
        const [lowerBinArray] = (0, derive_1.deriveBinArray)(pair, lowerBinArrayIndex, programId);
        const [upperBinArray] = (0, derive_1.deriveBinArray)(pair, upperBinArrayIndex, programId);
        binArrays.set(lowerBinArray.toBase58(), lowerBinArrayIndex);
        binArrays.set(upperBinArray.toBase58(), upperBinArrayIndex);
    }
    return Array.from(binArrays, ([key, index]) => ({
        key: new web3_js_1.PublicKey(key),
        index,
    }));
}
function* enumerateBins(binsById, lowerBinId, upperBinId, binStep, baseTokenDecimal, quoteTokenDecimal, version) {
    for (let currentBinId = lowerBinId; currentBinId <= upperBinId; currentBinId++) {
        const bin = binsById.get(currentBinId);
        if (bin != null) {
            yield types_1.BinLiquidity.fromBin(bin, currentBinId, binStep, baseTokenDecimal, quoteTokenDecimal, version);
        }
        else {
            yield types_1.BinLiquidity.empty(currentBinId, binStep, baseTokenDecimal, quoteTokenDecimal, version);
        }
    }
}
