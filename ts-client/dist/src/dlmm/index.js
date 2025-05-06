"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DLMM = void 0;
const anchor_1 = require("@coral-xyz/anchor");
const bytes_1 = require("@coral-xyz/anchor/dist/cjs/utils/bytes");
const spl_token_1 = require("@solana/spl-token");
const web3_js_1 = require("@solana/web3.js");
const decimal_js_1 = __importDefault(require("decimal.js"));
const constants_1 = require("./constants");
const error_1 = require("./error");
const helpers_1 = require("./helpers");
const math_1 = require("./helpers/math");
const idl_1 = require("./idl");
const types_1 = require("./types");
const computeUnit_1 = require("./helpers/computeUnit");
class DLMM {
    pubkey;
    program;
    lbPair;
    binArrayBitmapExtension;
    tokenX;
    tokenY;
    clock;
    opt;
    constructor(pubkey, program, lbPair, binArrayBitmapExtension, tokenX, tokenY, clock, opt) {
        this.pubkey = pubkey;
        this.program = program;
        this.lbPair = lbPair;
        this.binArrayBitmapExtension = binArrayBitmapExtension;
        this.tokenX = tokenX;
        this.tokenY = tokenY;
        this.clock = clock;
        this.opt = opt;
    }
    /** Static public method */
    /**
     * The function `getLbPairs` retrieves a list of LB pair accounts using a connection and optional
     * parameters.
     * @param {Connection} connection - The `connection` parameter is an instance of the `Connection`
     * class, which represents the connection to the Solana blockchain network.
     * @param {Opt} [opt] - The `opt` parameter is an optional object that contains additional options
     * for the function. It can have the following properties:
     * @returns The function `getLbPairs` returns a Promise that resolves to an array of
     * `LbPairAccount` objects.
     */
    static async getLbPairs(connection, opt) {
        const provider = new anchor_1.AnchorProvider(connection, {}, anchor_1.AnchorProvider.defaultOptions());
        const program = new anchor_1.Program(idl_1.IDL, opt?.programId ?? constants_1.LBCLMM_PROGRAM_IDS[opt?.cluster ?? "mainnet-beta"], provider);
        return program.account.lbPair.all();
    }
    static async getPairPubkeyIfExists(connection, tokenX, tokenY, binStep, baseFactor, opt) {
        const cluster = opt?.cluster || "mainnet-beta";
        const provider = new anchor_1.AnchorProvider(connection, {}, anchor_1.AnchorProvider.defaultOptions());
        const program = new anchor_1.Program(idl_1.IDL, opt?.programId ?? constants_1.LBCLMM_PROGRAM_IDS[cluster], provider);
        try {
            const [lbPair2Key] = (0, helpers_1.deriveLbPair2)(tokenX, tokenY, binStep, baseFactor, program.programId);
            const account2 = await program.account.lbPair.fetchNullable(lbPair2Key);
            if (account2)
                return lbPair2Key;
            const [lbPairKey] = (0, helpers_1.deriveLbPair)(tokenX, tokenY, binStep, program.programId);
            const account = await program.account.lbPair.fetchNullable(lbPairKey);
            if (account && account.parameters.baseFactor === baseFactor.toNumber()) {
                return lbPairKey;
            }
            return null;
        }
        catch (error) {
            return null;
        }
    }
    /**
     * The `create` function is a static method that creates a new instance of the `DLMM` class
     * @param {Connection} connection - The `connection` parameter is an instance of the `Connection`
     * class, which represents the connection to the Solana blockchain network.
     * @param {PublicKey} dlmm - The PublicKey of LB Pair.
     * @param {Opt} [opt] - The `opt` parameter is an optional object that can contain additional options
     * for the `create` function. It has the following properties:
     * @returns The `create` function returns a `Promise` that resolves to a `DLMM` object.
     */
    static async create(connection, dlmm, opt) {
        const cluster = opt?.cluster || "mainnet-beta";
        const provider = new anchor_1.AnchorProvider(connection, {}, anchor_1.AnchorProvider.defaultOptions());
        const program = new anchor_1.Program(idl_1.IDL, opt?.programId ?? constants_1.LBCLMM_PROGRAM_IDS[cluster], provider);
        const binArrayBitMapExtensionPubkey = (0, helpers_1.deriveBinArrayBitmapExtension)(dlmm, program.programId)[0];
        const accountsToFetch = [
            dlmm,
            binArrayBitMapExtensionPubkey,
            web3_js_1.SYSVAR_CLOCK_PUBKEY,
        ];
        const accountsInfo = await (0, helpers_1.chunkedGetMultipleAccountInfos)(connection, accountsToFetch);
        const lbPairAccountInfoBuffer = accountsInfo[0]?.data;
        if (!lbPairAccountInfoBuffer)
            throw new Error(`LB Pair account ${dlmm.toBase58()} not found`);
        const lbPairAccInfo = program.coder.accounts.decode("lbPair", lbPairAccountInfoBuffer);
        const binArrayBitMapAccountInfoBuffer = accountsInfo[1]?.data;
        let binArrayBitMapExtensionAccInfo = null;
        if (binArrayBitMapAccountInfoBuffer) {
            binArrayBitMapExtensionAccInfo = program.coder.accounts.decode("binArrayBitmapExtension", binArrayBitMapAccountInfoBuffer);
        }
        const clockAccountInfoBuffer = accountsInfo[2]?.data;
        if (!clockAccountInfoBuffer)
            throw new Error(`Clock account not found`);
        const clock = types_1.ClockLayout.decode(clockAccountInfoBuffer);
        const reserveAccountsInfo = await (0, helpers_1.chunkedGetMultipleAccountInfos)(program.provider.connection, [
            lbPairAccInfo.reserveX,
            lbPairAccInfo.reserveY,
            lbPairAccInfo.tokenXMint,
            lbPairAccInfo.tokenYMint,
        ]);
        let binArrayBitmapExtension;
        if (binArrayBitMapExtensionAccInfo) {
            binArrayBitmapExtension = {
                account: binArrayBitMapExtensionAccInfo,
                publicKey: binArrayBitMapExtensionPubkey,
            };
        }
        const reserveXBalance = spl_token_1.AccountLayout.decode(reserveAccountsInfo[0].data);
        const reserveYBalance = spl_token_1.AccountLayout.decode(reserveAccountsInfo[1].data);
        const tokenXDecimal = spl_token_1.MintLayout.decode(reserveAccountsInfo[2].data).decimals;
        const tokenYDecimal = spl_token_1.MintLayout.decode(reserveAccountsInfo[3].data).decimals;
        const tokenX = {
            publicKey: lbPairAccInfo.tokenXMint,
            reserve: lbPairAccInfo.reserveX,
            amount: reserveXBalance.amount,
            decimal: tokenXDecimal,
        };
        const tokenY = {
            publicKey: lbPairAccInfo.tokenYMint,
            reserve: lbPairAccInfo.reserveY,
            amount: reserveYBalance.amount,
            decimal: tokenYDecimal,
        };
        return new DLMM(dlmm, program, lbPairAccInfo, binArrayBitmapExtension, tokenX, tokenY, clock, opt);
    }
    /**
     * Similar to `create` function, but it accept multiple lbPairs to be initialized.
     * @param {Connection} connection - The `connection` parameter is an instance of the `Connection`
     * class, which represents the connection to the Solana blockchain network.
     * @param dlmmList - An Array of PublicKey of LB Pairs.
     * @param {Opt} [opt] - An optional parameter of type `Opt`.
     * @returns The function `createMultiple` returns a Promise that resolves to an array of `DLMM`
     * objects.
     */
    static async createMultiple(connection, dlmmList, opt) {
        const cluster = opt?.cluster || "mainnet-beta";
        const provider = new anchor_1.AnchorProvider(connection, {}, anchor_1.AnchorProvider.defaultOptions());
        const program = new anchor_1.Program(idl_1.IDL, opt?.programId ?? constants_1.LBCLMM_PROGRAM_IDS[cluster], provider);
        const binArrayBitMapExtensions = dlmmList.map((lbPair) => (0, helpers_1.deriveBinArrayBitmapExtension)(lbPair, program.programId)[0]);
        const accountsToFetch = [
            ...dlmmList,
            ...binArrayBitMapExtensions,
            web3_js_1.SYSVAR_CLOCK_PUBKEY,
        ];
        const accountsInfo = await (0, helpers_1.chunkedGetMultipleAccountInfos)(connection, accountsToFetch);
        const clockAccount = accountsInfo.pop();
        const clockAccountInfoBuffer = clockAccount?.data;
        if (!clockAccountInfoBuffer)
            throw new Error(`Clock account not found`);
        const clock = types_1.ClockLayout.decode(clockAccountInfoBuffer);
        const lbPairArraysMap = new Map();
        for (let i = 0; i < dlmmList.length; i++) {
            const lbPairPubKey = dlmmList[i];
            const lbPairAccountInfoBuffer = accountsInfo[i]?.data;
            if (!lbPairAccountInfoBuffer)
                throw new Error(`LB Pair account ${lbPairPubKey.toBase58()} not found`);
            const binArrayAccInfo = program.coder.accounts.decode("lbPair", lbPairAccountInfoBuffer);
            lbPairArraysMap.set(lbPairPubKey.toBase58(), binArrayAccInfo);
        }
        const binArrayBitMapExtensionsMap = new Map();
        for (let i = dlmmList.length; i < accountsInfo.length; i++) {
            const index = i - dlmmList.length;
            const lbPairPubkey = dlmmList[index];
            const binArrayBitMapAccountInfoBuffer = accountsInfo[i]?.data;
            if (binArrayBitMapAccountInfoBuffer) {
                const binArrayBitMapExtensionAccInfo = program.coder.accounts.decode("binArrayBitmapExtension", binArrayBitMapAccountInfoBuffer);
                binArrayBitMapExtensionsMap.set(lbPairPubkey.toBase58(), binArrayBitMapExtensionAccInfo);
            }
        }
        const reservePublicKeys = Array.from(lbPairArraysMap.values())
            .map(({ reserveX, reserveY }) => [reserveX, reserveY])
            .flat();
        const tokenMintPublicKeys = Array.from(lbPairArraysMap.values())
            .map(({ tokenXMint, tokenYMint }) => [tokenXMint, tokenYMint])
            .flat();
        const reserveAndTokenMintAccountsInfo = await (0, helpers_1.chunkedGetMultipleAccountInfos)(program.provider.connection, [
            ...reservePublicKeys,
            ...tokenMintPublicKeys,
        ]);
        const lbClmmImpl = await Promise.all(dlmmList.map(async (lbPair, index) => {
            const lbPairState = lbPairArraysMap.get(lbPair.toBase58());
            if (!lbPairState)
                throw new Error(`LB Pair ${lbPair.toBase58()} state not found`);
            const binArrayBitmapExtensionState = binArrayBitMapExtensionsMap.get(lbPair.toBase58());
            const binArrayBitmapExtensionPubkey = binArrayBitMapExtensions[index];
            let binArrayBitmapExtension = null;
            if (binArrayBitmapExtensionState) {
                binArrayBitmapExtension = {
                    account: binArrayBitmapExtensionState,
                    publicKey: binArrayBitmapExtensionPubkey,
                };
            }
            const reserveXAccountInfo = reserveAndTokenMintAccountsInfo[index * 2];
            const reserveYAccountInfo = reserveAndTokenMintAccountsInfo[index * 2 + 1];
            const tokenXMintAccountInfo = reserveAndTokenMintAccountsInfo[reservePublicKeys.length + index * 2];
            const tokenYMintAccountInfo = reserveAndTokenMintAccountsInfo[reservePublicKeys.length + index * 2 + 1];
            if (!reserveXAccountInfo || !reserveYAccountInfo)
                throw new Error(`Reserve account for LB Pair ${lbPair.toBase58()} not found`);
            const reserveXBalance = spl_token_1.AccountLayout.decode(reserveXAccountInfo.data);
            const reserveYBalance = spl_token_1.AccountLayout.decode(reserveYAccountInfo.data);
            const tokenXDecimal = spl_token_1.MintLayout.decode(tokenXMintAccountInfo.data).decimals;
            const tokenYDecimal = spl_token_1.MintLayout.decode(tokenYMintAccountInfo.data).decimals;
            const tokenX = {
                publicKey: lbPairState.tokenXMint,
                reserve: lbPairState.reserveX,
                amount: reserveXBalance.amount,
                decimal: tokenXDecimal,
            };
            const tokenY = {
                publicKey: lbPairState.tokenYMint,
                reserve: lbPairState.reserveY,
                amount: reserveYBalance.amount,
                decimal: tokenYDecimal,
            };
            return new DLMM(lbPair, program, lbPairState, binArrayBitmapExtension, tokenX, tokenY, clock, opt);
        }));
        return lbClmmImpl;
    }
    static async getAllPresetParameters(connection, opt) {
        const provider = new anchor_1.AnchorProvider(connection, {}, anchor_1.AnchorProvider.defaultOptions());
        const program = new anchor_1.Program(idl_1.IDL, opt?.programId ?? constants_1.LBCLMM_PROGRAM_IDS[opt?.cluster ?? "mainnet-beta"], provider);
        const presetParameter = await program.account.presetParameter.all();
        return presetParameter;
    }
    /**
     * The function `getAllLbPairPositionsByUser` retrieves all liquidity pool pair positions for a given
     * user.
     * @param {Connection} connection - The `connection` parameter is an instance of the `Connection`
     * class, which represents the connection to the Solana blockchain.
     * @param {PublicKey} userPubKey - The user's wallet public key.
     * @param {Opt} [opt] - An optional object that contains additional options for the function.
     * @returns The function `getAllLbPairPositionsByUser` returns a `Promise` that resolves to a `Map`
     * object. The `Map` object contains key-value pairs, where the key is a string representing the LB
     * Pair account, and the value is an object of PositionInfo
     */
    static async getAllLbPairPositionsByUser(connection, userPubKey, opt) {
        const cluster = opt?.cluster || "mainnet-beta";
        const provider = new anchor_1.AnchorProvider(connection, {}, anchor_1.AnchorProvider.defaultOptions());
        const program = new anchor_1.Program(idl_1.IDL, opt?.programId ?? constants_1.LBCLMM_PROGRAM_IDS[cluster], provider);
        const positionsV2 = await program.account.positionV2.all([
            {
                memcmp: {
                    bytes: bytes_1.bs58.encode(userPubKey.toBuffer()),
                    offset: 8 + 32,
                },
            },
        ]);
        const binArrayPubkeySetV2 = new Set();
        const lbPairSetV2 = new Set();
        positionsV2.forEach(({ account: { upperBinId, lowerBinId, lbPair } }) => {
            const lowerBinArrayIndex = (0, helpers_1.binIdToBinArrayIndex)(new anchor_1.BN(lowerBinId));
            const upperBinArrayIndex = (0, helpers_1.binIdToBinArrayIndex)(new anchor_1.BN(upperBinId));
            const [lowerBinArrayPubKey] = (0, helpers_1.deriveBinArray)(lbPair, lowerBinArrayIndex, program.programId);
            const [upperBinArrayPubKey] = (0, helpers_1.deriveBinArray)(lbPair, upperBinArrayIndex, program.programId);
            binArrayPubkeySetV2.add(lowerBinArrayPubKey.toBase58());
            binArrayPubkeySetV2.add(upperBinArrayPubKey.toBase58());
            lbPairSetV2.add(lbPair.toBase58());
        });
        const binArrayPubkeyArrayV2 = Array.from(binArrayPubkeySetV2).map((pubkey) => new web3_js_1.PublicKey(pubkey));
        const lbPairArrayV2 = Array.from(lbPairSetV2).map((pubkey) => new web3_js_1.PublicKey(pubkey));
        const [clockAccInfo, ...binArraysAccInfo] = await (0, helpers_1.chunkedGetMultipleAccountInfos)(connection, [
            web3_js_1.SYSVAR_CLOCK_PUBKEY,
            ...binArrayPubkeyArrayV2,
            ...lbPairArrayV2,
        ]);
        const positionBinArraysMapV2 = new Map();
        for (let i = 0; i < binArrayPubkeyArrayV2.length; i++) {
            const binArrayPubkey = binArrayPubkeyArrayV2[i];
            const binArrayAccInfoBufferV2 = binArraysAccInfo[i];
            if (binArrayAccInfoBufferV2) {
                const binArrayAccInfo = program.coder.accounts.decode("binArray", binArrayAccInfoBufferV2.data);
                positionBinArraysMapV2.set(binArrayPubkey.toBase58(), binArrayAccInfo);
            }
        }
        const lbPairArraysMapV2 = new Map();
        for (let i = binArrayPubkeyArrayV2.length; i < binArraysAccInfo.length; i++) {
            const lbPairPubkey = lbPairArrayV2[i - binArrayPubkeyArrayV2.length];
            const lbPairAccInfoBufferV2 = binArraysAccInfo[i];
            if (!lbPairAccInfoBufferV2)
                throw new Error(`LB Pair account ${lbPairPubkey.toBase58()} not found`);
            const lbPairAccInfo = program.coder.accounts.decode("lbPair", lbPairAccInfoBufferV2.data);
            lbPairArraysMapV2.set(lbPairPubkey.toBase58(), lbPairAccInfo);
        }
        const reservePublicKeysV2 = Array.from(lbPairArraysMapV2.values())
            .map(({ reserveX, reserveY, tokenXMint, tokenYMint }) => [
            reserveX,
            reserveY,
            tokenXMint,
            tokenYMint,
        ])
            .flat();
        const reserveAccountsInfo = await (0, helpers_1.chunkedGetMultipleAccountInfos)(program.provider.connection, reservePublicKeysV2);
        const lbPairReserveMapV2 = new Map();
        const lbPairMintMapV2 = new Map();
        lbPairArrayV2.forEach((lbPair, idx) => {
            const index = idx * 4;
            const reserveAccBufferXV2 = reserveAccountsInfo[index];
            const reserveAccBufferYV2 = reserveAccountsInfo[index + 1];
            if (!reserveAccBufferXV2 || !reserveAccBufferYV2)
                throw new Error(`Reserve account for LB Pair ${lbPair.toBase58()} not found`);
            const reserveAccX = spl_token_1.AccountLayout.decode(reserveAccBufferXV2.data);
            const reserveAccY = spl_token_1.AccountLayout.decode(reserveAccBufferYV2.data);
            lbPairReserveMapV2.set(lbPair.toBase58(), {
                reserveX: reserveAccX.amount,
                reserveY: reserveAccY.amount,
            });
            const mintXBufferV2 = reserveAccountsInfo[index + 2];
            const mintYBufferV2 = reserveAccountsInfo[index + 3];
            if (!mintXBufferV2 || !mintYBufferV2)
                throw new Error(`Mint account for LB Pair ${lbPair.toBase58()} not found`);
            const mintX = spl_token_1.MintLayout.decode(mintXBufferV2.data);
            const mintY = spl_token_1.MintLayout.decode(mintYBufferV2.data);
            lbPairMintMapV2.set(lbPair.toBase58(), {
                mintXDecimal: mintX.decimals,
                mintYDecimal: mintY.decimals,
            });
        });
        const onChainTimestamp = new anchor_1.BN(clockAccInfo.data.readBigInt64LE(32).toString()).toNumber();
        const positionsMap = new Map();
        for (let position of positionsV2) {
            const { account, publicKey: positionPubKey } = position;
            const { upperBinId, lowerBinId, lbPair, feeOwner } = account;
            const lowerBinArrayIndex = (0, helpers_1.binIdToBinArrayIndex)(new anchor_1.BN(lowerBinId));
            const upperBinArrayIndex = (0, helpers_1.binIdToBinArrayIndex)(new anchor_1.BN(upperBinId));
            const [lowerBinArrayPubKey] = (0, helpers_1.deriveBinArray)(lbPair, lowerBinArrayIndex, program.programId);
            const [upperBinArrayPubKey] = (0, helpers_1.deriveBinArray)(lbPair, upperBinArrayIndex, program.programId);
            const lowerBinArray = positionBinArraysMapV2.get(lowerBinArrayPubKey.toBase58());
            const upperBinArray = positionBinArraysMapV2.get(upperBinArrayPubKey.toBase58());
            const lbPairAcc = lbPairArraysMapV2.get(lbPair.toBase58());
            const [baseTokenDecimal, quoteTokenDecimal] = await Promise.all([
                (0, helpers_1.getTokenDecimals)(program.provider.connection, lbPairAcc.tokenXMint),
                (0, helpers_1.getTokenDecimals)(program.provider.connection, lbPairAcc.tokenYMint),
            ]);
            const reserveXBalance = lbPairReserveMapV2.get(lbPair.toBase58())?.reserveX ?? BigInt(0);
            const reserveYBalance = lbPairReserveMapV2.get(lbPair.toBase58())?.reserveY ?? BigInt(0);
            const tokenX = {
                publicKey: lbPairAcc.tokenXMint,
                reserve: lbPairAcc.reserveX,
                amount: reserveXBalance,
                decimal: baseTokenDecimal,
            };
            const tokenY = {
                publicKey: lbPairAcc.tokenYMint,
                reserve: lbPairAcc.reserveY,
                amount: reserveYBalance,
                decimal: quoteTokenDecimal,
            };
            const positionData = !!lowerBinArray && !!upperBinArray ? await DLMM.processPosition(program, types_1.PositionVersion.V2, lbPairAcc, onChainTimestamp, account, baseTokenDecimal, quoteTokenDecimal, lowerBinArray, upperBinArray, feeOwner) : {
                totalXAmount: '0',
                totalYAmount: '0',
                positionBinData: [],
                lastUpdatedAt: new anchor_1.BN(0),
                upperBinId,
                lowerBinId,
                feeX: new anchor_1.BN(0),
                feeY: new anchor_1.BN(0),
                rewardOne: new anchor_1.BN(0),
                rewardTwo: new anchor_1.BN(0),
                feeOwner,
                totalClaimedFeeXAmount: new anchor_1.BN(0),
                totalClaimedFeeYAmount: new anchor_1.BN(0),
            };
            if (positionData) {
                positionsMap.set(lbPair.toBase58(), {
                    publicKey: lbPair,
                    lbPair: lbPairAcc,
                    tokenX,
                    tokenY,
                    lbPairPositionsData: [
                        ...(positionsMap.get(lbPair.toBase58())?.lbPairPositionsData ?? []),
                        {
                            publicKey: positionPubKey,
                            positionData,
                            version: types_1.PositionVersion.V2,
                        },
                    ],
                });
            }
        }
        return positionsMap;
    }
    static getPricePerLamport(tokenXDecimal, tokenYDecimal, price) {
        return new decimal_js_1.default(price)
            .mul(new decimal_js_1.default(10 ** (tokenYDecimal - tokenXDecimal)))
            .toString();
    }
    static getBinIdFromPrice(price, binStep, min) {
        const binStepNum = new decimal_js_1.default(binStep).div(new decimal_js_1.default(constants_1.BASIS_POINT_MAX));
        const binId = new decimal_js_1.default(price)
            .log()
            .dividedBy(new decimal_js_1.default(1).add(binStepNum).log());
        return (min ? binId.floor() : binId.ceil()).toNumber();
    }
    /** Public methods */
    static async createPermissionLbPair(connection, binStep, tokenX, tokenY, activeId, baseKey, creatorKey, feeBps, activationType, opt) {
        const provider = new anchor_1.AnchorProvider(connection, {}, anchor_1.AnchorProvider.defaultOptions());
        const program = new anchor_1.Program(idl_1.IDL, opt?.programId ?? constants_1.LBCLMM_PROGRAM_IDS[opt.cluster], provider);
        const [lbPair] = (0, helpers_1.derivePermissionLbPair)(baseKey, tokenX, tokenY, binStep, program.programId);
        const [reserveX] = (0, helpers_1.deriveReserve)(tokenX, lbPair, program.programId);
        const [reserveY] = (0, helpers_1.deriveReserve)(tokenY, lbPair, program.programId);
        const [oracle] = (0, helpers_1.deriveOracle)(lbPair, program.programId);
        const activeBinArrayIndex = (0, helpers_1.binIdToBinArrayIndex)(activeId);
        const binArrayBitmapExtension = (0, helpers_1.isOverflowDefaultBinArrayBitmap)(activeBinArrayIndex)
            ? (0, helpers_1.deriveBinArrayBitmapExtension)(lbPair, program.programId)[0]
            : null;
        const { minBinId, maxBinId } = (0, math_1.findSwappableMinMaxBinId)(binStep);
        const ixData = {
            activeId: activeId.toNumber(),
            binStep: binStep.toNumber(),
            baseFactor: (0, math_1.computeBaseFactorFromFeeBps)(binStep, feeBps).toNumber(),
            minBinId: minBinId.toNumber(),
            maxBinId: maxBinId.toNumber(),
            activationType,
        };
        return program.methods
            .initializePermissionLbPair(ixData)
            .accounts({
            lbPair,
            rent: web3_js_1.SYSVAR_RENT_PUBKEY,
            reserveX,
            reserveY,
            binArrayBitmapExtension,
            tokenMintX: tokenX,
            tokenMintY: tokenY,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            oracle,
            systemProgram: web3_js_1.SystemProgram.programId,
            admin: creatorKey,
            base: baseKey,
        })
            .transaction();
    }
    static async createCustomizablePermissionlessLbPair(connection, binStep, tokenX, tokenY, activeId, feeBps, activationType, hasAlphaVault, creatorKey, activationPoint, opt) {
        const provider = new anchor_1.AnchorProvider(connection, {}, anchor_1.AnchorProvider.defaultOptions());
        const program = new anchor_1.Program(idl_1.IDL, opt?.programId ?? constants_1.LBCLMM_PROGRAM_IDS[opt.cluster], provider);
        const [lbPair] = (0, helpers_1.deriveCustomizablePermissionlessLbPair)(tokenX, tokenY, program.programId);
        const [reserveX] = (0, helpers_1.deriveReserve)(tokenX, lbPair, program.programId);
        const [reserveY] = (0, helpers_1.deriveReserve)(tokenY, lbPair, program.programId);
        const [oracle] = (0, helpers_1.deriveOracle)(lbPair, program.programId);
        const activeBinArrayIndex = (0, helpers_1.binIdToBinArrayIndex)(activeId);
        const binArrayBitmapExtension = (0, helpers_1.isOverflowDefaultBinArrayBitmap)(activeBinArrayIndex)
            ? (0, helpers_1.deriveBinArrayBitmapExtension)(lbPair, program.programId)[0]
            : null;
        const ixData = {
            activeId: activeId.toNumber(),
            binStep: binStep.toNumber(),
            baseFactor: (0, math_1.computeBaseFactorFromFeeBps)(binStep, feeBps).toNumber(),
            activationType,
            activationPoint: activationPoint ? activationPoint : null,
            hasAlphaVault,
            padding: Array(64).fill(0),
        };
        const userTokenX = (0, spl_token_1.getAssociatedTokenAddressSync)(tokenX, creatorKey);
        const userTokenY = (0, spl_token_1.getAssociatedTokenAddressSync)(tokenY, creatorKey);
        return program.methods
            .initializeCustomizablePermissionlessLbPair(ixData)
            .accounts({
            lbPair,
            reserveX,
            reserveY,
            binArrayBitmapExtension,
            tokenMintX: tokenX,
            tokenMintY: tokenY,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            oracle,
            systemProgram: web3_js_1.SystemProgram.programId,
            userTokenX,
            userTokenY,
            funder: creatorKey,
        })
            .transaction();
    }
    static async createLbPair(connection, funder, tokenX, tokenY, binStep, baseFactor, presetParameter, activeId, opt) {
        const provider = new anchor_1.AnchorProvider(connection, {}, anchor_1.AnchorProvider.defaultOptions());
        const program = new anchor_1.Program(idl_1.IDL, opt?.programId ?? constants_1.LBCLMM_PROGRAM_IDS[opt.cluster], provider);
        const existsPool = await this.getPairPubkeyIfExists(connection, tokenX, tokenY, binStep, baseFactor);
        if (existsPool) {
            throw new Error("Pool already exists");
        }
        const [lbPair] = (0, helpers_1.deriveLbPair2)(tokenX, tokenY, binStep, baseFactor, program.programId);
        const [reserveX] = (0, helpers_1.deriveReserve)(tokenX, lbPair, program.programId);
        const [reserveY] = (0, helpers_1.deriveReserve)(tokenY, lbPair, program.programId);
        const [oracle] = (0, helpers_1.deriveOracle)(lbPair, program.programId);
        const activeBinArrayIndex = (0, helpers_1.binIdToBinArrayIndex)(activeId);
        const binArrayBitmapExtension = (0, helpers_1.isOverflowDefaultBinArrayBitmap)(activeBinArrayIndex)
            ? (0, helpers_1.deriveBinArrayBitmapExtension)(lbPair, program.programId)[0]
            : null;
        return program.methods
            .initializeLbPair(activeId.toNumber(), binStep.toNumber())
            .accounts({
            funder,
            lbPair,
            rent: web3_js_1.SYSVAR_RENT_PUBKEY,
            reserveX,
            reserveY,
            binArrayBitmapExtension,
            tokenMintX: tokenX,
            tokenMintY: tokenY,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            oracle,
            presetParameter,
            systemProgram: web3_js_1.SystemProgram.programId,
        })
            .transaction();
    }
    /**
     * The function `refetchStates` retrieves and updates various states and data related to bin arrays
     * and lb pairs.
     */
    async refetchStates() {
        const binArrayBitmapExtensionPubkey = (0, helpers_1.deriveBinArrayBitmapExtension)(this.pubkey, this.program.programId)[0];
        const [lbPairAccountInfo, binArrayBitmapExtensionAccountInfo, reserveXAccountInfo, reserveYAccountInfo,] = await (0, helpers_1.chunkedGetMultipleAccountInfos)(this.program.provider.connection, [
            this.pubkey,
            binArrayBitmapExtensionPubkey,
            this.lbPair.reserveX,
            this.lbPair.reserveY,
        ]);
        const lbPairState = this.program.coder.accounts.decode("lbPair", lbPairAccountInfo.data);
        if (binArrayBitmapExtensionAccountInfo) {
            const binArrayBitmapExtensionState = this.program.coder.accounts.decode("binArrayBitmapExtension", binArrayBitmapExtensionAccountInfo.data);
            if (binArrayBitmapExtensionState) {
                this.binArrayBitmapExtension = {
                    account: binArrayBitmapExtensionState,
                    publicKey: binArrayBitmapExtensionPubkey,
                };
            }
        }
        const reserveXBalance = spl_token_1.AccountLayout.decode(reserveXAccountInfo.data);
        const reserveYBalance = spl_token_1.AccountLayout.decode(reserveYAccountInfo.data);
        const [tokenXDecimal, tokenYDecimal] = await Promise.all([
            (0, helpers_1.getTokenDecimals)(this.program.provider.connection, lbPairState.tokenXMint),
            (0, helpers_1.getTokenDecimals)(this.program.provider.connection, lbPairState.tokenYMint),
        ]);
        this.tokenX = {
            amount: reserveXBalance.amount,
            decimal: tokenXDecimal,
            publicKey: lbPairState.tokenXMint,
            reserve: lbPairState.reserveX,
        };
        this.tokenY = {
            amount: reserveYBalance.amount,
            decimal: tokenYDecimal,
            publicKey: lbPairState.tokenYMint,
            reserve: lbPairState.reserveY,
        };
        this.lbPair = lbPairState;
    }
    /**
     * The function `getBinArrays` returns an array of `BinArrayAccount` objects
     * @returns a Promise that resolves to an array of BinArrayAccount objects.
     */
    async getBinArrays() {
        return this.program.account.binArray.all([
            {
                memcmp: {
                    bytes: bytes_1.bs58.encode(this.pubkey.toBuffer()),
                    offset: 8 + 16,
                },
            },
        ]);
    }
    /**
     * The function `getBinArrayAroundActiveBin` retrieves a specified number of `BinArrayAccount`
     * objects from the blockchain, based on the active bin and its surrounding bin arrays.
     * @param
     *    swapForY - The `swapForY` parameter is a boolean value that indicates whether the swap is using quote token as input.
     *    [count=4] - The `count` parameter is the number of bin arrays to retrieve on left and right respectively. By default, it is set to 4.
     * @returns an array of `BinArrayAccount` objects.
     */
    async getBinArrayForSwap(swapForY, count = 4) {
        await this.refetchStates();
        const binArraysPubkey = new Set();
        let shouldStop = false;
        let activeIdToLoop = this.lbPair.activeId;
        while (!shouldStop) {
            const binArrayIndex = (0, helpers_1.findNextBinArrayIndexWithLiquidity)(swapForY, new anchor_1.BN(activeIdToLoop), this.lbPair, this.binArrayBitmapExtension?.account ?? null);
            if (binArrayIndex === null)
                shouldStop = true;
            else {
                const [binArrayPubKey] = (0, helpers_1.deriveBinArray)(this.pubkey, binArrayIndex, this.program.programId);
                binArraysPubkey.add(binArrayPubKey.toBase58());
                const [lowerBinId, upperBinId] = (0, helpers_1.getBinArrayLowerUpperBinId)(binArrayIndex);
                activeIdToLoop = swapForY
                    ? lowerBinId.toNumber() - 1
                    : upperBinId.toNumber() + 1;
            }
            if (binArraysPubkey.size === count)
                shouldStop = true;
        }
        const accountsToFetch = Array.from(binArraysPubkey).map((pubkey) => new web3_js_1.PublicKey(pubkey));
        const binArraysAccInfoBuffer = await (0, helpers_1.chunkedGetMultipleAccountInfos)(this.program.provider.connection, accountsToFetch);
        const binArrays = await Promise.all(binArraysAccInfoBuffer.map(async (accInfo, idx) => {
            const account = this.program.coder.accounts.decode("binArray", accInfo.data);
            const publicKey = accountsToFetch[idx];
            return {
                account,
                publicKey,
            };
        }));
        return binArrays;
    }
    static calculateFeeInfo(baseFactor, binStep) {
        const baseFeeRate = new anchor_1.BN(baseFactor).mul(new anchor_1.BN(binStep)).mul(new anchor_1.BN(10));
        const baseFeeRatePercentage = new decimal_js_1.default(baseFeeRate.toString())
            .mul(new decimal_js_1.default(100))
            .div(new decimal_js_1.default(constants_1.FEE_PRECISION.toString()));
        const maxFeeRatePercentage = new decimal_js_1.default(constants_1.MAX_FEE_RATE.toString())
            .mul(new decimal_js_1.default(100))
            .div(new decimal_js_1.default(constants_1.FEE_PRECISION.toString()));
        return {
            baseFeeRatePercentage,
            maxFeeRatePercentage,
        };
    }
    /**
     * The function `getFeeInfo` calculates and returns the base fee rate percentage, maximum fee rate
     * percentage, and protocol fee percentage.
     * @returns an object of type `FeeInfo` with the following properties: baseFeeRatePercentage, maxFeeRatePercentage, and protocolFeePercentage.
     */
    getFeeInfo() {
        const { baseFactor, protocolShare } = this.lbPair.parameters;
        const { baseFeeRatePercentage, maxFeeRatePercentage } = DLMM.calculateFeeInfo(baseFactor, this.lbPair.binStep);
        const protocolFeePercentage = new decimal_js_1.default(protocolShare.toString())
            .mul(new decimal_js_1.default(100))
            .div(new decimal_js_1.default(constants_1.BASIS_POINT_MAX));
        return {
            baseFeeRatePercentage,
            maxFeeRatePercentage,
            protocolFeePercentage,
        };
    }
    /**
     * The function calculates and returns a dynamic fee
     * @returns a Decimal value representing the dynamic fee.
     */
    getDynamicFee() {
        let vParameterClone = Object.assign({}, this.lbPair.vParameters);
        let activeId = new anchor_1.BN(this.lbPair.activeId);
        const sParameters = this.lbPair.parameters;
        const currentTimestamp = Date.now() / 1000;
        this.updateReference(activeId.toNumber(), vParameterClone, sParameters, currentTimestamp);
        this.updateVolatilityAccumulator(vParameterClone, sParameters, activeId.toNumber());
        const totalFee = (0, helpers_1.getTotalFee)(this.lbPair.binStep, sParameters, vParameterClone);
        return new decimal_js_1.default(totalFee.toString())
            .div(new decimal_js_1.default(constants_1.FEE_PRECISION.toString()))
            .mul(100);
    }
    /**
     * The function `getEmissionRate` returns the emission rates for two rewards.
     * @returns an object of type `EmissionRate`. The object has two properties: `rewardOne` and
     * `rewardTwo`, both of which are of type `Decimal`.
     */
    getEmissionRate() {
        const now = Date.now() / 1000;
        const [rewardOneEmissionRate, rewardTwoEmissionRate] = this.lbPair.rewardInfos.map(({ rewardRate, rewardDurationEnd }) => now > rewardDurationEnd.toNumber() ? undefined : rewardRate);
        return {
            rewardOne: rewardOneEmissionRate
                ? new decimal_js_1.default(rewardOneEmissionRate.toString()).div(constants_1.PRECISION)
                : undefined,
            rewardTwo: rewardTwoEmissionRate
                ? new decimal_js_1.default(rewardTwoEmissionRate.toString()).div(constants_1.PRECISION)
                : undefined,
        };
    }
    /**
     * The function `getBinsAroundActiveBin` retrieves a specified number of bins to the left and right
     * of the active bin and returns them along with the active bin ID.
     * @param {number} numberOfBinsToTheLeft - The parameter `numberOfBinsToTheLeft` represents the
     * number of bins to the left of the active bin that you want to retrieve. It determines how many
     * bins you want to include in the result that are positioned to the left of the active bin.
     * @param {number} numberOfBinsToTheRight - The parameter `numberOfBinsToTheRight` represents the
     * number of bins to the right of the active bin that you want to retrieve.
     * @returns an object with two properties: "activeBin" and "bins". The value of "activeBin" is the
     * value of "this.lbPair.activeId", and the value of "bins" is the result of calling the "getBins"
     * function with the specified parameters.
     */
    async getBinsAroundActiveBin(numberOfBinsToTheLeft, numberOfBinsToTheRight) {
        const lowerBinId = this.lbPair.activeId - numberOfBinsToTheLeft - 1;
        const upperBinId = this.lbPair.activeId + numberOfBinsToTheRight + 1;
        const bins = await this.getBins(this.pubkey, lowerBinId, upperBinId, this.tokenX.decimal, this.tokenY.decimal);
        return { activeBin: this.lbPair.activeId, bins };
    }
    /**
     * The function `getBinsBetweenMinAndMaxPrice` retrieves a list of bins within a specified price
     * range.
     * @param {number} minPrice - The minimum price value for filtering the bins.
     * @param {number} maxPrice - The `maxPrice` parameter is the maximum price value that you want to
     * use for filtering the bins.
     * @returns an object with two properties: "activeBin" and "bins". The value of "activeBin" is the
     * active bin ID of the lbPair, and the value of "bins" is an array of BinLiquidity objects.
     */
    async getBinsBetweenMinAndMaxPrice(minPrice, maxPrice) {
        const lowerBinId = this.getBinIdFromPrice(minPrice, true) - 1;
        const upperBinId = this.getBinIdFromPrice(maxPrice, false) + 1;
        const bins = await this.getBins(this.pubkey, lowerBinId, upperBinId, this.tokenX.decimal, this.tokenX.decimal);
        return { activeBin: this.lbPair.activeId, bins };
    }
    /**
     * The function `getBinsBetweenLowerAndUpperBound` retrieves a list of bins between a lower and upper
     * bin ID and returns the active bin ID and the list of bins.
     * @param {number} lowerBinId - The lowerBinId parameter is a number that represents the ID of the
     * lowest bin.
     * @param {number} upperBinId - The upperBinID parameter is a number that represents the ID of the
     * highest bin.
     * @param {BinArray} [lowerBinArrays] - The `lowerBinArrays` parameter is an optional parameter of
     * type `BinArray`. It represents an array of bins that are below the lower bin ID.
     * @param {BinArray} [upperBinArrays] - The parameter `upperBinArrays` is an optional parameter of
     * type `BinArray`. It represents an array of bins that are above the upper bin ID.
     * @returns an object with two properties: "activeBin" and "bins". The value of "activeBin" is the
     * active bin ID of the lbPair, and the value of "bins" is an array of BinLiquidity objects.
     */
    async getBinsBetweenLowerAndUpperBound(lowerBinId, upperBinId, lowerBinArray, upperBinArray) {
        const bins = await this.getBins(this.pubkey, lowerBinId, upperBinId, this.tokenX.decimal, this.tokenY.decimal, lowerBinArray, upperBinArray);
        return { activeBin: this.lbPair.activeId, bins };
    }
    /**
     * The function converts a real price of bin to a lamport value
     * @param {number} price - The `price` parameter is a number representing the price of a token.
     * @returns {string} price per Lamport of bin
     */
    toPricePerLamport(price) {
        return DLMM.getPricePerLamport(this.tokenX.decimal, this.tokenY.decimal, price);
    }
    /**
     * The function converts a price per lamport value to a real price of bin
     * @param {number} pricePerLamport - The parameter `pricePerLamport` is a number representing the
     * price per lamport.
     * @returns {string} real price of bin
     */
    fromPricePerLamport(pricePerLamport) {
        return new decimal_js_1.default(pricePerLamport)
            .div(new decimal_js_1.default(10 ** (this.tokenY.decimal - this.tokenX.decimal)))
            .toString();
    }
    /**
     * The function retrieves the active bin ID and its corresponding price.
     * @returns an object with two properties: "binId" which is a number, and "price" which is a string.
     */
    async getActiveBin() {
        const { activeId } = await this.program.account.lbPair.fetch(this.pubkey);
        const [activeBinState] = await this.getBins(this.pubkey, activeId, activeId, this.tokenX.decimal, this.tokenY.decimal);
        return activeBinState;
    }
    /**
     * The function get bin ID based on a given price and a boolean flag indicating whether to
     * round down or up.
     * @param {number} price - The price parameter is a number that represents the price value.
     * @param {boolean} min - The "min" parameter is a boolean value that determines whether to round
     * down or round up the calculated binId. If "min" is true, the binId will be rounded down (floor),
     * otherwise it will be rounded up (ceil).
     * @returns {number} which is the binId calculated based on the given price and whether the minimum
     * value should be used.
     */
    getBinIdFromPrice(price, min) {
        return DLMM.getBinIdFromPrice(price, this.lbPair.binStep, min);
    }
    /**
     * The function `getPositionsByUserAndLbPair` retrieves positions by user and LB pair, including
     * active bin and user positions.
     * @param {PublicKey} [userPubKey] - The `userPubKey` parameter is an optional parameter of type
     * `PublicKey`. It represents the public key of a user. If no `userPubKey` is provided, the function
     * will return an object with an empty `userPositions` array and the active bin information obtained
     * from the `getActive
     * @returns The function `getPositionsByUserAndLbPair` returns a Promise that resolves to an object
     * with two properties:
     *    - "activeBin" which is an object with two properties: "binId" and "price". The value of "binId"
     *     is the active bin ID of the lbPair, and the value of "price" is the price of the active bin.
     *   - "userPositions" which is an array of Position objects.
     */
    async getPositionsByUserAndLbPair(userPubKey) {
        const promiseResults = await Promise.all([
            this.getActiveBin(),
            userPubKey &&
                this.program.account.positionV2.all([
                    {
                        memcmp: {
                            bytes: bytes_1.bs58.encode(userPubKey.toBuffer()),
                            offset: 8 + 32,
                        },
                    },
                    {
                        memcmp: {
                            bytes: bytes_1.bs58.encode(this.pubkey.toBuffer()),
                            offset: 8,
                        },
                    },
                ]),
        ]);
        const [activeBin, positionsV2] = promiseResults;
        if (!activeBin) {
            throw new Error("Error fetching active bin");
        }
        if (!userPubKey) {
            return {
                activeBin,
                userPositions: [],
            };
        }
        if (!positionsV2) {
            throw new Error("Error fetching positions");
        }
        const binArrayPubkeySetV2 = new Set();
        positionsV2.forEach(({ account: { upperBinId, lowerBinId, lbPair } }) => {
            const lowerBinArrayIndex = (0, helpers_1.binIdToBinArrayIndex)(new anchor_1.BN(lowerBinId));
            const upperBinArrayIndex = (0, helpers_1.binIdToBinArrayIndex)(new anchor_1.BN(upperBinId));
            const [lowerBinArrayPubKey] = (0, helpers_1.deriveBinArray)(this.pubkey, lowerBinArrayIndex, this.program.programId);
            const [upperBinArrayPubKey] = (0, helpers_1.deriveBinArray)(this.pubkey, upperBinArrayIndex, this.program.programId);
            binArrayPubkeySetV2.add(lowerBinArrayPubKey.toBase58());
            binArrayPubkeySetV2.add(upperBinArrayPubKey.toBase58());
        });
        const binArrayPubkeyArrayV2 = Array.from(binArrayPubkeySetV2).map((pubkey) => new web3_js_1.PublicKey(pubkey));
        const lbPairAndBinArrays = await (0, helpers_1.chunkedGetMultipleAccountInfos)(this.program.provider.connection, [
            this.pubkey,
            web3_js_1.SYSVAR_CLOCK_PUBKEY,
            ...binArrayPubkeyArrayV2,
        ]);
        const [lbPairAccInfo, clockAccInfo, ...binArraysAccInfo] = lbPairAndBinArrays;
        const positionBinArraysMapV2 = new Map();
        for (let i = 0; i < binArraysAccInfo.length; i++) {
            const binArrayPubkey = binArrayPubkeyArrayV2[i];
            const binArrayAccBufferV2 = binArraysAccInfo[i];
            if (!binArrayAccBufferV2)
                throw new Error(`Bin Array account ${binArrayPubkey.toBase58()} not found`);
            const binArrayAccInfo = this.program.coder.accounts.decode("binArray", binArrayAccBufferV2.data);
            positionBinArraysMapV2.set(binArrayPubkey.toBase58(), binArrayAccInfo);
        }
        if (!lbPairAccInfo)
            throw new Error(`LB Pair account ${this.pubkey.toBase58()} not found`);
        const onChainTimestamp = new anchor_1.BN(clockAccInfo.data.readBigInt64LE(32).toString()).toNumber();
        const userPositionsV2 = await Promise.all(positionsV2.map(async ({ publicKey, account }) => {
            const { lowerBinId, upperBinId, feeOwner } = account;
            const lowerBinArrayIndex = (0, helpers_1.binIdToBinArrayIndex)(new anchor_1.BN(lowerBinId));
            const upperBinArrayIndex = (0, helpers_1.binIdToBinArrayIndex)(new anchor_1.BN(upperBinId));
            const [lowerBinArrayPubKey] = (0, helpers_1.deriveBinArray)(this.pubkey, lowerBinArrayIndex, this.program.programId);
            const [upperBinArrayPubKey] = (0, helpers_1.deriveBinArray)(this.pubkey, upperBinArrayIndex, this.program.programId);
            const lowerBinArray = positionBinArraysMapV2.get(lowerBinArrayPubKey.toBase58());
            const upperBinArray = positionBinArraysMapV2.get(upperBinArrayPubKey.toBase58());
            return {
                publicKey,
                positionData: await DLMM.processPosition(this.program, types_1.PositionVersion.V2, this.lbPair, onChainTimestamp, account, this.tokenX.decimal, this.tokenY.decimal, lowerBinArray, upperBinArray, feeOwner),
                version: types_1.PositionVersion.V2,
            };
        }));
        return {
            activeBin,
            userPositions: userPositionsV2,
        };
    }
    async quoteCreatePosition({ strategy }) {
        const { minBinId, maxBinId } = strategy;
        const lowerBinArrayIndex = (0, helpers_1.binIdToBinArrayIndex)(new anchor_1.BN(minBinId));
        const upperBinArrayIndex = anchor_1.BN.max((0, helpers_1.binIdToBinArrayIndex)(new anchor_1.BN(maxBinId)), lowerBinArrayIndex.add(new anchor_1.BN(1)));
        const binArraysCount = (await this.binArraysToBeCreate(lowerBinArrayIndex, upperBinArrayIndex)).length;
        const positionCount = Math.ceil((maxBinId - minBinId + 1) / constants_1.MAX_BIN_PER_TX);
        const binArrayCost = binArraysCount * constants_1.BIN_ARRAY_FEE;
        const positionCost = positionCount * constants_1.POSITION_FEE;
        return {
            binArraysCount,
            binArrayCost,
            positionCount,
            positionCost,
        };
    }
    /**
     * Creates an empty position and initializes the corresponding bin arrays if needed.
     * @param param0 The settings of the requested new position.
     * @returns A promise that resolves into a transaction for creating the requested position.
     */
    async createEmptyPosition({ positionPubKey, minBinId, maxBinId, user, }) {
        const createPositionIx = await this.program.methods
            .initializePosition(minBinId, maxBinId - minBinId + 1)
            .accounts({
            payer: user,
            position: positionPubKey,
            lbPair: this.pubkey,
            owner: user,
        })
            .instruction();
        const lowerBinArrayIndex = (0, helpers_1.binIdToBinArrayIndex)(new anchor_1.BN(minBinId));
        const upperBinArrayIndex = anchor_1.BN.max(lowerBinArrayIndex.add(new anchor_1.BN(1)), (0, helpers_1.binIdToBinArrayIndex)(new anchor_1.BN(maxBinId)));
        const createBinArrayIxs = await this.createBinArraysIfNeeded(upperBinArrayIndex, lowerBinArrayIndex, user);
        const instructions = [createPositionIx, ...createBinArrayIxs];
        const setCUIx = await (0, helpers_1.getEstimatedComputeUnitIxWithBuffer)(this.program.provider.connection, instructions, user);
        const { blockhash, lastValidBlockHeight } = await this.program.provider.connection.getLatestBlockhash("confirmed");
        return new web3_js_1.Transaction({
            blockhash,
            lastValidBlockHeight,
            feePayer: user,
        }).add(setCUIx, ...instructions);
    }
    /**
     * The function `getPosition` retrieves position information for a given public key and processes it
     * using various data to return a `LbPosition` object.
     * @param {PublicKey} positionPubKey - The `getPosition` function you provided is an asynchronous
     * function that fetches position information based on a given public key. Here's a breakdown of the
     * parameters used in the function:
     * @returns The `getPosition` function returns a Promise that resolves to an object of type
     * `LbPosition`. The object contains the following properties:
     * - `publicKey`: The public key of the position account
     * - `positionData`: Position Object
     * - `version`: The version of the position (in this case, `Position.V2`)
     */
    async getPosition(positionPubKey) {
        const positionAccountInfo = await this.program.account.positionV2.fetch(positionPubKey);
        if (!positionAccountInfo) {
            throw new Error(`Position account ${positionPubKey.toBase58()} not found`);
        }
        const { lowerBinId, upperBinId, feeOwner } = positionAccountInfo;
        const lowerBinArrayIndex = (0, helpers_1.binIdToBinArrayIndex)(new anchor_1.BN(lowerBinId));
        const upperBinArrayIndex = (0, helpers_1.binIdToBinArrayIndex)(new anchor_1.BN(upperBinId));
        const [lowerBinArrayPubKey] = (0, helpers_1.deriveBinArray)(this.pubkey, lowerBinArrayIndex, this.program.programId);
        const [upperBinArrayPubKey] = (0, helpers_1.deriveBinArray)(this.pubkey, upperBinArrayIndex, this.program.programId);
        const [clockAccInfo, lowerBinArrayAccInfo, upperBinArrayAccInfo] = await (0, helpers_1.chunkedGetMultipleAccountInfos)(this.program.provider.connection, [
            web3_js_1.SYSVAR_CLOCK_PUBKEY,
            lowerBinArrayPubKey,
            upperBinArrayPubKey,
        ]);
        if (!lowerBinArrayAccInfo || !upperBinArrayAccInfo) {
            return {
                publicKey: positionPubKey,
                positionData: {
                    totalXAmount: '0',
                    totalYAmount: '0',
                    positionBinData: [],
                    lastUpdatedAt: new anchor_1.BN(0),
                    upperBinId,
                    lowerBinId,
                    feeX: new anchor_1.BN(0),
                    feeY: new anchor_1.BN(0),
                    rewardOne: new anchor_1.BN(0),
                    rewardTwo: new anchor_1.BN(0),
                    feeOwner,
                    totalClaimedFeeXAmount: new anchor_1.BN(0),
                    totalClaimedFeeYAmount: new anchor_1.BN(0),
                },
                version: types_1.PositionVersion.V2,
            };
        }
        const onChainTimestamp = new anchor_1.BN(clockAccInfo.data.readBigInt64LE(32).toString()).toNumber();
        const lowerBinArray = this.program.coder.accounts.decode("binArray", lowerBinArrayAccInfo.data);
        const upperBinArray = this.program.coder.accounts.decode("binArray", upperBinArrayAccInfo.data);
        return {
            publicKey: positionPubKey,
            positionData: await DLMM.processPosition(this.program, types_1.PositionVersion.V2, this.lbPair, onChainTimestamp, positionAccountInfo, this.tokenX.decimal, this.tokenY.decimal, lowerBinArray, upperBinArray, feeOwner),
            version: types_1.PositionVersion.V2,
        };
    }
    /**
     * The function `initializePositionAndAddLiquidityByStrategy` function is used to initializes a position and adds liquidity
     * @param {TInitializePositionAndAddLiquidityParamsByStrategy}
     *    - `positionPubKey`: The public key of the position account. (usually use `new Keypair()`)
     *    - `totalXAmount`: The total amount of token X to be added to the liquidity pool.
     *    - `totalYAmount`: The total amount of token Y to be added to the liquidity pool.
     *    - `strategy`: The strategy parameters to be used for the liquidity pool (Can use `calculateStrategyParameter` to calculate).
     *    - `user`: The public key of the user account.
     *    - `slippage`: The slippage percentage to be used for the liquidity pool.
     * @returns {Promise<Transaction>} The function `initializePositionAndAddLiquidityByWeight` returns a `Promise` that
     * resolves to either a single `Transaction` object.
     */
    async initializePositionAndAddLiquidityByStrategy({ positionPubKey, totalXAmount, totalYAmount, strategy, user, slippage, }) {
        const { maxBinId, minBinId } = strategy;
        const maxActiveBinSlippage = slippage
            ? Math.ceil(slippage / (this.lbPair.binStep / 100))
            : constants_1.MAX_ACTIVE_BIN_SLIPPAGE;
        const preInstructions = [];
        const initializePositionIx = await this.program.methods
            .initializePosition(minBinId, maxBinId - minBinId + 1)
            .accounts({
            payer: user,
            position: positionPubKey,
            lbPair: this.pubkey,
            owner: user,
        })
            .instruction();
        preInstructions.push(initializePositionIx);
        const lowerBinArrayIndex = (0, helpers_1.binIdToBinArrayIndex)(new anchor_1.BN(minBinId));
        const [binArrayLower] = (0, helpers_1.deriveBinArray)(this.pubkey, lowerBinArrayIndex, this.program.programId);
        const upperBinArrayIndex = anchor_1.BN.max(lowerBinArrayIndex.add(new anchor_1.BN(1)), (0, helpers_1.binIdToBinArrayIndex)(new anchor_1.BN(maxBinId)));
        const [binArrayUpper] = (0, helpers_1.deriveBinArray)(this.pubkey, upperBinArrayIndex, this.program.programId);
        const createBinArrayIxs = await this.createBinArraysIfNeeded(upperBinArrayIndex, lowerBinArrayIndex, user);
        preInstructions.push(...createBinArrayIxs);
        const [{ ataPubKey: userTokenX, ix: createPayerTokenXIx }, { ataPubKey: userTokenY, ix: createPayerTokenYIx },] = await Promise.all([
            (0, helpers_1.getOrCreateATAInstruction)(this.program.provider.connection, this.tokenX.publicKey, user),
            (0, helpers_1.getOrCreateATAInstruction)(this.program.provider.connection, this.tokenY.publicKey, user),
        ]);
        createPayerTokenXIx && preInstructions.push(createPayerTokenXIx);
        createPayerTokenYIx && preInstructions.push(createPayerTokenYIx);
        if (this.tokenX.publicKey.equals(spl_token_1.NATIVE_MINT) && !totalXAmount.isZero()) {
            const wrapSOLIx = (0, helpers_1.wrapSOLInstruction)(user, userTokenX, BigInt(totalXAmount.toString()));
            preInstructions.push(...wrapSOLIx);
        }
        if (this.tokenY.publicKey.equals(spl_token_1.NATIVE_MINT) && !totalYAmount.isZero()) {
            const wrapSOLIx = (0, helpers_1.wrapSOLInstruction)(user, userTokenY, BigInt(totalYAmount.toString()));
            preInstructions.push(...wrapSOLIx);
        }
        const postInstructions = [];
        if ([
            this.tokenX.publicKey.toBase58(),
            this.tokenY.publicKey.toBase58(),
        ].includes(spl_token_1.NATIVE_MINT.toBase58())) {
            const closeWrappedSOLIx = await (0, helpers_1.unwrapSOLInstruction)(user);
            closeWrappedSOLIx && postInstructions.push(closeWrappedSOLIx);
        }
        const minBinArrayIndex = (0, helpers_1.binIdToBinArrayIndex)(new anchor_1.BN(minBinId));
        const maxBinArrayIndex = (0, helpers_1.binIdToBinArrayIndex)(new anchor_1.BN(maxBinId));
        const useExtension = (0, helpers_1.isOverflowDefaultBinArrayBitmap)(minBinArrayIndex) ||
            (0, helpers_1.isOverflowDefaultBinArrayBitmap)(maxBinArrayIndex);
        const binArrayBitmapExtension = useExtension
            ? (0, helpers_1.deriveBinArrayBitmapExtension)(this.pubkey, this.program.programId)[0]
            : null;
        const activeId = this.lbPair.activeId;
        const strategyParameters = (0, helpers_1.toStrategyParameters)(strategy);
        const liquidityParams = {
            amountX: totalXAmount,
            amountY: totalYAmount,
            activeId,
            maxActiveBinSlippage,
            strategyParameters,
        };
        const addLiquidityAccounts = {
            position: positionPubKey,
            lbPair: this.pubkey,
            userTokenX,
            userTokenY,
            reserveX: this.lbPair.reserveX,
            reserveY: this.lbPair.reserveY,
            tokenXMint: this.lbPair.tokenXMint,
            tokenYMint: this.lbPair.tokenYMint,
            binArrayLower,
            binArrayUpper,
            binArrayBitmapExtension,
            sender: user,
            tokenXProgram: spl_token_1.TOKEN_PROGRAM_ID,
            tokenYProgram: spl_token_1.TOKEN_PROGRAM_ID,
        };
        const programMethod = this.program.methods.addLiquidityByStrategy(liquidityParams);
        const addLiquidityIx = await programMethod
            .accounts(addLiquidityAccounts)
            .instruction();
        const instructions = [
            ...preInstructions,
            addLiquidityIx,
            ...postInstructions,
        ];
        const setCUIx = await (0, helpers_1.getEstimatedComputeUnitIxWithBuffer)(this.program.provider.connection, instructions, user);
        instructions.unshift(setCUIx);
        const { blockhash, lastValidBlockHeight } = await this.program.provider.connection.getLatestBlockhash("confirmed");
        return new web3_js_1.Transaction({
            blockhash,
            lastValidBlockHeight,
            feePayer: user,
        }).add(...instructions);
    }
    /**
     * The function `initializePositionAndAddLiquidityByWeight` function is used to initializes a position and adds liquidity
     * @param {TInitializePositionAndAddLiquidityParams}
     *    - `positionPubKey`: The public key of the position account. (usually use `new Keypair()`)
     *    - `totalXAmount`: The total amount of token X to be added to the liquidity pool.
     *    - `totalYAmount`: The total amount of token Y to be added to the liquidity pool.
     *    - `xYAmountDistribution`: An array of objects of type `XYAmountDistribution` that represents (can use `calculateSpotDistribution`, `calculateBidAskDistribution` & `calculateNormalDistribution`)
     *    - `user`: The public key of the user account.
     *    - `slippage`: The slippage percentage to be used for the liquidity pool.
     * @returns {Promise<Transaction|Transaction[]>} The function `initializePositionAndAddLiquidityByWeight` returns a `Promise` that
     * resolves to either a single `Transaction` object (if less than 26bin involved) or an array of `Transaction` objects.
     */
    async initializePositionAndAddLiquidityByWeight({ positionPubKey, totalXAmount, totalYAmount, xYAmountDistribution, user, slippage, }) {
        const { lowerBinId, upperBinId, binIds } = this.processXYAmountDistribution(xYAmountDistribution);
        const maxActiveBinSlippage = slippage
            ? Math.ceil(slippage / (this.lbPair.binStep / 100))
            : constants_1.MAX_ACTIVE_BIN_SLIPPAGE;
        if (upperBinId >= lowerBinId + constants_1.MAX_BIN_PER_POSITION.toNumber()) {
            throw new Error(`Position must be within a range of 1 to ${constants_1.MAX_BIN_PER_POSITION.toNumber()} bins.`);
        }
        const preInstructions = [];
        const initializePositionIx = await this.program.methods
            .initializePosition(lowerBinId, upperBinId - lowerBinId + 1)
            .accounts({
            payer: user,
            position: positionPubKey,
            lbPair: this.pubkey,
            owner: user,
        })
            .instruction();
        preInstructions.push(initializePositionIx);
        const lowerBinArrayIndex = (0, helpers_1.binIdToBinArrayIndex)(new anchor_1.BN(lowerBinId));
        const [binArrayLower] = (0, helpers_1.deriveBinArray)(this.pubkey, lowerBinArrayIndex, this.program.programId);
        const upperBinArrayIndex = anchor_1.BN.max(lowerBinArrayIndex.add(new anchor_1.BN(1)), (0, helpers_1.binIdToBinArrayIndex)(new anchor_1.BN(upperBinId)));
        const [binArrayUpper] = (0, helpers_1.deriveBinArray)(this.pubkey, upperBinArrayIndex, this.program.programId);
        const createBinArrayIxs = await this.createBinArraysIfNeeded(upperBinArrayIndex, lowerBinArrayIndex, user);
        preInstructions.push(...createBinArrayIxs);
        const [{ ataPubKey: userTokenX, ix: createPayerTokenXIx }, { ataPubKey: userTokenY, ix: createPayerTokenYIx },] = await Promise.all([
            (0, helpers_1.getOrCreateATAInstruction)(this.program.provider.connection, this.tokenX.publicKey, user),
            (0, helpers_1.getOrCreateATAInstruction)(this.program.provider.connection, this.tokenY.publicKey, user),
        ]);
        createPayerTokenXIx && preInstructions.push(createPayerTokenXIx);
        createPayerTokenYIx && preInstructions.push(createPayerTokenYIx);
        if (this.tokenX.publicKey.equals(spl_token_1.NATIVE_MINT) && !totalXAmount.isZero()) {
            const wrapSOLIx = (0, helpers_1.wrapSOLInstruction)(user, userTokenX, BigInt(totalXAmount.toString()));
            preInstructions.push(...wrapSOLIx);
        }
        if (this.tokenY.publicKey.equals(spl_token_1.NATIVE_MINT) && !totalYAmount.isZero()) {
            const wrapSOLIx = (0, helpers_1.wrapSOLInstruction)(user, userTokenY, BigInt(totalYAmount.toString()));
            preInstructions.push(...wrapSOLIx);
        }
        const postInstructions = [];
        if ([
            this.tokenX.publicKey.toBase58(),
            this.tokenY.publicKey.toBase58(),
        ].includes(spl_token_1.NATIVE_MINT.toBase58())) {
            const closeWrappedSOLIx = await (0, helpers_1.unwrapSOLInstruction)(user);
            closeWrappedSOLIx && postInstructions.push(closeWrappedSOLIx);
        }
        const minBinId = Math.min(...binIds);
        const maxBinId = Math.max(...binIds);
        const minBinArrayIndex = (0, helpers_1.binIdToBinArrayIndex)(new anchor_1.BN(minBinId));
        const maxBinArrayIndex = (0, helpers_1.binIdToBinArrayIndex)(new anchor_1.BN(maxBinId));
        const useExtension = (0, helpers_1.isOverflowDefaultBinArrayBitmap)(minBinArrayIndex) ||
            (0, helpers_1.isOverflowDefaultBinArrayBitmap)(maxBinArrayIndex);
        const binArrayBitmapExtension = useExtension
            ? (0, helpers_1.deriveBinArrayBitmapExtension)(this.pubkey, this.program.programId)[0]
            : null;
        const activeId = this.lbPair.activeId;
        const binLiquidityDist = (0, helpers_1.toWeightDistribution)(totalXAmount, totalYAmount, xYAmountDistribution.map((item) => ({
            binId: item.binId,
            xAmountBpsOfTotal: item.xAmountBpsOfTotal,
            yAmountBpsOfTotal: item.yAmountBpsOfTotal,
        })), this.lbPair.binStep);
        if (binLiquidityDist.length === 0) {
            throw new Error("No liquidity to add");
        }
        const liquidityParams = {
            amountX: totalXAmount,
            amountY: totalYAmount,
            binLiquidityDist,
            activeId,
            maxActiveBinSlippage,
        };
        const addLiquidityAccounts = {
            position: positionPubKey,
            lbPair: this.pubkey,
            userTokenX,
            userTokenY,
            reserveX: this.lbPair.reserveX,
            reserveY: this.lbPair.reserveY,
            tokenXMint: this.lbPair.tokenXMint,
            tokenYMint: this.lbPair.tokenYMint,
            binArrayLower,
            binArrayUpper,
            binArrayBitmapExtension,
            sender: user,
            tokenXProgram: spl_token_1.TOKEN_PROGRAM_ID,
            tokenYProgram: spl_token_1.TOKEN_PROGRAM_ID,
        };
        const oneSideLiquidityParams = {
            amount: totalXAmount.isZero() ? totalYAmount : totalXAmount,
            activeId,
            maxActiveBinSlippage,
            binLiquidityDist,
        };
        const oneSideAddLiquidityAccounts = {
            binArrayLower,
            binArrayUpper,
            lbPair: this.pubkey,
            binArrayBitmapExtension: null,
            sender: user,
            position: positionPubKey,
            reserve: totalXAmount.isZero()
                ? this.lbPair.reserveY
                : this.lbPair.reserveX,
            tokenMint: totalXAmount.isZero()
                ? this.lbPair.tokenYMint
                : this.lbPair.tokenXMint,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            userToken: totalXAmount.isZero() ? userTokenY : userTokenX,
        };
        const isOneSideDeposit = totalXAmount.isZero() || totalYAmount.isZero();
        const programMethod = isOneSideDeposit
            ? this.program.methods.addLiquidityOneSide(oneSideLiquidityParams)
            : this.program.methods.addLiquidityByWeight(liquidityParams);
        if (xYAmountDistribution.length < constants_1.MAX_BIN_LENGTH_ALLOWED_IN_ONE_TX) {
            const addLiqIx = await programMethod
                .accounts(isOneSideDeposit ? oneSideAddLiquidityAccounts : addLiquidityAccounts)
                .instruction();
            const instructions = [...preInstructions, addLiqIx, ...postInstructions];
            const setCUIx = await (0, helpers_1.getEstimatedComputeUnitIxWithBuffer)(this.program.provider.connection, instructions, user);
            instructions.unshift(setCUIx);
            const { blockhash, lastValidBlockHeight } = await this.program.provider.connection.getLatestBlockhash("confirmed");
            return new web3_js_1.Transaction({
                blockhash,
                lastValidBlockHeight,
                feePayer: user,
            }).add(...instructions);
        }
        const addLiqIx = await programMethod
            .accounts(isOneSideDeposit ? oneSideAddLiquidityAccounts : addLiquidityAccounts)
            .instruction();
        const setCUIx = await (0, helpers_1.getEstimatedComputeUnitIxWithBuffer)(this.program.provider.connection, [addLiqIx], user, computeUnit_1.DEFAULT_ADD_LIQUIDITY_CU // The function return multiple transactions that dependent on each other, simulation will fail
        );
        const mainInstructions = [setCUIx, addLiqIx];
        const transactions = [];
        const { blockhash, lastValidBlockHeight } = await this.program.provider.connection.getLatestBlockhash("confirmed");
        if (preInstructions.length) {
            const preInstructionsTx = new web3_js_1.Transaction({
                blockhash,
                lastValidBlockHeight,
                feePayer: user,
            }).add(...preInstructions);
            transactions.push(preInstructionsTx);
        }
        const mainTx = new web3_js_1.Transaction({
            blockhash,
            lastValidBlockHeight,
            feePayer: user,
        }).add(...mainInstructions);
        transactions.push(mainTx);
        if (postInstructions.length) {
            const postInstructionsTx = new web3_js_1.Transaction({
                blockhash,
                lastValidBlockHeight,
                feePayer: user,
            }).add(...postInstructions);
            transactions.push(postInstructionsTx);
        }
        return transactions;
    }
    /**
     * The `addLiquidityByStrategy` function is used to add liquidity to existing position
     * @param {TInitializePositionAndAddLiquidityParamsByStrategy}
     *    - `positionPubKey`: The public key of the position account. (usually use `new Keypair()`)
     *    - `totalXAmount`: The total amount of token X to be added to the liquidity pool.
     *    - `totalYAmount`: The total amount of token Y to be added to the liquidity pool.
     *    - `strategy`: The strategy parameters to be used for the liquidity pool (Can use `calculateStrategyParameter` to calculate).
     *    - `user`: The public key of the user account.
     *    - `slippage`: The slippage percentage to be used for the liquidity pool.
     * @returns {Promise<Transaction>} The function `addLiquidityByWeight` returns a `Promise` that resolves to either a single
     * `Transaction` object
     */
    async addLiquidityByStrategy({ positionPubKey, totalXAmount, totalYAmount, strategy, user, slippage, }) {
        const { maxBinId, minBinId } = strategy;
        const maxActiveBinSlippage = slippage
            ? Math.ceil(slippage / (this.lbPair.binStep / 100))
            : constants_1.MAX_ACTIVE_BIN_SLIPPAGE;
        const preInstructions = [];
        const minBinArrayIndex = (0, helpers_1.binIdToBinArrayIndex)(new anchor_1.BN(minBinId));
        const maxBinArrayIndex = (0, helpers_1.binIdToBinArrayIndex)(new anchor_1.BN(maxBinId));
        const useExtension = (0, helpers_1.isOverflowDefaultBinArrayBitmap)(minBinArrayIndex) ||
            (0, helpers_1.isOverflowDefaultBinArrayBitmap)(maxBinArrayIndex);
        const binArrayBitmapExtension = useExtension
            ? (0, helpers_1.deriveBinArrayBitmapExtension)(this.pubkey, this.program.programId)[0]
            : null;
        const strategyParameters = (0, helpers_1.toStrategyParameters)(strategy);
        const positionAccount = await this.program.account.positionV2.fetch(positionPubKey);
        const lowerBinArrayIndex = (0, helpers_1.binIdToBinArrayIndex)(new anchor_1.BN(positionAccount.lowerBinId));
        const upperBinArrayIndex = lowerBinArrayIndex.add(new anchor_1.BN(1));
        const [binArrayLower] = (0, helpers_1.deriveBinArray)(this.pubkey, lowerBinArrayIndex, this.program.programId);
        const [binArrayUpper] = (0, helpers_1.deriveBinArray)(this.pubkey, upperBinArrayIndex, this.program.programId);
        const createBinArrayIxs = await this.createBinArraysIfNeeded(upperBinArrayIndex, lowerBinArrayIndex, user);
        preInstructions.push(...createBinArrayIxs);
        const [{ ataPubKey: userTokenX, ix: createPayerTokenXIx }, { ataPubKey: userTokenY, ix: createPayerTokenYIx },] = await Promise.all([
            (0, helpers_1.getOrCreateATAInstruction)(this.program.provider.connection, this.tokenX.publicKey, user),
            (0, helpers_1.getOrCreateATAInstruction)(this.program.provider.connection, this.tokenY.publicKey, user),
        ]);
        createPayerTokenXIx && preInstructions.push(createPayerTokenXIx);
        createPayerTokenYIx && preInstructions.push(createPayerTokenYIx);
        if (this.tokenX.publicKey.equals(spl_token_1.NATIVE_MINT) && !totalXAmount.isZero()) {
            const wrapSOLIx = (0, helpers_1.wrapSOLInstruction)(user, userTokenX, BigInt(totalXAmount.toString()));
            preInstructions.push(...wrapSOLIx);
        }
        if (this.tokenY.publicKey.equals(spl_token_1.NATIVE_MINT) && !totalYAmount.isZero()) {
            const wrapSOLIx = (0, helpers_1.wrapSOLInstruction)(user, userTokenY, BigInt(totalYAmount.toString()));
            preInstructions.push(...wrapSOLIx);
        }
        const postInstructions = [];
        if ([
            this.tokenX.publicKey.toBase58(),
            this.tokenY.publicKey.toBase58(),
        ].includes(spl_token_1.NATIVE_MINT.toBase58())) {
            const closeWrappedSOLIx = await (0, helpers_1.unwrapSOLInstruction)(user);
            closeWrappedSOLIx && postInstructions.push(closeWrappedSOLIx);
        }
        const liquidityParams = {
            amountX: totalXAmount,
            amountY: totalYAmount,
            activeId: this.lbPair.activeId,
            maxActiveBinSlippage,
            strategyParameters,
        };
        const addLiquidityAccounts = {
            position: positionPubKey,
            lbPair: this.pubkey,
            userTokenX,
            userTokenY,
            reserveX: this.lbPair.reserveX,
            reserveY: this.lbPair.reserveY,
            tokenXMint: this.lbPair.tokenXMint,
            tokenYMint: this.lbPair.tokenYMint,
            binArrayLower,
            binArrayUpper,
            binArrayBitmapExtension,
            sender: user,
            tokenXProgram: spl_token_1.TOKEN_PROGRAM_ID,
            tokenYProgram: spl_token_1.TOKEN_PROGRAM_ID,
        };
        const programMethod = this.program.methods.addLiquidityByStrategy(liquidityParams);
        const addLiquidityIx = await programMethod
            .accounts(addLiquidityAccounts)
            .instruction();
        const instructions = [
            ...preInstructions,
            addLiquidityIx,
            ...postInstructions,
        ];
        const setCUIx = await (0, helpers_1.getEstimatedComputeUnitIxWithBuffer)(this.program.provider.connection, instructions, user);
        instructions.unshift(setCUIx);
        const { blockhash, lastValidBlockHeight } = await this.program.provider.connection.getLatestBlockhash("confirmed");
        return new web3_js_1.Transaction({
            blockhash,
            lastValidBlockHeight,
            feePayer: user,
        }).add(...instructions);
    }
    /**
     * The `addLiquidityByWeight` function is used to add liquidity to existing position
     * @param {TInitializePositionAndAddLiquidityParams}
     *    - `positionPubKey`: The public key of the position account. (usually use `new Keypair()`)
     *    - `totalXAmount`: The total amount of token X to be added to the liquidity pool.
     *    - `totalYAmount`: The total amount of token Y to be added to the liquidity pool.
     *    - `xYAmountDistribution`: An array of objects of type `XYAmountDistribution` that represents (can use `calculateSpotDistribution`, `calculateBidAskDistribution` & `calculateNormalDistribution`)
     *    - `user`: The public key of the user account.
     *    - `slippage`: The slippage percentage to be used for the liquidity pool.
     * @returns {Promise<Transaction|Transaction[]>} The function `addLiquidityByWeight` returns a `Promise` that resolves to either a single
     * `Transaction` object (if less than 26bin involved) or an array of `Transaction` objects.
     */
    async addLiquidityByWeight({ positionPubKey, totalXAmount, totalYAmount, xYAmountDistribution, user, slippage, }) {
        const maxActiveBinSlippage = slippage
            ? Math.ceil(slippage / (this.lbPair.binStep / 100))
            : constants_1.MAX_ACTIVE_BIN_SLIPPAGE;
        const positionAccount = await this.program.account.positionV2.fetch(positionPubKey);
        const { lowerBinId, upperBinId, binIds } = this.processXYAmountDistribution(xYAmountDistribution);
        if (lowerBinId < positionAccount.lowerBinId)
            throw new Error(`Lower Bin ID (${lowerBinId}) lower than Position Lower Bin Id (${positionAccount.lowerBinId})`);
        if (upperBinId > positionAccount.upperBinId)
            throw new Error(`Upper Bin ID (${upperBinId}) higher than Position Upper Bin Id (${positionAccount.upperBinId})`);
        const minBinId = Math.min(...binIds);
        const maxBinId = Math.max(...binIds);
        const minBinArrayIndex = (0, helpers_1.binIdToBinArrayIndex)(new anchor_1.BN(minBinId));
        const maxBinArrayIndex = (0, helpers_1.binIdToBinArrayIndex)(new anchor_1.BN(maxBinId));
        const useExtension = (0, helpers_1.isOverflowDefaultBinArrayBitmap)(minBinArrayIndex) ||
            (0, helpers_1.isOverflowDefaultBinArrayBitmap)(maxBinArrayIndex);
        const binArrayBitmapExtension = useExtension
            ? (0, helpers_1.deriveBinArrayBitmapExtension)(this.pubkey, this.program.programId)[0]
            : null;
        const activeId = this.lbPair.activeId;
        const binLiquidityDist = (0, helpers_1.toWeightDistribution)(totalXAmount, totalYAmount, xYAmountDistribution.map((item) => ({
            binId: item.binId,
            xAmountBpsOfTotal: item.xAmountBpsOfTotal,
            yAmountBpsOfTotal: item.yAmountBpsOfTotal,
        })), this.lbPair.binStep);
        if (binLiquidityDist.length === 0) {
            throw new Error("No liquidity to add");
        }
        const lowerBinArrayIndex = (0, helpers_1.binIdToBinArrayIndex)(new anchor_1.BN(positionAccount.lowerBinId));
        const [binArrayLower] = (0, helpers_1.deriveBinArray)(this.pubkey, lowerBinArrayIndex, this.program.programId);
        const upperBinArrayIndex = anchor_1.BN.max(lowerBinArrayIndex.add(new anchor_1.BN(1)), (0, helpers_1.binIdToBinArrayIndex)(new anchor_1.BN(positionAccount.upperBinId)));
        const [binArrayUpper] = (0, helpers_1.deriveBinArray)(this.pubkey, upperBinArrayIndex, this.program.programId);
        const preInstructions = [];
        const createBinArrayIxs = await this.createBinArraysIfNeeded(upperBinArrayIndex, lowerBinArrayIndex, user);
        preInstructions.push(...createBinArrayIxs);
        const [{ ataPubKey: userTokenX, ix: createPayerTokenXIx }, { ataPubKey: userTokenY, ix: createPayerTokenYIx },] = await Promise.all([
            (0, helpers_1.getOrCreateATAInstruction)(this.program.provider.connection, this.tokenX.publicKey, user),
            (0, helpers_1.getOrCreateATAInstruction)(this.program.provider.connection, this.tokenY.publicKey, user),
        ]);
        createPayerTokenXIx && preInstructions.push(createPayerTokenXIx);
        createPayerTokenYIx && preInstructions.push(createPayerTokenYIx);
        if (this.tokenX.publicKey.equals(spl_token_1.NATIVE_MINT) && !totalXAmount.isZero()) {
            const wrapSOLIx = (0, helpers_1.wrapSOLInstruction)(user, userTokenX, BigInt(totalXAmount.toString()));
            preInstructions.push(...wrapSOLIx);
        }
        if (this.tokenY.publicKey.equals(spl_token_1.NATIVE_MINT) && !totalYAmount.isZero()) {
            const wrapSOLIx = (0, helpers_1.wrapSOLInstruction)(user, userTokenY, BigInt(totalYAmount.toString()));
            preInstructions.push(...wrapSOLIx);
        }
        const postInstructions = [];
        if ([
            this.tokenX.publicKey.toBase58(),
            this.tokenY.publicKey.toBase58(),
        ].includes(spl_token_1.NATIVE_MINT.toBase58())) {
            const closeWrappedSOLIx = await (0, helpers_1.unwrapSOLInstruction)(user);
            closeWrappedSOLIx && postInstructions.push(closeWrappedSOLIx);
        }
        const liquidityParams = {
            amountX: totalXAmount,
            amountY: totalYAmount,
            binLiquidityDist,
            activeId,
            maxActiveBinSlippage,
        };
        const addLiquidityAccounts = {
            position: positionPubKey,
            lbPair: this.pubkey,
            userTokenX,
            userTokenY,
            reserveX: this.lbPair.reserveX,
            reserveY: this.lbPair.reserveY,
            tokenXMint: this.lbPair.tokenXMint,
            tokenYMint: this.lbPair.tokenYMint,
            binArrayLower,
            binArrayUpper,
            binArrayBitmapExtension,
            sender: user,
            tokenXProgram: spl_token_1.TOKEN_PROGRAM_ID,
            tokenYProgram: spl_token_1.TOKEN_PROGRAM_ID,
        };
        const oneSideLiquidityParams = {
            amount: totalXAmount.isZero() ? totalYAmount : totalXAmount,
            activeId,
            maxActiveBinSlippage,
            binLiquidityDist,
        };
        const oneSideAddLiquidityAccounts = {
            binArrayLower,
            binArrayUpper,
            lbPair: this.pubkey,
            binArrayBitmapExtension: null,
            sender: user,
            position: positionPubKey,
            reserve: totalXAmount.isZero()
                ? this.lbPair.reserveY
                : this.lbPair.reserveX,
            tokenMint: totalXAmount.isZero()
                ? this.lbPair.tokenYMint
                : this.lbPair.tokenXMint,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            userToken: totalXAmount.isZero() ? userTokenY : userTokenX,
        };
        const isOneSideDeposit = totalXAmount.isZero() || totalYAmount.isZero();
        const programMethod = isOneSideDeposit
            ? this.program.methods.addLiquidityOneSide(oneSideLiquidityParams)
            : this.program.methods.addLiquidityByWeight(liquidityParams);
        if (xYAmountDistribution.length < constants_1.MAX_BIN_LENGTH_ALLOWED_IN_ONE_TX) {
            const addLiqIx = await programMethod
                .accounts(isOneSideDeposit ? oneSideAddLiquidityAccounts : addLiquidityAccounts)
                .instruction();
            const instructions = [...preInstructions, addLiqIx, ...postInstructions];
            const setCUIx = await (0, helpers_1.getEstimatedComputeUnitIxWithBuffer)(this.program.provider.connection, instructions, user);
            instructions.unshift(setCUIx);
            const { blockhash, lastValidBlockHeight } = await this.program.provider.connection.getLatestBlockhash("confirmed");
            return new web3_js_1.Transaction({
                blockhash,
                lastValidBlockHeight,
                feePayer: user,
            }).add(...instructions);
        }
        const addLiqIx = await programMethod
            .accounts(isOneSideDeposit ? oneSideAddLiquidityAccounts : addLiquidityAccounts)
            .instruction();
        const setCUIx = await (0, helpers_1.getEstimatedComputeUnitIxWithBuffer)(this.program.provider.connection, [addLiqIx], user);
        const mainInstructions = [setCUIx, addLiqIx];
        const transactions = [];
        const { blockhash, lastValidBlockHeight } = await this.program.provider.connection.getLatestBlockhash("confirmed");
        if (preInstructions.length) {
            const preInstructionsTx = new web3_js_1.Transaction({
                blockhash,
                lastValidBlockHeight,
                feePayer: user,
            }).add(...preInstructions);
            transactions.push(preInstructionsTx);
        }
        const mainTx = new web3_js_1.Transaction({
            blockhash,
            lastValidBlockHeight,
            feePayer: user,
        }).add(...mainInstructions);
        transactions.push(mainTx);
        if (postInstructions.length) {
            const postInstructionsTx = new web3_js_1.Transaction({
                blockhash,
                lastValidBlockHeight,
                feePayer: user,
            }).add(...postInstructions);
            transactions.push(postInstructionsTx);
        }
        return transactions;
    }
    /**
     * The `removeLiquidity` function is used to remove liquidity from a position,
     * with the option to claim rewards and close the position.
     * @param
     *    - `user`: The public key of the user account.
     *    - `position`: The public key of the position account.
     *    - `binIds`: An array of numbers that represent the bin IDs to remove liquidity from.
     *    - `liquiditiesBpsToRemove`: An array of numbers (percentage) that represent the liquidity to remove from each bin.
     *    - `shouldClaimAndClose`: A boolean flag that indicates whether to claim rewards and close the position.
     * @returns {Promise<Transaction|Transaction[]>}
     */
    async removeLiquidity({ user, position, binIds, bps, shouldClaimAndClose = false, }) {
        const lowerBinIdToRemove = Math.min(...binIds);
        const upperBinIdToRemove = Math.max(...binIds);
        const { lbPair, owner, feeOwner, lowerBinId: positionLowerBinId, liquidityShares } = await this.program.account.positionV2.fetch(position);
        if (liquidityShares.every((share) => share.isZero())) {
            throw new Error("No liquidity to remove");
        }
        const lowerBinArrayIndex = (0, helpers_1.binIdToBinArrayIndex)(new anchor_1.BN(positionLowerBinId));
        const upperBinArrayIndex = lowerBinArrayIndex.add(new anchor_1.BN(1));
        const [binArrayLower] = (0, helpers_1.deriveBinArray)(lbPair, lowerBinArrayIndex, this.program.programId);
        const [binArrayUpper] = (0, helpers_1.deriveBinArray)(lbPair, upperBinArrayIndex, this.program.programId);
        const preInstructions = [];
        const walletToReceiveFee = feeOwner.equals(web3_js_1.PublicKey.default)
            ? user
            : feeOwner;
        const [{ ataPubKey: userTokenX, ix: createPayerTokenXIx }, { ataPubKey: userTokenY, ix: createPayerTokenYIx }, { ataPubKey: feeOwnerTokenX, ix: createFeeOwnerTokenXIx }, { ataPubKey: feeOwnerTokenY, ix: createFeeOwnerTokenYIx },] = await Promise.all([
            (0, helpers_1.getOrCreateATAInstruction)(this.program.provider.connection, this.tokenX.publicKey, owner, user),
            (0, helpers_1.getOrCreateATAInstruction)(this.program.provider.connection, this.tokenY.publicKey, owner, user),
            (0, helpers_1.getOrCreateATAInstruction)(this.program.provider.connection, this.tokenX.publicKey, walletToReceiveFee, user),
            (0, helpers_1.getOrCreateATAInstruction)(this.program.provider.connection, this.tokenY.publicKey, walletToReceiveFee, user),
        ]);
        createPayerTokenXIx && preInstructions.push(createPayerTokenXIx);
        createPayerTokenYIx && preInstructions.push(createPayerTokenYIx);
        if (!walletToReceiveFee.equals(owner)) {
            createFeeOwnerTokenXIx && preInstructions.push(createFeeOwnerTokenXIx);
            createFeeOwnerTokenYIx && preInstructions.push(createFeeOwnerTokenYIx);
        }
        const secondTransactionsIx = [];
        const postInstructions = [];
        if (shouldClaimAndClose) {
            const claimSwapFeeIx = await this.program.methods
                .claimFee()
                .accounts({
                binArrayLower,
                binArrayUpper,
                lbPair: this.pubkey,
                sender: user,
                position,
                reserveX: this.lbPair.reserveX,
                reserveY: this.lbPair.reserveY,
                tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
                tokenXMint: this.tokenX.publicKey,
                tokenYMint: this.tokenY.publicKey,
                userTokenX: feeOwnerTokenX,
                userTokenY: feeOwnerTokenY,
            })
                .instruction();
            postInstructions.push(claimSwapFeeIx);
            for (let i = 0; i < 2; i++) {
                const rewardInfo = this.lbPair.rewardInfos[i];
                if (!rewardInfo || rewardInfo.mint.equals(web3_js_1.PublicKey.default))
                    continue;
                const { ataPubKey, ix: rewardAtaIx } = await (0, helpers_1.getOrCreateATAInstruction)(this.program.provider.connection, rewardInfo.mint, user);
                rewardAtaIx && preInstructions.push(rewardAtaIx);
                const claimRewardIx = await this.program.methods
                    .claimReward(new anchor_1.BN(i))
                    .accounts({
                    lbPair: this.pubkey,
                    sender: user,
                    position,
                    binArrayLower,
                    binArrayUpper,
                    rewardVault: rewardInfo.vault,
                    rewardMint: rewardInfo.mint,
                    tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
                    userTokenAccount: ataPubKey,
                })
                    .instruction();
                secondTransactionsIx.push(claimRewardIx);
            }
            const closePositionIx = await this.program.methods
                .closePosition()
                .accounts({
                binArrayLower,
                binArrayUpper,
                rentReceiver: owner, // Must be position owner
                position,
                lbPair: this.pubkey,
                sender: user,
            })
                .instruction();
            if (secondTransactionsIx.length) {
                secondTransactionsIx.push(closePositionIx);
            }
            else {
                postInstructions.push(closePositionIx);
            }
        }
        if ([
            this.tokenX.publicKey.toBase58(),
            this.tokenY.publicKey.toBase58(),
        ].includes(spl_token_1.NATIVE_MINT.toBase58())) {
            const closeWrappedSOLIx = await (0, helpers_1.unwrapSOLInstruction)(user);
            closeWrappedSOLIx && postInstructions.push(closeWrappedSOLIx);
        }
        const minBinArrayIndex = (0, helpers_1.binIdToBinArrayIndex)(new anchor_1.BN(lowerBinIdToRemove));
        const maxBinArrayIndex = (0, helpers_1.binIdToBinArrayIndex)(new anchor_1.BN(upperBinIdToRemove));
        const useExtension = (0, helpers_1.isOverflowDefaultBinArrayBitmap)(minBinArrayIndex) ||
            (0, helpers_1.isOverflowDefaultBinArrayBitmap)(maxBinArrayIndex);
        const binArrayBitmapExtension = useExtension
            ? (0, helpers_1.deriveBinArrayBitmapExtension)(this.pubkey, this.program.programId)[0]
            : null;
        const removeLiquidityTx = await this.program.methods
            .removeLiquidityByRange(lowerBinIdToRemove, upperBinIdToRemove, bps.toNumber())
            .accounts({
            position,
            lbPair,
            userTokenX,
            userTokenY,
            reserveX: this.lbPair.reserveX,
            reserveY: this.lbPair.reserveY,
            tokenXMint: this.tokenX.publicKey,
            tokenYMint: this.tokenY.publicKey,
            binArrayLower,
            binArrayUpper,
            binArrayBitmapExtension,
            tokenXProgram: spl_token_1.TOKEN_PROGRAM_ID,
            tokenYProgram: spl_token_1.TOKEN_PROGRAM_ID,
            sender: user,
        })
            .instruction();
        const instructions = [
            ...preInstructions,
            removeLiquidityTx,
            ...postInstructions,
        ];
        const setCUIx = await (0, helpers_1.getEstimatedComputeUnitIxWithBuffer)(this.program.provider.connection, instructions, user);
        instructions.unshift(setCUIx);
        if (secondTransactionsIx.length) {
            const setCUIx = await (0, helpers_1.getEstimatedComputeUnitIxWithBuffer)(this.program.provider.connection, secondTransactionsIx, user);
            const { blockhash, lastValidBlockHeight } = await this.program.provider.connection.getLatestBlockhash("confirmed");
            const claimRewardsTx = new web3_js_1.Transaction({
                blockhash,
                lastValidBlockHeight,
                feePayer: user,
            }).add(setCUIx, ...secondTransactionsIx);
            const mainTx = new web3_js_1.Transaction({
                blockhash,
                lastValidBlockHeight,
                feePayer: user,
            }).add(...instructions);
            return [mainTx, claimRewardsTx];
        }
        else {
            const { blockhash, lastValidBlockHeight } = await this.program.provider.connection.getLatestBlockhash("confirmed");
            return new web3_js_1.Transaction({
                blockhash,
                lastValidBlockHeight,
                feePayer: user,
            }).add(...instructions);
        }
    }
    /**
     * The `closePosition` function closes a position
     * @param
     *    - `owner`: The public key of the owner of the position.
     *    - `position`: The public key of the position account.
     * @returns {Promise<Transaction>}
     */
    async closePosition({ owner, position, }) {
        const { lowerBinId } = await this.program.account.positionV2.fetch(position.publicKey);
        const lowerBinArrayIndex = (0, helpers_1.binIdToBinArrayIndex)(new anchor_1.BN(lowerBinId));
        const [binArrayLower] = (0, helpers_1.deriveBinArray)(this.pubkey, lowerBinArrayIndex, this.program.programId);
        const upperBinArrayIndex = lowerBinArrayIndex.add(new anchor_1.BN(1));
        const [binArrayUpper] = (0, helpers_1.deriveBinArray)(this.pubkey, upperBinArrayIndex, this.program.programId);
        const closePositionTx = await this.program.methods
            .closePosition()
            .accounts({
            binArrayLower,
            binArrayUpper,
            rentReceiver: owner,
            position: position.publicKey,
            lbPair: this.pubkey,
            sender: owner,
        })
            .transaction();
        const { blockhash, lastValidBlockHeight } = await this.program.provider.connection.getLatestBlockhash("confirmed");
        return new web3_js_1.Transaction({
            blockhash,
            lastValidBlockHeight,
            feePayer: owner,
        }).add(closePositionTx);
    }
    /**
     * The `swapQuoteExactOut` function returns a quote for a swap
     * @param
     *    - `outAmount`: Amount of lamport to swap out
     *    - `swapForY`: Swap token X to Y when it is true, else reversed.
     *    - `allowedSlippage`: Allowed slippage for the swap. Expressed in BPS. To convert from slippage percentage to BPS unit: SLIPPAGE_PERCENTAGE * 100
     * @returns {SwapQuote}
     *    - `inAmount`: Amount of lamport to swap in
     *    - `outAmount`: Amount of lamport to swap out
     *    - `fee`: Fee amount
     *    - `protocolFee`: Protocol fee amount
     *    - `maxInAmount`: Maximum amount of lamport to swap in
     *    - `binArraysPubkey`: Array of bin arrays involved in the swap
     * @throws {DlmmSdkError}
     *
     */
    swapQuoteExactOut(outAmount, swapForY, allowedSlippage, binArrays) {
        // TODO: Should we use onchain clock ? Volatile fee rate is sensitive to time. Caching clock might causes the quoted fee off ...
        const currentTimestamp = Date.now() / 1000;
        let outAmountLeft = outAmount;
        let vParameterClone = Object.assign({}, this.lbPair.vParameters);
        let activeId = new anchor_1.BN(this.lbPair.activeId);
        const binStep = this.lbPair.binStep;
        const sParameters = this.lbPair.parameters;
        this.updateReference(activeId.toNumber(), vParameterClone, sParameters, currentTimestamp);
        let startBinId = activeId;
        let binArraysForSwap = new Map();
        let actualInAmount = new anchor_1.BN(0);
        let feeAmount = new anchor_1.BN(0);
        let protocolFeeAmount = new anchor_1.BN(0);
        while (!outAmountLeft.isZero()) {
            let binArrayAccountToSwap = (0, helpers_1.findNextBinArrayWithLiquidity)(swapForY, activeId, this.lbPair, this.binArrayBitmapExtension?.account ?? null, binArrays);
            if (binArrayAccountToSwap == null) {
                throw new error_1.DlmmSdkError("SWAP_QUOTE_INSUFFICIENT_LIQUIDITY", "Insufficient liquidity in binArrays");
            }
            binArraysForSwap.set(binArrayAccountToSwap.publicKey, true);
            this.updateVolatilityAccumulator(vParameterClone, sParameters, activeId.toNumber());
            if ((0, helpers_1.isBinIdWithinBinArray)(activeId, binArrayAccountToSwap.account.index)) {
                const bin = (0, helpers_1.getBinFromBinArray)(activeId.toNumber(), binArrayAccountToSwap.account);
                const { amountIn, amountOut, fee, protocolFee } = (0, helpers_1.swapExactOutQuoteAtBin)(bin, binStep, sParameters, vParameterClone, outAmountLeft, swapForY);
                if (!amountOut.isZero()) {
                    outAmountLeft = outAmountLeft.sub(amountOut);
                    actualInAmount = actualInAmount.add(amountIn);
                    feeAmount = feeAmount.add(fee);
                    protocolFeeAmount = protocolFee.add(protocolFee);
                }
            }
            if (!outAmountLeft.isZero()) {
                if (swapForY) {
                    activeId = activeId.sub(new anchor_1.BN(1));
                }
                else {
                    activeId = activeId.add(new anchor_1.BN(1));
                }
            }
        }
        const startPrice = (0, helpers_1.getPriceOfBinByBinId)(startBinId.toNumber(), this.lbPair.binStep);
        const endPrice = (0, helpers_1.getPriceOfBinByBinId)(activeId.toNumber(), this.lbPair.binStep);
        const priceImpact = startPrice
            .sub(endPrice)
            .abs()
            .div(startPrice)
            .mul(new decimal_js_1.default(100));
        const maxInAmount = actualInAmount
            .mul(new anchor_1.BN(constants_1.BASIS_POINT_MAX).add(allowedSlippage))
            .div(new anchor_1.BN(constants_1.BASIS_POINT_MAX));
        return {
            inAmount: actualInAmount,
            maxInAmount,
            outAmount,
            priceImpact,
            fee: feeAmount,
            protocolFee: protocolFeeAmount,
            binArraysPubkey: [...binArraysForSwap.keys()],
        };
    }
    /**
     * The `swapQuote` function returns a quote for a swap
     * @param
     *    - `inAmount`: Amount of lamport to swap in
     *    - `swapForY`: Swap token X to Y when it is true, else reversed.
     *    - `allowedSlippage`: Allowed slippage for the swap. Expressed in BPS. To convert from slippage percentage to BPS unit: SLIPPAGE_PERCENTAGE * 100
     *    - `binArrays`: binArrays for swapQuote.
     *    - `isPartialFill`: Flag to check whether the the swapQuote is partial fill, default = false.
     * @returns {SwapQuote}
     *    - `consumedInAmount`: Amount of lamport to swap in
     *    - `outAmount`: Amount of lamport to swap out
     *    - `fee`: Fee amount
     *    - `protocolFee`: Protocol fee amount
     *    - `minOutAmount`: Minimum amount of lamport to swap out
     *    - `priceImpact`: Price impact of the swap
     *    - `binArraysPubkey`: Array of bin arrays involved in the swap
     * @throws {DlmmSdkError}
     */
    swapQuote(inAmount, swapForY, allowedSlippage, binArrays, isPartialFill) {
        // TODO: Should we use onchain clock ? Volatile fee rate is sensitive to time. Caching clock might causes the quoted fee off ...
        const currentTimestamp = Date.now() / 1000;
        let inAmountLeft = inAmount;
        let vParameterClone = Object.assign({}, this.lbPair.vParameters);
        let activeId = new anchor_1.BN(this.lbPair.activeId);
        const binStep = this.lbPair.binStep;
        const sParameters = this.lbPair.parameters;
        this.updateReference(activeId.toNumber(), vParameterClone, sParameters, currentTimestamp);
        let startBin = null;
        let binArraysForSwap = new Map();
        let actualOutAmount = new anchor_1.BN(0);
        let feeAmount = new anchor_1.BN(0);
        let protocolFeeAmount = new anchor_1.BN(0);
        let lastFilledActiveBinId = activeId;
        while (!inAmountLeft.isZero()) {
            let binArrayAccountToSwap = (0, helpers_1.findNextBinArrayWithLiquidity)(swapForY, activeId, this.lbPair, this.binArrayBitmapExtension?.account ?? null, binArrays);
            if (binArrayAccountToSwap == null) {
                if (isPartialFill) {
                    break;
                }
                else {
                    throw new error_1.DlmmSdkError("SWAP_QUOTE_INSUFFICIENT_LIQUIDITY", "Insufficient liquidity in binArrays for swapQuote");
                }
            }
            binArraysForSwap.set(binArrayAccountToSwap.publicKey, true);
            this.updateVolatilityAccumulator(vParameterClone, sParameters, activeId.toNumber());
            if ((0, helpers_1.isBinIdWithinBinArray)(activeId, binArrayAccountToSwap.account.index)) {
                const bin = (0, helpers_1.getBinFromBinArray)(activeId.toNumber(), binArrayAccountToSwap.account);
                const { amountIn, amountOut, fee, protocolFee } = (0, helpers_1.swapExactInQuoteAtBin)(bin, binStep, sParameters, vParameterClone, inAmountLeft, swapForY);
                if (!amountIn.isZero()) {
                    inAmountLeft = inAmountLeft.sub(amountIn);
                    actualOutAmount = actualOutAmount.add(amountOut);
                    feeAmount = feeAmount.add(fee);
                    protocolFeeAmount = protocolFee.add(protocolFee);
                    if (!startBin) {
                        startBin = bin;
                    }
                    lastFilledActiveBinId = activeId;
                }
            }
            if (!inAmountLeft.isZero()) {
                if (swapForY) {
                    activeId = activeId.sub(new anchor_1.BN(1));
                }
                else {
                    activeId = activeId.add(new anchor_1.BN(1));
                }
            }
        }
        if (!startBin) {
            // The pool insufficient liquidity
            throw new error_1.DlmmSdkError("SWAP_QUOTE_INSUFFICIENT_LIQUIDITY", "Insufficient liquidity");
        }
        inAmount = inAmount.sub(inAmountLeft);
        const outAmountWithoutSlippage = (0, helpers_1.getOutAmount)(startBin, inAmount.sub((0, helpers_1.computeFeeFromAmount)(binStep, sParameters, vParameterClone, inAmount)), swapForY);
        const priceImpact = new decimal_js_1.default(actualOutAmount.toString())
            .sub(new decimal_js_1.default(outAmountWithoutSlippage.toString()))
            .div(new decimal_js_1.default(outAmountWithoutSlippage.toString()))
            .mul(new decimal_js_1.default(100));
        const minOutAmount = actualOutAmount
            .mul(new anchor_1.BN(constants_1.BASIS_POINT_MAX).sub(allowedSlippage))
            .div(new anchor_1.BN(constants_1.BASIS_POINT_MAX));
        const endPrice = (0, helpers_1.getPriceOfBinByBinId)(lastFilledActiveBinId.toNumber(), this.lbPair.binStep);
        return {
            consumedInAmount: inAmount,
            outAmount: actualOutAmount,
            fee: feeAmount,
            protocolFee: protocolFeeAmount,
            minOutAmount,
            priceImpact,
            binArraysPubkey: [...binArraysForSwap.keys()],
            endPrice,
        };
    }
    async swapExactOut({ inToken, outToken, outAmount, maxInAmount, lbPair, user, binArraysPubkey, }) {
        const { tokenXMint, tokenYMint, reserveX, reserveY, activeId, oracle } = await this.program.account.lbPair.fetch(lbPair);
        const preInstructions = [];
        const postInstructions = [];
        const [{ ataPubKey: userTokenIn, ix: createInTokenAccountIx }, { ataPubKey: userTokenOut, ix: createOutTokenAccountIx },] = await Promise.all([
            (0, helpers_1.getOrCreateATAInstruction)(this.program.provider.connection, inToken, user),
            (0, helpers_1.getOrCreateATAInstruction)(this.program.provider.connection, outToken, user),
        ]);
        createInTokenAccountIx && preInstructions.push(createInTokenAccountIx);
        createOutTokenAccountIx && preInstructions.push(createOutTokenAccountIx);
        if (inToken.equals(spl_token_1.NATIVE_MINT)) {
            const wrapSOLIx = (0, helpers_1.wrapSOLInstruction)(user, userTokenIn, BigInt(maxInAmount.toString()));
            preInstructions.push(...wrapSOLIx);
            const closeWrappedSOLIx = await (0, helpers_1.unwrapSOLInstruction)(user);
            closeWrappedSOLIx && postInstructions.push(closeWrappedSOLIx);
        }
        if (outToken.equals(spl_token_1.NATIVE_MINT)) {
            const closeWrappedSOLIx = await (0, helpers_1.unwrapSOLInstruction)(user);
            closeWrappedSOLIx && postInstructions.push(closeWrappedSOLIx);
        }
        let swapForY = true;
        if (outToken.equals(tokenXMint))
            swapForY = false;
        const binArrays = binArraysPubkey.map((pubkey) => {
            return {
                isSigner: false,
                isWritable: true,
                pubkey,
            };
        });
        const swapIx = await this.program.methods
            .swapExactOut(maxInAmount, outAmount)
            .accounts({
            lbPair,
            reserveX,
            reserveY,
            tokenXMint,
            tokenYMint,
            tokenXProgram: spl_token_1.TOKEN_PROGRAM_ID,
            tokenYProgram: spl_token_1.TOKEN_PROGRAM_ID,
            user,
            userTokenIn,
            userTokenOut,
            binArrayBitmapExtension: this.binArrayBitmapExtension
                ? this.binArrayBitmapExtension.publicKey
                : null,
            oracle,
            hostFeeIn: null,
        })
            .remainingAccounts(binArrays)
            .instruction();
        const instructions = [...preInstructions, swapIx, ...postInstructions];
        const setCUIx = await (0, helpers_1.getEstimatedComputeUnitIxWithBuffer)(this.program.provider.connection, instructions, user);
        instructions.unshift(setCUIx);
        const { blockhash, lastValidBlockHeight } = await this.program.provider.connection.getLatestBlockhash("confirmed");
        return new web3_js_1.Transaction({
            blockhash,
            lastValidBlockHeight,
            feePayer: user,
        }).add(...instructions);
    }
    /**
     * Returns a transaction to be signed and sent by user performing swap.
     * @param {SwapWithPriceImpactParams}
     *    - `inToken`: The public key of the token to be swapped in.
     *    - `outToken`: The public key of the token to be swapped out.
     *    - `inAmount`: The amount of token to be swapped in.
     *    - `priceImpact`: Accepted price impact bps.
     *    - `lbPair`: The public key of the liquidity pool.
     *    - `user`: The public key of the user account.
     *    - `binArraysPubkey`: Array of bin arrays involved in the swap
     * @returns {Promise<Transaction>}
     */
    async swapWithPriceImpact({ inToken, outToken, inAmount, lbPair, user, priceImpact, binArraysPubkey, }) {
        const preInstructions = [];
        const postInstructions = [];
        const [{ ataPubKey: userTokenIn, ix: createInTokenAccountIx }, { ataPubKey: userTokenOut, ix: createOutTokenAccountIx },] = await Promise.all([
            (0, helpers_1.getOrCreateATAInstruction)(this.program.provider.connection, inToken, user),
            (0, helpers_1.getOrCreateATAInstruction)(this.program.provider.connection, outToken, user),
        ]);
        createInTokenAccountIx && preInstructions.push(createInTokenAccountIx);
        createOutTokenAccountIx && preInstructions.push(createOutTokenAccountIx);
        if (inToken.equals(spl_token_1.NATIVE_MINT)) {
            const wrapSOLIx = (0, helpers_1.wrapSOLInstruction)(user, userTokenIn, BigInt(inAmount.toString()));
            preInstructions.push(...wrapSOLIx);
            const closeWrappedSOLIx = await (0, helpers_1.unwrapSOLInstruction)(user);
            closeWrappedSOLIx && postInstructions.push(closeWrappedSOLIx);
        }
        if (outToken.equals(spl_token_1.NATIVE_MINT)) {
            const closeWrappedSOLIx = await (0, helpers_1.unwrapSOLInstruction)(user);
            closeWrappedSOLIx && postInstructions.push(closeWrappedSOLIx);
        }
        // TODO: needs some refinement in case binArray not yet initialized
        const binArrays = binArraysPubkey.map((pubkey) => {
            return {
                isSigner: false,
                isWritable: true,
                pubkey,
            };
        });
        const swapIx = await this.program.methods
            .swapWithPriceImpact(inAmount, this.lbPair.activeId, priceImpact.toNumber())
            .accounts({
            lbPair,
            reserveX: this.lbPair.reserveX,
            reserveY: this.lbPair.reserveY,
            tokenXMint: this.lbPair.tokenXMint,
            tokenYMint: this.lbPair.tokenYMint,
            tokenXProgram: spl_token_1.TOKEN_PROGRAM_ID,
            tokenYProgram: spl_token_1.TOKEN_PROGRAM_ID,
            user,
            userTokenIn,
            userTokenOut,
            binArrayBitmapExtension: this.binArrayBitmapExtension
                ? this.binArrayBitmapExtension.publicKey
                : null,
            oracle: this.lbPair.oracle,
            hostFeeIn: null,
        })
            .remainingAccounts(binArrays)
            .instruction();
        const instructions = [...preInstructions, swapIx, ...postInstructions];
        const setCUIx = await (0, helpers_1.getEstimatedComputeUnitIxWithBuffer)(this.program.provider.connection, instructions, user);
        instructions.unshift(setCUIx);
        const { blockhash, lastValidBlockHeight } = await this.program.provider.connection.getLatestBlockhash("confirmed");
        return new web3_js_1.Transaction({
            blockhash,
            lastValidBlockHeight,
            feePayer: user,
        }).add(...instructions);
    }
    /**
     * Returns a transaction to be signed and sent by user performing swap.
     * @param {SwapParams}
     *    - `inToken`: The public key of the token to be swapped in.
     *    - `outToken`: The public key of the token to be swapped out.
     *    - `inAmount`: The amount of token to be swapped in.
     *    - `minOutAmount`: The minimum amount of token to be swapped out.
     *    - `lbPair`: The public key of the liquidity pool.
     *    - `user`: The public key of the user account.
     *    - `binArraysPubkey`: Array of bin arrays involved in the swap
     * @returns {Promise<Transaction>}
     */
    async swap({ inToken, outToken, inAmount, minOutAmount, lbPair, user, binArraysPubkey, }) {
        const preInstructions = [];
        const postInstructions = [];
        const [{ ataPubKey: userTokenIn, ix: createInTokenAccountIx }, { ataPubKey: userTokenOut, ix: createOutTokenAccountIx },] = await Promise.all([
            (0, helpers_1.getOrCreateATAInstruction)(this.program.provider.connection, inToken, user),
            (0, helpers_1.getOrCreateATAInstruction)(this.program.provider.connection, outToken, user),
        ]);
        createInTokenAccountIx && preInstructions.push(createInTokenAccountIx);
        createOutTokenAccountIx && preInstructions.push(createOutTokenAccountIx);
        if (inToken.equals(spl_token_1.NATIVE_MINT)) {
            const wrapSOLIx = (0, helpers_1.wrapSOLInstruction)(user, userTokenIn, BigInt(inAmount.toString()));
            preInstructions.push(...wrapSOLIx);
            const closeWrappedSOLIx = await (0, helpers_1.unwrapSOLInstruction)(user);
            closeWrappedSOLIx && postInstructions.push(closeWrappedSOLIx);
        }
        if (outToken.equals(spl_token_1.NATIVE_MINT)) {
            const closeWrappedSOLIx = await (0, helpers_1.unwrapSOLInstruction)(user);
            closeWrappedSOLIx && postInstructions.push(closeWrappedSOLIx);
        }
        // TODO: needs some refinement in case binArray not yet initialized
        const binArrays = binArraysPubkey.map((pubkey) => {
            return {
                isSigner: false,
                isWritable: true,
                pubkey,
            };
        });
        const swapIx = await this.program.methods
            .swap(inAmount, minOutAmount)
            .accounts({
            lbPair,
            reserveX: this.lbPair.reserveX,
            reserveY: this.lbPair.reserveY,
            tokenXMint: this.lbPair.tokenXMint,
            tokenYMint: this.lbPair.tokenYMint,
            tokenXProgram: spl_token_1.TOKEN_PROGRAM_ID, // dont use 2022 first; lack familiarity
            tokenYProgram: spl_token_1.TOKEN_PROGRAM_ID, // dont use 2022 first; lack familiarity
            user,
            userTokenIn,
            userTokenOut,
            binArrayBitmapExtension: this.binArrayBitmapExtension
                ? this.binArrayBitmapExtension.publicKey
                : null,
            oracle: this.lbPair.oracle,
            hostFeeIn: null,
        })
            .remainingAccounts(binArrays)
            .instruction();
        const instructions = [...preInstructions, swapIx, ...postInstructions];
        const setCUIx = await (0, helpers_1.getEstimatedComputeUnitIxWithBuffer)(this.program.provider.connection, instructions, user);
        instructions.unshift(setCUIx);
        const { blockhash, lastValidBlockHeight } = await this.program.provider.connection.getLatestBlockhash("confirmed");
        return new web3_js_1.Transaction({
            blockhash,
            lastValidBlockHeight,
            feePayer: user,
        }).add(...instructions);
    }
    /**
     * The claimLMReward function is used to claim rewards for a specific position owned by a specific owner.
     * @param
     *    - `owner`: The public key of the owner of the position.
     *    - `position`: The public key of the position account.
     * @returns {Promise<Transaction>}
     */
    async claimLMReward({ owner, position, }) {
        const claimTransactions = await this.createClaimBuildMethod({
            owner,
            position,
        });
        if (!claimTransactions.length)
            return;
        const instructions = claimTransactions.map((t) => t.instructions).flat();
        const setCUIx = await (0, helpers_1.getEstimatedComputeUnitIxWithBuffer)(this.program.provider.connection, instructions, owner);
        const { blockhash, lastValidBlockHeight } = await this.program.provider.connection.getLatestBlockhash("confirmed");
        return new web3_js_1.Transaction({
            blockhash,
            lastValidBlockHeight,
            feePayer: owner,
        }).add(setCUIx, ...claimTransactions);
    }
    /**
     * The `claimAllLMRewards` function is used to claim all liquidity mining rewards for a given owner
     * and their positions.
     * @param
     *    - `owner`: The public key of the owner of the positions.
     *    - `positions`: An array of objects of type `PositionData` that represents the positions to claim rewards from.
     * @returns {Promise<Transaction[]>}
     */
    async claimAllLMRewards({ owner, positions, }) {
        const claimAllTxs = (await Promise.all(positions
            .filter(({ positionData: { rewardOne, rewardTwo } }) => !rewardOne.isZero() || !rewardTwo.isZero())
            .map(async (position, idx) => {
            return await this.createClaimBuildMethod({
                owner,
                position,
                shouldIncludePreIx: idx === 0,
            });
        }))).flat();
        const chunkedClaimAllTx = (0, helpers_1.chunks)(claimAllTxs, constants_1.MAX_CLAIM_ALL_ALLOWED);
        if (chunkedClaimAllTx.length === 0)
            return [];
        const setCUIx = await (0, helpers_1.getEstimatedComputeUnitIxWithBuffer)(this.program.provider.connection, 
        // First tx simulation will success because it will create all the ATA. Then, we use the simulated CU as references for the rest
        chunkedClaimAllTx[0].map((t) => t.instructions).flat(), owner);
        const { blockhash, lastValidBlockHeight } = await this.program.provider.connection.getLatestBlockhash("confirmed");
        return Promise.all(chunkedClaimAllTx.map(async (claimAllTx) => {
            return new web3_js_1.Transaction({
                feePayer: owner,
                blockhash,
                lastValidBlockHeight,
            })
                .add(setCUIx)
                .add(...claimAllTx);
        }));
    }
    async setActivationPoint(activationPoint) {
        const setActivationPointTx = await this.program.methods
            .setActivationPoint(activationPoint)
            .accounts({
            lbPair: this.pubkey,
            admin: this.lbPair.creator,
        })
            .transaction();
        const { blockhash, lastValidBlockHeight } = await this.program.provider.connection.getLatestBlockhash("confirmed");
        return new web3_js_1.Transaction({
            feePayer: this.lbPair.creator,
            blockhash,
            lastValidBlockHeight,
        }).add(setActivationPointTx);
    }
    async setPairStatus(enabled) {
        const pairStatus = enabled ? 0 : 1;
        const tx = await this.program.methods.setPairStatus(pairStatus).accounts({
            lbPair: this.pubkey,
            admin: this.lbPair.creator
        }).transaction();
        const { blockhash, lastValidBlockHeight } = await this.program.provider.connection.getLatestBlockhash("confirmed");
        return new web3_js_1.Transaction({
            feePayer: this.lbPair.creator,
            blockhash,
            lastValidBlockHeight,
        }).add(tx);
    }
    /**
     * The function `claimSwapFee` is used to claim swap fees for a specific position owned by a specific owner.
     * @param
     *    - `owner`: The public key of the owner of the position.
     *    - `position`: The public key of the position account.
     * @returns {Promise<Transaction>}
     */
    async claimSwapFee({ owner, position, }) {
        const claimFeeTx = await this.createClaimSwapFeeMethod({ owner, position });
        const { blockhash, lastValidBlockHeight } = await this.program.provider.connection.getLatestBlockhash("confirmed");
        return new web3_js_1.Transaction({
            blockhash,
            lastValidBlockHeight,
            feePayer: owner,
        }).add(claimFeeTx);
    }
    /**
     * The `claimAllSwapFee` function to claim swap fees for multiple positions owned by a specific owner.
     * @param
     *    - `owner`: The public key of the owner of the positions.
     *    - `positions`: An array of objects of type `PositionData` that represents the positions to claim swap fees from.
     * @returns {Promise<Transaction[]>}
     */
    async claimAllSwapFee({ owner, positions, }) {
        const claimAllTxs = (await Promise.all(positions
            .filter(({ positionData: { feeX, feeY } }) => !feeX.isZero() || !feeY.isZero())
            .map(async (position, idx, positions) => {
            return await this.createClaimSwapFeeMethod({
                owner,
                position,
                shouldIncludePretIx: idx === 0,
                shouldIncludePostIx: idx === positions.length - 1,
            });
        }))).flat();
        const chunkedClaimAllTx = (0, helpers_1.chunks)(claimAllTxs, constants_1.MAX_CLAIM_ALL_ALLOWED);
        if (chunkedClaimAllTx.length === 0)
            return [];
        const setCUIx = await (0, helpers_1.getEstimatedComputeUnitIxWithBuffer)(this.program.provider.connection, 
        // First tx simulation will success because it will create all the ATA. Then, we use the simulated CU as references for the rest
        chunkedClaimAllTx[0].map((t) => t.instructions).flat(), owner);
        const { blockhash, lastValidBlockHeight } = await this.program.provider.connection.getLatestBlockhash("confirmed");
        return Promise.all(chunkedClaimAllTx.map(async (claimAllTx) => {
            return new web3_js_1.Transaction({
                feePayer: owner,
                blockhash,
                lastValidBlockHeight,
            })
                .add(setCUIx)
                .add(...claimAllTx);
        }));
    }
    /**
     * The function `claimAllRewardsByPosition` allows a user to claim all rewards for a specific
     * position.
     * @param
     *    - `owner`: The public key of the owner of the position.
     *    - `position`: The public key of the position account.
     * @returns {Promise<Transaction[]>}
     */
    async claimAllRewardsByPosition({ owner, position, }) {
        const preInstructions = [];
        const pairTokens = [this.tokenX.publicKey, this.tokenY.publicKey];
        const tokensInvolved = [...pairTokens];
        for (let i = 0; i < 2; i++) {
            const rewardMint = this.lbPair.rewardInfos[i].mint;
            if (!tokensInvolved.some((pubkey) => rewardMint.equals(pubkey)) &&
                !rewardMint.equals(web3_js_1.PublicKey.default)) {
                tokensInvolved.push(this.lbPair.rewardInfos[i].mint);
            }
        }
        const feeOwner = position.positionData.feeOwner.equals(web3_js_1.PublicKey.default)
            ? owner
            : position.positionData.feeOwner;
        const createATAAccAndIx = await Promise.all(tokensInvolved.map((token) => {
            // Single position. Swap fee only belongs to owner, or the customized fee owner.
            if (pairTokens.some((t) => t.equals(token))) {
                return (0, helpers_1.getOrCreateATAInstruction)(this.program.provider.connection, token, feeOwner, owner);
            }
            // Reward
            return (0, helpers_1.getOrCreateATAInstruction)(this.program.provider.connection, token, owner);
        }));
        createATAAccAndIx.forEach(({ ix }) => ix && preInstructions.push(ix));
        const claimAllSwapFeeTxs = await this.createClaimSwapFeeMethod({
            owner,
            position,
            shouldIncludePostIx: false,
            shouldIncludePretIx: false,
        });
        const claimAllLMTxs = await this.createClaimBuildMethod({
            owner,
            position,
            shouldIncludePreIx: false,
        });
        const claimAllTxs = (0, helpers_1.chunks)([claimAllSwapFeeTxs, ...claimAllLMTxs], constants_1.MAX_CLAIM_ALL_ALLOWED);
        const postInstructions = [];
        if (tokensInvolved.some((pubkey) => pubkey.equals(spl_token_1.NATIVE_MINT))) {
            const closeWrappedSOLIx = await (0, helpers_1.unwrapSOLInstruction)(owner);
            closeWrappedSOLIx && postInstructions.push(closeWrappedSOLIx);
        }
        const { blockhash, lastValidBlockHeight } = await this.program.provider.connection.getLatestBlockhash("confirmed");
        return Promise.all(claimAllTxs.map(async (claimAllTx) => {
            const mainInstructions = claimAllTx.map((t) => t.instructions).flat();
            const instructions = [
                ...preInstructions,
                ...mainInstructions,
                ...postInstructions,
            ];
            const setCUIx = await (0, helpers_1.getEstimatedComputeUnitIxWithBuffer)(this.program.provider.connection, instructions, owner);
            const tx = new web3_js_1.Transaction({
                feePayer: owner,
                blockhash,
                lastValidBlockHeight,
            }).add(setCUIx);
            if (preInstructions.length)
                tx.add(...preInstructions);
            tx.add(...claimAllTx);
            if (postInstructions.length)
                tx.add(...postInstructions);
            return tx;
        }));
    }
    /**
     * The `seedLiquidity` function create multiple grouped instructions. The grouped instructions will be either [initialize bin array + initialize position instructions] or [deposit instruction] combination.
     * @param
     *    - `owner`: The public key of the positions owner.
     *    - `seedAmount`: Lamport amount to be seeded to the pool.
     *    - `minPrice`: Start price in UI format
     *    - `maxPrice`: End price in UI format
     *    - `base`: Base key
     * @returns {Promise<SeedLiquidityResponse>}
     */
    async seedLiquidity(owner, seedAmount, curvature, minPrice, maxPrice, base) {
        const toLamportMultiplier = new decimal_js_1.default(10 ** (this.tokenY.decimal - this.tokenX.decimal));
        const minPricePerLamport = new decimal_js_1.default(minPrice).mul(toLamportMultiplier);
        const maxPricePerLamport = new decimal_js_1.default(maxPrice).mul(toLamportMultiplier);
        const minBinId = new anchor_1.BN(DLMM.getBinIdFromPrice(minPricePerLamport, this.lbPair.binStep, false));
        const maxBinId = new anchor_1.BN(DLMM.getBinIdFromPrice(maxPricePerLamport, this.lbPair.binStep, true));
        if (minBinId.toNumber() < this.lbPair.activeId) {
            throw new Error("minPrice < current pair price");
        }
        if (minBinId.toNumber() >= maxBinId.toNumber()) {
            throw new Error("Price range too small");
        }
        // Generate amount for each bin
        const k = 1.0 / curvature;
        const binDepositAmount = (0, math_1.generateAmountForBinRange)(seedAmount, this.lbPair.binStep, this.tokenX.decimal, this.tokenY.decimal, minBinId, maxBinId, k);
        const decompressMultiplier = new anchor_1.BN(10 ** this.tokenX.decimal);
        let { compressedBinAmount, compressionLoss } = (0, math_1.compressBinAmount)(binDepositAmount, decompressMultiplier);
        // Distribute loss after compression back to bins based on bin ratio with total deposited amount
        let { newCompressedBinAmount: compressedBinDepositAmount, loss: finalLoss, } = (0, math_1.distributeAmountToCompressedBinsByRatio)(compressedBinAmount, compressionLoss, decompressMultiplier, new anchor_1.BN(2 ** 32 - 1) // u32
        );
        // This amount will be deposited to the last bin without compression
        const positionCount = (0, math_1.getPositionCount)(minBinId, maxBinId.sub(new anchor_1.BN(1)));
        const seederTokenX = (0, spl_token_1.getAssociatedTokenAddressSync)(this.lbPair.tokenXMint, owner, false);
        const initializeBinArraysAndPositionIxs = [];
        const addLiquidityIxs = [];
        const appendedInitBinArrayIx = new Set();
        for (let i = 0; i < positionCount.toNumber(); i++) {
            const lowerBinId = minBinId.add(constants_1.MAX_BIN_PER_POSITION.mul(new anchor_1.BN(i)));
            const upperBinId = lowerBinId.add(constants_1.MAX_BIN_PER_POSITION).sub(new anchor_1.BN(1));
            const lowerBinArrayIndex = (0, helpers_1.binIdToBinArrayIndex)(lowerBinId);
            const upperBinArrayIndex = (0, helpers_1.binIdToBinArrayIndex)(upperBinId);
            const [positionPda, _bump] = (0, helpers_1.derivePosition)(this.pubkey, base, lowerBinId, constants_1.MAX_BIN_PER_POSITION, this.program.programId);
            const [lowerBinArray] = (0, helpers_1.deriveBinArray)(this.pubkey, lowerBinArrayIndex, this.program.programId);
            const [upperBinArray] = (0, helpers_1.deriveBinArray)(this.pubkey, upperBinArrayIndex, this.program.programId);
            const accounts = await this.program.provider.connection.getMultipleAccountsInfo([
                lowerBinArray,
                upperBinArray,
                positionPda,
            ]);
            let instructions = [];
            const lowerBinArrayAccount = accounts[0];
            if (!lowerBinArrayAccount &&
                !appendedInitBinArrayIx.has(lowerBinArray.toBase58())) {
                instructions.push(await this.program.methods
                    .initializeBinArray(lowerBinArrayIndex)
                    .accounts({
                    lbPair: this.pubkey,
                    binArray: lowerBinArray,
                    funder: owner,
                })
                    .instruction());
                appendedInitBinArrayIx.add(lowerBinArray.toBase58());
            }
            const upperBinArrayAccount = accounts[1];
            if (!upperBinArrayAccount &&
                !appendedInitBinArrayIx.has(upperBinArray.toBase58())) {
                instructions.push(await this.program.methods
                    .initializeBinArray(upperBinArrayIndex)
                    .accounts({
                    lbPair: this.pubkey,
                    binArray: upperBinArray,
                    funder: owner,
                })
                    .instruction());
                appendedInitBinArrayIx.add(upperBinArray.toBase58());
            }
            const positionAccount = accounts[2];
            if (!positionAccount) {
                instructions.push(await this.program.methods
                    .initializePositionPda(lowerBinId.toNumber(), constants_1.MAX_BIN_PER_POSITION.toNumber())
                    .accounts({
                    lbPair: this.pubkey,
                    position: positionPda,
                    base,
                    owner,
                    payer: owner,
                })
                    .instruction());
            }
            // Initialize bin arrays and initialize position account in 1 tx
            if (instructions.length > 1) {
                instructions.push(await (0, helpers_1.getEstimatedComputeUnitIxWithBuffer)(this.program.provider.connection, instructions, owner));
                initializeBinArraysAndPositionIxs.push(instructions);
                instructions = [];
            }
            const positionDeposited = positionAccount &&
                this.program.coder.accounts
                    .decode("positionV2", positionAccount.data)
                    .liquidityShares.reduce((total, cur) => total.add(cur), new anchor_1.BN(0))
                    .gt(new anchor_1.BN(0));
            if (!positionDeposited) {
                const cappedUpperBinId = Math.min(upperBinId.toNumber(), maxBinId.toNumber() - 1);
                const bins = [];
                for (let i = lowerBinId.toNumber(); i <= cappedUpperBinId; i++) {
                    bins.push({
                        binId: i,
                        amount: compressedBinDepositAmount.get(i).toNumber(),
                    });
                }
                instructions.push(await this.program.methods
                    .addLiquidityOneSidePrecise({
                    bins,
                    decompressMultiplier,
                })
                    .accounts({
                    position: positionPda,
                    lbPair: this.pubkey,
                    binArrayBitmapExtension: this.binArrayBitmapExtension
                        ? this.binArrayBitmapExtension.publicKey
                        : this.program.programId,
                    userToken: seederTokenX,
                    reserve: this.lbPair.reserveX,
                    tokenMint: this.lbPair.tokenXMint,
                    binArrayLower: lowerBinArray,
                    binArrayUpper: upperBinArray,
                    sender: owner,
                })
                    .instruction());
                // Last position
                if (i + 1 >= positionCount.toNumber() && !finalLoss.isZero()) {
                    instructions.push(await this.program.methods
                        .addLiquidityOneSide({
                        amount: finalLoss,
                        activeId: this.lbPair.activeId,
                        maxActiveBinSlippage: 0,
                        binLiquidityDist: [
                            {
                                binId: cappedUpperBinId,
                                weight: 1,
                            },
                        ],
                    })
                        .accounts({
                        position: positionPda,
                        lbPair: this.pubkey,
                        binArrayBitmapExtension: this.binArrayBitmapExtension
                            ? this.binArrayBitmapExtension.publicKey
                            : this.program.programId,
                        userToken: seederTokenX,
                        reserve: this.lbPair.reserveX,
                        tokenMint: this.lbPair.tokenXMint,
                        binArrayLower: lowerBinArray,
                        binArrayUpper: upperBinArray,
                        sender: owner,
                    })
                        .instruction());
                }
                addLiquidityIxs.push([
                    web3_js_1.ComputeBudgetProgram.setComputeUnitLimit({
                        units: computeUnit_1.DEFAULT_ADD_LIQUIDITY_CU,
                    }),
                    ...instructions,
                ]);
            }
        }
        return {
            initializeBinArraysAndPositionIxs,
            addLiquidityIxs,
        };
    }
    /**
   * The `seedLiquidity` function create multiple grouped instructions. The grouped instructions will be either [initialize bin array + initialize position instructions] or [deposit instruction] combination.
   * @param
   *    - `payer`: The public key of the tx payer.
   *    - `base`: Base key
   *    - `seedAmount`: Token X lamport amount to be seeded to the pool.
   *    - `price`: TokenX/TokenY Price in UI format
   *    - `roundingUp`: Whether to round up the price
   *    - `positionOwner`: The owner of the position
   *    - `feeOwner`: Position fee owner
   *    - `operator`: Operator of the position. Operator able to manage the position on behalf of the position owner. However, liquidity withdrawal issue by the operator can only send to the position owner.
   *    - `lockReleasePoint`: The lock release point of the position.
   *    - `shouldSeedPositionOwner` (optional): Whether to send 1 lamport amount of token X to the position owner to prove ownership.
   *
   * The returned instructions need to be executed sequentially if it was separated into multiple transactions.
   * @returns {Promise<TransactionInstruction[]>}
   */
    async seedLiquiditySingleBin(payer, base, seedAmount, price, roundingUp, positionOwner, feeOwner, operator, lockReleasePoint, shouldSeedPositionOwner = false) {
        const pricePerLamport = DLMM.getPricePerLamport(this.tokenX.decimal, this.tokenY.decimal, price);
        const binIdNumber = DLMM.getBinIdFromPrice(pricePerLamport, this.lbPair.binStep, !roundingUp);
        const binId = new anchor_1.BN(binIdNumber);
        const lowerBinArrayIndex = (0, helpers_1.binIdToBinArrayIndex)(binId);
        const upperBinArrayIndex = lowerBinArrayIndex.add(new anchor_1.BN(1));
        const [lowerBinArray] = (0, helpers_1.deriveBinArray)(this.pubkey, lowerBinArrayIndex, this.program.programId);
        const [upperBinArray] = (0, helpers_1.deriveBinArray)(this.pubkey, upperBinArrayIndex, this.program.programId);
        const [positionPda] = (0, helpers_1.derivePosition)(this.pubkey, base, binId, new anchor_1.BN(1), this.program.programId);
        const preInstructions = [];
        const [{ ataPubKey: userTokenX, ix: createPayerTokenXIx }, { ataPubKey: userTokenY, ix: createPayerTokenYIx },] = await Promise.all([
            (0, helpers_1.getOrCreateATAInstruction)(this.program.provider.connection, this.tokenX.publicKey, operator, payer),
            (0, helpers_1.getOrCreateATAInstruction)(this.program.provider.connection, this.tokenY.publicKey, operator, payer),
        ]);
        // create userTokenX and userTokenY accounts
        createPayerTokenXIx && preInstructions.push(createPayerTokenXIx);
        createPayerTokenYIx && preInstructions.push(createPayerTokenYIx);
        let [binArrayBitmapExtension] = (0, helpers_1.deriveBinArrayBitmapExtension)(this.pubkey, this.program.programId);
        const accounts = await this.program.provider.connection.getMultipleAccountsInfo([
            lowerBinArray,
            upperBinArray,
            positionPda,
            binArrayBitmapExtension,
        ]);
        if ((0, helpers_1.isOverflowDefaultBinArrayBitmap)(lowerBinArrayIndex)) {
            const bitmapExtensionAccount = accounts[3];
            if (!bitmapExtensionAccount) {
                preInstructions.push(await this.program.methods.initializeBinArrayBitmapExtension().accounts({
                    binArrayBitmapExtension,
                    funder: payer,
                    lbPair: this.pubkey
                }).instruction());
            }
        }
        else {
            binArrayBitmapExtension = this.program.programId;
        }
        const operatorTokenX = (0, spl_token_1.getAssociatedTokenAddressSync)(this.lbPair.tokenXMint, operator, true);
        const positionOwnerTokenX = (0, spl_token_1.getAssociatedTokenAddressSync)(this.lbPair.tokenXMint, positionOwner, true);
        if (shouldSeedPositionOwner) {
            const positionOwnerTokenXAccount = await this.program.provider.connection.getAccountInfo(positionOwnerTokenX);
            if (positionOwnerTokenXAccount) {
                const account = spl_token_1.AccountLayout.decode(positionOwnerTokenXAccount.data);
                if (account.amount == BigInt(0)) {
                    // send 1 lamport to position owner token X to prove ownership
                    const transferIx = (0, spl_token_1.createTransferInstruction)(operatorTokenX, positionOwnerTokenX, payer, 1);
                    preInstructions.push(transferIx);
                }
            }
            else {
                const createPositionOwnerTokenXIx = (0, spl_token_1.createAssociatedTokenAccountInstruction)(payer, positionOwnerTokenX, positionOwner, this.lbPair.tokenXMint);
                preInstructions.push(createPositionOwnerTokenXIx);
                // send 1 lamport to position owner token X to prove ownership
                const transferIx = (0, spl_token_1.createTransferInstruction)(operatorTokenX, positionOwnerTokenX, payer, 1);
                preInstructions.push(transferIx);
            }
        }
        const lowerBinArrayAccount = accounts[0];
        const upperBinArrayAccount = accounts[1];
        const positionAccount = accounts[2];
        if (!lowerBinArrayAccount) {
            preInstructions.push(await this.program.methods
                .initializeBinArray(lowerBinArrayIndex)
                .accounts({
                binArray: lowerBinArray,
                funder: payer,
                lbPair: this.pubkey,
            })
                .instruction());
        }
        if (!upperBinArrayAccount) {
            preInstructions.push(await this.program.methods
                .initializeBinArray(upperBinArrayIndex)
                .accounts({
                binArray: upperBinArray,
                funder: payer,
                lbPair: this.pubkey,
            })
                .instruction());
        }
        if (!positionAccount) {
            preInstructions.push(await this.program.methods
                .initializePositionByOperator(binId.toNumber(), 1, feeOwner, lockReleasePoint)
                .accounts({
                payer,
                base,
                position: positionPda,
                lbPair: this.pubkey,
                owner: positionOwner,
                operator,
                operatorTokenX,
                ownerTokenX: positionOwnerTokenX,
            })
                .instruction());
        }
        const binLiquidityDist = {
            binId: binIdNumber,
            distributionX: constants_1.BASIS_POINT_MAX,
            distributionY: 0,
        };
        const addLiquidityParams = {
            amountX: seedAmount,
            amountY: new anchor_1.BN(0),
            binLiquidityDist: [binLiquidityDist],
        };
        const depositLiquidityIx = await this.program.methods.addLiquidity(addLiquidityParams).accounts({
            position: positionPda,
            lbPair: this.pubkey,
            binArrayBitmapExtension,
            userTokenX,
            userTokenY,
            reserveX: this.lbPair.reserveX,
            reserveY: this.lbPair.reserveY,
            tokenXMint: this.lbPair.tokenXMint,
            tokenYMint: this.lbPair.tokenYMint,
            binArrayLower: lowerBinArray,
            binArrayUpper: upperBinArray,
            sender: operator,
            tokenXProgram: spl_token_1.TOKEN_PROGRAM_ID,
            tokenYProgram: spl_token_1.TOKEN_PROGRAM_ID,
        }).instruction();
        return [...preInstructions, depositLiquidityIx];
    }
    /**
     * Initializes bin arrays for the given bin array indexes if it wasn't initialized.
     *
     * @param {BN[]} binArrayIndexes - An array of bin array indexes to initialize.
     * @param {PublicKey} funder - The public key of the funder.
     * @return {Promise<TransactionInstruction[]>} An array of transaction instructions to initialize the bin arrays.
     */
    async initializeBinArrays(binArrayIndexes, funder) {
        const ixs = [];
        for (const idx of binArrayIndexes) {
            const [binArray] = (0, helpers_1.deriveBinArray)(this.pubkey, idx, this.program.programId);
            const binArrayAccount = await this.program.provider.connection.getAccountInfo(binArray);
            if (binArrayAccount === null) {
                ixs.push(await this.program.methods
                    .initializeBinArray(idx)
                    .accounts({
                    binArray,
                    funder,
                    lbPair: this.pubkey,
                })
                    .instruction());
            }
        }
        return ixs;
    }
    /**
     *
     * @param
     *    - `lowerBinId`: Lower bin ID of the position. This represent the lowest price of the position
     *    - `positionWidth`: Width of the position. This will decide the upper bin id of the position, which represents the highest price of the position. UpperBinId = lowerBinId + positionWidth
     *    - `owner`: Owner of the position.
     *    - `operator`: Operator of the position. Operator able to manage the position on behalf of the position owner. However, liquidity withdrawal issue by the operator can only send to the position owner.
     *    - `base`: Base key
     *    - `feeOwner`: Owner of the fees earned by the position.
     *    - `payer`: Payer for the position account rental.
     *    - `lockReleasePoint`: The lock release point of the position.
     * @returns
     */
    async initializePositionByOperator({ lowerBinId, positionWidth, owner, feeOwner, base, operator, payer, lockReleasePoint, }) {
        const [positionPda, _bump] = (0, helpers_1.derivePosition)(this.pubkey, base, lowerBinId, positionWidth, this.program.programId);
        const operatorTokenX = (0, spl_token_1.getAssociatedTokenAddressSync)(this.lbPair.tokenXMint, operator, true);
        const ownerTokenX = (0, spl_token_1.getAssociatedTokenAddressSync)(this.lbPair.tokenXMint, owner, true);
        const initializePositionByOperatorTx = await this.program.methods
            .initializePositionByOperator(lowerBinId.toNumber(), constants_1.MAX_BIN_PER_POSITION.toNumber(), feeOwner, lockReleasePoint)
            .accounts({
            lbPair: this.pubkey,
            position: positionPda,
            base,
            operator,
            owner,
            ownerTokenX,
            operatorTokenX,
            payer,
        })
            .transaction();
        const { blockhash, lastValidBlockHeight } = await this.program.provider.connection.getLatestBlockhash("confirmed");
        return new web3_js_1.Transaction({
            feePayer: operator,
            blockhash,
            lastValidBlockHeight,
        }).add(initializePositionByOperatorTx);
    }
    /**
     * The `claimAllRewards` function to claim swap fees and LM rewards for multiple positions owned by a specific owner.
     * @param
     *    - `owner`: The public key of the owner of the positions.
     *    - `positions`: An array of objects of type `PositionData` that represents the positions to claim swap fees and LM rewards from.
     * @returns {Promise<Transaction[]>}
     */
    async claimAllRewards({ owner, positions, }) {
        const preInstructions = [];
        const pairsToken = [this.tokenX.publicKey, this.tokenY.publicKey];
        const tokensInvolved = [...pairsToken];
        for (let i = 0; i < 2; i++) {
            const rewardMint = this.lbPair.rewardInfos[i].mint;
            if (!tokensInvolved.some((pubkey) => rewardMint.equals(pubkey)) &&
                !rewardMint.equals(web3_js_1.PublicKey.default)) {
                tokensInvolved.push(this.lbPair.rewardInfos[i].mint);
            }
        }
        // Filter only position with fees and/or rewards
        positions = positions.filter(({ positionData: { feeX, feeY, rewardOne, rewardTwo } }) => !feeX.isZero() ||
            !feeY.isZero() ||
            !rewardOne.isZero() ||
            !rewardTwo.isZero());
        const feeOwners = [
            ...new Set([
                owner.toBase58(),
                ...positions
                    .filter((p) => !p.positionData.feeOwner.equals(web3_js_1.PublicKey.default))
                    .map((p) => p.positionData.feeOwner.toBase58()),
            ]),
        ].map((pk) => new web3_js_1.PublicKey(pk));
        const createATAAccAndIx = await Promise.all(tokensInvolved
            .map((token) => {
            // There's multiple positions, therefore swap fee ATA might includes account from owner, and customized fee owners
            if (pairsToken.some((p) => p.equals(token))) {
                return feeOwners.map((customOwner) => (0, helpers_1.getOrCreateATAInstruction)(this.program.provider.connection, token, customOwner, owner));
            }
            //
            return [
                (0, helpers_1.getOrCreateATAInstruction)(this.program.provider.connection, token, owner),
            ];
        })
            .flat());
        createATAAccAndIx.forEach(({ ix }) => ix && preInstructions.push(ix));
        const claimAllSwapFeeTxs = (await Promise.all(positions
            .filter(({ positionData: { feeX, feeY } }) => !feeX.isZero() || !feeY.isZero())
            .map(async (position) => {
            return await this.createClaimSwapFeeMethod({
                owner,
                position,
                shouldIncludePretIx: false,
                shouldIncludePostIx: false,
            });
        }))).flat();
        const claimAllLMTxs = (await Promise.all(positions
            .filter(({ positionData: { rewardOne, rewardTwo } }) => !rewardOne.isZero() || !rewardTwo.isZero())
            .map(async (position) => {
            return await this.createClaimBuildMethod({
                owner,
                position,
                shouldIncludePreIx: false,
            });
        }))).flat();
        const chunkedClaimAllTx = (0, helpers_1.chunks)([...claimAllSwapFeeTxs, ...claimAllLMTxs], constants_1.MAX_CLAIM_ALL_ALLOWED);
        const postInstructions = [];
        if (tokensInvolved.some((pubkey) => pubkey.equals(spl_token_1.NATIVE_MINT))) {
            const closeWrappedSOLIx = await (0, helpers_1.unwrapSOLInstruction)(owner);
            closeWrappedSOLIx && postInstructions.push(closeWrappedSOLIx);
        }
        const { blockhash, lastValidBlockHeight } = await this.program.provider.connection.getLatestBlockhash("confirmed");
        return Promise.all(chunkedClaimAllTx.map(async (claimAllTx) => {
            const mainIxs = claimAllTx.map((t) => t.instructions).flat();
            const instructions = [
                ...preInstructions,
                ...mainIxs,
                ...postInstructions,
            ];
            const setCUIx = await (0, helpers_1.getEstimatedComputeUnitIxWithBuffer)(this.program.provider.connection, instructions, owner);
            const tx = new web3_js_1.Transaction({
                feePayer: owner,
                blockhash,
                lastValidBlockHeight,
            }).add(setCUIx);
            if (preInstructions.length)
                tx.add(...preInstructions);
            tx.add(...claimAllTx);
            if (postInstructions.length)
                tx.add(...postInstructions);
            return tx;
        }));
    }
    canSyncWithMarketPrice(marketPrice, activeBinId) {
        const marketPriceBinId = this.getBinIdFromPrice(Number(DLMM.getPricePerLamport(this.tokenX.decimal, this.tokenY.decimal, marketPrice)), false);
        const marketPriceBinArrayIndex = (0, helpers_1.binIdToBinArrayIndex)(new anchor_1.BN(marketPriceBinId));
        const swapForY = marketPriceBinId < activeBinId;
        const toBinArrayIndex = (0, helpers_1.findNextBinArrayIndexWithLiquidity)(swapForY, new anchor_1.BN(activeBinId), this.lbPair, this.binArrayBitmapExtension?.account ?? null);
        if (toBinArrayIndex === null)
            return true;
        return swapForY
            ? marketPriceBinArrayIndex.gt(toBinArrayIndex)
            : marketPriceBinArrayIndex.lt(toBinArrayIndex);
    }
    /**
     * The `syncWithMarketPrice` function is used to sync the liquidity pool with the market price.
     * @param
     *    - `marketPrice`: The market price to sync with.
     *    - `owner`: The public key of the owner of the liquidity pool.
     * @returns {Promise<Transaction>}
     */
    async syncWithMarketPrice(marketPrice, owner) {
        const marketPriceBinId = this.getBinIdFromPrice(Number(DLMM.getPricePerLamport(this.tokenX.decimal, this.tokenY.decimal, marketPrice)), false);
        const activeBin = await this.getActiveBin();
        const activeBinId = activeBin.binId;
        if (!this.canSyncWithMarketPrice(marketPrice, activeBinId)) {
            throw new Error("Unable to sync with market price due to bin with liquidity between current and market price bin");
        }
        const fromBinArrayIndex = (0, helpers_1.binIdToBinArrayIndex)(new anchor_1.BN(activeBinId));
        const swapForY = marketPriceBinId < activeBinId;
        const toBinArrayIndex = (0, helpers_1.findNextBinArrayIndexWithLiquidity)(swapForY, new anchor_1.BN(activeBinId), this.lbPair, this.binArrayBitmapExtension?.account ?? null);
        const accountsToFetch = [];
        const [binArrayBitMapExtensionPubkey] = (0, helpers_1.deriveBinArrayBitmapExtension)(this.pubkey, this.program.programId);
        accountsToFetch.push(binArrayBitMapExtensionPubkey);
        const [fromBinArrayPubkey] = (0, helpers_1.deriveBinArray)(this.pubkey, fromBinArrayIndex, this.program.programId);
        accountsToFetch.push(fromBinArrayPubkey);
        const toBinArrayPubkey = (() => {
            if (!toBinArrayIndex)
                return null;
            const [toBinArrayPubkey] = (0, helpers_1.deriveBinArray)(this.pubkey, toBinArrayIndex, this.program.programId);
            accountsToFetch.push(toBinArrayPubkey);
            return toBinArrayPubkey;
        })();
        const binArrayAccounts = await this.program.provider.connection.getMultipleAccountsInfo(accountsToFetch);
        let fromBinArray = null;
        let toBinArray = null;
        let binArrayBitmapExtension = null;
        if (!!binArrayAccounts?.[0]) {
            binArrayBitmapExtension = binArrayBitMapExtensionPubkey;
        }
        if (!!binArrayAccounts?.[1]) {
            fromBinArray = fromBinArrayPubkey;
        }
        if (!!binArrayAccounts?.[2] && !!toBinArrayIndex) {
            toBinArray = toBinArrayPubkey;
        }
        const { blockhash, lastValidBlockHeight } = await this.program.provider.connection.getLatestBlockhash("confirmed");
        const syncWithMarketPriceTx = await this.program.methods
            .goToABin(marketPriceBinId)
            .accounts({
            lbPair: this.pubkey,
            binArrayBitmapExtension,
            fromBinArray,
            toBinArray,
        })
            .transaction();
        return new web3_js_1.Transaction({
            feePayer: owner,
            blockhash,
            lastValidBlockHeight,
        }).add(syncWithMarketPriceTx);
    }
    async getMaxPriceInBinArrays(binArrayAccounts) {
        // Don't mutate
        const sortedBinArrays = [...binArrayAccounts].sort(({ account: { index: indexA } }, { account: { index: indexB } }) => indexA.toNumber() - indexB.toNumber());
        let count = sortedBinArrays.length - 1;
        let binPriceWithLastLiquidity;
        while (count >= 0) {
            const binArray = sortedBinArrays[count];
            if (binArray) {
                const bins = binArray.account.bins;
                if (bins.every(({ amountX }) => amountX.isZero())) {
                    count--;
                }
                else {
                    const lastBinWithLiquidityIndex = bins.findLastIndex(({ amountX }) => !amountX.isZero());
                    binPriceWithLastLiquidity =
                        bins[lastBinWithLiquidityIndex].price.toString();
                    count = -1;
                }
            }
        }
        return this.fromPricePerLamport(Number(binPriceWithLastLiquidity) / (2 ** 64 - 1));
    }
    getAmountOutWithdrawSingleSide(maxLiquidityShare, price, bin, isWithdrawForY) {
        const amountX = (0, math_1.mulDiv)(maxLiquidityShare, bin.amountX, bin.liquiditySupply, math_1.Rounding.Down);
        const amountY = (0, math_1.mulDiv)(maxLiquidityShare, bin.amountY, bin.liquiditySupply, math_1.Rounding.Down);
        const amount0 = isWithdrawForY ? amountX : amountY;
        const amount1 = isWithdrawForY ? amountY : amountX;
        const remainAmountX = bin.amountX.sub(amountX);
        const remainAmountY = bin.amountY.sub(amountY);
        if (amount0.eq(new anchor_1.BN(0))) {
            return {
                withdrawAmount: amount1,
            };
        }
        let maxAmountOut = isWithdrawForY ? remainAmountY : remainAmountX;
        let maxAmountIn = isWithdrawForY
            ? (0, math_1.shlDiv)(remainAmountY, price, constants_1.SCALE_OFFSET, math_1.Rounding.Up)
            : (0, math_1.mulShr)(remainAmountX, price, constants_1.SCALE_OFFSET, math_1.Rounding.Up);
        let maxFee = (0, helpers_1.computeFee)(this.lbPair.binStep, this.lbPair.parameters, this.lbPair.vParameters, maxAmountIn);
        maxAmountIn = maxAmountIn.add(maxFee);
        if (amount0.gt(maxAmountIn)) {
            return {
                withdrawAmount: amount1.add(maxAmountOut),
            };
        }
        const fee = (0, helpers_1.computeFeeFromAmount)(this.lbPair.binStep, this.lbPair.parameters, this.lbPair.vParameters, amount0);
        const amount0AfterFee = amount0.sub(fee);
        const amountOut = isWithdrawForY
            ? (0, math_1.mulShr)(price, amount0AfterFee, constants_1.SCALE_OFFSET, math_1.Rounding.Down)
            : (0, math_1.shlDiv)(amount0AfterFee, price, constants_1.SCALE_OFFSET, math_1.Rounding.Down);
        return {
            withdrawAmount: amount1.add(amountOut),
        };
    }
    async getWithdrawSingleSideAmount(positionPubkey, isWithdrawForY) {
        let totalWithdrawAmount = new anchor_1.BN(0);
        let lowerBinArray;
        let upperBinArray;
        const position = await this.program.account.positionV2.fetch(positionPubkey);
        const lowerBinArrayIdx = (0, helpers_1.binIdToBinArrayIndex)(new anchor_1.BN(position.lowerBinId));
        const [lowerBinArrayPubKey] = (0, helpers_1.deriveBinArray)(position.lbPair, lowerBinArrayIdx, this.program.programId);
        const upperBinArrayIdx = lowerBinArrayIdx.add(new anchor_1.BN(1));
        const [upperBinArrayPubKey] = (0, helpers_1.deriveBinArray)(position.lbPair, upperBinArrayIdx, this.program.programId);
        [lowerBinArray, upperBinArray] =
            await this.program.account.binArray.fetchMultiple([
                lowerBinArrayPubKey,
                upperBinArrayPubKey,
            ]);
        for (let idx = 0; idx < position.liquidityShares.length; idx++) {
            const shareToRemove = position.liquidityShares[idx];
            if (shareToRemove.eq(new anchor_1.BN(0))) {
                continue;
            }
            const binId = new anchor_1.BN(position.lowerBinId).add(new anchor_1.BN(idx));
            const binArrayIndex = (0, helpers_1.binIdToBinArrayIndex)(binId);
            const binArray = binArrayIndex.eq(lowerBinArrayIdx)
                ? lowerBinArray
                : upperBinArray;
            if (!binArray) {
                throw new Error("BinArray not found");
            }
            const bin = (0, helpers_1.getBinFromBinArray)(binId.toNumber(), binArray);
            if (isWithdrawForY) {
                if (binId.gt(new anchor_1.BN(this.lbPair.activeId))) {
                    break;
                }
            }
            else {
                if (binId.lt(new anchor_1.BN(this.lbPair.activeId))) {
                    continue;
                }
            }
            const price = (0, math_1.getQPriceFromId)(binId, new anchor_1.BN(this.lbPair.binStep));
            const { withdrawAmount } = this.getAmountOutWithdrawSingleSide(shareToRemove, price, bin, isWithdrawForY);
            totalWithdrawAmount = totalWithdrawAmount.add(withdrawAmount);
        }
        return totalWithdrawAmount;
    }
    /**
     *
     * @param swapInitiator Address of the swap initiator
     * @returns
     */
    isSwapDisabled(swapInitiator) {
        if (this.lbPair.status == types_1.PairStatus.Disabled) {
            return true;
        }
        if (this.lbPair.pairType == types_1.PairType.Permissioned) {
            const currentPoint = this.lbPair.activationType == types_1.ActivationType.Slot
                ? this.clock.slot
                : this.clock.unixTimestamp;
            const preActivationSwapPoint = this.lbPair.activationPoint.sub(this.lbPair.preActivationDuration);
            const activationPoint = !this.lbPair.preActivationSwapAddress.equals(web3_js_1.PublicKey.default) &&
                this.lbPair.preActivationSwapAddress.equals(swapInitiator)
                ? preActivationSwapPoint
                : this.lbPair.activationPoint;
            if (currentPoint < activationPoint) {
                return true;
            }
        }
        return false;
    }
    /** Private static method */
    static async getBinArrays(program, lbPairPubkey) {
        return program.account.binArray.all([
            {
                memcmp: {
                    bytes: bytes_1.bs58.encode(lbPairPubkey.toBuffer()),
                    offset: 8 + 16,
                },
            },
        ]);
    }
    static async getClaimableLMReward(program, positionVersion, lbPair, onChainTimestamp, position, lowerBinArray, upperBinArray) {
        const lowerBinArrayIdx = (0, helpers_1.binIdToBinArrayIndex)(new anchor_1.BN(position.lowerBinId));
        let rewards = [new anchor_1.BN(0), new anchor_1.BN(0)];
        let _lowerBinArray = lowerBinArray;
        let _upperBinArray = upperBinArray;
        if (!lowerBinArray || !upperBinArray) {
            const lowerBinArrayIdx = (0, helpers_1.binIdToBinArrayIndex)(new anchor_1.BN(position.lowerBinId));
            const [lowerBinArray] = (0, helpers_1.deriveBinArray)(position.lbPair, lowerBinArrayIdx, program.programId);
            const upperBinArrayIdx = lowerBinArrayIdx.add(new anchor_1.BN(1));
            const [upperBinArray] = (0, helpers_1.deriveBinArray)(position.lbPair, upperBinArrayIdx, program.programId);
            [_lowerBinArray, _upperBinArray] =
                await program.account.binArray.fetchMultiple([
                    lowerBinArray,
                    upperBinArray,
                ]);
        }
        if (!_lowerBinArray || !_upperBinArray)
            throw new Error("BinArray not found");
        for (let i = position.lowerBinId; i <= position.upperBinId; i++) {
            const binArrayIdx = (0, helpers_1.binIdToBinArrayIndex)(new anchor_1.BN(i));
            const binArray = binArrayIdx.eq(lowerBinArrayIdx)
                ? _lowerBinArray
                : _upperBinArray;
            const binState = (0, helpers_1.getBinFromBinArray)(i, binArray);
            const binIdxInPosition = i - position.lowerBinId;
            const positionRewardInfo = position.rewardInfos[binIdxInPosition];
            const liquidityShare = positionVersion === types_1.PositionVersion.V1
                ? position.liquidityShares[binIdxInPosition]
                : position.liquidityShares[binIdxInPosition].shrn(64);
            for (let j = 0; j < 2; j++) {
                const pairRewardInfo = lbPair.rewardInfos[j];
                if (!pairRewardInfo.mint.equals(web3_js_1.PublicKey.default)) {
                    let rewardPerTokenStored = binState.rewardPerTokenStored[j];
                    if (i == lbPair.activeId && !binState.liquiditySupply.isZero()) {
                        const currentTime = new anchor_1.BN(Math.min(onChainTimestamp, pairRewardInfo.rewardDurationEnd.toNumber()));
                        const delta = currentTime.sub(pairRewardInfo.lastUpdateTime);
                        const liquiditySupply = binArray.version == 0
                            ? binState.liquiditySupply
                            : binState.liquiditySupply.shrn(64);
                        const rewardPerTokenStoredDelta = pairRewardInfo.rewardRate
                            .mul(delta)
                            .div(new anchor_1.BN(15))
                            .div(liquiditySupply);
                        rewardPerTokenStored = rewardPerTokenStored.add(rewardPerTokenStoredDelta);
                    }
                    const delta = rewardPerTokenStored.sub(positionRewardInfo.rewardPerTokenCompletes[j]);
                    const newReward = (0, math_1.mulShr)(delta, liquidityShare, constants_1.SCALE_OFFSET, math_1.Rounding.Down);
                    rewards[j] = rewards[j]
                        .add(newReward)
                        .add(positionRewardInfo.rewardPendings[j]);
                }
            }
        }
        return {
            rewardOne: rewards[0],
            rewardTwo: rewards[1],
        };
    }
    static async getClaimableSwapFee(program, positionVersion, position, lowerBinArray, upperBinArray) {
        const lowerBinArrayIdx = (0, helpers_1.binIdToBinArrayIndex)(new anchor_1.BN(position.lowerBinId));
        let feeX = new anchor_1.BN(0);
        let feeY = new anchor_1.BN(0);
        let _lowerBinArray = lowerBinArray;
        let _upperBinArray = upperBinArray;
        if (!lowerBinArray || !upperBinArray) {
            const lowerBinArrayIdx = (0, helpers_1.binIdToBinArrayIndex)(new anchor_1.BN(position.lowerBinId));
            const [lowerBinArray] = (0, helpers_1.deriveBinArray)(position.lbPair, lowerBinArrayIdx, program.programId);
            const upperBinArrayIdx = lowerBinArrayIdx.add(new anchor_1.BN(1));
            const [upperBinArray] = (0, helpers_1.deriveBinArray)(position.lbPair, upperBinArrayIdx, program.programId);
            [_lowerBinArray, _upperBinArray] =
                await program.account.binArray.fetchMultiple([
                    lowerBinArray,
                    upperBinArray,
                ]);
        }
        if (!_lowerBinArray || !_upperBinArray)
            throw new Error("BinArray not found");
        for (let i = position.lowerBinId; i <= position.upperBinId; i++) {
            const binArrayIdx = (0, helpers_1.binIdToBinArrayIndex)(new anchor_1.BN(i));
            const binArray = binArrayIdx.eq(lowerBinArrayIdx)
                ? _lowerBinArray
                : _upperBinArray;
            const binState = (0, helpers_1.getBinFromBinArray)(i, binArray);
            const binIdxInPosition = i - position.lowerBinId;
            const feeInfos = position.feeInfos[binIdxInPosition];
            const liquidityShare = positionVersion === types_1.PositionVersion.V1
                ? position.liquidityShares[binIdxInPosition]
                : position.liquidityShares[binIdxInPosition].shrn(64);
            const newFeeX = (0, math_1.mulShr)(liquidityShare, binState.feeAmountXPerTokenStored.sub(feeInfos.feeXPerTokenComplete), constants_1.SCALE_OFFSET, math_1.Rounding.Down);
            const newFeeY = (0, math_1.mulShr)(liquidityShare, binState.feeAmountYPerTokenStored.sub(feeInfos.feeYPerTokenComplete), constants_1.SCALE_OFFSET, math_1.Rounding.Down);
            feeX = feeX.add(newFeeX).add(feeInfos.feeXPending);
            feeY = feeY.add(newFeeY).add(feeInfos.feeYPending);
        }
        return { feeX, feeY };
    }
    static async processPosition(program, version, lbPair, onChainTimestamp, position, baseTokenDecimal, quoteTokenDecimal, lowerBinArray, upperBinArray, feeOwner) {
        const { lowerBinId, upperBinId, liquidityShares: posShares, lastUpdatedAt, totalClaimedFeeXAmount, totalClaimedFeeYAmount, } = position;
        const bins = this.getBinsBetweenLowerAndUpperBound(lbPair, lowerBinId, upperBinId, baseTokenDecimal, quoteTokenDecimal, lowerBinArray, upperBinArray);
        if (!bins.length)
            return null;
        /// assertion
        if (bins[0].binId !== lowerBinId ||
            bins[bins.length - 1].binId !== upperBinId)
            throw new Error("Bin ID mismatch");
        const positionData = [];
        let totalXAmount = new decimal_js_1.default(0);
        let totalYAmount = new decimal_js_1.default(0);
        bins.forEach((bin, idx) => {
            const binSupply = new decimal_js_1.default(bin.supply.toString());
            const posShare = new decimal_js_1.default(posShares[idx].toString());
            const positionXAmount = binSupply.eq(new decimal_js_1.default("0"))
                ? new decimal_js_1.default("0")
                : posShare.mul(bin.xAmount.toString()).div(binSupply);
            const positionYAmount = binSupply.eq(new decimal_js_1.default("0"))
                ? new decimal_js_1.default("0")
                : posShare.mul(bin.yAmount.toString()).div(binSupply);
            totalXAmount = totalXAmount.add(positionXAmount);
            totalYAmount = totalYAmount.add(positionYAmount);
            positionData.push({
                binId: bin.binId,
                price: bin.price,
                pricePerToken: bin.pricePerToken,
                binXAmount: bin.xAmount.toString(),
                binYAmount: bin.yAmount.toString(),
                binLiquidity: binSupply.toString(),
                positionLiquidity: posShare.toString(),
                positionXAmount: positionXAmount.toString(),
                positionYAmount: positionYAmount.toString(),
            });
        });
        const { feeX, feeY } = await this.getClaimableSwapFee(program, version, position, lowerBinArray, upperBinArray);
        const { rewardOne, rewardTwo } = await this.getClaimableLMReward(program, version, lbPair, onChainTimestamp, position, lowerBinArray, upperBinArray);
        return {
            totalXAmount: totalXAmount.toString(),
            totalYAmount: totalYAmount.toString(),
            positionBinData: positionData,
            lastUpdatedAt,
            lowerBinId,
            upperBinId,
            feeX,
            feeY,
            rewardOne,
            rewardTwo,
            feeOwner,
            totalClaimedFeeXAmount,
            totalClaimedFeeYAmount,
        };
    }
    static getBinsBetweenLowerAndUpperBound(lbPair, lowerBinId, upperBinId, baseTokenDecimal, quoteTokenDecimal, lowerBinArrays, upperBinArrays) {
        const lowerBinArrayIndex = (0, helpers_1.binIdToBinArrayIndex)(new anchor_1.BN(lowerBinId));
        const upperBinArrayIndex = (0, helpers_1.binIdToBinArrayIndex)(new anchor_1.BN(upperBinId));
        let bins = [];
        if (lowerBinArrayIndex.eq(upperBinArrayIndex)) {
            const binArray = lowerBinArrays;
            const [lowerBinIdForBinArray] = (0, helpers_1.getBinArrayLowerUpperBinId)(binArray.index);
            binArray.bins.forEach((bin, idx) => {
                const binId = lowerBinIdForBinArray.toNumber() + idx;
                if (binId >= lowerBinId && binId <= upperBinId) {
                    const pricePerLamport = (0, helpers_1.getPriceOfBinByBinId)(binId, lbPair.binStep).toString();
                    bins.push({
                        binId,
                        xAmount: bin.amountX,
                        yAmount: bin.amountY,
                        supply: bin.liquiditySupply,
                        price: pricePerLamport,
                        version: binArray.version,
                        pricePerToken: new decimal_js_1.default(pricePerLamport)
                            .mul(new decimal_js_1.default(10 ** (baseTokenDecimal - quoteTokenDecimal)))
                            .toString(),
                    });
                }
            });
        }
        else {
            const binArrays = [lowerBinArrays, upperBinArrays];
            binArrays.forEach((binArray) => {
                const [lowerBinIdForBinArray] = (0, helpers_1.getBinArrayLowerUpperBinId)(binArray.index);
                binArray.bins.forEach((bin, idx) => {
                    const binId = lowerBinIdForBinArray.toNumber() + idx;
                    if (binId >= lowerBinId && binId <= upperBinId) {
                        const pricePerLamport = (0, helpers_1.getPriceOfBinByBinId)(binId, lbPair.binStep).toString();
                        bins.push({
                            binId,
                            xAmount: bin.amountX,
                            yAmount: bin.amountY,
                            supply: bin.liquiditySupply,
                            price: pricePerLamport,
                            version: binArray.version,
                            pricePerToken: new decimal_js_1.default(pricePerLamport)
                                .mul(new decimal_js_1.default(10 ** (baseTokenDecimal - quoteTokenDecimal)))
                                .toString(),
                        });
                    }
                });
            });
        }
        return bins;
    }
    /** Private method */
    processXYAmountDistribution(xYAmountDistribution) {
        let currentBinId = null;
        const xAmountDistribution = [];
        const yAmountDistribution = [];
        const binIds = [];
        xYAmountDistribution.forEach((binAndAmount) => {
            xAmountDistribution.push(binAndAmount.xAmountBpsOfTotal);
            yAmountDistribution.push(binAndAmount.yAmountBpsOfTotal);
            binIds.push(binAndAmount.binId);
            if (currentBinId && binAndAmount.binId !== currentBinId + 1) {
                throw new Error("Discontinuous Bin ID");
            }
            else {
                currentBinId = binAndAmount.binId;
            }
        });
        return {
            lowerBinId: xYAmountDistribution[0].binId,
            upperBinId: xYAmountDistribution[xYAmountDistribution.length - 1].binId,
            xAmountDistribution,
            yAmountDistribution,
            binIds,
        };
    }
    async getBins(lbPairPubKey, lowerBinId, upperBinId, baseTokenDecimal, quoteTokenDecimal, lowerBinArray, upperBinArray) {
        const lowerBinArrayIndex = (0, helpers_1.binIdToBinArrayIndex)(new anchor_1.BN(lowerBinId));
        const upperBinArrayIndex = (0, helpers_1.binIdToBinArrayIndex)(new anchor_1.BN(upperBinId));
        const hasCachedLowerBinArray = lowerBinArray != null;
        const hasCachedUpperBinArray = upperBinArray != null;
        const isSingleBinArray = lowerBinArrayIndex.eq(upperBinArrayIndex);
        const lowerBinArrayIndexOffset = hasCachedLowerBinArray ? 1 : 0;
        const upperBinArrayIndexOffset = hasCachedUpperBinArray ? -1 : 0;
        const binArrayPubkeys = (0, helpers_1.range)(lowerBinArrayIndex.toNumber() + lowerBinArrayIndexOffset, upperBinArrayIndex.toNumber() + upperBinArrayIndexOffset, i => (0, helpers_1.deriveBinArray)(lbPairPubKey, new anchor_1.BN(i), this.program.programId)[0]);
        const fetchedBinArrays = binArrayPubkeys.length !== 0 ?
            await this.program.account.binArray.fetchMultiple(binArrayPubkeys) : [];
        const binArrays = [
            ...(hasCachedLowerBinArray ? [lowerBinArray] : []),
            ...fetchedBinArrays,
            ...((hasCachedUpperBinArray && !isSingleBinArray) ? [upperBinArray] : [])
        ];
        const binsById = new Map(binArrays
            .filter(x => x != null)
            .flatMap(({ bins, index }) => {
            const [lowerBinId] = (0, helpers_1.getBinArrayLowerUpperBinId)(index);
            return bins.map((b, i) => [lowerBinId.toNumber() + i, b]);
        }));
        const version = binArrays.find(binArray => binArray != null)?.version ?? 1;
        return Array.from((0, helpers_1.enumerateBins)(binsById, lowerBinId, upperBinId, this.lbPair.binStep, baseTokenDecimal, quoteTokenDecimal, version));
    }
    async binArraysToBeCreate(lowerBinArrayIndex, upperBinArrayIndex) {
        const binArrayIndexes = Array.from({ length: upperBinArrayIndex.sub(lowerBinArrayIndex).toNumber() + 1 }, (_, index) => index + lowerBinArrayIndex.toNumber()).map((idx) => new anchor_1.BN(idx));
        const binArrays = [];
        for (const idx of binArrayIndexes) {
            const [binArrayPubKey] = (0, helpers_1.deriveBinArray)(this.pubkey, idx, this.program.programId);
            binArrays.push(binArrayPubKey);
        }
        const binArrayAccounts = await this.program.provider.connection.getMultipleAccountsInfo(binArrays);
        return binArrayAccounts
            .filter((binArray) => binArray === null)
            .map((_, index) => binArrays[index]);
    }
    async createBinArraysIfNeeded(upperBinArrayIndex, lowerBinArrayIndex, funder) {
        const ixs = [];
        const binArrayIndexes = Array.from({ length: upperBinArrayIndex.sub(lowerBinArrayIndex).toNumber() + 1 }, (_, index) => index + lowerBinArrayIndex.toNumber()).map((idx) => new anchor_1.BN(idx));
        for (const idx of binArrayIndexes) {
            const [binArray] = (0, helpers_1.deriveBinArray)(this.pubkey, idx, this.program.programId);
            const binArrayAccount = await this.program.provider.connection.getAccountInfo(binArray);
            if (binArrayAccount === null) {
                ixs.push(await this.program.methods
                    .initializeBinArray(idx)
                    .accounts({
                    binArray,
                    funder,
                    lbPair: this.pubkey,
                })
                    .instruction());
            }
        }
        return ixs;
    }
    updateVolatilityAccumulator(vParameter, sParameter, activeId) {
        const deltaId = Math.abs(vParameter.indexReference - activeId);
        const newVolatilityAccumulator = vParameter.volatilityReference + deltaId * constants_1.BASIS_POINT_MAX;
        vParameter.volatilityAccumulator = Math.min(newVolatilityAccumulator, sParameter.maxVolatilityAccumulator);
    }
    updateReference(activeId, vParameter, sParameter, currentTimestamp) {
        const elapsed = currentTimestamp - vParameter.lastUpdateTimestamp.toNumber();
        if (elapsed >= sParameter.filterPeriod) {
            vParameter.indexReference = activeId;
            if (elapsed < sParameter.decayPeriod) {
                const decayedVolatilityReference = Math.floor((vParameter.volatilityAccumulator * sParameter.reductionFactor) /
                    constants_1.BASIS_POINT_MAX);
                vParameter.volatilityReference = decayedVolatilityReference;
            }
            else {
                vParameter.volatilityReference = 0;
            }
        }
    }
    async createClaimBuildMethod({ owner, position, shouldIncludePreIx = true, }) {
        const lowerBinArrayIndex = (0, helpers_1.binIdToBinArrayIndex)(new anchor_1.BN(position.positionData.lowerBinId));
        const [binArrayLower] = (0, helpers_1.deriveBinArray)(this.pubkey, lowerBinArrayIndex, this.program.programId);
        const upperBinArrayIndex = lowerBinArrayIndex.add(new anchor_1.BN(1));
        const [binArrayUpper] = (0, helpers_1.deriveBinArray)(this.pubkey, upperBinArrayIndex, this.program.programId);
        const claimTransactions = [];
        for (let i = 0; i < 2; i++) {
            const rewardInfo = this.lbPair.rewardInfos[i];
            if (!rewardInfo || rewardInfo.mint.equals(web3_js_1.PublicKey.default))
                continue;
            const preInstructions = [];
            const { ataPubKey, ix } = await (0, helpers_1.getOrCreateATAInstruction)(this.program.provider.connection, rewardInfo.mint, owner);
            ix && preInstructions.push(ix);
            const claimTransaction = await this.program.methods
                .claimReward(new anchor_1.BN(i))
                .accounts({
                lbPair: this.pubkey,
                sender: owner,
                position: position.publicKey,
                binArrayLower,
                binArrayUpper,
                rewardVault: rewardInfo.vault,
                rewardMint: rewardInfo.mint,
                tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
                userTokenAccount: ataPubKey,
            })
                .preInstructions(shouldIncludePreIx ? preInstructions : [])
                .transaction();
            claimTransactions.push(claimTransaction);
        }
        return claimTransactions;
    }
    async createClaimSwapFeeMethod({ owner, position, shouldIncludePretIx = true, shouldIncludePostIx = true, }) {
        const { lowerBinId, feeOwner } = position.positionData;
        const lowerBinArrayIndex = (0, helpers_1.binIdToBinArrayIndex)(new anchor_1.BN(lowerBinId));
        const [binArrayLower] = (0, helpers_1.deriveBinArray)(this.pubkey, lowerBinArrayIndex, this.program.programId);
        const upperBinArrayIndex = lowerBinArrayIndex.add(new anchor_1.BN(1));
        const [binArrayUpper] = (0, helpers_1.deriveBinArray)(this.pubkey, upperBinArrayIndex, this.program.programId);
        const [reserveX] = (0, helpers_1.deriveReserve)(this.tokenX.publicKey, this.pubkey, this.program.programId);
        const [reserveY] = (0, helpers_1.deriveReserve)(this.tokenY.publicKey, this.pubkey, this.program.programId);
        const walletToReceiveFee = feeOwner.equals(web3_js_1.PublicKey.default)
            ? owner
            : feeOwner;
        const preInstructions = [];
        const [{ ataPubKey: userTokenX, ix: createInTokenAccountIx }, { ataPubKey: userTokenY, ix: createOutTokenAccountIx },] = await Promise.all([
            (0, helpers_1.getOrCreateATAInstruction)(this.program.provider.connection, this.tokenX.publicKey, walletToReceiveFee, owner),
            (0, helpers_1.getOrCreateATAInstruction)(this.program.provider.connection, this.tokenY.publicKey, walletToReceiveFee, owner),
        ]);
        createInTokenAccountIx && preInstructions.push(createInTokenAccountIx);
        createOutTokenAccountIx && preInstructions.push(createOutTokenAccountIx);
        const postInstructions = [];
        if ([
            this.tokenX.publicKey.toBase58(),
            this.tokenY.publicKey.toBase58(),
        ].includes(spl_token_1.NATIVE_MINT.toBase58())) {
            const closeWrappedSOLIx = await (0, helpers_1.unwrapSOLInstruction)(owner);
            closeWrappedSOLIx && postInstructions.push(closeWrappedSOLIx);
        }
        const claimFeeTx = await this.program.methods
            .claimFee()
            .accounts({
            binArrayLower,
            binArrayUpper,
            lbPair: this.pubkey,
            sender: owner,
            position: position.publicKey,
            reserveX,
            reserveY,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            tokenXMint: this.tokenX.publicKey,
            tokenYMint: this.tokenY.publicKey,
            userTokenX,
            userTokenY,
        })
            .preInstructions(shouldIncludePretIx ? preInstructions : [])
            .postInstructions(shouldIncludePostIx ? postInstructions : [])
            .transaction();
        return claimFeeTx;
    }
}
exports.DLMM = DLMM;
