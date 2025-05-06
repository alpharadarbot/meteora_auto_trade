"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const web3_js_1 = require("@solana/web3.js");
const dlmm_1 = require("../dlmm");
const bn_js_1 = __importDefault(require("bn.js"));
const decimal_js_1 = __importDefault(require("decimal.js"));
const helpers_1 = require("../dlmm/helpers");
const rpc_1 = require("@coral-xyz/anchor/dist/cjs/utils/rpc");
async function initializeBinArrayExample() {
    const funder = web3_js_1.Keypair.fromSecretKey(new Uint8Array(JSON.parse(process.env.WALLET)));
    console.log("Connected wallet", funder.publicKey.toBase58());
    const poolAddress = new web3_js_1.PublicKey("BfxJcifavkCgznhvAtLsBHQpyNwaTMs2cR986qbH4fPh");
    let rpc = "https://api.mainnet-beta.solana.com";
    const connection = new web3_js_1.Connection(rpc, "finalized");
    const dlmmPool = await dlmm_1.DLMM.create(connection, poolAddress, {
        cluster: "mainnet-beta",
    });
    const fromUIPrice = 1.0;
    const toUIPrice = 4.0;
    const toLamportMultiplier = new decimal_js_1.default(10 ** (dlmmPool.tokenY.decimal - dlmmPool.tokenX.decimal));
    const minPricePerLamport = new decimal_js_1.default(fromUIPrice).mul(toLamportMultiplier);
    const maxPricePerLamport = new decimal_js_1.default(toUIPrice).mul(toLamportMultiplier);
    const minBinId = new bn_js_1.default(dlmm_1.DLMM.getBinIdFromPrice(minPricePerLamport, dlmmPool.lbPair.binStep, false));
    const maxBinId = new bn_js_1.default(dlmm_1.DLMM.getBinIdFromPrice(maxPricePerLamport, dlmmPool.lbPair.binStep, false));
    const binArraysRequired = (0, helpers_1.getBinArraysRequiredByPositionRange)(poolAddress, minBinId, maxBinId, dlmmPool.program.programId);
    console.log(binArraysRequired);
    const initializeBinArrayIxs = await dlmmPool.initializeBinArrays(binArraysRequired.map((b) => b.index), funder.publicKey);
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    const transaction = new web3_js_1.Transaction({
        blockhash,
        lastValidBlockHeight,
        feePayer: funder.publicKey,
    }).add(...initializeBinArrayIxs);
    transaction.sign(funder);
    const simulationResult = await (0, rpc_1.simulateTransaction)(connection, transaction, [
        funder,
    ]);
    console.log(simulationResult);
}
initializeBinArrayExample();
