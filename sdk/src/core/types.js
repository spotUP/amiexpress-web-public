"use strict";
/**
 * Core SDK Type Definitions
 *
 * Professional type system for BBS door development
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpecialKey = exports.AnsiStyle = exports.AnsiColor = void 0;
// ===== ANSI Color Types =====
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
})(AnsiColor || (exports.AnsiColor = AnsiColor = {}));
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
