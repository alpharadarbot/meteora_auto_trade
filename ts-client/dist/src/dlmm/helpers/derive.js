"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.derivePresetParameter = derivePresetParameter;
exports.derivePresetParameter2 = derivePresetParameter2;
exports.deriveLbPair2 = deriveLbPair2;
exports.deriveLbPair = deriveLbPair;
exports.deriveCustomizablePermissionlessLbPair = deriveCustomizablePermissionlessLbPair;
exports.derivePermissionLbPair = derivePermissionLbPair;
exports.deriveOracle = deriveOracle;
exports.derivePosition = derivePosition;
exports.deriveBinArray = deriveBinArray;
exports.deriveReserve = deriveReserve;
const web3_js_1 = require("@solana/web3.js");
const constants_1 = require("../constants");
/** private */
function sortTokenMints(tokenX, tokenY) {
    const [minKey, maxKey] = tokenX.toBuffer().compare(tokenY.toBuffer()) == 1
        ? [tokenY, tokenX]
        : [tokenX, tokenY];
    return [minKey, maxKey];
}
/** private */
/**
 *
 * @deprecated Use derivePresetParameter2
 */
function derivePresetParameter(binStep, programId) {
    return web3_js_1.PublicKey.findProgramAddressSync([
        Buffer.from("preset_parameter"),
        new Uint8Array(binStep.toArrayLike(Buffer, "le", 2)),
    ], programId);
}
function derivePresetParameter2(binStep, baseFactor, programId) {
    return web3_js_1.PublicKey.findProgramAddressSync([
        Buffer.from("preset_parameter"),
        new Uint8Array(binStep.toArrayLike(Buffer, "le", 2)),
        new Uint8Array(baseFactor.toArrayLike(Buffer, "le", 2)),
    ], programId);
}
function deriveLbPair2(tokenX, tokenY, binStep, baseFactor, programId) {
    const [minKey, maxKey] = sortTokenMints(tokenX, tokenY);
    return web3_js_1.PublicKey.findProgramAddressSync([
        minKey.toBuffer(),
        maxKey.toBuffer(),
        new Uint8Array(binStep.toArrayLike(Buffer, "le", 2)),
        new Uint8Array(baseFactor.toArrayLike(Buffer, "le", 2)),
    ], programId);
}
/**
 *
 * @deprecated Use deriveLbPair2
 */
function deriveLbPair(tokenX, tokenY, binStep, programId) {
    const [minKey, maxKey] = sortTokenMints(tokenX, tokenY);
    return web3_js_1.PublicKey.findProgramAddressSync([
        minKey.toBuffer(),
        maxKey.toBuffer(),
        new Uint8Array(binStep.toArrayLike(Buffer, "le", 2)),
    ], programId);
}
function deriveCustomizablePermissionlessLbPair(tokenX, tokenY, programId) {
    const [minKey, maxKey] = sortTokenMints(tokenX, tokenY);
    return web3_js_1.PublicKey.findProgramAddressSync([constants_1.ILM_BASE.toBuffer(), minKey.toBuffer(), maxKey.toBuffer()], programId);
}
function derivePermissionLbPair(baseKey, tokenX, tokenY, binStep, programId) {
    const [minKey, maxKey] = sortTokenMints(tokenX, tokenY);
    return web3_js_1.PublicKey.findProgramAddressSync([
        baseKey.toBuffer(),
        minKey.toBuffer(),
        maxKey.toBuffer(),
        new Uint8Array(binStep.toArrayLike(Buffer, "le", 2)),
    ], programId);
}
function deriveOracle(lbPair, programId) {
    return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("oracle"), lbPair.toBytes()], programId);
}
function derivePosition(lbPair, base, lowerBinId, width, programId) {
    let lowerBinIdBytes;
    if (lowerBinId.isNeg()) {
        lowerBinIdBytes = new Uint8Array(lowerBinId.toTwos(32).toArrayLike(Buffer, "le", 4));
    }
    else {
        lowerBinIdBytes = new Uint8Array(lowerBinId.toArrayLike(Buffer, "le", 4));
    }
    return web3_js_1.PublicKey.findProgramAddressSync([
        Buffer.from("position"),
        lbPair.toBuffer(),
        base.toBuffer(),
        lowerBinIdBytes,
        new Uint8Array(width.toBuffer("le", 4)),
    ], programId);
}
function deriveBinArray(lbPair, index, programId) {
    let binArrayBytes;
    if (index.isNeg()) {
        binArrayBytes = new Uint8Array(index.toTwos(64).toArrayLike(Buffer, "le", 8));
    }
    else {
        binArrayBytes = new Uint8Array(index.toArrayLike(Buffer, "le", 8));
    }
    return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("bin_array"), lbPair.toBytes(), binArrayBytes], programId);
}
function deriveReserve(token, lbPair, programId) {
    return web3_js_1.PublicKey.findProgramAddressSync([lbPair.toBuffer(), token.toBuffer()], programId);
}
