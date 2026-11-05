"use strict";
/**
 * Card Lobby - Managers Export
 * Central export point for all manager classes
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameStateManager = exports.DialogManager = exports.UIManager = void 0;
var UIManager_1 = require("./UIManager");
Object.defineProperty(exports, "UIManager", { enumerable: true, get: function () { return UIManager_1.UIManager; } });
var DialogManager_1 = require("./DialogManager");
Object.defineProperty(exports, "DialogManager", { enumerable: true, get: function () { return DialogManager_1.DialogManager; } });
var GameStateManager_1 = require("./GameStateManager");
Object.defineProperty(exports, "GameStateManager", { enumerable: true, get: function () { return GameStateManager_1.GameStateManager; } });
