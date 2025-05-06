"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DlmmSdkError = exports.DLMMError = void 0;
const idl_1 = require("./idl");
const anchor_1 = require("@coral-xyz/anchor");
const constants_1 = require("./constants");
// ProgramError error parser
class DLMMError extends Error {
    errorCode;
    errorName;
    errorMessage;
    constructor(error) {
        let _errorCode = 0;
        let _errorName = "Something went wrong";
        let _errorMessage = "Something went wrong";
        if (error instanceof Error) {
            const anchorError = anchor_1.AnchorError.parse(JSON.parse(JSON.stringify(error)).logs);
            if (anchorError?.program.toBase58() === constants_1.LBCLMM_PROGRAM_IDS["mainnet-beta"]) {
                _errorCode = anchorError.error.errorCode.number;
                _errorName = anchorError.error.errorCode.code;
                _errorMessage = anchorError.error.errorMessage;
            }
        }
        else {
            const idlError = idl_1.IDL.errors.find((err) => err.code === error);
            if (idlError) {
                _errorCode = idlError.code;
                _errorName = idlError.name;
                _errorMessage = idlError.msg;
            }
        }
        super(_errorMessage);
        this.errorCode = _errorCode;
        this.errorName = _errorName;
        this.errorMessage = _errorMessage;
    }
}
exports.DLMMError = DLMMError;
class DlmmSdkError extends Error {
    name;
    message;
    constructor(name, message) {
        super();
        this.name = name;
        this.message = message;
    }
}
exports.DlmmSdkError = DlmmSdkError;
