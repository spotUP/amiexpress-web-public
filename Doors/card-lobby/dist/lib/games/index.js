"use strict";
/**
 * The lobby's games, behind one seam.
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
exports.parseGameDefinition = exports.patienceRankValue = exports.buildPatienceDeck = exports.PatienceEngine = exports.buildVandtiaDeck = exports.cardValue = exports.burnsThePile = exports.isWild = exports.canPlayOn = exports.VandtiaEngine = exports.buildSkitgubbeDeck = exports.rankValue = exports.beats = exports.SUIT_NAMES = exports.SkitgubbeEngine = void 0;
__exportStar(require("./types"), exports);
__exportStar(require("./registry"), exports);
// Both engines export a `cardId`/`cardFromId` for their own card shape, so
// the barrel re-exports the types and the classes and leaves the helpers to
// be imported from the engine that owns them.
var engine_1 = require("./skitgubbe/engine");
Object.defineProperty(exports, "SkitgubbeEngine", { enumerable: true, get: function () { return engine_1.SkitgubbeEngine; } });
Object.defineProperty(exports, "SUIT_NAMES", { enumerable: true, get: function () { return engine_1.SUIT_NAMES; } });
Object.defineProperty(exports, "beats", { enumerable: true, get: function () { return engine_1.beats; } });
Object.defineProperty(exports, "rankValue", { enumerable: true, get: function () { return engine_1.rankValue; } });
Object.defineProperty(exports, "buildSkitgubbeDeck", { enumerable: true, get: function () { return engine_1.buildSkitgubbeDeck; } });
__exportStar(require("./skitgubbe/module"), exports);
var engine_2 = require("./vandtia/engine");
Object.defineProperty(exports, "VandtiaEngine", { enumerable: true, get: function () { return engine_2.VandtiaEngine; } });
Object.defineProperty(exports, "canPlayOn", { enumerable: true, get: function () { return engine_2.canPlayOn; } });
Object.defineProperty(exports, "isWild", { enumerable: true, get: function () { return engine_2.isWild; } });
Object.defineProperty(exports, "burnsThePile", { enumerable: true, get: function () { return engine_2.burnsThePile; } });
Object.defineProperty(exports, "cardValue", { enumerable: true, get: function () { return engine_2.cardValue; } });
Object.defineProperty(exports, "buildVandtiaDeck", { enumerable: true, get: function () { return engine_2.buildVandtiaDeck; } });
__exportStar(require("./vandtia/module"), exports);
var engine_3 = require("./patience/engine");
Object.defineProperty(exports, "PatienceEngine", { enumerable: true, get: function () { return engine_3.PatienceEngine; } });
Object.defineProperty(exports, "buildPatienceDeck", { enumerable: true, get: function () { return engine_3.buildPatienceDeck; } });
Object.defineProperty(exports, "patienceRankValue", { enumerable: true, get: function () { return engine_3.rankValue; } });
var parser_1 = require("./patience/parser");
Object.defineProperty(exports, "parseGameDefinition", { enumerable: true, get: function () { return parser_1.parseGameDefinition; } });
__exportStar(require("./patience/module"), exports);
