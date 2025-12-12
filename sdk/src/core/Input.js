"use strict";
/**
 * Input - User Input Abstraction Layer
 *
 * Provides clean API for handling user input
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
exports.Input = void 0;
var Input = /** @class */ (function () {
    function Input(bbsSession, output) {
        this.timeoutMs = null;
        this.bbsSession = bbsSession;
        this.output = output;
    }
    // ===== Timeout Management =====
    Input.prototype.setTimeout = function (ms) {
        this.timeoutMs = ms;
    };
    Input.prototype.clearTimeout = function () {
        this.timeoutMs = null;
    };
    // ===== Core Input Methods =====
    Input.prototype.waitForKey = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        var timeout = null;
                        var handler = function (data) {
                            if (timeout)
                                clearTimeout(timeout);
                            _this.bbsSession.doorInputHandler = null;
                            resolve(_this.parseKeyPress(data));
                        };
                        _this.bbsSession.doorInputHandler = handler;
                        if (_this.timeoutMs) {
                            timeout = setTimeout(function () {
                                _this.bbsSession.doorInputHandler = null;
                                reject(new Error('Input timeout'));
                            }, _this.timeoutMs);
                        }
                    })];
            });
        });
    };
    Input.prototype.waitForKeyPress = function (key) {
        return __awaiter(this, void 0, void 0, function () {
            var press;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!true) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.waitForKey()];
                    case 1:
                        press = _a.sent();
                        if (press.key === key) {
                            return [2 /*return*/];
                        }
                        return [3 /*break*/, 0];
                    case 2: return [2 /*return*/];
                }
            });
        });
    };
    Input.prototype.getChar = function () {
        return __awaiter(this, void 0, void 0, function () {
            var press;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.waitForKey()];
                    case 1:
                        press = _a.sent();
                        return [2 /*return*/, press.key];
                }
            });
        });
    };
    Input.prototype.getLine = function (prompt_1) {
        return __awaiter(this, arguments, void 0, function (prompt, maxLength) {
            var input, press;
            if (maxLength === void 0) { maxLength = 255; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!prompt) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.output.write(prompt)];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        input = '';
                        _a.label = 3;
                    case 3:
                        if (!true) return [3 /*break*/, 12];
                        return [4 /*yield*/, this.waitForKey()];
                    case 4:
                        press = _a.sent();
                        if (!(press.key === '\r' || press.key === '\n')) return [3 /*break*/, 6];
                        return [4 /*yield*/, this.output.writeLine('')];
                    case 5:
                        _a.sent();
                        return [2 /*return*/, input];
                    case 6:
                        if (!(press.key === '\x7f' || press.key === '\b')) return [3 /*break*/, 9];
                        if (!(input.length > 0)) return [3 /*break*/, 8];
                        input = input.slice(0, -1);
                        return [4 /*yield*/, this.output.write('\b \b')];
                    case 7:
                        _a.sent();
                        _a.label = 8;
                    case 8: return [3 /*break*/, 3];
                    case 9:
                        // Handle escape
                        if (press.key === '\x1b') {
                            return [2 /*return*/, ''];
                        }
                        if (!(press.key.length === 1 && press.key >= ' ' && press.key <= '~')) return [3 /*break*/, 11];
                        if (!(input.length < maxLength)) return [3 /*break*/, 11];
                        input += press.key;
                        return [4 /*yield*/, this.output.write(press.key)];
                    case 10:
                        _a.sent();
                        _a.label = 11;
                    case 11: return [3 /*break*/, 3];
                    case 12: return [2 /*return*/];
                }
            });
        });
    };
    Input.prototype.getYesNo = function (prompt) {
        return __awaiter(this, void 0, void 0, function () {
            var press, key;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!prompt) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.output.write(prompt + ' (Y/N): ')];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        if (!true) return [3 /*break*/, 8];
                        return [4 /*yield*/, this.waitForKey()];
                    case 3:
                        press = _a.sent();
                        key = press.key.toLowerCase();
                        if (!(key === 'y')) return [3 /*break*/, 5];
                        return [4 /*yield*/, this.output.writeLine('Yes')];
                    case 4:
                        _a.sent();
                        return [2 /*return*/, true];
                    case 5:
                        if (!(key === 'n')) return [3 /*break*/, 7];
                        return [4 /*yield*/, this.output.writeLine('No')];
                    case 6:
                        _a.sent();
                        return [2 /*return*/, false];
                    case 7: return [3 /*break*/, 2];
                    case 8: return [2 /*return*/];
                }
            });
        });
    };
    Input.prototype.getNumber = function (prompt, min, max) {
        return __awaiter(this, void 0, void 0, function () {
            var line, num;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!true) return [3 /*break*/, 8];
                        return [4 /*yield*/, this.getLine(prompt)];
                    case 1:
                        line = _a.sent();
                        num = parseInt(line, 10);
                        if (!isNaN(num)) return [3 /*break*/, 3];
                        return [4 /*yield*/, this.output.writeLine('Invalid number. Try again.')];
                    case 2:
                        _a.sent();
                        return [3 /*break*/, 0];
                    case 3:
                        if (!(min !== undefined && num < min)) return [3 /*break*/, 5];
                        return [4 /*yield*/, this.output.writeLine("Number must be at least ".concat(min, "."))];
                    case 4:
                        _a.sent();
                        return [3 /*break*/, 0];
                    case 5:
                        if (!(max !== undefined && num > max)) return [3 /*break*/, 7];
                        return [4 /*yield*/, this.output.writeLine("Number must be at most ".concat(max, "."))];
                    case 6:
                        _a.sent();
                        return [3 /*break*/, 0];
                    case 7: return [2 /*return*/, num];
                    case 8: return [2 /*return*/];
                }
            });
        });
    };
    Input.prototype.getChoice = function (prompt, choices) {
        return __awaiter(this, void 0, void 0, function () {
            var num;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.output.writeLine(prompt)];
                    case 1:
                        _a.sent();
                        choices.forEach(function (choice, i) {
                            _this.output.writeLine("".concat(i + 1, ". ").concat(choice));
                        });
                        _a.label = 2;
                    case 2:
                        if (!true) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.getNumber('Choice: ', 1, choices.length)];
                    case 3:
                        num = _a.sent();
                        if (num >= 1 && num <= choices.length) {
                            return [2 /*return*/, num - 1];
                        }
                        return [3 /*break*/, 2];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    // ===== Helper Methods =====
    Input.prototype.parseKeyPress = function (data) {
        var press = {
            key: data,
            raw: data,
            ctrl: false,
            alt: false,
            shift: false,
            meta: false,
        };
        // Detect ctrl keys (ASCII 1-26)
        if (data.length === 1 && data.charCodeAt(0) >= 1 && data.charCodeAt(0) <= 26) {
            press.ctrl = true;
            press.key = String.fromCharCode(data.charCodeAt(0) + 96); // Convert to letter
        }
        // Detect alt keys (starts with ESC)
        if (data.length === 2 && data[0] === '\x1b') {
            press.alt = true;
            press.key = data[1];
        }
        return press;
    };
    return Input;
}());
exports.Input = Input;
