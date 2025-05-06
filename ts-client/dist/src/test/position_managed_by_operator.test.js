"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const anchor_1 = require("@coral-xyz/anchor");
const spl_token_1 = require("@solana/spl-token");
const web3_js_1 = require("@solana/web3.js");
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
describe("Position by operator", () => {
    describe("Position by operator management", () => {
        const baseKeypair = web3_js_1.Keypair.generate();
        const wenDecimal = 5;
        const usdcDecimal = 6;
        const feeBps = new anchor_1.BN(500);
        let WEN;
        let USDC;
        let operatorWEN;
        let operatorUSDC;
        let pairKey;
        let pair;
        let position;
        const toLamportMultiplier = new decimal_js_1.default(10 ** (wenDecimal - usdcDecimal));
        const minPrice = 1;
        const binStep = 100;
        const minBinId = index_1.DLMM.getBinIdFromPrice(new decimal_js_1.default(minPrice).mul(toLamportMultiplier), binStep, false);
        const operatorKeypair = web3_js_1.Keypair.generate();
        const mockMultisigKeypair = web3_js_1.Keypair.generate();
        beforeAll(async () => {
            const signature = await connection.requestAirdrop(operatorKeypair.publicKey, 10 * web3_js_1.LAMPORTS_PER_SOL);
            await connection.confirmTransaction(signature, "finalized");
            WEN = await (0, spl_token_1.createMint)(connection, keypair, keypair.publicKey, null, wenDecimal, web3_js_1.Keypair.generate(), null, spl_token_1.TOKEN_PROGRAM_ID);
            USDC = await (0, spl_token_1.createMint)(connection, keypair, keypair.publicKey, null, usdcDecimal, web3_js_1.Keypair.generate(), null, spl_token_1.TOKEN_PROGRAM_ID);
            const operatorWenInfo = await (0, spl_token_1.getOrCreateAssociatedTokenAccount)(connection, keypair, WEN, operatorKeypair.publicKey, false, "confirmed", {
                commitment: "confirmed",
            }, spl_token_1.TOKEN_PROGRAM_ID, spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID);
            operatorWEN = operatorWenInfo.address;
            const mockMultisigWenInfo = await (0, spl_token_1.getOrCreateAssociatedTokenAccount)(connection, keypair, WEN, mockMultisigKeypair.publicKey, true, "confirmed", {
                commitment: "confirmed",
            }, spl_token_1.TOKEN_PROGRAM_ID, spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID);
            const operatorUsdcInfo = await (0, spl_token_1.getOrCreateAssociatedTokenAccount)(connection, keypair, USDC, operatorKeypair.publicKey, false, "confirmed", {
                commitment: "confirmed",
            }, spl_token_1.TOKEN_PROGRAM_ID, spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID);
            operatorUSDC = operatorUsdcInfo.address;
            await (0, spl_token_1.mintTo)(connection, keypair, WEN, operatorWEN, keypair.publicKey, 200_000_000_000 * 10 ** wenDecimal, [], {
                commitment: "confirmed",
            }, spl_token_1.TOKEN_PROGRAM_ID);
            await (0, spl_token_1.mintTo)(connection, keypair, USDC, operatorUSDC, keypair.publicKey, 1_000_000_000 * 10 ** usdcDecimal, [], {
                commitment: "confirmed",
            }, spl_token_1.TOKEN_PROGRAM_ID);
            await (0, spl_token_1.mintTo)(connection, keypair, WEN, mockMultisigWenInfo.address, keypair.publicKey, 200_000_000_000 * 10 ** wenDecimal, [], {});
            let rawTx = await index_1.DLMM.createPermissionLbPair(connection, new anchor_1.BN(binStep), WEN, USDC, new anchor_1.BN(minBinId.toString()), baseKeypair.publicKey, keypair.publicKey, feeBps, types_1.ActivationType.Slot, { cluster: "localhost" });
            let txHash = await (0, web3_js_1.sendAndConfirmTransaction)(connection, rawTx, [
                keypair,
                baseKeypair,
            ]).catch((e) => {
                console.error(e);
                throw e;
            });
            console.log("Create permissioned LB pair", txHash);
            [pairKey] = (0, helpers_1.derivePermissionLbPair)(baseKeypair.publicKey, WEN, USDC, new anchor_1.BN(binStep), programId);
            pair = await index_1.DLMM.create(connection, pairKey, {
                cluster: "localhost",
            });
        });
        it("Create position with operator", async () => {
            await pair.refetchStates();
            const lowerBinId = new anchor_1.BN(minBinId).sub(constants_1.MAX_BIN_PER_POSITION.div(new anchor_1.BN(2)));
            const positionWidth = new anchor_1.BN(constants_1.MAX_BIN_PER_POSITION);
            const transaction = await pair.initializePositionByOperator({
                lowerBinId,
                positionWidth: new anchor_1.BN(constants_1.MAX_BIN_PER_POSITION),
                owner: mockMultisigKeypair.publicKey,
                feeOwner: mockMultisigKeypair.publicKey,
                operator: operatorKeypair.publicKey,
                payer: operatorKeypair.publicKey,
                base: baseKeypair.publicKey,
                lockReleasePoint: new anchor_1.BN(0),
            });
            const txHash = await (0, web3_js_1.sendAndConfirmTransaction)(connection, transaction, [
                operatorKeypair,
                baseKeypair,
            ]).catch((e) => {
                console.error(e);
                throw e;
            });
            console.log("Initialize position with operator", txHash);
            [position] = (0, helpers_1.derivePosition)(pair.pubkey, baseKeypair.publicKey, lowerBinId, positionWidth, pair.program.programId);
            const positionState = await pair.program.account.positionV2.fetch(position);
            expect(positionState.owner.toBase58()).toBe(mockMultisigKeypair.publicKey.toBase58());
            expect(positionState.feeOwner.toBase58()).toBe(mockMultisigKeypair.publicKey.toBase58());
            expect(positionState.operator.toBase58()).toBe(operatorKeypair.publicKey.toBase58());
        });
        it("Operator add liquidity to the position", async () => {
            await pair.refetchStates();
            const positionState = await pair.program.account.positionV2.fetch(position);
            const [beforeOperatorTokenX, beforeOperatorTokenY] = await Promise.all([
                connection
                    .getTokenAccountBalance(operatorWEN)
                    .then((b) => new anchor_1.BN(b.value.amount)),
                connection
                    .getTokenAccountBalance(operatorUSDC)
                    .then((b) => new anchor_1.BN(b.value.amount)),
            ]);
            let transaction = await pair.addLiquidityByStrategy({
                positionPubKey: position,
                totalXAmount: new anchor_1.BN(1000 * 10 ** wenDecimal),
                totalYAmount: new anchor_1.BN(0),
                strategy: {
                    strategyType: types_1.StrategyType.SpotImBalanced,
                    maxBinId: positionState.upperBinId,
                    minBinId,
                },
                user: operatorKeypair.publicKey,
                slippage: 0,
            });
            let txHash = await (0, web3_js_1.sendAndConfirmTransaction)(connection, transaction, [
                operatorKeypair,
            ]).catch((e) => {
                console.error(e);
                throw e;
            });
            transaction = await pair.addLiquidityByStrategy({
                positionPubKey: position,
                totalXAmount: new anchor_1.BN(0),
                totalYAmount: new anchor_1.BN(1000 * 10 ** usdcDecimal),
                strategy: {
                    strategyType: types_1.StrategyType.SpotImBalanced,
                    maxBinId: minBinId - 1,
                    minBinId: positionState.lowerBinId,
                },
                user: operatorKeypair.publicKey,
                slippage: 0,
            });
            txHash = await (0, web3_js_1.sendAndConfirmTransaction)(connection, transaction, [
                operatorKeypair,
            ]).catch((e) => {
                console.error(e);
                throw e;
            });
            const [afterOperatorTokenX, afterOperatorTokenY] = await Promise.all([
                connection
                    .getTokenAccountBalance(operatorWEN)
                    .then((b) => new anchor_1.BN(b.value.amount)),
                connection
                    .getTokenAccountBalance(operatorUSDC)
                    .then((b) => new anchor_1.BN(b.value.amount)),
            ]);
            // Debit from operator
            expect(afterOperatorTokenY.lt(beforeOperatorTokenY)).toBeTruthy();
            expect(afterOperatorTokenX.lt(beforeOperatorTokenX)).toBeTruthy();
            console.log("Operator add liquidity to the position", txHash);
        });
        it("Operator remove liquidity from the position, owner (multisig) receive the liquidity", async () => {
            await pair.refetchStates();
            const positionState = await pair.program.account.positionV2.fetch(position);
            const mockMultisigWEN = (0, spl_token_1.getAssociatedTokenAddressSync)(WEN, positionState.owner, true, spl_token_1.TOKEN_PROGRAM_ID);
            const mockMultisigUSDC = (0, spl_token_1.getAssociatedTokenAddressSync)(USDC, positionState.owner, true, spl_token_1.TOKEN_PROGRAM_ID);
            const [beforeOwnerWEN, beforeOwnerUSDC] = await Promise.all([
                connection
                    .getTokenAccountBalance(mockMultisigWEN)
                    .then((b) => new anchor_1.BN(b.value.amount))
                    .catch((_) => new anchor_1.BN(0)),
                connection
                    .getTokenAccountBalance(mockMultisigUSDC)
                    .then((b) => new anchor_1.BN(b.value.amount))
                    .catch((_) => new anchor_1.BN(0)),
            ]);
            const binIds = [];
            for (let i = positionState.lowerBinId; i <= positionState.upperBinId; i++) {
                binIds.push(i);
            }
            const transaction = await pair.removeLiquidity({
                user: operatorKeypair.publicKey,
                position,
                binIds,
                bps: new anchor_1.BN(10000),
                shouldClaimAndClose: true,
            });
            const transactions = [];
            if (!Array.isArray(transaction)) {
                transactions.push(transaction);
            }
            else {
                transactions.push(...transaction);
            }
            for (const tx of transactions) {
                const txHash = await (0, web3_js_1.sendAndConfirmTransaction)(connection, tx, [
                    operatorKeypair,
                ]).catch((e) => {
                    console.error(e);
                    throw e;
                });
                console.log("Withdraw to owner, claim fees, and close transaction", txHash);
            }
            const [afterOwnerWEN, afterOwnerUSDC] = await Promise.all([
                connection
                    .getTokenAccountBalance(mockMultisigWEN)
                    .then((b) => new anchor_1.BN(b.value.amount)),
                connection
                    .getTokenAccountBalance(mockMultisigUSDC)
                    .then((b) => new anchor_1.BN(b.value.amount)),
            ]);
            // Credit to owner
            expect(afterOwnerWEN.gt(beforeOwnerUSDC)).toBeTruthy();
            expect(afterOwnerUSDC.gt(beforeOwnerUSDC)).toBeTruthy();
        });
    });
});
