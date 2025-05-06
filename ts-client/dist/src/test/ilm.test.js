"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const anchor_1 = require("@coral-xyz/anchor");
const spl_token_1 = require("@solana/spl-token");
const web3_js_1 = require("@solana/web3.js");
const babar_1 = __importDefault(require("babar"));
const decimal_js_1 = __importDefault(require("decimal.js"));
const fs_1 = __importDefault(require("fs"));
const constants_1 = require("../dlmm/constants");
const helpers_1 = require("../dlmm/helpers");
const index_1 = require("../dlmm/index");
const types_1 = require("../dlmm/types");
const keypairBuffer = fs_1.default.readFileSync("../keys/localnet/admin-bossj3JvwiNK7pvjr149DqdtJxf2gdygbcmEPTkb2F1.json", "utf-8");
const connection = new web3_js_1.Connection("http://127.0.0.1:8899", "confirmed");
const keypair = web3_js_1.Keypair.fromSecretKey(new Uint8Array(JSON.parse(keypairBuffer)));
const programId = new web3_js_1.PublicKey(constants_1.LBCLMM_PROGRAM_IDS["localhost"]);
describe("ILM test", () => {
    describe("WEN", () => {
        const baseKeypair = web3_js_1.Keypair.generate();
        const wenDecimal = 5;
        const usdcDecimal = 6;
        const feeBps = new anchor_1.BN(500);
        const lockDuration = new anchor_1.BN(0);
        let WEN;
        let USDC;
        let userWEN;
        let userUSDC;
        let pairKey;
        let pair;
        const toLamportMultiplier = new decimal_js_1.default(10 ** (wenDecimal - usdcDecimal));
        const minPrice = 0.000001;
        const maxPrice = 0.00003;
        const binStep = 100;
        const curvature = 0.6;
        const seedAmount = new anchor_1.BN(200_000_000_000);
        const minBinId = index_1.DLMM.getBinIdFromPrice(new decimal_js_1.default(minPrice).mul(toLamportMultiplier), binStep, false);
        beforeAll(async () => {
            WEN = await (0, spl_token_1.createMint)(connection, keypair, keypair.publicKey, null, wenDecimal, web3_js_1.Keypair.generate(), null, spl_token_1.TOKEN_PROGRAM_ID);
            USDC = await (0, spl_token_1.createMint)(connection, keypair, keypair.publicKey, null, usdcDecimal, web3_js_1.Keypair.generate(), null, spl_token_1.TOKEN_PROGRAM_ID);
            const userWenInfo = await (0, spl_token_1.getOrCreateAssociatedTokenAccount)(connection, keypair, WEN, keypair.publicKey, false, "confirmed", {
                commitment: "confirmed",
            }, spl_token_1.TOKEN_PROGRAM_ID, spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID);
            userWEN = userWenInfo.address;
            const userUsdcInfo = await (0, spl_token_1.getOrCreateAssociatedTokenAccount)(connection, keypair, USDC, keypair.publicKey, false, "confirmed", {
                commitment: "confirmed",
            }, spl_token_1.TOKEN_PROGRAM_ID, spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID);
            userUSDC = userUsdcInfo.address;
            await (0, spl_token_1.mintTo)(connection, keypair, WEN, userWEN, keypair.publicKey, 200_000_000_000 * 10 ** wenDecimal, [], {
                commitment: "confirmed",
            }, spl_token_1.TOKEN_PROGRAM_ID);
            await (0, spl_token_1.mintTo)(connection, keypair, USDC, userUSDC, keypair.publicKey, 1_000_000_000 * 10 ** usdcDecimal, [], {
                commitment: "confirmed",
            }, spl_token_1.TOKEN_PROGRAM_ID);
            const slot = await connection.getSlot();
            const activationPoint = new anchor_1.BN(slot).add(new anchor_1.BN(100));
            let rawTx = await index_1.DLMM.createCustomizablePermissionlessLbPair(connection, new anchor_1.BN(binStep), WEN, USDC, new anchor_1.BN(minBinId.toString()), feeBps, types_1.ActivationType.Slot, false, // No alpha vault. Set to true the program will deterministically whitelist the alpha vault to swap before the pool start trading. Check: https://github.com/MeteoraAg/alpha-vault-sdk initialize{Prorata|Fcfs}Vault method to create the alpha vault.
            keypair.publicKey, activationPoint, {
                cluster: "localhost",
            });
            let txHash = await (0, web3_js_1.sendAndConfirmTransaction)(connection, rawTx, [
                keypair,
            ]).catch((e) => {
                console.error(e);
                throw e;
            });
            console.log("Create permissioned LB pair", txHash);
            [pairKey] = (0, helpers_1.deriveCustomizablePermissionlessLbPair)(WEN, USDC, programId);
            pair = await index_1.DLMM.create(connection, pairKey, {
                cluster: "localhost",
            });
        });
        it("seed liquidity", async () => {
            const { initializeBinArraysAndPositionIxs, addLiquidityIxs } = await pair.seedLiquidity(keypair.publicKey, seedAmount, curvature, minPrice, maxPrice, baseKeypair.publicKey);
            // Initialize all bin array and position, transaction order can be in sequence or not
            {
                const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
                const transactions = [];
                for (const groupIx of initializeBinArraysAndPositionIxs) {
                    const tx = new web3_js_1.Transaction({
                        feePayer: keypair.publicKey,
                        blockhash,
                        lastValidBlockHeight,
                    }).add(...groupIx);
                    const signers = [keypair, baseKeypair];
                    transactions.push((0, web3_js_1.sendAndConfirmTransaction)(connection, tx, signers));
                }
                await Promise.all(transactions)
                    .then((txs) => {
                    txs.map(console.log);
                })
                    .catch((e) => {
                    console.error(e);
                    throw e;
                });
            }
            const beforeTokenXBalance = await connection
                .getTokenAccountBalance(userWEN)
                .then((i) => new anchor_1.BN(i.value.amount));
            {
                const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
                const transactions = [];
                // Deposit to positions created in above step. The add liquidity order can be in sequence or not.
                for (const groupIx of addLiquidityIxs) {
                    const tx = new web3_js_1.Transaction({
                        feePayer: keypair.publicKey,
                        blockhash,
                        lastValidBlockHeight,
                    }).add(...groupIx);
                    const signers = [keypair];
                    transactions.push((0, web3_js_1.sendAndConfirmTransaction)(connection, tx, signers));
                }
                await Promise.all(transactions)
                    .then((txs) => {
                    txs.map(console.log);
                })
                    .catch((e) => {
                    console.error(e);
                    throw e;
                });
            }
            const afterTokenXBalance = await connection
                .getTokenAccountBalance(userWEN)
                .then((i) => new anchor_1.BN(i.value.amount));
            const actualDepositedAmount = beforeTokenXBalance.sub(afterTokenXBalance);
            expect(actualDepositedAmount.toString()).toEqual(seedAmount.toString());
            let binArrays = await pair.getBinArrays();
            binArrays = binArrays.sort((a, b) => a.account.index.cmp(b.account.index));
            const binLiquidities = binArrays
                .map((ba) => {
                const [lowerBinId, upperBinId] = (0, helpers_1.getBinArrayLowerUpperBinId)(ba.account.index);
                const binWithLiquidity = [];
                for (let i = lowerBinId.toNumber(); i <= upperBinId.toNumber(); i++) {
                    const binAmountX = ba.account.bins[i - lowerBinId.toNumber()].amountX;
                    const binPrice = (0, helpers_1.getPriceOfBinByBinId)(i, pair.lbPair.binStep);
                    const liquidity = new decimal_js_1.default(binAmountX.toString())
                        .mul(binPrice)
                        .floor()
                        .toNumber();
                    binWithLiquidity.push([i, liquidity]);
                }
                return binWithLiquidity;
            })
                .flat();
            console.log(binLiquidities.filter((b) => b[1] > 0).reverse());
            console.log(binLiquidities.filter((b) => b[1] > 0));
            console.log((0, babar_1.default)(binLiquidities));
        });
    });
    describe("Shaky", () => {
        const baseKeypair = web3_js_1.Keypair.generate();
        const sharkyDecimal = 6;
        const usdcDecimal = 6;
        const feeBps = new anchor_1.BN(250);
        let SHARKY;
        let USDC;
        let userSHAKY;
        let userUSDC;
        let pairKey;
        let pair;
        const toLamportMultiplier = new decimal_js_1.default(10 ** (sharkyDecimal - usdcDecimal));
        const minPrice = 0.5;
        const maxPrice = 1.62;
        const binStep = 80;
        const curvature = 1;
        const seedAmount = new anchor_1.BN(5_000_000_000_000);
        const minBinId = index_1.DLMM.getBinIdFromPrice(new decimal_js_1.default(minPrice).mul(toLamportMultiplier), binStep, false);
        beforeAll(async () => {
            SHARKY = await (0, spl_token_1.createMint)(connection, keypair, keypair.publicKey, null, sharkyDecimal, web3_js_1.Keypair.generate(), null, spl_token_1.TOKEN_PROGRAM_ID);
            USDC = await (0, spl_token_1.createMint)(connection, keypair, keypair.publicKey, null, usdcDecimal, web3_js_1.Keypair.generate(), null, spl_token_1.TOKEN_PROGRAM_ID);
            const userShakyInfo = await (0, spl_token_1.getOrCreateAssociatedTokenAccount)(connection, keypair, SHARKY, keypair.publicKey, false, "confirmed", {
                commitment: "confirmed",
            }, spl_token_1.TOKEN_PROGRAM_ID, spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID);
            userSHAKY = userShakyInfo.address;
            const userUsdcInfo = await (0, spl_token_1.getOrCreateAssociatedTokenAccount)(connection, keypair, USDC, keypair.publicKey, false, "confirmed", {
                commitment: "confirmed",
            }, spl_token_1.TOKEN_PROGRAM_ID, spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID);
            userUSDC = userUsdcInfo.address;
            await (0, spl_token_1.mintTo)(connection, keypair, SHARKY, userSHAKY, keypair.publicKey, 200_000_000_000 * 10 ** sharkyDecimal, [], {
                commitment: "confirmed",
            }, spl_token_1.TOKEN_PROGRAM_ID);
            await (0, spl_token_1.mintTo)(connection, keypair, USDC, userUSDC, keypair.publicKey, 1_000_000_000 * 10 ** usdcDecimal, [], {
                commitment: "confirmed",
            }, spl_token_1.TOKEN_PROGRAM_ID);
            const slot = await connection.getSlot();
            const activationPoint = new anchor_1.BN(slot).add(new anchor_1.BN(100));
            let rawTx = await index_1.DLMM.createCustomizablePermissionlessLbPair(connection, new anchor_1.BN(binStep), SHARKY, USDC, new anchor_1.BN(minBinId.toString()), feeBps, types_1.ActivationType.Slot, false, // No alpha vault. Set to true the program will deterministically whitelist the alpha vault to swap before the pool start trading. Check: https://github.com/MeteoraAg/alpha-vault-sdk initialize{Prorata|Fcfs}Vault method to create the alpha vault.
            keypair.publicKey, activationPoint, {
                cluster: "localhost",
            });
            let txHash = await (0, web3_js_1.sendAndConfirmTransaction)(connection, rawTx, [
                keypair,
            ]).catch((e) => {
                console.error(e);
                throw e;
            });
            console.log("Create permissioned LB pair", txHash);
            [pairKey] = (0, helpers_1.deriveCustomizablePermissionlessLbPair)(SHARKY, USDC, programId);
            pair = await index_1.DLMM.create(connection, pairKey, {
                cluster: "localhost",
            });
        });
        it("seed liquidity", async () => {
            const { initializeBinArraysAndPositionIxs, addLiquidityIxs } = await pair.seedLiquidity(keypair.publicKey, seedAmount, curvature, minPrice, maxPrice, baseKeypair.publicKey);
            // Initialize all bin array and position, transaction order can be in sequence or not
            {
                const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
                const transactions = [];
                for (const groupIx of initializeBinArraysAndPositionIxs) {
                    const tx = new web3_js_1.Transaction({
                        feePayer: keypair.publicKey,
                        blockhash,
                        lastValidBlockHeight,
                    }).add(...groupIx);
                    const signers = [keypair, baseKeypair];
                    transactions.push((0, web3_js_1.sendAndConfirmTransaction)(connection, tx, signers));
                }
                await Promise.all(transactions)
                    .then((txs) => {
                    txs.map(console.log);
                })
                    .catch((e) => {
                    console.error(e);
                    throw e;
                });
            }
            const beforeTokenXBalance = await connection
                .getTokenAccountBalance(userSHAKY)
                .then((i) => new anchor_1.BN(i.value.amount));
            {
                const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
                const transactions = [];
                // Deposit to positions created in above step. The add liquidity order can be in sequence or not.
                for (const groupIx of addLiquidityIxs) {
                    const tx = new web3_js_1.Transaction({
                        feePayer: keypair.publicKey,
                        blockhash,
                        lastValidBlockHeight,
                    }).add(...groupIx);
                    const signers = [keypair];
                    transactions.push((0, web3_js_1.sendAndConfirmTransaction)(connection, tx, signers));
                }
                await Promise.all(transactions)
                    .then((txs) => {
                    txs.map(console.log);
                })
                    .catch((e) => {
                    console.error(e);
                    throw e;
                });
            }
            const afterTokenXBalance = await connection
                .getTokenAccountBalance(userSHAKY)
                .then((i) => new anchor_1.BN(i.value.amount));
            const actualDepositedAmount = beforeTokenXBalance.sub(afterTokenXBalance);
            expect(actualDepositedAmount.toString()).toEqual(seedAmount.toString());
            let binArrays = await pair.getBinArrays();
            binArrays = binArrays.sort((a, b) => a.account.index.cmp(b.account.index));
            const binLiquidities = binArrays
                .map((ba) => {
                const [lowerBinId, upperBinId] = (0, helpers_1.getBinArrayLowerUpperBinId)(ba.account.index);
                const binWithLiquidity = [];
                for (let i = lowerBinId.toNumber(); i <= upperBinId.toNumber(); i++) {
                    const binAmountX = ba.account.bins[i - lowerBinId.toNumber()].amountX;
                    const binPrice = (0, helpers_1.getPriceOfBinByBinId)(i, pair.lbPair.binStep);
                    const liquidity = new decimal_js_1.default(binAmountX.toString())
                        .mul(binPrice)
                        .floor()
                        .toNumber();
                    binWithLiquidity.push([i, liquidity]);
                }
                return binWithLiquidity;
            })
                .flat();
            console.log(binLiquidities.filter((b) => b[1] > 0).reverse());
            console.log(binLiquidities.filter((b) => b[1] > 0));
            console.log((0, babar_1.default)(binLiquidities));
        });
    });
});
