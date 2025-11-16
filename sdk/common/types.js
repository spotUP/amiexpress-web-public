"use strict";
/**
 * Shared Types for AmiExpress SDK
 * Used by both server and client runtimes
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnsiBgColor = exports.AnsiColor = void 0;
/**
 * ANSI Color Codes
 */
var AnsiColor;
(function (AnsiColor) {
    AnsiColor[AnsiColor["BLACK"] = 30] = "BLACK";
    AnsiColor[AnsiColor["RED"] = 31] = "RED";
    AnsiColor[AnsiColor["GREEN"] = 32] = "GREEN";
    AnsiColor[AnsiColor["YELLOW"] = 33] = "YELLOW";
    AnsiColor[AnsiColor["BLUE"] = 34] = "BLUE";
    AnsiColor[AnsiColor["MAGENTA"] = 35] = "MAGENTA";
    AnsiColor[AnsiColor["CYAN"] = 36] = "CYAN";
    AnsiColor[AnsiColor["WHITE"] = 37] = "WHITE";
    AnsiColor[AnsiColor["BRIGHT_BLACK"] = 90] = "BRIGHT_BLACK";
    AnsiColor[AnsiColor["BRIGHT_RED"] = 91] = "BRIGHT_RED";
    AnsiColor[AnsiColor["BRIGHT_GREEN"] = 92] = "BRIGHT_GREEN";
    AnsiColor[AnsiColor["BRIGHT_YELLOW"] = 93] = "BRIGHT_YELLOW";
    AnsiColor[AnsiColor["BRIGHT_BLUE"] = 94] = "BRIGHT_BLUE";
    AnsiColor[AnsiColor["BRIGHT_MAGENTA"] = 95] = "BRIGHT_MAGENTA";
    AnsiColor[AnsiColor["BRIGHT_CYAN"] = 96] = "BRIGHT_CYAN";
    AnsiColor[AnsiColor["BRIGHT_WHITE"] = 97] = "BRIGHT_WHITE";
})(AnsiColor || (exports.AnsiColor = AnsiColor = {}));
/**
 * ANSI Background Color Codes
 */
var AnsiBgColor;
(function (AnsiBgColor) {
    AnsiBgColor[AnsiBgColor["BLACK"] = 40] = "BLACK";
    AnsiBgColor[AnsiBgColor["RED"] = 41] = "RED";
    AnsiBgColor[AnsiBgColor["GREEN"] = 42] = "GREEN";
    AnsiBgColor[AnsiBgColor["YELLOW"] = 43] = "YELLOW";
    AnsiBgColor[AnsiBgColor["BLUE"] = 44] = "BLUE";
    AnsiBgColor[AnsiBgColor["MAGENTA"] = 45] = "MAGENTA";
    AnsiBgColor[AnsiBgColor["CYAN"] = 46] = "CYAN";
    AnsiBgColor[AnsiBgColor["WHITE"] = 47] = "WHITE";
    AnsiBgColor[AnsiBgColor["BRIGHT_BLACK"] = 100] = "BRIGHT_BLACK";
    AnsiBgColor[AnsiBgColor["BRIGHT_RED"] = 101] = "BRIGHT_RED";
    AnsiBgColor[AnsiBgColor["BRIGHT_GREEN"] = 102] = "BRIGHT_GREEN";
    AnsiBgColor[AnsiBgColor["BRIGHT_YELLOW"] = 103] = "BRIGHT_YELLOW";
    AnsiBgColor[AnsiBgColor["BRIGHT_BLUE"] = 104] = "BRIGHT_BLUE";
    AnsiBgColor[AnsiBgColor["BRIGHT_MAGENTA"] = 105] = "BRIGHT_MAGENTA";
    AnsiBgColor[AnsiBgColor["BRIGHT_CYAN"] = 106] = "BRIGHT_CYAN";
    AnsiBgColor[AnsiBgColor["BRIGHT_WHITE"] = 107] = "BRIGHT_WHITE";
})(AnsiBgColor || (exports.AnsiBgColor = AnsiBgColor = {}));
