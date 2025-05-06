"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const web3_js_1 = require("@solana/web3.js");
const dlmm_1 = require("../dlmm");
const bn_js_1 = __importDefault(require("bn.js"));
async function swapQuote(poolAddress, swapAmount, swapYtoX, isPartialFill) {
    let rpc = "https://api.mainnet-beta.solana.com";
    const connection = new web3_js_1.Connection(rpc, "finalized");
    const dlmmPool = await dlmm_1.DLMM.create(connection, poolAddress, {
        cluster: "mainnet-beta",
    });
    const binArrays = await dlmmPool.getBinArrayForSwap(swapYtoX);
    const swapQuote = await dlmmPool.swapQuote(swapAmount, swapYtoX, new bn_js_1.default(10), binArrays, isPartialFill);
    console.log("🚀 ~ swapQuote:", swapQuote);
    console.log("consumedInAmount: %s, outAmount: %s", swapQuote.consumedInAmount.toString(), swapQuote.outAmount.toString());
}
async function main() {
    await swapQuote(new web3_js_1.PublicKey("8kCbYxnF8ggdJACxz4NLYtVhEEz6EBvN5NQcKAazpkEY"), new bn_js_1.default(1_000_000_000), true, true);
}
main();
