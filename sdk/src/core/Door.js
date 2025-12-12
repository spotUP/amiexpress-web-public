"use strict";
/**
 * Door - Base Class for BBS Doors
 *
 * Professional door framework with lifecycle hooks and type safety
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
exports.Door = void 0;
var Output_1 = require("./Output");
var Input_1 = require("./Input");
var Storage_1 = require("./Storage");
var Door = /** @class */ (function () {
    function Door(config) {
        this.startHandlers = [];
        this.inputHandlers = [];
        this.closeHandlers = [];
        this.errorHandlers = [];
        this.isRunning = false;
        this.config = config;
    }
    // ===== Lifecycle Registration =====
    /**
     * Register a handler to run when the door starts
     */
    Door.prototype.onStart = function (handler) {
        this.startHandlers.push(handler);
        return this;
    };
    /**
     * Register a handler to run on user input
     */
    Door.prototype.onInput = function (handler) {
        this.inputHandlers.push(handler);
        return this;
    };
    /**
     * Register a handler to run when the door closes
     */
    Door.prototype.onClose = function (handler) {
        this.closeHandlers.push(handler);
        return this;
    };
    /**
     * Register an error handler
     */
    Door.prototype.onError = function (handler) {
        this.errorHandlers.push(handler);
        return this;
    };
    // ===== Door Execution =====
    /**
     * Execute the door
     *
     * This is called by the BBS backend when a user runs the door
     */
    Door.prototype.execute = function (rawSession) {
        return __awaiter(this, void 0, void 0, function () {
            var socket, bbsSession, user, _a, params, bbs, context, _i, _b, handler, _c, _d, handler, error_1, _e, _f, handler;
            return __generator(this, function (_g) {
                switch (_g.label) {
                    case 0:
                        if (this.isRunning) {
                            throw new Error('Door is already running');
                        }
                        this.isRunning = true;
                        socket = rawSession.socket, bbsSession = rawSession.bbsSession, user = rawSession.user, _a = rawSession.params, params = _a === void 0 ? [] : _a, bbs = rawSession.bbs;
                        context = this.createContext(socket, bbsSession, user, params, bbs);
                        _g.label = 1;
                    case 1:
                        _g.trys.push([1, 12, 17, 18]);
                        _i = 0, _b = this.startHandlers;
                        _g.label = 2;
                    case 2:
                        if (!(_i < _b.length)) return [3 /*break*/, 5];
                        handler = _b[_i];
                        return [4 /*yield*/, handler(context)];
                    case 3:
                        _g.sent();
                        _g.label = 4;
                    case 4:
                        _i++;
                        return [3 /*break*/, 2];
                    case 5:
                        if (!(this.inputHandlers.length > 0)) return [3 /*break*/, 7];
                        return [4 /*yield*/, this.runInputLoop(socket, bbsSession, context)];
                    case 6:
                        _g.sent();
                        _g.label = 7;
                    case 7:
                        _c = 0, _d = this.closeHandlers;
                        _g.label = 8;
                    case 8:
                        if (!(_c < _d.length)) return [3 /*break*/, 11];
                        handler = _d[_c];
                        return [4 /*yield*/, handler(context)];
                    case 9:
                        _g.sent();
                        _g.label = 10;
                    case 10:
                        _c++;
                        return [3 /*break*/, 8];
                    case 11: return [3 /*break*/, 18];
                    case 12:
                        error_1 = _g.sent();
                        _e = 0, _f = this.errorHandlers;
                        _g.label = 13;
                    case 13:
                        if (!(_e < _f.length)) return [3 /*break*/, 16];
                        handler = _f[_e];
                        return [4 /*yield*/, handler(context, error_1)];
                    case 14:
                        _g.sent();
                        _g.label = 15;
                    case 15:
                        _e++;
                        return [3 /*break*/, 13];
                    case 16:
                        // Re-throw if no error handlers
                        if (this.errorHandlers.length === 0) {
                            throw error_1;
                        }
                        return [3 /*break*/, 18];
                    case 17:
                        this.isRunning = false;
                        return [7 /*endfinally*/];
                    case 18: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Exit the door
     *
     * Can be called from within handlers to immediately close the door
     */
    Door.prototype.exit = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.isRunning = false;
                return [2 /*return*/];
            });
        });
    };
    // ===== Internal Methods =====
    Door.prototype.createContext = function (socket, bbsSession, user, params, bbs) {
        var output = new Output_1.Output(socket);
        var input = new Input_1.Input(bbsSession, output);
        var storage = new Storage_1.Storage({
            doorName: this.config.name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
            userId: user.id,
        });
        return {
            user: user,
            nodeId: bbsSession.nodeId || 1,
            output: output,
            input: input,
            storage: storage,
            params: params,
            bbs: bbs,
        };
    };
    Door.prototype.runInputLoop = function (socket, bbsSession, context) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve) {
                        var handler = function (data) { return __awaiter(_this, void 0, void 0, function () {
                            var keyPress, _i, _a, inputHandler, error_2, _b, _c, errorHandler;
                            return __generator(this, function (_d) {
                                switch (_d.label) {
                                    case 0:
                                        if (!this.isRunning) {
                                            bbsSession.doorInputHandler = null;
                                            resolve();
                                            return [2 /*return*/];
                                        }
                                        _d.label = 1;
                                    case 1:
                                        _d.trys.push([1, 6, , 11]);
                                        keyPress = {
                                            key: data,
                                            raw: data,
                                            ctrl: false,
                                            alt: false,
                                            shift: false,
                                            meta: false,
                                        };
                                        _i = 0, _a = this.inputHandlers;
                                        _d.label = 2;
                                    case 2:
                                        if (!(_i < _a.length)) return [3 /*break*/, 5];
                                        inputHandler = _a[_i];
                                        return [4 /*yield*/, inputHandler(context, keyPress)];
                                    case 3:
                                        _d.sent();
                                        _d.label = 4;
                                    case 4:
                                        _i++;
                                        return [3 /*break*/, 2];
                                    case 5: return [3 /*break*/, 11];
                                    case 6:
                                        error_2 = _d.sent();
                                        _b = 0, _c = this.errorHandlers;
                                        _d.label = 7;
                                    case 7:
                                        if (!(_b < _c.length)) return [3 /*break*/, 10];
                                        errorHandler = _c[_b];
                                        return [4 /*yield*/, errorHandler(context, error_2)];
                                    case 8:
                                        _d.sent();
                                        _d.label = 9;
                                    case 9:
                                        _b++;
                                        return [3 /*break*/, 7];
                                    case 10:
                                        // Re-throw if no error handlers
                                        if (this.errorHandlers.length === 0) {
                                            throw error_2;
                                        }
                                        return [3 /*break*/, 11];
                                    case 11: return [2 /*return*/];
                                }
                            });
                        }); };
                        bbsSession.doorInputHandler = handler;
                        // Handle disconnection
                        socket.once('disconnect', function () {
                            bbsSession.doorInputHandler = null;
                            _this.isRunning = false;
                            resolve();
                        });
                        // Handle door:close event
                        socket.once('door:close', function () {
                            bbsSession.doorInputHandler = null;
                            _this.isRunning = false;
                            resolve();
                        });
                    })];
            });
        });
    };
    // ===== Getters =====
    Door.prototype.getConfig = function () {
        return __assign({}, this.config);
    };
    Door.prototype.isActive = function () {
        return this.isRunning;
    };
    return Door;
}());
exports.Door = Door;
