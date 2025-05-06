"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const web3_js_1 = require("@solana/web3.js");
const bytes_1 = require("@coral-xyz/anchor/dist/cjs/utils/bytes");
const dlmm_1 = require("../dlmm");
const bn_js_1 = __importDefault(require("bn.js"));
const types_1 = require("../dlmm/types");
const user = web3_js_1.Keypair.fromSecretKey(new Uint8Array(bytes_1.bs58.decode(process.env.USER_PRIVATE_KEY)));
const RPC = process.env.RPC || "https://api.devnet.solana.com";
const connection = new web3_js_1.Connection(RPC, "finalized");
const poolAddress = new web3_js_1.PublicKey("3W2HKgUa96Z69zzG3LK1g8KdcRAWzAttiLiHfYnKuPw5");
let activeBin;
let userPositions = [];
const newBalancePosition = new web3_js_1.Keypair();
const newImbalancePosition = new web3_js_1.Keypair();
const newOneSidePosition = new web3_js_1.Keypair();
async function getActiveBin(dlmmPool) {
    // Get pool state
    activeBin = await dlmmPool.getActiveBin();
    console.log("🚀 ~ activeBin:", activeBin);
}
// To create a balance deposit position
async function createBalancePosition(dlmmPool) {
    const TOTAL_RANGE_INTERVAL = 10; // 10 bins on each side of the active bin
    const minBinId = activeBin.binId - TOTAL_RANGE_INTERVAL;
    const maxBinId = activeBin.binId + TOTAL_RANGE_INTERVAL;
    const activeBinPricePerToken = dlmmPool.fromPricePerLamport(Number(activeBin.price));
    const totalXAmount = new bn_js_1.default(100);
    const totalYAmount = totalXAmount.mul(new bn_js_1.default(Number(activeBinPricePerToken)));
    // Create Position
    const createPositionTx = await dlmmPool.initializePositionAndAddLiquidityByStrategy({
        positionPubKey: newBalancePosition.publicKey,
        user: user.publicKey,
        totalXAmount,
        totalYAmount,
        strategy: {
            maxBinId,
            minBinId,
            strategyType: types_1.StrategyType.SpotBalanced,
        },
    });
    try {
        const createBalancePositionTxHash = await (0, web3_js_1.sendAndConfirmTransaction)(connection, createPositionTx, [user, newBalancePosition]);
        console.log("🚀 ~ createBalancePositionTxHash:", createBalancePositionTxHash);
    }
    catch (error) {
        console.log("🚀 ~ error:", JSON.parse(JSON.stringify(error)));
    }
}
async function createImbalancePosition(dlmmPool) {
    const TOTAL_RANGE_INTERVAL = 10; // 10 bins on each side of the active bin
    const minBinId = activeBin.binId - TOTAL_RANGE_INTERVAL;
    const maxBinId = activeBin.binId + TOTAL_RANGE_INTERVAL;
    const totalXAmount = new bn_js_1.default(100);
    const totalYAmount = new bn_js_1.default(50);
    // Create Position
    const createPositionTx = await dlmmPool.initializePositionAndAddLiquidityByStrategy({
        positionPubKey: newImbalancePosition.publicKey,
        user: user.publicKey,
        totalXAmount,
        totalYAmount,
        strategy: {
            maxBinId,
            minBinId,
            strategyType: types_1.StrategyType.SpotImBalanced,
        },
    });
    try {
        const createImbalancePositionTxHash = await (0, web3_js_1.sendAndConfirmTransaction)(connection, createPositionTx, [user, newImbalancePosition]);
        console.log("🚀 ~ createImbalancePositionTxHash:", createImbalancePositionTxHash);
    }
    catch (error) {
        console.log("🚀 ~ error:", JSON.parse(JSON.stringify(error)));
    }
}
async function createOneSidePosition(dlmmPool) {
    const TOTAL_RANGE_INTERVAL = 10; // 10 bins on each side of the active bin
    const minBinId = activeBin.binId;
    const maxBinId = activeBin.binId + TOTAL_RANGE_INTERVAL * 2;
    const totalXAmount = new bn_js_1.default(100);
    const totalYAmount = new bn_js_1.default(0);
    // Create Position
    const createPositionTx = await dlmmPool.initializePositionAndAddLiquidityByStrategy({
        positionPubKey: newOneSidePosition.publicKey,
        user: user.publicKey,
        totalXAmount,
        totalYAmount,
        strategy: {
            maxBinId,
            minBinId,
            strategyType: types_1.StrategyType.SpotImBalanced,
        },
    });
    try {
        const createOneSidePositionTxHash = await (0, web3_js_1.sendAndConfirmTransaction)(connection, createPositionTx, [user, newOneSidePosition]);
        console.log("🚀 ~ createOneSidePositionTxHash:", createOneSidePositionTxHash);
    }
    catch (error) {
        console.log("🚀 ~ error:", JSON.parse(JSON.stringify(error)));
    }
}
async function getPositionsState(dlmmPool) {
    // Get position state
    const positionsState = await dlmmPool.getPositionsByUserAndLbPair(user.publicKey);
    userPositions = positionsState.userPositions;
    console.log("🚀 ~ userPositions:", userPositions);
}
async function addLiquidityToExistingPosition(dlmmPool) {
    const TOTAL_RANGE_INTERVAL = 10; // 10 bins on each side of the active bin
    const minBinId = activeBin.binId - TOTAL_RANGE_INTERVAL;
    const maxBinId = activeBin.binId + TOTAL_RANGE_INTERVAL;
    const activeBinPricePerToken = dlmmPool.fromPricePerLamport(Number(activeBin.price));
    const totalXAmount = new bn_js_1.default(100);
    const totalYAmount = totalXAmount.mul(new bn_js_1.default(Number(activeBinPricePerToken)));
    // Add Liquidity to existing position
    const addLiquidityTx = await dlmmPool.addLiquidityByStrategy({
        positionPubKey: newBalancePosition.publicKey,
        user: user.publicKey,
        totalXAmount,
        totalYAmount,
        strategy: {
            maxBinId,
            minBinId,
            strategyType: types_1.StrategyType.SpotBalanced,
        },
    });
    try {
        const addLiquidityTxHash = await (0, web3_js_1.sendAndConfirmTransaction)(connection, addLiquidityTx, [user]);
        console.log("🚀 ~ addLiquidityTxHash:", addLiquidityTxHash);
    }
    catch (error) {
        console.log("🚀 ~ error:", JSON.parse(JSON.stringify(error)));
    }
}
async function removePositionLiquidity(dlmmPool) {
    // Remove Liquidity
    const removeLiquidityTxs = (await Promise.all(userPositions.map(({ publicKey, positionData }) => {
        const binIdsToRemove = positionData.positionBinData.map((bin) => bin.binId);
        return dlmmPool.removeLiquidity({
            position: publicKey,
            user: user.publicKey,
            binIds: binIdsToRemove,
            bps: new bn_js_1.default(100 * 100),
            shouldClaimAndClose: true, // should claim swap fee and close position together
        });
    }))).flat();
    try {
        for (let tx of removeLiquidityTxs) {
            const removeBalanceLiquidityTxHash = await (0, web3_js_1.sendAndConfirmTransaction)(connection, tx, [user], { skipPreflight: false, preflightCommitment: "confirmed" });
            console.log("🚀 ~ removeBalanceLiquidityTxHash:", removeBalanceLiquidityTxHash);
        }
    }
    catch (error) {
        console.log("🚀 ~ error:", JSON.parse(JSON.stringify(error)));
    }
}
async function swap(dlmmPool) {
    const swapAmount = new bn_js_1.default(100);
    // Swap quote
    const swapYtoX = true;
    const binArrays = await dlmmPool.getBinArrayForSwap(swapYtoX);
    const swapQuote = await dlmmPool.swapQuote(swapAmount, swapYtoX, new bn_js_1.default(10), binArrays);
    console.log("🚀 ~ swapQuote:", swapQuote);
    // Swap
    const swapTx = await dlmmPool.swap({
        inToken: dlmmPool.tokenX.publicKey,
        binArraysPubkey: swapQuote.binArraysPubkey,
        inAmount: swapAmount,
        lbPair: dlmmPool.pubkey,
        user: user.publicKey,
        minOutAmount: swapQuote.minOutAmount,
        outToken: dlmmPool.tokenY.publicKey,
    });
    try {
        const swapTxHash = await (0, web3_js_1.sendAndConfirmTransaction)(connection, swapTx, [
            user,
        ]);
        console.log("🚀 ~ swapTxHash:", swapTxHash);
    }
    catch (error) {
        console.log("🚀 ~ error:", JSON.parse(JSON.stringify(error)));
    }
}
async function main() {
    const dlmmPool = await dlmm_1.DLMM.create(connection, poolAddress, {
        cluster: "devnet",
    });
    await getActiveBin(dlmmPool);
    await createBalancePosition(dlmmPool);
    await createImbalancePosition(dlmmPool);
    await createOneSidePosition(dlmmPool);
    await getPositionsState(dlmmPool);
    await addLiquidityToExistingPosition(dlmmPool);
    await removePositionLiquidity(dlmmPool);
    await swap(dlmmPool);
}
main();
