"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_BIN_PER_ARRAY = void 0;
const anchor_1 = require("@coral-xyz/anchor");
const spl_token_1 = require("@solana/spl-token");
const web3_js_1 = require("@solana/web3.js");
const babar_1 = __importDefault(require("babar"));
const decimal_js_1 = __importDefault(require("decimal.js"));
const fs_1 = __importDefault(require("fs"));
const constants_1 = require("../dlmm/constants");
const helpers_1 = require("../dlmm/helpers");
const math_1 = require("../dlmm/helpers/math");
const idl_1 = require("../dlmm/idl");
const index_1 = require("../dlmm/index");
const types_1 = require("../dlmm/types");
const keypairBuffer = fs_1.default.readFileSync("../keys/localnet/admin-bossj3JvwiNK7pvjr149DqdtJxf2gdygbcmEPTkb2F1.json", "utf-8");
const connection = new web3_js_1.Connection("http://127.0.0.1:8899", "confirmed");
const keypair = web3_js_1.Keypair.fromSecretKey(new Uint8Array(JSON.parse(keypairBuffer)));
const btcDecimal = 8;
const usdcDecimal = 6;
const CONSTANTS = Object.entries(idl_1.IDL.constants);
const BIN_ARRAY_BITMAP_SIZE = new anchor_1.BN(CONSTANTS.find(([k, v]) => v.name == "BIN_ARRAY_BITMAP_SIZE")[1].value);
exports.MAX_BIN_PER_ARRAY = new anchor_1.BN(CONSTANTS.find(([k, v]) => v.name == "MAX_BIN_PER_ARRAY")[1].value);
const ACTIVE_ID_OUT_OF_RANGE = BIN_ARRAY_BITMAP_SIZE.mul(exports.MAX_BIN_PER_ARRAY);
const DEFAULT_ACTIVE_ID = new anchor_1.BN(5660);
const DEFAULT_BIN_STEP = new anchor_1.BN(10);
const DEFAULT_BASE_FACTOR = new anchor_1.BN(10000);
const DEFAULT_BASE_FACTOR_2 = new anchor_1.BN(4000);
const programId = new anchor_1.web3.PublicKey(constants_1.LBCLMM_PROGRAM_IDS["localhost"]);
let BTC;
let USDC;
let lbClmm;
let lbClmmWithBitMapExt;
let lbPairPubkey;
let lbPairWithBitMapExtPubkey;
let userBTC;
let userUSDC;
let presetParamPda;
let presetParamPda2;
const positionKeypair = web3_js_1.Keypair.generate();
function assertAmountWithPrecision(actualAmount, expectedAmount, precisionPercent) {
    if (expectedAmount == 0 && actualAmount == 0) {
        return;
    }
    let maxAmount, minAmount;
    if (expectedAmount > actualAmount) {
        maxAmount = expectedAmount;
        minAmount = actualAmount;
    }
    else {
        maxAmount = actualAmount;
        minAmount = expectedAmount;
    }
    let diff = ((maxAmount - minAmount) * 100) / maxAmount;
    expect(diff).toBeLessThan(precisionPercent);
}
describe("SDK test", () => {
    beforeAll(async () => {
        BTC = await (0, spl_token_1.createMint)(connection, keypair, keypair.publicKey, null, btcDecimal, web3_js_1.Keypair.generate(), null, spl_token_1.TOKEN_PROGRAM_ID);
        USDC = await (0, spl_token_1.createMint)(connection, keypair, keypair.publicKey, null, usdcDecimal, web3_js_1.Keypair.generate(), null, spl_token_1.TOKEN_PROGRAM_ID);
        const userBtcInfo = await (0, spl_token_1.getOrCreateAssociatedTokenAccount)(connection, keypair, BTC, keypair.publicKey, false, "confirmed", {
            commitment: "confirmed",
        }, spl_token_1.TOKEN_PROGRAM_ID, spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID);
        userBTC = userBtcInfo.address;
        const userUsdcInfo = await (0, spl_token_1.getOrCreateAssociatedTokenAccount)(connection, keypair, USDC, keypair.publicKey, false, "confirmed", {
            commitment: "confirmed",
        }, spl_token_1.TOKEN_PROGRAM_ID, spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID);
        userUSDC = userUsdcInfo.address;
        await (0, spl_token_1.mintTo)(connection, keypair, BTC, userBTC, keypair.publicKey, 100_000_000 * 10 ** btcDecimal, [], {
            commitment: "confirmed",
        }, spl_token_1.TOKEN_PROGRAM_ID);
        await (0, spl_token_1.mintTo)(connection, keypair, USDC, userUSDC, keypair.publicKey, 100_000_000 * 10 ** usdcDecimal, [], {
            commitment: "confirmed",
        }, spl_token_1.TOKEN_PROGRAM_ID);
        [lbPairPubkey] = (0, helpers_1.deriveLbPair2)(BTC, USDC, DEFAULT_BIN_STEP, DEFAULT_BASE_FACTOR, programId);
        [lbPairWithBitMapExtPubkey] = (0, helpers_1.deriveLbPair2)(spl_token_1.NATIVE_MINT, USDC, DEFAULT_BIN_STEP, DEFAULT_BASE_FACTOR_2, programId);
        [presetParamPda] = (0, helpers_1.derivePresetParameter2)(DEFAULT_BIN_STEP, DEFAULT_BASE_FACTOR, programId);
        [presetParamPda2] = (0, helpers_1.derivePresetParameter2)(DEFAULT_BIN_STEP, DEFAULT_BASE_FACTOR_2, programId);
        const provider = new anchor_1.AnchorProvider(connection, new anchor_1.Wallet(keypair), anchor_1.AnchorProvider.defaultOptions());
        const program = new anchor_1.Program(idl_1.IDL, constants_1.LBCLMM_PROGRAM_IDS["localhost"], provider);
        const presetParamState = await program.account.presetParameter.fetchNullable(presetParamPda);
        if (!presetParamState) {
            await program.methods
                .initializePresetParameter({
                binStep: DEFAULT_BIN_STEP.toNumber(),
                baseFactor: DEFAULT_BASE_FACTOR.toNumber(),
                filterPeriod: 30,
                decayPeriod: 600,
                reductionFactor: 5000,
                variableFeeControl: 40000,
                protocolShare: 0,
                maxBinId: 43690,
                minBinId: -43690,
                maxVolatilityAccumulator: 350000,
            })
                .accounts({
                admin: keypair.publicKey,
                presetParameter: presetParamPda,
                rent: anchor_1.web3.SYSVAR_RENT_PUBKEY,
                systemProgram: anchor_1.web3.SystemProgram.programId,
            })
                .signers([keypair])
                .rpc({
                commitment: "confirmed",
            });
        }
        const presetParamState2 = await program.account.presetParameter.fetchNullable(presetParamPda2);
        if (!presetParamState2) {
            await program.methods
                .initializePresetParameter({
                binStep: DEFAULT_BIN_STEP.toNumber(),
                baseFactor: DEFAULT_BASE_FACTOR_2.toNumber(),
                filterPeriod: 30,
                decayPeriod: 600,
                reductionFactor: 5000,
                variableFeeControl: 40000,
                protocolShare: 0,
                maxBinId: 43690,
                minBinId: -43690,
                maxVolatilityAccumulator: 350000,
            })
                .accounts({
                admin: keypair.publicKey,
                presetParameter: presetParamPda2,
                rent: anchor_1.web3.SYSVAR_RENT_PUBKEY,
                systemProgram: anchor_1.web3.SystemProgram.programId,
            })
                .signers([keypair])
                .rpc({
                commitment: "confirmed",
            });
        }
    });
    describe("Permissioned lb pair", () => {
        const baseKeypair = web3_js_1.Keypair.generate();
        let pairKey;
        let pair;
        let customFeeOwnerPosition;
        const customFeeOwnerPositionFeeOwner = web3_js_1.Keypair.generate();
        const customFeeOwnerPositionOwner = web3_js_1.Keypair.generate();
        const normalPosition = web3_js_1.Keypair.generate();
        const normalPositionOwner = keypair.publicKey;
        const btcInAmount = new anchor_1.BN(1).mul(new anchor_1.BN(10 ** btcDecimal));
        const usdcInAmount = new anchor_1.BN(24000).mul(new anchor_1.BN(10 ** usdcDecimal));
        const xYAmountDistribution = [
            {
                binId: DEFAULT_ACTIVE_ID.sub(new anchor_1.BN(3)).toNumber(),
                xAmountBpsOfTotal: new anchor_1.BN(0),
                yAmountBpsOfTotal: new anchor_1.BN(4500),
            },
            {
                binId: DEFAULT_ACTIVE_ID.sub(new anchor_1.BN(2)).toNumber(),
                xAmountBpsOfTotal: new anchor_1.BN(0),
                yAmountBpsOfTotal: new anchor_1.BN(3000),
            },
            {
                binId: DEFAULT_ACTIVE_ID.sub(new anchor_1.BN(1)).toNumber(),
                xAmountBpsOfTotal: new anchor_1.BN(0),
                yAmountBpsOfTotal: new anchor_1.BN(2500),
            },
        ];
        beforeAll(async () => {
            await connection.requestAirdrop(customFeeOwnerPositionOwner.publicKey, 2 * web3_js_1.LAMPORTS_PER_SOL);
        });
        it("findSwappableMinMaxBinId returned min/max bin id are 1 bit from max/min value", () => {
            for (let binStep = 1; binStep <= 500; binStep++) {
                const { minBinId, maxBinId } = (0, math_1.findSwappableMinMaxBinId)(new anchor_1.BN(binStep));
                const minQPrice = (0, math_1.getQPriceFromId)(minBinId, new anchor_1.BN(binStep));
                const maxQPrice = (0, math_1.getQPriceFromId)(maxBinId, new anchor_1.BN(binStep));
                expect(minQPrice.toString()).toBe("2");
                expect(maxQPrice.toString()).toBe("170141183460469231731687303715884105727");
                const nextMinQPrice = (0, math_1.getQPriceFromId)(minBinId.sub(new anchor_1.BN(1)), new anchor_1.BN(binStep));
                const nextMaxQPrice = (0, math_1.getQPriceFromId)(maxBinId.add(new anchor_1.BN(1)), new anchor_1.BN(binStep));
                expect(nextMinQPrice.toString()).toBe("1");
                expect(nextMaxQPrice.toString()).toBe("340282366920938463463374607431768211455");
            }
        });
        it("create permissioned LB pair", async () => {
            const feeBps = new anchor_1.BN(50);
            try {
                const rawTx = await index_1.DLMM.createPermissionLbPair(connection, DEFAULT_BIN_STEP, BTC, USDC, DEFAULT_ACTIVE_ID, baseKeypair.publicKey, keypair.publicKey, feeBps, types_1.ActivationType.Slot, { cluster: "localhost" });
                const txHash = await (0, web3_js_1.sendAndConfirmTransaction)(connection, rawTx, [
                    keypair,
                    baseKeypair,
                ]);
                expect(txHash).not.toBeNull();
                console.log("Create permissioned LB pair", txHash);
                [pairKey] = (0, helpers_1.derivePermissionLbPair)(baseKeypair.publicKey, BTC, USDC, DEFAULT_BIN_STEP, programId);
                pair = await index_1.DLMM.create(connection, pairKey, {
                    cluster: "localhost",
                });
                const pairState = pair.lbPair;
                expect(pairState.pairType).toBe(types_1.PairType.Permissioned);
            }
            catch (error) {
                console.log(JSON.parse(JSON.stringify(error)));
            }
        });
        it("initialize position and add liquidity buy side", async () => {
            const program = pair.program;
            const baseKeypair = web3_js_1.Keypair.generate();
            const lowerBinId = DEFAULT_ACTIVE_ID.sub(constants_1.MAX_BIN_PER_POSITION);
            const width = constants_1.MAX_BIN_PER_POSITION;
            const lowerBinIdBytes = lowerBinId.isNeg()
                ? lowerBinId.toTwos(32).toArrayLike(Buffer, "le", 4)
                : lowerBinId.toArrayLike(Buffer, "le", 4);
            const widthBytes = width.isNeg()
                ? width.toTwos(32).toArrayLike(Buffer, "le", 4)
                : width.toArrayLike(Buffer, "le", 4);
            [customFeeOwnerPosition] = web3_js_1.PublicKey.findProgramAddressSync([
                Buffer.from("position"),
                pair.pubkey.toBuffer(),
                baseKeypair.publicKey.toBuffer(),
                lowerBinIdBytes,
                widthBytes,
            ], pair.program.programId);
            const operatorTokenX = await (0, spl_token_1.getOrCreateAssociatedTokenAccount)(connection, keypair, BTC, keypair.publicKey);
            const ownerTokenX = await (0, spl_token_1.getOrCreateAssociatedTokenAccount)(connection, keypair, BTC, customFeeOwnerPositionOwner.publicKey);
            await (0, spl_token_1.transfer)(connection, keypair, operatorTokenX.address, ownerTokenX.address, keypair, BigInt(1));
            console.log("Initialize position by operator");
            const initializePositionByOperatorTx = await program.methods
                .initializePositionByOperator(lowerBinId.toNumber(), width.toNumber(), customFeeOwnerPositionFeeOwner.publicKey, new anchor_1.BN(0))
                .accounts({
                lbPair: pair.pubkey,
                position: customFeeOwnerPosition,
                base: baseKeypair.publicKey,
                operator: keypair.publicKey,
                operatorTokenX: operatorTokenX.address,
                ownerTokenX: ownerTokenX.address,
                owner: customFeeOwnerPositionOwner.publicKey,
                program: program.programId,
                payer: keypair.publicKey,
            })
                .transaction();
            await (0, web3_js_1.sendAndConfirmTransaction)(connection, initializePositionByOperatorTx, [keypair, baseKeypair]).catch((e) => {
                console.error(e);
                throw e;
            });
            await pair.refetchStates();
            console.log("Add liquidity by weight");
            let addLiquidityTxs = await pair.addLiquidityByWeight({
                positionPubKey: customFeeOwnerPosition,
                totalXAmount: new anchor_1.BN(0),
                totalYAmount: usdcInAmount,
                xYAmountDistribution,
                user: keypair.publicKey,
                slippage: 0,
            });
            addLiquidityTxs = Array.isArray(addLiquidityTxs)
                ? addLiquidityTxs[0]
                : addLiquidityTxs;
            await (0, web3_js_1.sendAndConfirmTransaction)(connection, addLiquidityTxs, [keypair]);
            await pair.refetchStates();
        });
        it("update activation point", async () => {
            try {
                const currentSlot = await connection.getSlot();
                const activationPoint = new anchor_1.BN(currentSlot + 10);
                const rawTx = await pair.setActivationPoint(new anchor_1.BN(currentSlot + 10));
                const txHash = await (0, web3_js_1.sendAndConfirmTransaction)(connection, rawTx, [
                    keypair,
                ]);
                console.log("Update activation point", txHash);
                expect(txHash).not.toBeNull();
                await pair.refetchStates();
                const pairState = pair.lbPair;
                expect(pairState.activationPoint.eq(activationPoint)).toBeTruthy();
            }
            catch (error) {
                console.log(JSON.parse(JSON.stringify(error)));
            }
        });
        it("normal position add liquidity after activation", async () => {
            while (true) {
                const currentSlot = await connection.getSlot();
                if (currentSlot >= pair.lbPair.activationPoint.toNumber()) {
                    break;
                }
                else {
                    await new Promise((res) => setTimeout(res, 1000));
                }
            }
            const initPositionAddLiquidityTx = await pair.initializePositionAndAddLiquidityByStrategy({
                positionPubKey: normalPosition.publicKey,
                totalXAmount: btcInAmount,
                totalYAmount: usdcInAmount,
                strategy: {
                    strategyType: types_1.StrategyType.SpotBalanced,
                    maxBinId: xYAmountDistribution[xYAmountDistribution.length - 1].binId,
                    minBinId: xYAmountDistribution[0].binId,
                },
                user: keypair.publicKey,
                slippage: 0,
            });
            await (0, web3_js_1.sendAndConfirmTransaction)(connection, initPositionAddLiquidityTx, [
                keypair,
                normalPosition,
            ]);
        });
        it("remove liquidity from position with custom owner, capital to position owner, but fee to fee owner", async () => {
            const activeBinArrayIdx = (0, helpers_1.binIdToBinArrayIndex)(new anchor_1.BN(pair.lbPair.activeId));
            const [activeBinArray] = (0, helpers_1.deriveBinArray)(pair.pubkey, activeBinArrayIdx, pair.program.programId);
            let swapTx = await pair.swap({
                inAmount: new anchor_1.BN(10000000),
                outToken: USDC,
                minOutAmount: new anchor_1.BN(0),
                user: keypair.publicKey,
                inToken: BTC,
                lbPair: pair.pubkey,
                binArraysPubkey: [activeBinArray],
            });
            await (0, web3_js_1.sendAndConfirmTransaction)(connection, swapTx, [keypair]);
            swapTx = await pair.swap({
                inAmount: new anchor_1.BN(100).mul(new anchor_1.BN(10 ** usdcDecimal)),
                outToken: BTC,
                minOutAmount: new anchor_1.BN(0),
                user: keypair.publicKey,
                inToken: USDC,
                lbPair: pair.pubkey,
                binArraysPubkey: [activeBinArray],
            });
            await (0, web3_js_1.sendAndConfirmTransaction)(connection, swapTx, [keypair]);
            const ownerTokenXAta = (0, spl_token_1.getAssociatedTokenAddressSync)(pair.tokenX.publicKey, customFeeOwnerPositionOwner.publicKey);
            const ownerTokenYAta = (0, spl_token_1.getAssociatedTokenAddressSync)(pair.tokenY.publicKey, customFeeOwnerPositionOwner.publicKey);
            const feeOwnerTokenXAta = (0, spl_token_1.getAssociatedTokenAddressSync)(pair.tokenX.publicKey, customFeeOwnerPositionFeeOwner.publicKey);
            const feeOwnerTokenYAta = (0, spl_token_1.getAssociatedTokenAddressSync)(pair.tokenY.publicKey, customFeeOwnerPositionFeeOwner.publicKey);
            const [beforeOwnerTokenX, beforeOwnerTokenY, beforeFeeOwnerTokenX, beforeFeeOwnerTokenY,] = await Promise.all([
                connection
                    .getTokenAccountBalance(ownerTokenXAta)
                    .then((b) => new anchor_1.BN(b.value.amount))
                    .catch((_) => new anchor_1.BN(0)),
                connection
                    .getTokenAccountBalance(ownerTokenYAta)
                    .then((b) => new anchor_1.BN(b.value.amount))
                    .catch((_) => new anchor_1.BN(0)),
                connection
                    .getTokenAccountBalance(feeOwnerTokenXAta)
                    .then((b) => new anchor_1.BN(b.value.amount))
                    .catch((_) => new anchor_1.BN(0)),
                connection
                    .getTokenAccountBalance(feeOwnerTokenYAta)
                    .then((b) => new anchor_1.BN(b.value.amount))
                    .catch((_) => new anchor_1.BN(0)),
            ]);
            const removeLiquidityTx = await pair.removeLiquidity({
                user: customFeeOwnerPositionOwner.publicKey,
                binIds: xYAmountDistribution.map((dist) => dist.binId),
                position: customFeeOwnerPosition,
                bps: new anchor_1.BN(10_000),
                shouldClaimAndClose: true,
            });
            if (Array.isArray(removeLiquidityTx)) {
                for (const tx of removeLiquidityTx) {
                    const txHash = await (0, web3_js_1.sendAndConfirmTransaction)(connection, tx, [
                        customFeeOwnerPositionOwner,
                    ]);
                    console.log(txHash);
                }
            }
            else {
                const txHash = await (0, web3_js_1.sendAndConfirmTransaction)(connection, removeLiquidityTx, [customFeeOwnerPositionOwner]);
                console.log(txHash);
            }
            const [afterOwnerTokenX, afterOwnerTokenY, afterFeeOwnerTokenX, afterFeeOwnerTokenY,] = await Promise.all([
                connection
                    .getTokenAccountBalance(ownerTokenXAta)
                    .then((b) => new anchor_1.BN(b.value.amount)),
                connection
                    .getTokenAccountBalance(ownerTokenYAta)
                    .then((b) => new anchor_1.BN(b.value.amount)),
                connection
                    .getTokenAccountBalance(feeOwnerTokenXAta)
                    .then((b) => new anchor_1.BN(b.value.amount)),
                connection
                    .getTokenAccountBalance(feeOwnerTokenYAta)
                    .then((b) => new anchor_1.BN(b.value.amount)),
            ]);
            expect(afterOwnerTokenX.sub(beforeOwnerTokenX).toNumber()).toBeGreaterThan(0);
            expect(afterOwnerTokenY.sub(beforeOwnerTokenY).toNumber()).toBeGreaterThan(0);
            expect(afterFeeOwnerTokenX.sub(beforeFeeOwnerTokenX).toNumber()).toBeGreaterThan(0);
            expect(afterFeeOwnerTokenY.sub(beforeFeeOwnerTokenY).toNumber()).toBeGreaterThan(0);
        });
        it("remove liquidity from position, capital and fee to position owner", async () => {
            await pair.refetchStates();
            const positionState = await pair
                .getPositionsByUserAndLbPair(normalPositionOwner)
                .then((positions) => {
                return positions.userPositions.find((p) => p.publicKey.equals(normalPosition.publicKey));
            });
            const fullAmountX = new decimal_js_1.default(positionState.positionData.feeX.toString())
                .add(positionState.positionData.totalXAmount)
                .floor();
            const fullAmountY = new decimal_js_1.default(positionState.positionData.feeY.toString())
                .add(positionState.positionData.totalYAmount)
                .floor();
            const ownerTokenXAta = (0, spl_token_1.getAssociatedTokenAddressSync)(pair.tokenX.publicKey, normalPositionOwner);
            const ownerTokenYAta = (0, spl_token_1.getAssociatedTokenAddressSync)(pair.tokenY.publicKey, normalPositionOwner);
            const [beforeOwnerTokenX, beforeOwnerTokenY] = await Promise.all([
                connection
                    .getTokenAccountBalance(ownerTokenXAta)
                    .then((b) => new anchor_1.BN(b.value.amount)),
                connection
                    .getTokenAccountBalance(ownerTokenYAta)
                    .then((b) => new anchor_1.BN(b.value.amount)),
            ]);
            const removeLiquidityTx = await pair.removeLiquidity({
                user: keypair.publicKey,
                binIds: xYAmountDistribution.map((dist) => dist.binId),
                position: normalPosition.publicKey,
                bps: new anchor_1.BN(10_000),
                shouldClaimAndClose: true,
            });
            if (Array.isArray(removeLiquidityTx)) {
                for (const tx of removeLiquidityTx) {
                    const txHash = await (0, web3_js_1.sendAndConfirmTransaction)(connection, tx, [
                        keypair,
                    ]);
                    console.log(txHash);
                }
            }
            else {
                const txHash = await (0, web3_js_1.sendAndConfirmTransaction)(connection, removeLiquidityTx, [keypair]);
                console.log(txHash);
            }
            const [afterOwnerTokenX, afterOwnerTokenY] = await Promise.all([
                connection
                    .getTokenAccountBalance(ownerTokenXAta)
                    .then((b) => new anchor_1.BN(b.value.amount)),
                connection
                    .getTokenAccountBalance(ownerTokenYAta)
                    .then((b) => new anchor_1.BN(b.value.amount)),
            ]);
            const amountX = afterOwnerTokenX.sub(beforeOwnerTokenX);
            const amountY = afterOwnerTokenY.sub(beforeOwnerTokenY);
            expect(fullAmountX.toString()).toBe(amountX.toString());
            expect(fullAmountY.toString()).toBe(amountY.toString());
        });
    });
    describe("seed liquidity", () => {
        let baseKeypair;
        let pairKey;
        let pair;
        beforeEach(async () => {
            await (0, spl_token_1.mintTo)(connection, keypair, BTC, userBTC, keypair.publicKey, 1_000_000_000 * 10 ** btcDecimal, [], {
                commitment: "confirmed",
            }, spl_token_1.TOKEN_PROGRAM_ID);
            await (0, spl_token_1.mintTo)(connection, keypair, USDC, userUSDC, keypair.publicKey, 1_000_000_000 * 10 ** usdcDecimal, [], {
                commitment: "confirmed",
            }, spl_token_1.TOKEN_PROGRAM_ID);
            baseKeypair = web3_js_1.Keypair.generate();
            const feeBps = new anchor_1.BN(50);
            let rawTx = await index_1.DLMM.createPermissionLbPair(connection, DEFAULT_BIN_STEP, BTC, USDC, DEFAULT_ACTIVE_ID, baseKeypair.publicKey, keypair.publicKey, feeBps, types_1.ActivationType.Slot, { cluster: "localhost" });
            let txHash = await (0, web3_js_1.sendAndConfirmTransaction)(connection, rawTx, [
                keypair,
                baseKeypair,
            ]);
            expect(txHash).not.toBeNull();
            console.log("Create permissioned LB pair", txHash);
            [pairKey] = (0, helpers_1.derivePermissionLbPair)(baseKeypair.publicKey, BTC, USDC, DEFAULT_BIN_STEP, programId);
            pair = await index_1.DLMM.create(connection, pairKey, {
                cluster: "localhost",
            });
        });
        it("Rerun if failed at first deposit", async () => {
            const seedAmount = new anchor_1.BN(100_000_000).mul(new anchor_1.BN(10 ** btcDecimal));
            const curvature = 0.8;
            const priceMultiplier = new decimal_js_1.default(10 ** (pair.tokenX.decimal - pair.tokenY.decimal));
            const minPrice = new decimal_js_1.default((0, helpers_1.getPriceOfBinByBinId)(pair.lbPair.activeId, pair.lbPair.binStep))
                .add(1)
                .mul(priceMultiplier);
            const maxPrice = (0, helpers_1.getPriceOfBinByBinId)(pair.lbPair.activeId + 1 + constants_1.MAX_BIN_PER_POSITION.toNumber() * 3, pair.lbPair.binStep).mul(priceMultiplier);
            let { initializeBinArraysAndPositionIxs, addLiquidityIxs } = await pair.seedLiquidity(keypair.publicKey, seedAmount, curvature, minPrice.toNumber(), maxPrice.toNumber(), baseKeypair.publicKey);
            {
                const transactions = [];
                const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
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
            let beforeTokenXBalance = await connection
                .getTokenAccountBalance(userBTC)
                .then((i) => new anchor_1.BN(i.value.amount));
            // Simulate send all add liquidity, but index 0 ix timeout
            {
                const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
                const transactions = [];
                for (const [idx, groupIx] of addLiquidityIxs.entries()) {
                    if (idx == 0) {
                        continue;
                    }
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
            let afterTokenXBalance = await connection
                .getTokenAccountBalance(userBTC)
                .then((i) => new anchor_1.BN(i.value.amount));
            const actualDepositedAmount = beforeTokenXBalance.sub(afterTokenXBalance);
            expect(actualDepositedAmount.toString()).not.toEqual(seedAmount.toString());
            const seedLiquidityResponse = await pair.seedLiquidity(keypair.publicKey, seedAmount, curvature, minPrice.toNumber(), maxPrice.toNumber(), baseKeypair.publicKey);
            expect(seedLiquidityResponse.initializeBinArraysAndPositionIxs.length).toBe(0);
            expect(seedLiquidityResponse.addLiquidityIxs.length).toBe(1);
            beforeTokenXBalance = afterTokenXBalance;
            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
            const tx = new web3_js_1.Transaction({
                feePayer: keypair.publicKey,
                blockhash,
                lastValidBlockHeight,
            }).add(...seedLiquidityResponse.addLiquidityIxs[0]);
            const txHash = await (0, web3_js_1.sendAndConfirmTransaction)(connection, tx, [
                keypair,
            ]).catch((e) => {
                console.error(e);
                throw e;
            });
            console.log(txHash);
            afterTokenXBalance = await connection
                .getTokenAccountBalance(userBTC)
                .then((i) => new anchor_1.BN(i.value.amount));
            const depositedAmount = beforeTokenXBalance.sub(afterTokenXBalance);
            expect(actualDepositedAmount.add(depositedAmount).toString()).toEqual(seedAmount.toString());
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
            console.log((0, babar_1.default)(binLiquidities));
        });
        it("Rerun if failed at middle deposit", async () => {
            const seedAmount = new anchor_1.BN(100_000_000).mul(new anchor_1.BN(10 ** btcDecimal));
            const curvature = 0.8;
            const priceMultiplier = new decimal_js_1.default(10 ** (pair.tokenX.decimal - pair.tokenY.decimal));
            const minPrice = (0, helpers_1.getPriceOfBinByBinId)(pair.lbPair.activeId, pair.lbPair.binStep)
                .add(1)
                .mul(priceMultiplier);
            const maxPrice = (0, helpers_1.getPriceOfBinByBinId)(pair.lbPair.activeId + 1 + constants_1.MAX_BIN_PER_POSITION.toNumber() * 3, pair.lbPair.binStep).mul(priceMultiplier);
            let { initializeBinArraysAndPositionIxs, addLiquidityIxs } = await pair.seedLiquidity(keypair.publicKey, seedAmount, curvature, minPrice.toNumber(), maxPrice.toNumber(), baseKeypair.publicKey);
            {
                const transactions = [];
                const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
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
            let beforeTokenXBalance = await connection
                .getTokenAccountBalance(userBTC)
                .then((i) => new anchor_1.BN(i.value.amount));
            // Simulate send all add liquidity, but index 1 ix timeout
            {
                const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
                const transactions = [];
                for (const [idx, groupIx] of addLiquidityIxs.entries()) {
                    if (idx == 1) {
                        continue;
                    }
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
            let afterTokenXBalance = await connection
                .getTokenAccountBalance(userBTC)
                .then((i) => new anchor_1.BN(i.value.amount));
            const actualDepositedAmount = beforeTokenXBalance.sub(afterTokenXBalance);
            expect(actualDepositedAmount.toString()).not.toEqual(seedAmount.toString());
            const seedLiquidityResponse = await pair.seedLiquidity(keypair.publicKey, seedAmount, curvature, minPrice.toNumber(), maxPrice.toNumber(), baseKeypair.publicKey);
            expect(seedLiquidityResponse.initializeBinArraysAndPositionIxs.length).toBe(0);
            expect(seedLiquidityResponse.addLiquidityIxs.length).toBe(1);
            beforeTokenXBalance = afterTokenXBalance;
            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
            const tx = new web3_js_1.Transaction({
                feePayer: keypair.publicKey,
                blockhash,
                lastValidBlockHeight,
            }).add(...seedLiquidityResponse.addLiquidityIxs[0]);
            const txHash = await (0, web3_js_1.sendAndConfirmTransaction)(connection, tx, [
                keypair,
            ]).catch((e) => {
                console.error(e);
                throw e;
            });
            console.log(txHash);
            afterTokenXBalance = await connection
                .getTokenAccountBalance(userBTC)
                .then((i) => new anchor_1.BN(i.value.amount));
            const depositedAmount = beforeTokenXBalance.sub(afterTokenXBalance);
            expect(actualDepositedAmount.add(depositedAmount).toString()).toEqual(seedAmount.toString());
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
            console.log((0, babar_1.default)(binLiquidities));
        });
        it("Rerun if failed at last deposit", async () => {
            const seedAmount = new anchor_1.BN(100_000_000).mul(new anchor_1.BN(10 ** btcDecimal));
            const curvature = 0.8;
            const priceMultiplier = new decimal_js_1.default(10 ** (pair.tokenX.decimal - pair.tokenY.decimal));
            const minPrice = (0, helpers_1.getPriceOfBinByBinId)(pair.lbPair.activeId, pair.lbPair.binStep)
                .add(1)
                .mul(priceMultiplier);
            const maxPrice = (0, helpers_1.getPriceOfBinByBinId)(pair.lbPair.activeId + 1 + constants_1.MAX_BIN_PER_POSITION.toNumber() * 3, pair.lbPair.binStep).mul(priceMultiplier);
            let { initializeBinArraysAndPositionIxs, addLiquidityIxs } = await pair.seedLiquidity(keypair.publicKey, seedAmount, curvature, minPrice.toNumber(), maxPrice.toNumber(), baseKeypair.publicKey);
            {
                const transactions = [];
                const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
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
            let beforeTokenXBalance = await connection
                .getTokenAccountBalance(userBTC)
                .then((i) => new anchor_1.BN(i.value.amount));
            // Simulate send all add liquidity, but index 2 ix timeout
            {
                const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
                const transactions = [];
                for (const [idx, groupIx] of addLiquidityIxs.entries()) {
                    if (idx == 2) {
                        continue;
                    }
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
            let afterTokenXBalance = await connection
                .getTokenAccountBalance(userBTC)
                .then((i) => new anchor_1.BN(i.value.amount));
            const actualDepositedAmount = beforeTokenXBalance.sub(afterTokenXBalance);
            expect(actualDepositedAmount.toString()).not.toEqual(seedAmount.toString());
            const seedLiquidityResponse = await pair.seedLiquidity(keypair.publicKey, seedAmount, curvature, minPrice.toNumber(), maxPrice.toNumber(), baseKeypair.publicKey);
            expect(seedLiquidityResponse.initializeBinArraysAndPositionIxs.length).toBe(0);
            expect(seedLiquidityResponse.addLiquidityIxs.length).toBe(1);
            beforeTokenXBalance = afterTokenXBalance;
            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
            const tx = new web3_js_1.Transaction({
                feePayer: keypair.publicKey,
                blockhash,
                lastValidBlockHeight,
            }).add(...seedLiquidityResponse.addLiquidityIxs[0]);
            const txHash = await (0, web3_js_1.sendAndConfirmTransaction)(connection, tx, [
                keypair,
            ]).catch((e) => {
                console.error(e);
                throw e;
            });
            console.log(txHash);
            afterTokenXBalance = await connection
                .getTokenAccountBalance(userBTC)
                .then((i) => new anchor_1.BN(i.value.amount));
            const depositedAmount = beforeTokenXBalance.sub(afterTokenXBalance);
            expect(actualDepositedAmount.add(depositedAmount).toString()).toEqual(seedAmount.toString());
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
            console.log((0, babar_1.default)(binLiquidities));
        });
        it("Happy path", async () => {
            const seedAmount = new anchor_1.BN(Math.random() * 1_000_000_000)
                .add(new anchor_1.BN(100_000_000))
                .mul(new anchor_1.BN(10 ** btcDecimal));
            const curvature = Math.floor((Math.random() * 1.5 + 0.5) * 100) / 100;
            const priceMultiplier = new decimal_js_1.default(10 ** (pair.tokenX.decimal - pair.tokenY.decimal));
            const positionNeeded = Math.floor(Math.random() * 11 + 1);
            const minPrice = (0, helpers_1.getPriceOfBinByBinId)(pair.lbPair.activeId, pair.lbPair.binStep)
                .add(1)
                .mul(priceMultiplier);
            const maxPrice = (0, helpers_1.getPriceOfBinByBinId)(pair.lbPair.activeId +
                1 +
                constants_1.MAX_BIN_PER_POSITION.toNumber() * positionNeeded, pair.lbPair.binStep).mul(priceMultiplier);
            console.log("SeedAmount", seedAmount.toString());
            console.log("Curvature", curvature);
            console.log("PositionNeeded", positionNeeded);
            console.log("Min/Max price", minPrice, maxPrice);
            console.log("Binstep", pair.lbPair.binStep);
            const { initializeBinArraysAndPositionIxs, addLiquidityIxs } = await pair.seedLiquidity(keypair.publicKey, seedAmount, curvature, minPrice.toNumber(), maxPrice.toNumber(), baseKeypair.publicKey);
            const beforeTokenXBalance = await connection
                .getTokenAccountBalance(userBTC)
                .then((i) => new anchor_1.BN(i.value.amount));
            {
                const transactions = [];
                const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
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
            {
                const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
                const transactions = [];
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
                .getTokenAccountBalance(userBTC)
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
            // console.log(binLiquidities.filter((b) => b[1] > 0).reverse());
            // console.log(binLiquidities.filter((b) => b[1] > 0));
            console.log((0, babar_1.default)(binLiquidities));
        });
    });
    it("create LB pair", async () => {
        try {
            const rawTx = await index_1.DLMM.createLbPair(connection, keypair.publicKey, BTC, USDC, new anchor_1.BN(DEFAULT_BIN_STEP), new anchor_1.BN(DEFAULT_BASE_FACTOR), presetParamPda, DEFAULT_ACTIVE_ID, { cluster: "localhost" });
            const txHash = await (0, web3_js_1.sendAndConfirmTransaction)(connection, rawTx, [
                keypair,
            ]);
            expect(txHash).not.toBeNull();
            console.log("Create LB pair", txHash);
        }
        catch (error) {
            console.log(JSON.parse(JSON.stringify(error)));
        }
    });
    it("fetch all preset parameter", async () => {
        const presetParams = await index_1.DLMM.getAllPresetParameters(connection, {
            cluster: "localhost",
        });
        expect(presetParams.length).toBeGreaterThan(0);
    });
    it("create LB pair with bitmap extension", async () => {
        try {
            const rawTx = await index_1.DLMM.createLbPair(connection, keypair.publicKey, spl_token_1.NATIVE_MINT, USDC, new anchor_1.BN(DEFAULT_BIN_STEP), new anchor_1.BN(DEFAULT_BASE_FACTOR_2), presetParamPda2, ACTIVE_ID_OUT_OF_RANGE, { cluster: "localhost" });
            const txHash = await (0, web3_js_1.sendAndConfirmTransaction)(connection, rawTx, [
                keypair,
            ]);
            expect(txHash).not.toBeNull();
            console.log("Create LB pair with bitmap extension", txHash);
        }
        catch (error) {
            console.log("🚀 ~ it ~ error:", JSON.parse(JSON.stringify(error)));
        }
    });
    it("create LBCLMM instance", async () => {
        [lbClmm] = await index_1.DLMM.createMultiple(connection, [lbPairPubkey], {
            cluster: "localhost",
        });
        expect(lbClmm).not.toBeNull();
        expect(lbClmm).toBeInstanceOf(index_1.DLMM);
        expect(lbClmm.tokenX.publicKey.toBase58()).toBe(BTC.toBase58());
        expect(lbClmm.tokenY.publicKey.toBase58()).toBe(USDC.toBase58());
        lbClmm = await index_1.DLMM.create(connection, lbPairPubkey, {
            cluster: "localhost",
        });
        expect(lbClmm).not.toBeNull();
        expect(lbClmm).toBeInstanceOf(index_1.DLMM);
        expect(lbClmm.tokenX.publicKey.toBase58()).toBe(BTC.toBase58());
        expect(lbClmm.tokenY.publicKey.toBase58()).toBe(USDC.toBase58());
    });
    it("create LBCLMM instance with bitmap extension", async () => {
        [lbClmmWithBitMapExt] = await index_1.DLMM.createMultiple(connection, [lbPairWithBitMapExtPubkey], { cluster: "localhost" });
        expect(lbClmmWithBitMapExt).not.toBeNull();
        expect(lbClmmWithBitMapExt).toBeInstanceOf(index_1.DLMM);
        expect(lbClmmWithBitMapExt.tokenX.publicKey.toBase58()).toBe(spl_token_1.NATIVE_MINT.toBase58());
        expect(lbClmmWithBitMapExt.tokenY.publicKey.toBase58()).toBe(USDC.toBase58());
        lbClmmWithBitMapExt = await index_1.DLMM.create(connection, lbPairWithBitMapExtPubkey, { cluster: "localhost" });
        expect(lbClmmWithBitMapExt).not.toBeNull();
        expect(lbClmmWithBitMapExt).toBeInstanceOf(index_1.DLMM);
        expect(lbClmmWithBitMapExt.tokenX.publicKey.toBase58()).toBe(spl_token_1.NATIVE_MINT.toBase58());
        expect(lbClmmWithBitMapExt.tokenY.publicKey.toBase58()).toBe(USDC.toBase58());
    });
    it("fetch created lb pair", async () => {
        expect(lbClmm.lbPair).not.toBeNull();
        expect(lbClmm.lbPair.tokenXMint.toBase58()).toBe(BTC.toBase58());
        expect(lbClmm.lbPair.tokenYMint.toBase58()).toBe(USDC.toBase58());
        expect(lbClmm.lbPair.activeId).toBe(DEFAULT_ACTIVE_ID.toNumber());
        expect(lbClmm.lbPair.binStep).toBe(DEFAULT_BIN_STEP.toNumber());
    });
    it("fetch all lb pair", async () => {
        const lbPairs = await index_1.DLMM.getLbPairs(connection, { cluster: "localhost" });
        expect(lbPairs.length).toBeGreaterThan(0);
        expect(lbPairs.find((lps) => lps.publicKey.toBase58() == lbPairPubkey.toBase58())).not.toBeUndefined();
    });
    it("initialize position and add liquidity to non exists bin arrays", async () => {
        const btcInAmount = new anchor_1.BN(1).mul(new anchor_1.BN(10 ** btcDecimal));
        const usdcInAmount = new anchor_1.BN(24000).mul(new anchor_1.BN(10 ** usdcDecimal));
        const xYAmountDistribution = [
            {
                binId: DEFAULT_ACTIVE_ID.sub(new anchor_1.BN(1)).toNumber(),
                xAmountBpsOfTotal: new anchor_1.BN(0),
                yAmountBpsOfTotal: new anchor_1.BN(7500),
            },
            {
                binId: DEFAULT_ACTIVE_ID.toNumber(),
                xAmountBpsOfTotal: new anchor_1.BN(2500),
                yAmountBpsOfTotal: new anchor_1.BN(2500),
            },
            {
                binId: DEFAULT_ACTIVE_ID.add(new anchor_1.BN(1)).toNumber(),
                xAmountBpsOfTotal: new anchor_1.BN(7500),
                yAmountBpsOfTotal: new anchor_1.BN(0),
            },
        ];
        const rawTxs = await lbClmm.initializePositionAndAddLiquidityByWeight({
            user: keypair.publicKey,
            positionPubKey: positionKeypair.publicKey,
            totalXAmount: btcInAmount,
            totalYAmount: usdcInAmount,
            xYAmountDistribution,
        });
        if (Array.isArray(rawTxs)) {
            for (const rawTx of rawTxs) {
                // Do not alter the order of the signers. Some weird bug from solana where it keep throwing error about positionKeypair has no balance.
                const txHash = await (0, web3_js_1.sendAndConfirmTransaction)(connection, rawTx, [
                    keypair,
                    positionKeypair,
                ]).catch(console.error);
                expect(txHash).not.toBeNull();
                console.log("Create bin arrays, position, and add liquidity", txHash);
            }
        }
        else {
            // console.log(rawTxs.instructions);
            const txHash = await (0, web3_js_1.sendAndConfirmTransaction)(connection, rawTxs, [
                keypair,
                positionKeypair,
            ]).catch(console.error);
            expect(txHash).not.toBeNull();
            console.log("Create bin arrays, position, and add liquidity", txHash);
        }
        const positionState = await lbClmm.program.account.positionV2.fetch(positionKeypair.publicKey);
        const lbPairPositionsMap = await index_1.DLMM.getAllLbPairPositionsByUser(connection, keypair.publicKey, {
            cluster: "localhost",
        });
        const positions = lbPairPositionsMap.get(lbPairPubkey.toBase58());
        const position = positions.lbPairPositionsData.find(({ publicKey }) => publicKey.equals(positionKeypair.publicKey));
        const { positionData } = position;
        expect(+positionData.totalXAmount).toBeLessThan(btcInAmount.toNumber());
        assertAmountWithPrecision(+positionData.totalXAmount, btcInAmount.toNumber(), 5);
        expect(+positionData.totalYAmount).toBeLessThan(usdcInAmount.toNumber());
        assertAmountWithPrecision(+positionData.totalYAmount, usdcInAmount.toNumber(), 5);
        expect(positionData.positionBinData.length).toBe(positionState.upperBinId - positionState.lowerBinId + 1);
        const positionBinWithLiquidity = positionData.positionBinData.filter((p) => p.positionLiquidity != "0");
        expect(positionBinWithLiquidity.length).toBe(xYAmountDistribution.length);
        for (const [idx, binData] of positionBinWithLiquidity.entries()) {
            const xYDist = xYAmountDistribution[idx];
            expect(binData.binId).toBe(xYDist.binId);
            assertAmountWithPrecision(+binData.binXAmount, xYDist.xAmountBpsOfTotal
                .mul(btcInAmount)
                .div(new anchor_1.BN(constants_1.BASIS_POINT_MAX))
                .toNumber(), 15);
            assertAmountWithPrecision(+binData.binYAmount, xYDist.yAmountBpsOfTotal
                .mul(usdcInAmount)
                .div(new anchor_1.BN(constants_1.BASIS_POINT_MAX))
                .toNumber(), 15);
        }
    });
    it("get user positions in pool", async () => {
        const positions = await lbClmm.getPositionsByUserAndLbPair(keypair.publicKey);
        expect(positions.userPositions.length).toBeGreaterThan(0);
        expect(positions.userPositions.find((ps) => ps.publicKey.toBase58() == positionKeypair.publicKey.toBase58())).not.toBeUndefined();
    });
    it("fetch all bin arrays of the lb pair", async () => {
        const binArrays = await lbClmm.getBinArrays();
        for (const binArray of binArrays) {
            expect(binArray.account.lbPair.toBase58()).toBe(lbPairPubkey.toBase58());
        }
        const { userPositions } = await lbClmm.getPositionsByUserAndLbPair(keypair.publicKey);
        expect(userPositions.length).toBeGreaterThan(0);
        userPositions.forEach((position) => {
            expect(position.positionData.positionBinData.length).toBeGreaterThan(0);
        });
    });
    describe("Swap within active bin", () => {
        describe("Swap exact in", () => {
            let btcInAmount;
            let usdcInAmount;
            let quotedOutAmount;
            let actualOutAmount;
            let binArraysPubkeyForSwap;
            beforeEach(async () => {
                await lbClmm.refetchStates();
            });
            it("quote X -> Y", async () => {
                const bins = await lbClmm.getBinsBetweenLowerAndUpperBound(lbClmm.lbPair.activeId, lbClmm.lbPair.activeId);
                const activeBin = bins.bins.pop();
                const btcAmountToSwapHalfUsdcOfActiveBin = new anchor_1.BN(activeBin.yAmount.div(new anchor_1.BN(2)).toNumber() /
                    Number.parseFloat(activeBin.price));
                btcInAmount = btcAmountToSwapHalfUsdcOfActiveBin;
                const binArrays = await lbClmm.getBinArrays();
                const { fee, outAmount, priceImpact, protocolFee, binArraysPubkey } = lbClmm.swapQuote(btcInAmount, true, new anchor_1.BN(0), binArrays);
                expect(outAmount.toString()).not.toEqual("0");
                expect(fee.toString()).not.toEqual("0");
                // Swap within active bin has no price impact
                expect(priceImpact.isZero()).toBeTruthy();
                expect(protocolFee.toString()).toEqual("0");
                expect(binArraysPubkey.length).toBeGreaterThan(0);
                binArraysPubkeyForSwap = binArraysPubkey;
                quotedOutAmount = outAmount;
            });
            it("swap X -> Y", async () => {
                const [beforeBtc, beforeUsdc] = await Promise.all([
                    connection
                        .getTokenAccountBalance(userBTC)
                        .then((ta) => new anchor_1.BN(ta.value.amount)),
                    connection
                        .getTokenAccountBalance(userUSDC)
                        .then((ta) => new anchor_1.BN(ta.value.amount)),
                ]);
                const rawTx = await lbClmm.swap({
                    inAmount: btcInAmount,
                    outToken: USDC,
                    minOutAmount: new anchor_1.BN(0),
                    user: keypair.publicKey,
                    inToken: BTC,
                    lbPair: lbPairPubkey,
                    binArraysPubkey: binArraysPubkeyForSwap,
                });
                const txHash = await (0, web3_js_1.sendAndConfirmTransaction)(connection, rawTx, [
                    keypair,
                ]);
                expect(txHash).not.toBeNull();
                console.log("Swap X -> Y", txHash);
                const [afterBtc, afterUsdc] = await Promise.all([
                    connection
                        .getTokenAccountBalance(userBTC)
                        .then((ta) => new anchor_1.BN(ta.value.amount)),
                    connection
                        .getTokenAccountBalance(userUSDC)
                        .then((ta) => new anchor_1.BN(ta.value.amount)),
                ]);
                expect(afterBtc.lt(beforeBtc)).toBeTruthy();
                expect(afterUsdc.gt(beforeUsdc)).toBeTruthy();
                actualOutAmount = afterUsdc.sub(beforeUsdc);
            });
            it("quote matches actual swap result (X -> Y)", () => {
                expect(actualOutAmount.toString()).toBe(quotedOutAmount.toString());
            });
            it("quote Y -> X", async () => {
                const bins = await lbClmm.getBinsBetweenLowerAndUpperBound(lbClmm.lbPair.activeId, lbClmm.lbPair.activeId);
                const activeBin = bins.bins.pop();
                const usdcAmountToSwapHalfBtcOfActiveBin = new anchor_1.BN(activeBin.xAmount.div(new anchor_1.BN(2)).toNumber() *
                    Number.parseFloat(activeBin.price));
                usdcInAmount = usdcAmountToSwapHalfBtcOfActiveBin;
                const binArrays = await lbClmm.getBinArrays();
                const { fee, outAmount, priceImpact, protocolFee, binArraysPubkey } = lbClmm.swapQuote(usdcInAmount, false, new anchor_1.BN(0), binArrays);
                expect(outAmount.toString()).not.toEqual("0");
                expect(fee.toString()).not.toEqual("0");
                // Swap within active bin has no price impact
                expect(priceImpact.isZero()).toBeTruthy();
                // TODO: Now we disable protocol we. Re-enable it back later.
                expect(protocolFee.toString()).toEqual("0");
                expect(binArraysPubkey.length).toBeGreaterThan(0);
                binArraysPubkeyForSwap = binArraysPubkey;
                quotedOutAmount = outAmount;
            });
            it("swap Y -> X", async () => {
                const [beforeBtc, beforeUsdc] = await Promise.all([
                    connection
                        .getTokenAccountBalance(userBTC)
                        .then((ta) => new anchor_1.BN(ta.value.amount)),
                    connection
                        .getTokenAccountBalance(userUSDC)
                        .then((ta) => new anchor_1.BN(ta.value.amount)),
                ]);
                const rawTx = await lbClmm.swap({
                    inAmount: usdcInAmount,
                    outToken: BTC,
                    minOutAmount: new anchor_1.BN(0),
                    user: keypair.publicKey,
                    inToken: USDC,
                    lbPair: lbPairPubkey,
                    binArraysPubkey: binArraysPubkeyForSwap,
                });
                const txHash = await (0, web3_js_1.sendAndConfirmTransaction)(connection, rawTx, [
                    keypair,
                ]);
                expect(txHash).not.toBeNull();
                console.log("Swap Y -> X", txHash);
                const [afterBtc, afterUsdc] = await Promise.all([
                    connection
                        .getTokenAccountBalance(userBTC)
                        .then((ta) => new anchor_1.BN(ta.value.amount)),
                    connection
                        .getTokenAccountBalance(userUSDC)
                        .then((ta) => new anchor_1.BN(ta.value.amount)),
                ]);
                expect(afterBtc.gt(beforeBtc)).toBeTruthy();
                expect(afterUsdc.lt(beforeUsdc)).toBeTruthy();
                actualOutAmount = afterBtc.sub(beforeBtc);
            });
            it("quote matches actual swap result (Y -> X)", () => {
                expect(actualOutAmount.toString()).toBe(quotedOutAmount.toString());
            });
        });
        describe("Swap exact out", () => {
            let outAmount;
            let quotedInAmount;
            let binArraysPubkeyForSwap;
            let quotedMaxInAmount;
            let quotedInFee;
            let actualOutAmount;
            let actualInAmount;
            beforeEach(async () => {
                await lbClmm.refetchStates();
            });
            it("quote X -> Y", async () => {
                outAmount = new anchor_1.BN(0);
                const bins = await lbClmm.getBinsBetweenLowerAndUpperBound(lbClmm.lbPair.activeId, lbClmm.lbPair.activeId);
                const activeBin = bins.bins.pop();
                const halfTokenYAmount = new anchor_1.BN(activeBin.yAmount.div(new anchor_1.BN(2)));
                outAmount = halfTokenYAmount;
                const binArrays = await lbClmm.getBinArrays();
                const { fee, inAmount, maxInAmount, protocolFee, binArraysPubkey, priceImpact, } = lbClmm.swapQuoteExactOut(outAmount, true, new anchor_1.BN(5), binArrays);
                expect(inAmount.toString()).not.toEqual("0");
                expect(fee.toString()).not.toEqual("0");
                expect(protocolFee.toString()).toEqual("0");
                expect(binArraysPubkey.length).toBeGreaterThan(0);
                expect(priceImpact.toNumber()).toBe(0);
                binArraysPubkeyForSwap = binArraysPubkey;
                quotedMaxInAmount = maxInAmount;
                quotedInFee = fee;
                quotedInAmount = inAmount;
            });
            it("swap X -> Y", async () => {
                const [beforeBtc, beforeUsdc] = await Promise.all([
                    connection
                        .getTokenAccountBalance(userBTC)
                        .then((ta) => new anchor_1.BN(ta.value.amount)),
                    connection
                        .getTokenAccountBalance(userUSDC)
                        .then((ta) => new anchor_1.BN(ta.value.amount)),
                ]);
                const rawTx = await lbClmm.swapExactOut({
                    maxInAmount: quotedMaxInAmount.add(quotedInFee),
                    inToken: BTC,
                    outToken: USDC,
                    outAmount,
                    user: keypair.publicKey,
                    lbPair: lbPairPubkey,
                    binArraysPubkey: binArraysPubkeyForSwap,
                });
                const txHash = await (0, web3_js_1.sendAndConfirmTransaction)(connection, rawTx, [
                    keypair,
                ]);
                expect(txHash).not.toBeNull();
                console.log("Swap X -> Y", txHash);
                const [afterBtc, afterUsdc] = await Promise.all([
                    connection
                        .getTokenAccountBalance(userBTC)
                        .then((ta) => new anchor_1.BN(ta.value.amount)),
                    connection
                        .getTokenAccountBalance(userUSDC)
                        .then((ta) => new anchor_1.BN(ta.value.amount)),
                ]);
                expect(afterBtc.lt(beforeBtc)).toBeTruthy();
                expect(afterUsdc.gt(beforeUsdc)).toBeTruthy();
                actualOutAmount = afterUsdc.sub(beforeUsdc);
                actualInAmount = beforeBtc.sub(afterBtc);
            });
            it("quote matches actual swap result (X -> Y)", () => {
                expect(actualOutAmount.toString()).toBe(outAmount.toString());
                expect(actualInAmount.toString()).toBe(quotedInAmount.add(quotedInFee).toString());
            });
            it("quote Y -> X", async () => {
                outAmount = new anchor_1.BN(0);
                const bins = await lbClmm.getBinsBetweenLowerAndUpperBound(lbClmm.lbPair.activeId, lbClmm.lbPair.activeId);
                const activeBin = bins.bins.pop();
                const halfTokenXAmount = new anchor_1.BN(activeBin.xAmount.div(new anchor_1.BN(2)));
                outAmount = halfTokenXAmount;
                const binArrays = await lbClmm.getBinArrays();
                const { fee, inAmount, maxInAmount, protocolFee, binArraysPubkey, priceImpact, } = lbClmm.swapQuoteExactOut(outAmount, false, new anchor_1.BN(5), binArrays);
                expect(inAmount.toString()).not.toEqual("0");
                expect(fee.toString()).not.toEqual("0");
                expect(protocolFee.toString()).toEqual("0");
                expect(binArraysPubkey.length).toBeGreaterThan(0);
                expect(priceImpact.toNumber()).toBe(0);
                binArraysPubkeyForSwap = binArraysPubkey;
                quotedMaxInAmount = maxInAmount;
                quotedInFee = fee;
                quotedInAmount = inAmount;
            });
            it("swap Y -> X", async () => {
                const [beforeBtc, beforeUsdc] = await Promise.all([
                    connection
                        .getTokenAccountBalance(userBTC)
                        .then((ta) => new anchor_1.BN(ta.value.amount)),
                    connection
                        .getTokenAccountBalance(userUSDC)
                        .then((ta) => new anchor_1.BN(ta.value.amount)),
                ]);
                const rawTx = await lbClmm.swapExactOut({
                    maxInAmount: quotedMaxInAmount.add(quotedInFee),
                    inToken: USDC,
                    outToken: BTC,
                    outAmount,
                    user: keypair.publicKey,
                    lbPair: lbPairPubkey,
                    binArraysPubkey: binArraysPubkeyForSwap,
                });
                const txHash = await (0, web3_js_1.sendAndConfirmTransaction)(connection, rawTx, [
                    keypair,
                ]).catch((err) => {
                    console.error(err);
                    throw err;
                });
                expect(txHash).not.toBeNull();
                console.log("Swap Y -> X", txHash);
                const [afterBtc, afterUsdc] = await Promise.all([
                    connection
                        .getTokenAccountBalance(userBTC)
                        .then((ta) => new anchor_1.BN(ta.value.amount)),
                    connection
                        .getTokenAccountBalance(userUSDC)
                        .then((ta) => new anchor_1.BN(ta.value.amount)),
                ]);
                expect(afterBtc.gt(beforeBtc)).toBeTruthy();
                expect(afterUsdc.lt(beforeUsdc)).toBeTruthy();
                actualOutAmount = afterBtc.sub(beforeBtc);
                actualInAmount = beforeUsdc.sub(afterUsdc);
            });
            it("quote matches actual swap result (Y -> X)", () => {
                expect(actualOutAmount.toString()).toBe(outAmount.toString());
                expect(actualInAmount.toString()).toBe(quotedInAmount.add(quotedInFee).toString());
            });
        });
    });
    describe("Swap with 2 bin", () => {
        describe("Swap exact in", () => {
            let btcInAmount;
            let usdcInAmount;
            let quotedOutAmount;
            let actualOutAmount;
            let binArraysPubkeyForSwap;
            beforeEach(async () => {
                await lbClmm.refetchStates();
            });
            it("quote X -> Y", async () => {
                const bins = await lbClmm.getBinsBetweenLowerAndUpperBound(lbClmm.lbPair.activeId - 1, lbClmm.lbPair.activeId);
                const beforeActiveBin = bins.bins.pop();
                const activeBin = bins.bins.pop();
                const btcAmountToCrossBin = activeBin.yAmount.toNumber() / Number.parseFloat(activeBin.price) +
                    beforeActiveBin.yAmount.div(new anchor_1.BN(2)).toNumber() /
                        Number.parseFloat(activeBin.price);
                btcInAmount = new anchor_1.BN(btcAmountToCrossBin + 1);
                const binArrays = await lbClmm.getBinArrays();
                const { fee, outAmount, priceImpact, protocolFee, binArraysPubkey } = lbClmm.swapQuote(btcInAmount, true, new anchor_1.BN(0), binArrays);
                expect(outAmount.toString()).not.toEqual("0");
                expect(fee.toString()).not.toEqual("0");
                // Swap with crossing bins has price impact
                expect(!priceImpact.isZero()).toBeTruthy();
                expect(protocolFee.toString()).toEqual("0");
                expect(binArraysPubkey.length).toBeGreaterThan(0);
                binArraysPubkeyForSwap = binArraysPubkey;
                quotedOutAmount = outAmount;
            });
            it("swap X -> Y", async () => {
                const [beforeBtc, beforeUsdc] = await Promise.all([
                    connection
                        .getTokenAccountBalance(userBTC)
                        .then((ta) => new anchor_1.BN(ta.value.amount)),
                    connection
                        .getTokenAccountBalance(userUSDC)
                        .then((ta) => new anchor_1.BN(ta.value.amount)),
                ]);
                const rawTx = await lbClmm.swap({
                    inAmount: btcInAmount,
                    outToken: USDC,
                    minOutAmount: new anchor_1.BN(0),
                    user: keypair.publicKey,
                    inToken: BTC,
                    lbPair: lbPairPubkey,
                    binArraysPubkey: binArraysPubkeyForSwap,
                });
                const txHash = await (0, web3_js_1.sendAndConfirmTransaction)(connection, rawTx, [
                    keypair,
                ]);
                expect(txHash).not.toBeNull();
                console.log("Swap X -> Y", txHash);
                const [afterBtc, afterUsdc] = await Promise.all([
                    connection
                        .getTokenAccountBalance(userBTC)
                        .then((ta) => new anchor_1.BN(ta.value.amount)),
                    connection
                        .getTokenAccountBalance(userUSDC)
                        .then((ta) => new anchor_1.BN(ta.value.amount)),
                ]);
                expect(afterBtc.lt(beforeBtc)).toBeTruthy();
                expect(afterUsdc.gt(beforeUsdc)).toBeTruthy();
                actualOutAmount = afterUsdc.sub(beforeUsdc);
            });
            it("quote matches actual swap result (X -> Y)", () => {
                expect(actualOutAmount.toString()).toBe(quotedOutAmount.toString());
            });
            it("quote Y -> X", async () => {
                const bins = await lbClmm.getBinsBetweenLowerAndUpperBound(lbClmm.lbPair.activeId, lbClmm.lbPair.activeId + 1);
                const activeBin = bins.bins.pop();
                const afterActiveBin = bins.bins.pop();
                const usdcAmountToCrossBin = activeBin.xAmount.toNumber() * Number.parseFloat(activeBin.price) +
                    afterActiveBin.xAmount.div(new anchor_1.BN(2)).toNumber() *
                        Number.parseFloat(afterActiveBin.price);
                usdcInAmount = new anchor_1.BN(usdcAmountToCrossBin + 1);
                const binArrays = await lbClmm.getBinArrays();
                const { fee, outAmount, priceImpact, protocolFee, binArraysPubkey } = lbClmm.swapQuote(usdcInAmount, false, new anchor_1.BN(0), binArrays);
                expect(outAmount.toString()).not.toEqual("0");
                expect(fee.toString()).not.toEqual("0");
                // Swap with crossing bins has price impact
                expect(!priceImpact.isZero()).toBeTruthy();
                expect(protocolFee.toString()).toEqual("0");
                expect(binArraysPubkey.length).toBeGreaterThan(0);
                binArraysPubkeyForSwap = binArraysPubkey;
                quotedOutAmount = outAmount;
            });
            it("swap Y -> X", async () => {
                const [beforeBtc, beforeUsdc] = await Promise.all([
                    connection
                        .getTokenAccountBalance(userBTC)
                        .then((ta) => new anchor_1.BN(ta.value.amount)),
                    connection
                        .getTokenAccountBalance(userUSDC)
                        .then((ta) => new anchor_1.BN(ta.value.amount)),
                ]);
                const rawTx = await lbClmm.swap({
                    inAmount: usdcInAmount,
                    outToken: BTC,
                    minOutAmount: new anchor_1.BN(0),
                    user: keypair.publicKey,
                    inToken: USDC,
                    lbPair: lbPairPubkey,
                    binArraysPubkey: binArraysPubkeyForSwap,
                });
                const txHash = await (0, web3_js_1.sendAndConfirmTransaction)(connection, rawTx, [
                    keypair,
                ]);
                expect(txHash).not.toBeNull();
                console.log("Swap Y -> X", txHash);
                const [afterBtc, afterUsdc] = await Promise.all([
                    connection
                        .getTokenAccountBalance(userBTC)
                        .then((ta) => new anchor_1.BN(ta.value.amount)),
                    connection
                        .getTokenAccountBalance(userUSDC)
                        .then((ta) => new anchor_1.BN(ta.value.amount)),
                ]);
                expect(afterBtc.gt(beforeBtc)).toBeTruthy();
                expect(afterUsdc.lt(beforeUsdc)).toBeTruthy();
                actualOutAmount = afterBtc.sub(beforeBtc);
            });
            it("quote matches actual swap result (Y -> X)", () => {
                expect(actualOutAmount.toString()).toBe(quotedOutAmount.toString());
            });
        });
        describe("Swap exact out", () => {
            let outAmount;
            let quotedInAmount;
            let binArraysPubkeyForSwap;
            let quotedMaxInAmount;
            let quotedInFee;
            let actualOutAmount;
            let actualInAmount;
            beforeEach(async () => {
                await lbClmm.refetchStates();
            });
            it("quote X -> Y", async () => {
                outAmount = new anchor_1.BN(0);
                const { bins } = await lbClmm.getBinsBetweenLowerAndUpperBound(lbClmm.lbPair.activeId - 1, lbClmm.lbPair.activeId);
                const sortedBins = bins.sort((a, b) => b.binId - a.binId);
                const activeBin = sortedBins.pop();
                outAmount = outAmount.add(activeBin.yAmount);
                const beforeActiveBin = sortedBins.pop();
                outAmount = outAmount.add(beforeActiveBin.yAmount.div(new anchor_1.BN(2)));
                const binArrays = await lbClmm.getBinArrays();
                const { fee, inAmount, maxInAmount, protocolFee, binArraysPubkey, priceImpact, } = lbClmm.swapQuoteExactOut(outAmount, true, new anchor_1.BN(5), binArrays);
                expect(inAmount.toString()).not.toEqual("0");
                expect(fee.toString()).not.toEqual("0");
                expect(protocolFee.toString()).toEqual("0");
                expect(binArraysPubkey.length).toBeGreaterThan(0);
                expect(priceImpact.toNumber()).toBeGreaterThan(0);
                binArraysPubkeyForSwap = binArraysPubkey;
                quotedMaxInAmount = maxInAmount;
                quotedInFee = fee;
                quotedInAmount = inAmount;
            });
            it("swap X -> Y", async () => {
                const [beforeBtc, beforeUsdc] = await Promise.all([
                    connection
                        .getTokenAccountBalance(userBTC)
                        .then((ta) => new anchor_1.BN(ta.value.amount)),
                    connection
                        .getTokenAccountBalance(userUSDC)
                        .then((ta) => new anchor_1.BN(ta.value.amount)),
                ]);
                const rawTx = await lbClmm.swapExactOut({
                    maxInAmount: quotedMaxInAmount.add(quotedInFee),
                    inToken: BTC,
                    outToken: USDC,
                    outAmount,
                    user: keypair.publicKey,
                    lbPair: lbPairPubkey,
                    binArraysPubkey: binArraysPubkeyForSwap,
                });
                const txHash = await (0, web3_js_1.sendAndConfirmTransaction)(connection, rawTx, [
                    keypair,
                ]);
                expect(txHash).not.toBeNull();
                console.log("Swap X -> Y", txHash);
                const [afterBtc, afterUsdc] = await Promise.all([
                    connection
                        .getTokenAccountBalance(userBTC)
                        .then((ta) => new anchor_1.BN(ta.value.amount)),
                    connection
                        .getTokenAccountBalance(userUSDC)
                        .then((ta) => new anchor_1.BN(ta.value.amount)),
                ]);
                expect(afterBtc.lt(beforeBtc)).toBeTruthy();
                expect(afterUsdc.gt(beforeUsdc)).toBeTruthy();
                actualOutAmount = afterUsdc.sub(beforeUsdc);
                actualInAmount = beforeBtc.sub(afterBtc);
            });
            it("quote matches actual swap result (X -> Y)", () => {
                expect(actualOutAmount.toString()).toBe(outAmount.toString());
                expect(actualInAmount.toString()).toBe(quotedInAmount.add(quotedInFee).toString());
            });
            it("quote Y -> X", async () => {
                outAmount = new anchor_1.BN(0);
                const { bins } = await lbClmm.getBinsBetweenLowerAndUpperBound(lbClmm.lbPair.activeId, lbClmm.lbPair.activeId + 1);
                const sortedBins = bins.sort((a, b) => a.binId - b.binId);
                const activeBin = sortedBins.pop();
                outAmount = outAmount.add(activeBin.xAmount);
                const afterActiveBin = sortedBins.pop();
                outAmount = outAmount.add(afterActiveBin.xAmount.div(new anchor_1.BN(2)));
                const binArrays = await lbClmm.getBinArrays();
                const { fee, inAmount, maxInAmount, protocolFee, binArraysPubkey, priceImpact, } = lbClmm.swapQuoteExactOut(outAmount, false, new anchor_1.BN(5), binArrays);
                expect(inAmount.toString()).not.toEqual("0");
                expect(fee.toString()).not.toEqual("0");
                expect(protocolFee.toString()).toEqual("0");
                expect(binArraysPubkey.length).toBeGreaterThan(0);
                expect(priceImpact.toNumber()).toBeGreaterThan(0);
                binArraysPubkeyForSwap = binArraysPubkey;
                quotedMaxInAmount = maxInAmount;
                quotedInFee = fee;
                quotedInAmount = inAmount;
            });
            it("swap Y -> X", async () => {
                const [beforeBtc, beforeUsdc] = await Promise.all([
                    connection
                        .getTokenAccountBalance(userBTC)
                        .then((ta) => new anchor_1.BN(ta.value.amount)),
                    connection
                        .getTokenAccountBalance(userUSDC)
                        .then((ta) => new anchor_1.BN(ta.value.amount)),
                ]);
                const rawTx = await lbClmm.swapExactOut({
                    maxInAmount: quotedMaxInAmount.add(quotedInFee),
                    inToken: USDC,
                    outToken: BTC,
                    outAmount,
                    user: keypair.publicKey,
                    lbPair: lbPairPubkey,
                    binArraysPubkey: binArraysPubkeyForSwap,
                });
                const txHash = await (0, web3_js_1.sendAndConfirmTransaction)(connection, rawTx, [
                    keypair,
                ]);
                expect(txHash).not.toBeNull();
                console.log("Swap Y -> X", txHash);
                const [afterBtc, afterUsdc] = await Promise.all([
                    connection
                        .getTokenAccountBalance(userBTC)
                        .then((ta) => new anchor_1.BN(ta.value.amount)),
                    connection
                        .getTokenAccountBalance(userUSDC)
                        .then((ta) => new anchor_1.BN(ta.value.amount)),
                ]);
                expect(afterBtc.gt(beforeBtc)).toBeTruthy();
                expect(afterUsdc.lt(beforeUsdc)).toBeTruthy();
                actualOutAmount = afterBtc.sub(beforeBtc);
                actualInAmount = beforeUsdc.sub(afterUsdc);
            });
            it("quote matches actual swap result (Y -> X)", () => {
                expect(actualOutAmount.toString()).toBe(outAmount.toString());
                expect(actualInAmount.toString()).toBe(quotedInAmount.add(quotedInFee).toString());
            });
        });
    });
});
