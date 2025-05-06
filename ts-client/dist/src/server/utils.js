"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertToPosition = void 0;
const web3_js_1 = require("@solana/web3.js");
const bn_js_1 = __importDefault(require("bn.js"));
const convertToPosition = (rawPosition) => {
    return {
        ...rawPosition,
        publicKey: new web3_js_1.PublicKey(rawPosition.publicKey),
        positionData: {
            ...rawPosition.positionData,
            lastUpdatedAt: new bn_js_1.default(rawPosition.positionData.lastUpdatedAt, 16),
            feeX: new bn_js_1.default(rawPosition.positionData.feeX, 16),
            feeY: new bn_js_1.default(rawPosition.positionData.feeY, 16),
            rewardOne: new bn_js_1.default(rawPosition.positionData.rewardOne, 16),
            rewardTwo: new bn_js_1.default(rawPosition.positionData.rewardTwo, 16),
            feeOwner: new web3_js_1.PublicKey(rawPosition.positionData.feeOwner),
            totalClaimedFeeXAmount: new bn_js_1.default(rawPosition.positionData.totalClaimedFeeXAmount, 16),
            totalClaimedFeeYAmount: new bn_js_1.default(rawPosition.positionData.totalClaimedFeeYAmount, 16),
        },
    };
};
exports.convertToPosition = convertToPosition;
