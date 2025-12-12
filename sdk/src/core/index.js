"use strict";
/**
 * AmiExpress BBS Door SDK - Core Module
 *
 * Professional SDK for building BBS doors with TypeScript
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpecialKey = exports.AnsiStyle = exports.AnsiColor = exports.Storage = exports.Input = exports.Output = exports.Door = void 0;
// Export core classes
var Door_1 = require("./Door");
Object.defineProperty(exports, "Door", { enumerable: true, get: function () { return Door_1.Door; } });
var Output_1 = require("./Output");
Object.defineProperty(exports, "Output", { enumerable: true, get: function () { return Output_1.Output; } });
var Input_1 = require("./Input");
Object.defineProperty(exports, "Input", { enumerable: true, get: function () { return Input_1.Input; } });
var Storage_1 = require("./Storage");
Object.defineProperty(exports, "Storage", { enumerable: true, get: function () { return Storage_1.Storage; } });
// Export enums (these are values, not types)
var types_1 = require("./types");
Object.defineProperty(exports, "AnsiColor", { enumerable: true, get: function () { return types_1.AnsiColor; } });
Object.defineProperty(exports, "AnsiStyle", { enumerable: true, get: function () { return types_1.AnsiStyle; } });
Object.defineProperty(exports, "SpecialKey", { enumerable: true, get: function () { return types_1.SpecialKey; } });
// Export utilities
__exportStar(require("../utils/screen-utils"), exports);
