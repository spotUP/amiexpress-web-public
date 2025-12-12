"use strict";
/**
 * Core Type Definitions for AmiExpress BBS Door SDK
 *
 * These types provide the foundation for all door development,
 * ensuring type safety and enabling AI-friendly code generation.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpecialKey = exports.AnsiStyle = exports.AnsiColor = void 0;
/**
 * ANSI Color codes (0-15 standard palette)
 */
var AnsiColor;
(function (AnsiColor) {
    AnsiColor[AnsiColor["Black"] = 0] = "Black";
    AnsiColor[AnsiColor["Red"] = 1] = "Red";
    AnsiColor[AnsiColor["Green"] = 2] = "Green";
    AnsiColor[AnsiColor["Yellow"] = 3] = "Yellow";
    AnsiColor[AnsiColor["Blue"] = 4] = "Blue";
    AnsiColor[AnsiColor["Magenta"] = 5] = "Magenta";
    AnsiColor[AnsiColor["Cyan"] = 6] = "Cyan";
    AnsiColor[AnsiColor["White"] = 7] = "White";
    AnsiColor[AnsiColor["BrightBlack"] = 8] = "BrightBlack";
    AnsiColor[AnsiColor["Gray"] = 8] = "Gray";
    AnsiColor[AnsiColor["BrightRed"] = 9] = "BrightRed";
    AnsiColor[AnsiColor["BrightGreen"] = 10] = "BrightGreen";
    AnsiColor[AnsiColor["BrightYellow"] = 11] = "BrightYellow";
    AnsiColor[AnsiColor["BrightBlue"] = 12] = "BrightBlue";
    AnsiColor[AnsiColor["BrightMagenta"] = 13] = "BrightMagenta";
    AnsiColor[AnsiColor["BrightCyan"] = 14] = "BrightCyan";
    AnsiColor[AnsiColor["BrightWhite"] = 15] = "BrightWhite";
})(AnsiColor || (exports.AnsiColor = AnsiColor = {}));
/**
 * ANSI text styles
 */
var AnsiStyle;
(function (AnsiStyle) {
    AnsiStyle[AnsiStyle["Normal"] = 0] = "Normal";
    AnsiStyle[AnsiStyle["Bold"] = 1] = "Bold";
    AnsiStyle[AnsiStyle["Dim"] = 2] = "Dim";
    AnsiStyle[AnsiStyle["Italic"] = 3] = "Italic";
    AnsiStyle[AnsiStyle["Underline"] = 4] = "Underline";
    AnsiStyle[AnsiStyle["Blink"] = 5] = "Blink";
    AnsiStyle[AnsiStyle["Reverse"] = 7] = "Reverse";
})(AnsiStyle || (exports.AnsiStyle = AnsiStyle = {}));
/**
 * Special keys for easy reference
 */
var SpecialKey;
(function (SpecialKey) {
    SpecialKey["Enter"] = "\r";
    SpecialKey["Escape"] = "\u001B";
    SpecialKey["Backspace"] = "";
    SpecialKey["Tab"] = "\t";
    SpecialKey["Space"] = " ";
    SpecialKey["ArrowUp"] = "\u001B[A";
    SpecialKey["ArrowDown"] = "\u001B[B";
    SpecialKey["ArrowRight"] = "\u001B[C";
    SpecialKey["ArrowLeft"] = "\u001B[D";
    SpecialKey["Delete"] = "\u001B[3~";
    SpecialKey["Home"] = "\u001B[H";
    SpecialKey["End"] = "\u001B[F";
    SpecialKey["PageUp"] = "\u001B[5~";
    SpecialKey["PageDown"] = "\u001B[6~";
})(SpecialKey || (exports.SpecialKey = SpecialKey = {}));
