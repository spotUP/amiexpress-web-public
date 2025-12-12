"use strict";
/**
 * Storage - Persistent Data Storage API
 *
 * Provides clean API for saving/loading door data
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
exports.Storage = void 0;
var fs = require("fs");
var path = require("path");
var Storage = /** @class */ (function () {
    function Storage(options, baseDir) {
        if (baseDir === void 0) { baseDir = process.cwd(); }
        var doorName = options.doorName, userId = options.userId, global = options.global;
        // Build storage path
        var storagePath = path.join(baseDir, 'data', 'doors', doorName);
        if (!global && userId) {
            storagePath = path.join(storagePath, 'users', userId);
        }
        else if (!global) {
            throw new Error('Storage requires either userId or global flag');
        }
        this.storageDir = storagePath;
        // Ensure directory exists
        if (!fs.existsSync(this.storageDir)) {
            fs.mkdirSync(this.storageDir, { recursive: true });
        }
    }
    // ===== Core Methods =====
    Storage.prototype.save = function (key, data) {
        return __awaiter(this, void 0, void 0, function () {
            var filePath, json;
            return __generator(this, function (_a) {
                filePath = this.getFilePath(key);
                json = JSON.stringify(data, null, 2);
                fs.writeFileSync(filePath, json, 'utf8');
                return [2 /*return*/];
            });
        });
    };
    Storage.prototype.load = function (key) {
        return __awaiter(this, void 0, void 0, function () {
            var filePath, json;
            return __generator(this, function (_a) {
                filePath = this.getFilePath(key);
                if (!fs.existsSync(filePath)) {
                    return [2 /*return*/, null];
                }
                try {
                    json = fs.readFileSync(filePath, 'utf8');
                    return [2 /*return*/, JSON.parse(json)];
                }
                catch (error) {
                    console.error("[Storage] Error loading ".concat(key, ":"), error);
                    return [2 /*return*/, null];
                }
                return [2 /*return*/];
            });
        });
    };
    Storage.prototype.delete = function (key) {
        return __awaiter(this, void 0, void 0, function () {
            var filePath;
            return __generator(this, function (_a) {
                filePath = this.getFilePath(key);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
                return [2 /*return*/];
            });
        });
    };
    Storage.prototype.exists = function (key) {
        return __awaiter(this, void 0, void 0, function () {
            var filePath;
            return __generator(this, function (_a) {
                filePath = this.getFilePath(key);
                return [2 /*return*/, fs.existsSync(filePath)];
            });
        });
    };
    Storage.prototype.keys = function () {
        return __awaiter(this, void 0, void 0, function () {
            var files;
            return __generator(this, function (_a) {
                if (!fs.existsSync(this.storageDir)) {
                    return [2 /*return*/, []];
                }
                files = fs.readdirSync(this.storageDir);
                return [2 /*return*/, files
                        .filter(function (f) { return f.endsWith('.json'); })
                        .map(function (f) { return f.replace(/\.json$/, ''); })];
            });
        });
    };
    Storage.prototype.clear = function () {
        return __awaiter(this, void 0, void 0, function () {
            var allKeys, _i, allKeys_1, key;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.keys()];
                    case 1:
                        allKeys = _a.sent();
                        _i = 0, allKeys_1 = allKeys;
                        _a.label = 2;
                    case 2:
                        if (!(_i < allKeys_1.length)) return [3 /*break*/, 5];
                        key = allKeys_1[_i];
                        return [4 /*yield*/, this.delete(key)];
                    case 3:
                        _a.sent();
                        _a.label = 4;
                    case 4:
                        _i++;
                        return [3 /*break*/, 2];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    // ===== Helper Methods =====
    Storage.prototype.getFilePath = function (key) {
        var filename = "".concat(key, ".json");
        return path.join(this.storageDir, filename);
    };
    Storage.prototype.getStorageDir = function () {
        return this.storageDir;
    };
    return Storage;
}());
exports.Storage = Storage;
