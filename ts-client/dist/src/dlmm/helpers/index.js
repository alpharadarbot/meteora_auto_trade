"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEstimatedComputeUnitIxWithBuffer = exports.getEstimatedComputeUnitUsageWithBuffer = exports.unwrapSOLInstruction = exports.wrapSOLInstruction = exports.parseLogs = exports.getOrCreateATAInstruction = void 0;
exports.chunks = chunks;
exports.range = range;
exports.chunkedFetchMultiplePoolAccount = chunkedFetchMultiplePoolAccount;
exports.chunkedFetchMultipleBinArrayBitmapExtensionAccount = chunkedFetchMultipleBinArrayBitmapExtensionAccount;
exports.getOutAmount = getOutAmount;
exports.getTokenDecimals = getTokenDecimals;
exports.getTokenBalance = getTokenBalance;
exports.chunkedGetMultipleAccountInfos = chunkedGetMultipleAccountInfos;
const spl_token_1 = require("@solana/spl-token");
const constants_1 = require("../constants");
const web3_js_1 = require("@solana/web3.js");
const math_1 = require("./math");
const helpers_1 = require("@solana-developers/helpers");
const computeUnit_1 = require("./computeUnit");
__exportStar(require("./derive"), exports);
__exportStar(require("./binArray"), exports);
__exportStar(require("./weight"), exports);
__exportStar(require("./fee"), exports);
__exportStar(require("./weightToAmounts"), exports);
__exportStar(require("./strategy"), exports);
__exportStar(require("./lbPair"), exports);
function chunks(array, size) {
    return Array.apply(0, new Array(Math.ceil(array.length / size))).map((_, index) => array.slice(index * size, (index + 1) * size));
}
function range(min, max, mapfn) {
    const length = max - min + 1;
    return Array.from({ length }, (_, i) => mapfn(min + i));
}
async function chunkedFetchMultiplePoolAccount(program, pks, chunkSize = 100) {
    const accounts = (await Promise.all(chunks(pks, chunkSize).map((chunk) => program.account.lbPair.fetchMultiple(chunk)))).flat();
    return accounts.filter(Boolean);
}
async function chunkedFetchMultipleBinArrayBitmapExtensionAccount(program, pks, chunkSize = 100) {
    const accounts = (await Promise.all(chunks(pks, chunkSize).map((chunk) => program.account.binArrayBitmapExtension.fetchMultiple(chunk)))).flat();
    return accounts;
}
function getOutAmount(bin, inAmount, swapForY) {
    return swapForY
        ? (0, math_1.mulShr)(inAmount, bin.price, constants_1.SCALE_OFFSET, math_1.Rounding.Down)
        : (0, math_1.shlDiv)(inAmount, bin.price, constants_1.SCALE_OFFSET, math_1.Rounding.Down);
}
async function getTokenDecimals(conn, mint) {
    const token = await (0, spl_token_1.getMint)(conn, mint);
    return await token.decimals;
}
const getOrCreateATAInstruction = async (connection, tokenMint, owner, payer = owner, allowOwnerOffCurve = true) => {
    const toAccount = (0, spl_token_1.getAssociatedTokenAddressSync)(tokenMint, owner, allowOwnerOffCurve);
    try {
        await (0, spl_token_1.getAccount)(connection, toAccount);
        return { ataPubKey: toAccount, ix: undefined };
    }
    catch (e) {
        if (e instanceof spl_token_1.TokenAccountNotFoundError ||
            e instanceof spl_token_1.TokenInvalidAccountOwnerError) {
            const ix = (0, spl_token_1.createAssociatedTokenAccountIdempotentInstruction)(payer, toAccount, owner, tokenMint);
            return { ataPubKey: toAccount, ix };
        }
        else {
            /* handle error */
            console.error("Error::getOrCreateATAInstruction", e);
            throw e;
        }
    }
};
exports.getOrCreateATAInstruction = getOrCreateATAInstruction;
async function getTokenBalance(conn, tokenAccount) {
    const acc = await (0, spl_token_1.getAccount)(conn, tokenAccount);
    return acc.amount;
}
const parseLogs = (eventParser, logs) => {
    if (!logs.length)
        throw new Error("No logs found");
    for (const event of eventParser?.parseLogs(logs)) {
        return event.data;
    }
    throw new Error("No events found");
};
exports.parseLogs = parseLogs;
const wrapSOLInstruction = (from, to, amount) => {
    return [
        web3_js_1.SystemProgram.transfer({
            fromPubkey: from,
            toPubkey: to,
            lamports: amount,
        }),
        new web3_js_1.TransactionInstruction({
            keys: [
                {
                    pubkey: to,
                    isSigner: false,
                    isWritable: true,
                },
            ],
            data: Buffer.from(new Uint8Array([17])),
            programId: spl_token_1.TOKEN_PROGRAM_ID,
        }),
    ];
};
exports.wrapSOLInstruction = wrapSOLInstruction;
const unwrapSOLInstruction = async (owner, allowOwnerOffCurve = true) => {
    const wSolATAAccount = (0, spl_token_1.getAssociatedTokenAddressSync)(spl_token_1.NATIVE_MINT, owner, allowOwnerOffCurve);
    if (wSolATAAccount) {
        const closedWrappedSolInstruction = (0, spl_token_1.createCloseAccountInstruction)(wSolATAAccount, owner, owner, [], spl_token_1.TOKEN_PROGRAM_ID);
        return closedWrappedSolInstruction;
    }
    return null;
};
exports.unwrapSOLInstruction = unwrapSOLInstruction;
async function chunkedGetMultipleAccountInfos(connection, pks, chunkSize = 100) {
    const accountInfos = (await Promise.all(chunks(pks, chunkSize).map((chunk) => connection.getMultipleAccountsInfo(chunk)))).flat();
    return accountInfos;
}
/**
 * Gets the estimated compute unit usage with a buffer.
 * @param connection A Solana connection object.
 * @param instructions The instructions of the transaction to simulate.
 * @param feePayer The public key of the fee payer.
 * @param buffer The buffer to add to the estimated compute unit usage. Max value is 1. Default value is 0.1 if not provided, and will be capped between 50k - 200k.
 * @returns The estimated compute unit usage with the buffer.
 */
const getEstimatedComputeUnitUsageWithBuffer = async (connection, instructions, feePayer, buffer) => {
    if (!buffer) {
        buffer = 0.1;
    }
    // Avoid negative value
    buffer = Math.max(0, buffer);
    // Limit buffer to 1
    buffer = Math.min(1, buffer);
    const estimatedComputeUnitUsage = await (0, helpers_1.getSimulationComputeUnits)(connection, instructions, feePayer, []);
    let extraComputeUnitBuffer = estimatedComputeUnitUsage * buffer;
    if (extraComputeUnitBuffer > computeUnit_1.MAX_CU_BUFFER) {
        extraComputeUnitBuffer = computeUnit_1.MAX_CU_BUFFER;
    }
    else if (extraComputeUnitBuffer < computeUnit_1.MIN_CU_BUFFER) {
        extraComputeUnitBuffer = computeUnit_1.MIN_CU_BUFFER;
    }
    return estimatedComputeUnitUsage + extraComputeUnitBuffer;
};
exports.getEstimatedComputeUnitUsageWithBuffer = getEstimatedComputeUnitUsageWithBuffer;
/**
 * Gets the estimated compute unit usage with a buffer and converts it to a SetComputeUnitLimit instruction.
 * If the estimated compute unit usage cannot be retrieved, returns a SetComputeUnitLimit instruction with the fallback unit.
 * @param connection A Solana connection object.
 * @param instructions The instructions of the transaction to simulate.
 * @param feePayer The public key of the fee payer.
 * @param buffer The buffer to add to the estimated compute unit usage. Max value is 1. Default value is 0.1 if not provided, and will be capped between 50k - 200k.
 * @returns A SetComputeUnitLimit instruction with the estimated compute unit usage.
 */
const getEstimatedComputeUnitIxWithBuffer = async (connection, instructions, feePayer, buffer) => {
    const units = await (0, exports.getEstimatedComputeUnitUsageWithBuffer)(connection, instructions, feePayer, buffer).catch((error) => {
        console.error("Error::getEstimatedComputeUnitUsageWithBuffer", error);
        return 1_400_000;
    });
    return web3_js_1.ComputeBudgetProgram.setComputeUnitLimit({ units });
};
exports.getEstimatedComputeUnitIxWithBuffer = getEstimatedComputeUnitIxWithBuffer;
