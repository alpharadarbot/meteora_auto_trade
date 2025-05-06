"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config = {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    splitting: true,
    sourcemap: true,
    minify: false,
    clean: true,
    skipNodeModulesBundle: true,
    dts: true,
    external: ["node_modules"],
};
exports.default = config;
