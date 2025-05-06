"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const web3_js_1 = require("@solana/web3.js");
const types_1 = require("../dlmm/types");
describe("Decode", () => {
    const connection = new web3_js_1.Connection("http://127.0.0.1:8899", "processed");
    test("Decode sysvar clock", async () => {
        const currentTime = Math.floor(Date.now() / 1000);
        const clockAccount = await connection.getAccountInfo(web3_js_1.SYSVAR_CLOCK_PUBKEY);
        const clock = types_1.ClockLayout.decode(clockAccount.data);
        console.log(clock.slot.toString());
        console.log(clock.unixTimestamp.toString());
        const secondDiff = Math.abs(currentTime - clock.unixTimestamp.toNumber());
        expect(clock.slot.toNumber()).toBeGreaterThan(0);
        expect(secondDiff).toBeLessThan(30);
    });
});
