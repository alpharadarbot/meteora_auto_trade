"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toAmountBidSide = toAmountBidSide;
exports.toAmountAskSide = toAmountAskSide;
exports.toAmountBothSide = toAmountBothSide;
exports.autoFillYByWeight = autoFillYByWeight;
exports.autoFillXByWeight = autoFillXByWeight;
const decimal_js_1 = __importDefault(require("decimal.js"));
const anchor_1 = require("@coral-xyz/anchor");
const weight_1 = require("./weight");
function toAmountBidSide(activeId, totalAmount, distributions) {
    // get sum of weight
    const totalWeight = distributions.reduce(function (sum, el) {
        return el.binId > activeId ? sum : sum.add(el.weight); // skip all ask side
    }, new decimal_js_1.default(0));
    if (totalWeight.cmp(new decimal_js_1.default(0)) != 1) {
        throw Error("Invalid parameteres");
    }
    return distributions.map((bin) => {
        if (bin.binId > activeId) {
            return {
                binId: bin.binId,
                amount: new anchor_1.BN(0),
            };
        }
        else {
            return {
                binId: bin.binId,
                amount: new anchor_1.BN(new decimal_js_1.default(totalAmount.toString())
                    .mul(new decimal_js_1.default(bin.weight).div(totalWeight))
                    .floor().toString()),
            };
        }
    });
}
function toAmountAskSide(activeId, binStep, totalAmount, distributions) {
    // get sum of weight
    const totalWeight = distributions.reduce(function (sum, el) {
        if (el.binId < activeId) {
            return sum;
        }
        else {
            const price = (0, weight_1.getPriceOfBinByBinId)(el.binId, binStep);
            const weightPerPrice = new decimal_js_1.default(el.weight).div(price);
            return sum.add(weightPerPrice);
        }
    }, new decimal_js_1.default(0));
    if (totalWeight.cmp(new decimal_js_1.default(0)) != 1) {
        throw Error("Invalid parameteres");
    }
    return distributions.map((bin) => {
        if (bin.binId < activeId) {
            return {
                binId: bin.binId,
                amount: new anchor_1.BN(0),
            };
        }
        else {
            const price = (0, weight_1.getPriceOfBinByBinId)(bin.binId, binStep);
            const weightPerPrice = new decimal_js_1.default(bin.weight).div(price);
            return {
                binId: bin.binId,
                amount: new anchor_1.BN(new decimal_js_1.default(totalAmount.toString()).mul(weightPerPrice).div(totalWeight).floor().toString()),
            };
        }
    });
}
function toAmountBothSide(activeId, binStep, amountX, amountY, amountXInActiveBin, amountYInActiveBin, distributions) {
    // only bid side
    if (activeId > distributions[distributions.length - 1].binId) {
        let amounts = toAmountBidSide(activeId, amountY, distributions);
        return amounts.map((bin) => {
            return {
                binId: bin.binId,
                amountX: new anchor_1.BN(0),
                amountY: bin.amount,
            };
        });
    }
    // only ask side
    if (activeId < distributions[0].binId) {
        let amounts = toAmountAskSide(activeId, binStep, amountX, distributions);
        return amounts.map((bin) => {
            return {
                binId: bin.binId,
                amountX: bin.amount,
                amountY: new anchor_1.BN(0),
            };
        });
    }
    const activeBins = distributions.filter((element) => {
        return element.binId === activeId;
    });
    if (activeBins.length === 1) {
        const p0 = (0, weight_1.getPriceOfBinByBinId)(activeId, binStep);
        let wx0 = new decimal_js_1.default(0);
        let wy0 = new decimal_js_1.default(0);
        const activeBin = activeBins[0];
        if (amountXInActiveBin.isZero() && amountYInActiveBin.isZero()) {
            wx0 = new decimal_js_1.default(activeBin.weight).div(p0.mul(new decimal_js_1.default(2)));
            wy0 = new decimal_js_1.default(activeBin.weight).div(new decimal_js_1.default(2));
        }
        else {
            let amountXInActiveBinDec = new decimal_js_1.default(amountXInActiveBin.toString());
            let amountYInActiveBinDec = new decimal_js_1.default(amountYInActiveBin.toString());
            if (!amountXInActiveBin.isZero()) {
                wx0 = new decimal_js_1.default(activeBin.weight).div(p0.add(amountYInActiveBinDec.div(amountXInActiveBinDec)));
            }
            if (!amountYInActiveBin.isZero()) {
                wy0 = new decimal_js_1.default(activeBin.weight).div(new decimal_js_1.default(1).add(p0.mul(amountXInActiveBinDec).div(amountYInActiveBinDec)));
            }
        }
        let totalWeightX = wx0;
        let totalWeightY = wy0;
        distributions.forEach((element) => {
            if (element.binId < activeId) {
                totalWeightY = totalWeightY.add(new decimal_js_1.default(element.weight));
            }
            if (element.binId > activeId) {
                let price = (0, weight_1.getPriceOfBinByBinId)(element.binId, binStep);
                let weighPerPrice = new decimal_js_1.default(element.weight).div(price);
                totalWeightX = totalWeightX.add(weighPerPrice);
            }
        });
        const kx = new decimal_js_1.default(amountX.toString()).div(totalWeightX);
        const ky = new decimal_js_1.default(amountY.toString()).div(totalWeightY);
        let k = (kx.lessThan(ky) ? kx : ky);
        return distributions.map((bin) => {
            if (bin.binId < activeId) {
                const amount = k.mul(new decimal_js_1.default(bin.weight));
                return {
                    binId: bin.binId,
                    amountX: new anchor_1.BN(0),
                    amountY: new anchor_1.BN(amount.floor().toString()),
                };
            }
            if (bin.binId > activeId) {
                const price = (0, weight_1.getPriceOfBinByBinId)(bin.binId, binStep);
                const weighPerPrice = new decimal_js_1.default(bin.weight).div(price);
                const amount = k.mul(weighPerPrice);
                return {
                    binId: bin.binId,
                    amountX: new anchor_1.BN(amount.floor().toString()),
                    amountY: new anchor_1.BN(0),
                };
            }
            const amountXActiveBin = k.mul(wx0);
            const amountYActiveBin = k.mul(wy0);
            return {
                binId: bin.binId,
                amountX: new anchor_1.BN(amountXActiveBin.floor().toString()),
                amountY: new anchor_1.BN(amountYActiveBin.floor().toString()),
            };
        });
    }
    else {
        let totalWeightX = new decimal_js_1.default(0);
        let totalWeightY = new decimal_js_1.default(0);
        distributions.forEach((element) => {
            if (element.binId < activeId) {
                totalWeightY = totalWeightY.add(new decimal_js_1.default(element.weight));
            }
            else {
                let price = (0, weight_1.getPriceOfBinByBinId)(element.binId, binStep);
                let weighPerPrice = new decimal_js_1.default(element.weight).div(price);
                totalWeightX = totalWeightX.add(weighPerPrice);
            }
        });
        let kx = new decimal_js_1.default(amountX.toString()).div(totalWeightX);
        let ky = new decimal_js_1.default(amountY.toString()).div(totalWeightY);
        let k = kx.lessThan(ky) ? kx : ky;
        return distributions.map((bin) => {
            if (bin.binId < activeId) {
                const amount = k.mul(new decimal_js_1.default(bin.weight));
                return {
                    binId: bin.binId,
                    amountX: new anchor_1.BN(0),
                    amountY: new anchor_1.BN(amount.floor().toString()),
                };
            }
            else {
                let price = (0, weight_1.getPriceOfBinByBinId)(bin.binId, binStep);
                let weighPerPrice = new decimal_js_1.default(bin.weight).div(price);
                const amount = k.mul(weighPerPrice);
                return {
                    binId: bin.binId,
                    amountX: new anchor_1.BN(amount.floor().toString()),
                    amountY: new anchor_1.BN(0),
                };
            }
        });
    }
}
function autoFillYByWeight(activeId, binStep, amountX, amountXInActiveBin, amountYInActiveBin, distributions) {
    const activeBins = distributions.filter((element) => {
        return element.binId === activeId;
    });
    if (activeBins.length === 1) {
        const p0 = (0, weight_1.getPriceOfBinByBinId)(activeId, binStep);
        let wx0 = new decimal_js_1.default(0);
        let wy0 = new decimal_js_1.default(0);
        const activeBin = activeBins[0];
        if (amountXInActiveBin.isZero() && amountYInActiveBin.isZero()) {
            wx0 = new decimal_js_1.default(activeBin.weight).div(p0.mul(new decimal_js_1.default(2)));
            wy0 = new decimal_js_1.default(activeBin.weight).div(new decimal_js_1.default(2));
        }
        else {
            let amountXInActiveBinDec = new decimal_js_1.default(amountXInActiveBin.toString());
            let amountYInActiveBinDec = new decimal_js_1.default(amountYInActiveBin.toString());
            if (!amountXInActiveBin.isZero()) {
                wx0 = new decimal_js_1.default(activeBin.weight).div(p0.add(amountYInActiveBinDec.div(amountXInActiveBinDec)));
            }
            if (!amountYInActiveBin.isZero()) {
                wy0 = new decimal_js_1.default(activeBin.weight).div(new decimal_js_1.default(1).add(p0.mul(amountXInActiveBinDec).div(amountYInActiveBinDec)));
            }
        }
        let totalWeightX = wx0;
        let totalWeightY = wy0;
        distributions.forEach((element) => {
            if (element.binId < activeId) {
                totalWeightY = totalWeightY.add(new decimal_js_1.default(element.weight));
            }
            if (element.binId > activeId) {
                const price = (0, weight_1.getPriceOfBinByBinId)(element.binId, binStep);
                const weighPerPrice = new decimal_js_1.default(element.weight).div(price);
                totalWeightX = totalWeightX.add(weighPerPrice);
            }
        });
        const kx = totalWeightX.isZero() ? new decimal_js_1.default(1) : new decimal_js_1.default(amountX.toString()).div(totalWeightX);
        const amountY = kx.mul(totalWeightY);
        return new anchor_1.BN(amountY.floor().toString());
    }
    else {
        let totalWeightX = new decimal_js_1.default(0);
        let totalWeightY = new decimal_js_1.default(0);
        distributions.forEach((element) => {
            if (element.binId < activeId) {
                totalWeightY = totalWeightY.add(new decimal_js_1.default(element.weight));
            }
            else {
                const price = (0, weight_1.getPriceOfBinByBinId)(element.binId, binStep);
                const weighPerPrice = new decimal_js_1.default(element.weight).div(price);
                totalWeightX = totalWeightX.add(weighPerPrice);
            }
        });
        const kx = totalWeightX.isZero() ? new decimal_js_1.default(1) : new decimal_js_1.default(amountX.toString()).div(totalWeightX);
        const amountY = kx.mul(totalWeightY);
        return new anchor_1.BN(amountY.floor().toString());
    }
}
function autoFillXByWeight(activeId, binStep, amountY, amountXInActiveBin, amountYInActiveBin, distributions) {
    const activeBins = distributions.filter((element) => {
        return element.binId === activeId;
    });
    if (activeBins.length === 1) {
        const p0 = (0, weight_1.getPriceOfBinByBinId)(activeId, binStep);
        let wx0 = new decimal_js_1.default(0);
        let wy0 = new decimal_js_1.default(0);
        const activeBin = activeBins[0];
        if (amountXInActiveBin.isZero() && amountYInActiveBin.isZero()) {
            wx0 = new decimal_js_1.default(activeBin.weight).div(p0.mul(new decimal_js_1.default(2)));
            wy0 = new decimal_js_1.default(activeBin.weight).div(new decimal_js_1.default(2));
        }
        else {
            let amountXInActiveBinDec = new decimal_js_1.default(amountXInActiveBin.toString());
            let amountYInActiveBinDec = new decimal_js_1.default(amountYInActiveBin.toString());
            if (!amountXInActiveBin.isZero()) {
                wx0 = new decimal_js_1.default(activeBin.weight).div(p0.add(amountYInActiveBinDec.div(amountXInActiveBinDec)));
            }
            if (!amountYInActiveBin.isZero()) {
                wy0 = new decimal_js_1.default(activeBin.weight).div(new decimal_js_1.default(1).add(p0.mul(amountXInActiveBinDec).div(amountYInActiveBinDec)));
            }
        }
        let totalWeightX = wx0;
        let totalWeightY = wy0;
        distributions.forEach((element) => {
            if (element.binId < activeId) {
                totalWeightY = totalWeightY.add(new decimal_js_1.default(element.weight));
            }
            if (element.binId > activeId) {
                const price = (0, weight_1.getPriceOfBinByBinId)(element.binId, binStep);
                const weighPerPrice = new decimal_js_1.default(element.weight).div(price);
                totalWeightX = totalWeightX.add(weighPerPrice);
            }
        });
        const ky = totalWeightY.isZero() ? new decimal_js_1.default(1) : new decimal_js_1.default(amountY.toString()).div(totalWeightY);
        const amountX = ky.mul(totalWeightX);
        return new anchor_1.BN(amountX.floor().toString());
    }
    else {
        let totalWeightX = new decimal_js_1.default(0);
        let totalWeightY = new decimal_js_1.default(0);
        distributions.forEach((element) => {
            if (element.binId < activeId) {
                totalWeightY = totalWeightY.add(new decimal_js_1.default(element.weight));
            }
            else {
                const price = (0, weight_1.getPriceOfBinByBinId)(element.binId, binStep);
                const weighPerPrice = new decimal_js_1.default(element.weight).div(price);
                totalWeightX = totalWeightX.add(weighPerPrice);
            }
        });
        const ky = totalWeightY.isZero() ? new decimal_js_1.default(1) : new decimal_js_1.default(amountY.toString()).div(totalWeightY);
        const amountX = ky.mul(totalWeightX);
        return new anchor_1.BN(amountX.floor().toString());
    }
}
