"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const anchor_1 = require("@coral-xyz/anchor");
const spl_token_1 = require("@solana/spl-token");
const web3_js_1 = require("@solana/web3.js");
const fs_1 = __importDefault(require("fs"));
const constants_1 = require("../dlmm/constants");
const helpers_1 = require("../dlmm/helpers");
const index_1 = require("../dlmm/index");
const types_1 = require("../dlmm/types");
const keypairBuffer = fs_1.default.readFileSync("../keys/localnet/admin-bossj3JvwiNK7pvjr149DqdtJxf2gdygbcmEPTkb2F1.json", "utf-8");
const connection = new web3_js_1.Connection("http://127.0.0.1:8899", "confirmed");
const owner = web3_js_1.Keypair.fromSecretKey(new Uint8Array(JSON.parse(keypairBuffer)));
const programId = new web3_js_1.PublicKey(constants_1.LBCLMM_PROGRAM_IDS["localhost"]);
describe("Single Bin Seed Liquidity Test", () => {
    describe("TokenX decimals < TokenY decimals", () => {
        const baseKeypair = web3_js_1.Keypair.generate();
        const positionOwnerKeypair = web3_js_1.Keypair.generate();
        const feeOwnerKeypair = web3_js_1.Keypair.generate();
        const wenDecimal = 5;
        const usdcDecimal = 6;
        const feeBps = new anchor_1.BN(500);
        const initialPrice = 0.000001;
        const binStep = 100;
        const wenSeedAmount = new anchor_1.BN(200_000 * 10 ** wenDecimal);
        let WEN;
        let USDC;
        let userWEN;
        let userUSDC;
        let pairKey;
        let pair;
        let positionOwnerTokenX;
        const initialPricePerLamport = index_1.DLMM.getPricePerLamport(wenDecimal, usdcDecimal, initialPrice);
        const binId = index_1.DLMM.getBinIdFromPrice(initialPricePerLamport, binStep, false);
        beforeAll(async () => {
            WEN = await (0, spl_token_1.createMint)(connection, owner, owner.publicKey, null, wenDecimal, web3_js_1.Keypair.generate(), null, spl_token_1.TOKEN_PROGRAM_ID);
            USDC = await (0, spl_token_1.createMint)(connection, owner, owner.publicKey, null, usdcDecimal, web3_js_1.Keypair.generate(), null, spl_token_1.TOKEN_PROGRAM_ID);
            const userWenInfo = await (0, spl_token_1.getOrCreateAssociatedTokenAccount)(connection, owner, WEN, owner.publicKey, false, "confirmed", {
                commitment: "confirmed",
            }, spl_token_1.TOKEN_PROGRAM_ID, spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID);
            userWEN = userWenInfo.address;
            const userUsdcInfo = await (0, spl_token_1.getOrCreateAssociatedTokenAccount)(connection, owner, USDC, owner.publicKey, false, "confirmed", {
                commitment: "confirmed",
            }, spl_token_1.TOKEN_PROGRAM_ID, spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID);
            userUSDC = userUsdcInfo.address;
            await (0, spl_token_1.mintTo)(connection, owner, WEN, userWEN, owner.publicKey, wenSeedAmount.toNumber() + 1, [], {
                commitment: "confirmed",
            }, spl_token_1.TOKEN_PROGRAM_ID);
            await (0, spl_token_1.mintTo)(connection, owner, USDC, userUSDC, owner.publicKey, 1_000_000_000 * 10 ** usdcDecimal, [], {
                commitment: "confirmed",
            }, spl_token_1.TOKEN_PROGRAM_ID);
            const slot = await connection.getSlot();
            const activationPoint = new anchor_1.BN(slot).add(new anchor_1.BN(100));
            let rawTx = await index_1.DLMM.createCustomizablePermissionlessLbPair(connection, new anchor_1.BN(binStep), WEN, USDC, new anchor_1.BN(binId.toString()), feeBps, types_1.ActivationType.Slot, false, // No alpha vault. Set to true the program will deterministically whitelist the alpha vault to swap before the pool start trading. Check: https://github.com/MeteoraAg/alpha-vault-sdk initialize{Prorata|Fcfs}Vault method to create the alpha vault.
            owner.publicKey, activationPoint, {
                cluster: "localhost",
            });
            let txHash = await (0, web3_js_1.sendAndConfirmTransaction)(connection, rawTx, [
                owner,
            ]).catch((e) => {
                console.error(e);
                throw e;
            });
            console.log("Create permissioned LB pair", txHash);
            [pairKey] = (0, helpers_1.deriveCustomizablePermissionlessLbPair)(WEN, USDC, programId);
            pair = await index_1.DLMM.create(connection, pairKey, {
                cluster: "localhost",
            });
            positionOwnerTokenX = (0, spl_token_1.getAssociatedTokenAddressSync)(WEN, positionOwnerKeypair.publicKey, true);
        });
        it("seed liquidity single bin", async () => {
            try {
                const positionOwnerTokenXBalance = await connection.getTokenAccountBalance(positionOwnerTokenX);
                if (positionOwnerTokenXBalance.value.amount == "0") {
                    await (0, spl_token_1.transfer)(connection, owner, userWEN, positionOwnerTokenX, owner, 1);
                }
            }
            catch (err) {
                await (0, spl_token_1.createAssociatedTokenAccount)(connection, owner, WEN, positionOwnerKeypair.publicKey);
                await (0, spl_token_1.transfer)(connection, owner, userWEN, positionOwnerTokenX, owner, 1);
            }
            const ixs = await pair.seedLiquiditySingleBin(owner.publicKey, baseKeypair.publicKey, wenSeedAmount, initialPrice, true, positionOwnerKeypair.publicKey, feeOwnerKeypair.publicKey, owner.publicKey, new anchor_1.BN(0));
            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
            const tx = new web3_js_1.Transaction({
                feePayer: owner.publicKey,
                blockhash,
                lastValidBlockHeight,
            }).add(...ixs);
            const beforeTokenXBalance = await connection
                .getTokenAccountBalance(userWEN)
                .then((i) => new anchor_1.BN(i.value.amount));
            await (0, web3_js_1.sendAndConfirmTransaction)(connection, tx, [
                owner,
                baseKeypair,
            ]).catch((e) => {
                console.error(e);
            });
            const afterTokenXBalance = await connection
                .getTokenAccountBalance(userWEN)
                .then((i) => new anchor_1.BN(i.value.amount));
            // minus 1 send to positionOwnerTokenX account
            const actualDepositedAmount = beforeTokenXBalance.sub(afterTokenXBalance);
            expect(actualDepositedAmount.toString()).toEqual(wenSeedAmount.toString());
        });
    });
});
