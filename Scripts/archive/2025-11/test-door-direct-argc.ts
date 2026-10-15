#!/usr/bin/env tsx
"use strict";
/**
 * Direct test of GetAnswer door with argc/argv restore fix
 *
 * Tests if restoring D0 (argc) and A0 (argv) after delay loop bypass
 * allows the door to progress past initialization and send messages.
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
var AmigaDoorSession_1 = require("./web/backend/src/amiga-emulation/AmigaDoorSession");
var path_1 = require("path");
var url_1 = require("url");
var __filename = (0, url_1.fileURLToPath)(import.meta.url);
var __dirname = path_1.default.dirname(__filename);
console.log('=== GetAnswer Door Test with argc/argv Restore ===\n');
function testDoor() {
    return __awaiter(this, void 0, void 0, function () {
        var mockSocket, mockConfig, doorPath, session, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    mockSocket = {
                        emit: function (event, data) {
                            if (event === 'ansi-output') {
                                console.log("[DOOR OUTPUT] ".concat(data.replace(/\r\n/g, '\n')));
                            }
                        }
                    };
                    mockConfig = {
                        bbsSession: {
                            nodeId: 0,
                            user: {
                                username: 'Sysop',
                                location: 'Test Location',
                                secLevel: 255
                            }
                        }
                    };
                    // Create door session
                    console.log('Creating door session...');
                    doorPath = path_1.default.join(__dirname, 'Doors/GetAnswer/GetAnswer');
                    session = new AmigaDoorSession_1.AmigaDoorSession(mockSocket, mockConfig, doorPath);
                    // Start door execution
                    console.log('Starting door execution...');
                    console.log('Watch for:');
                    console.log('  1. "Restored D0 (argc): 2" - argc/argv restored after delay loop');
                    console.log('  2. "DOOR MESSAGE RECEIVED" - Door sent message to BBS');
                    console.log('  3. "Processing command" - Command handler activated\n');
                    return [4 /*yield*/, session.start()];
                case 1:
                    _a.sent();
                    console.log('\n=== Test Complete ===');
                    console.log('Check the output above for:');
                    console.log('  - Did we see "Restored D0 (argc): 2"?');
                    console.log('  - Did door progress past PC=0x96ac4?');
                    console.log('  - Did door send any messages to AEDoorPort0?');
                    process.exit(0);
                    return [3 /*break*/, 3];
                case 2:
                    error_1 = _a.sent();
                    console.error('Test error:', error_1);
                    process.exit(1);
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    });
}
testDoor();
