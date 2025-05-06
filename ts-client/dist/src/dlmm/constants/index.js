"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ILM_BASE = exports.MAX_ACTIVE_BIN_SLIPPAGE = exports.MAX_BIN_PER_TX = exports.MAX_BIN_LENGTH_ALLOWED_IN_ONE_TX = exports.MAX_CLAIM_ALL_ALLOWED = exports.PRECISION = exports.SIMULATION_USER = exports.EXTENSION_BINARRAY_BITMAP_SIZE = exports.BIN_ARRAY_BITMAP_SIZE = exports.MAX_BIN_PER_POSITION = exports.MAX_BIN_ARRAY_SIZE = exports.POSITION_FEE = exports.BIN_ARRAY_FEE = exports.MAX_FEE_RATE = exports.FEE_PRECISION = exports.SCALE = exports.SCALE_OFFSET = exports.BASIS_POINT_MAX = exports.Network = exports.ADMIN = exports.LBCLMM_PROGRAM_IDS = void 0;
const web3_js_1 = require("@solana/web3.js");
const idl_1 = require("../idl");
const anchor_1 = require("@coral-xyz/anchor");
exports.LBCLMM_PROGRAM_IDS = {
    devnet: "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
    localhost: "LbVRzDTvBDEcrthxfZ4RL6yiq3uZw8bS6MwtdY6UhFQ",
    "mainnet-beta": "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
};
exports.ADMIN = {
    devnet: "6WaLrrRfReGKBYUSkmx2K6AuT21ida4j8at2SUiZdXu8",
    localhost: "bossj3JvwiNK7pvjr149DqdtJxf2gdygbcmEPTkb2F1",
};
var Network;
(function (Network) {
    Network["MAINNET"] = "mainnet-beta";
    Network["TESTNET"] = "testnet";
    Network["DEVNET"] = "devnet";
    Network["LOCAL"] = "localhost";
})(Network || (exports.Network = Network = {}));
exports.BASIS_POINT_MAX = 10000;
exports.SCALE_OFFSET = 64;
exports.SCALE = new anchor_1.BN(1).shln(exports.SCALE_OFFSET);
exports.FEE_PRECISION = new anchor_1.BN(1_000_000_000);
exports.MAX_FEE_RATE = new anchor_1.BN(100_000_000);
exports.BIN_ARRAY_FEE = 0.07054656;
exports.POSITION_FEE = 0.0565152;
const CONSTANTS = Object.entries(idl_1.IDL.constants);
exports.MAX_BIN_ARRAY_SIZE = new anchor_1.BN(CONSTANTS.find(([k, v]) => v.name == "MAX_BIN_PER_ARRAY")?.[1].value ?? 0);
exports.MAX_BIN_PER_POSITION = new anchor_1.BN(CONSTANTS.find(([k, v]) => v.name == "MAX_BIN_PER_POSITION")?.[1].value ?? 0);
exports.BIN_ARRAY_BITMAP_SIZE = new anchor_1.BN(CONSTANTS.find(([k, v]) => v.name == "BIN_ARRAY_BITMAP_SIZE")?.[1].value ?? 0);
exports.EXTENSION_BINARRAY_BITMAP_SIZE = new anchor_1.BN(CONSTANTS.find(([k, v]) => v.name == "EXTENSION_BINARRAY_BITMAP_SIZE")?.[1]
    .value ?? 0);
exports.SIMULATION_USER = new web3_js_1.PublicKey("HrY9qR5TiB2xPzzvbBu5KrBorMfYGQXh9osXydz4jy9s");
exports.PRECISION = 18446744073709551616;
exports.MAX_CLAIM_ALL_ALLOWED = 3;
exports.MAX_BIN_LENGTH_ALLOWED_IN_ONE_TX = 26;
exports.MAX_BIN_PER_TX = 69;
exports.MAX_ACTIVE_BIN_SLIPPAGE = 3;
exports.ILM_BASE = new web3_js_1.PublicKey("MFGQxwAmB91SwuYX36okv2Qmdc9aMuHTwWGUrp4AtB1");
