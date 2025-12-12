"use strict";
/**
 * Output - ANSI Output Abstraction Layer
 *
 * Provides clean API for terminal output with ANSI escape codes
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Output = void 0;
var Output = /** @class */ (function () {
    function Output(socket) {
        this.socket = socket;
    }
    // ===== Basic Output =====
    Output.prototype.write = function (text) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.socket.emit('ansi-output', text);
                return [2 /*return*/];
            });
        });
    };
    Output.prototype.writeLine = function (text) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.socket.emit('ansi-output', text + '\r\n');
                return [2 /*return*/];
            });
        });
    };
    // ===== Screen Control =====
    Output.prototype.clear = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.socket.emit('ansi-output', '\x1b[2J\x1b[H');
                return [2 /*return*/];
            });
        });
    };
    Output.prototype.moveCursor = function (row, col) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.socket.emit('ansi-output', "\u001B[".concat(row, ";").concat(col, "H"));
                return [2 /*return*/];
            });
        });
    };
    Output.prototype.saveCursor = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.socket.emit('ansi-output', '\x1b[s');
                return [2 /*return*/];
            });
        });
    };
    Output.prototype.restoreCursor = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.socket.emit('ansi-output', '\x1b[u');
                return [2 /*return*/];
            });
        });
    };
    Output.prototype.hideCursor = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.socket.emit('ansi-output', '\x1b[?25l');
                return [2 /*return*/];
            });
        });
    };
    Output.prototype.showCursor = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.socket.emit('ansi-output', '\x1b[?25h');
                return [2 /*return*/];
            });
        });
    };
    Output.prototype.eraseToEndOfLine = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.socket.emit('ansi-output', '\x1b[K');
                return [2 /*return*/];
            });
        });
    };
    Output.prototype.eraseToEndOfScreen = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.socket.emit('ansi-output', '\x1b[J');
                return [2 /*return*/];
            });
        });
    };
    Output.prototype.scroll = function (lines) {
        return __awaiter(this, void 0, void 0, function () {
            var code;
            return __generator(this, function (_a) {
                code = lines > 0 ? "\u001B[".concat(lines, "S") : "\u001B[".concat(-lines, "T");
                this.socket.emit('ansi-output', code);
                return [2 /*return*/];
            });
        });
    };
    // ===== Color and Style =====
    Output.prototype.setForeground = function (color) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.socket.emit('ansi-output', "\u001B[0;3".concat(color, "m"));
                return [2 /*return*/];
            });
        });
    };
    Output.prototype.setBackground = function (color) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.socket.emit('ansi-output', "\u001B[4".concat(color, "m"));
                return [2 /*return*/];
            });
        });
    };
    Output.prototype.setStyle = function (style) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.socket.emit('ansi-output', "\u001B[".concat(style, "m"));
                return [2 /*return*/];
            });
        });
    };
    Output.prototype.reset = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.socket.emit('ansi-output', '\x1b[0m');
                return [2 /*return*/];
            });
        });
    };
    // ===== Convenience Methods =====
    Output.prototype.coloredText = function (text, fg, bg) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.setForeground(fg)];
                    case 1:
                        _a.sent();
                        if (!(bg !== undefined)) return [3 /*break*/, 3];
                        return [4 /*yield*/, this.setBackground(bg)];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3: return [4 /*yield*/, this.write(text)];
                    case 4:
                        _a.sent();
                        return [4 /*yield*/, this.reset()];
                    case 5:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    Output.prototype.centerText = function (text_1) {
        return __awaiter(this, arguments, void 0, function (text, width) {
            var padding;
            if (width === void 0) { width = 80; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        padding = Math.max(0, Math.floor((width - text.length) / 2));
                        return [4 /*yield*/, this.write(' '.repeat(padding) + text)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    Output.prototype.box = function (text_1) {
        return __awaiter(this, arguments, void 0, function (text, width) {
            var top, padded, bottom;
            if (width === void 0) { width = 80; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        top = '+' + '-'.repeat(width - 2) + '+';
                        padded = '| ' + text.padEnd(width - 4) + ' |';
                        bottom = '+' + '-'.repeat(width - 2) + '+';
                        return [4 /*yield*/, this.writeLine(top)];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.writeLine(padded)];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, this.writeLine(bottom)];
                    case 3:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    Output.prototype.progressBar = function (current_1, total_1) {
        return __awaiter(this, arguments, void 0, function (current, total, width) {
            var percent, filled, empty, bar;
            if (width === void 0) { width = 50; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        percent = Math.min(100, Math.max(0, Math.floor((current / total) * 100)));
                        filled = Math.floor((percent / 100) * width);
                        empty = width - filled;
                        bar = '[' + '='.repeat(filled) + ' '.repeat(empty) + ']';
                        return [4 /*yield*/, this.write("".concat(bar, " ").concat(percent, "%"))];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    return Output;
}());
exports.Output = Output;
