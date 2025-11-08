"use strict";
/**
 * AmiExpress BBS Door SDK - Core Exports
 *
 * Main entry point for the SDK. Import everything you need from here.
 *
 * @example
 * ```typescript
 * import {
 *   Door,
 *   GraphicsEngine,
 *   PhysicsEngine,
 *   AudioEngine,
 *   MenuSystem,
 *   HUDBuilder
 * } from '@amiexpress/sdk';
 * ```
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
exports.SDK_VERSION = exports.DebugOverlay = exports.ReleasePacker = exports.ClassSystem = exports.QuestSystem = exports.DialogueSystem = exports.InventorySystem = exports.SaveManager = exports.LevelManager = exports.HUDBuilder = exports.MenuSystem = exports.TacticalCombatEngine = exports.AIEngine = exports.NetworkEngine = exports.AudioEngine = exports.PhysicsEngine = exports.GraphicsEngine = exports.Door = void 0;
exports.quickStart = quickStart;
// Core
const door_api_1 = require("./door-api");
Object.defineProperty(exports, "Door", { enumerable: true, get: function () { return door_api_1.Door; } });
__exportStar(require("./types"), exports);
// Engines
var graphics_engine_1 = require("../engines/graphics/graphics-engine");
Object.defineProperty(exports, "GraphicsEngine", { enumerable: true, get: function () { return graphics_engine_1.GraphicsEngine; } });
var physics_engine_1 = require("../engines/physics/physics-engine");
Object.defineProperty(exports, "PhysicsEngine", { enumerable: true, get: function () { return physics_engine_1.PhysicsEngine; } });
var audio_engine_1 = require("../engines/audio/audio-engine");
Object.defineProperty(exports, "AudioEngine", { enumerable: true, get: function () { return audio_engine_1.AudioEngine; } });
var network_engine_1 = require("../engines/network/network-engine");
Object.defineProperty(exports, "NetworkEngine", { enumerable: true, get: function () { return network_engine_1.NetworkEngine; } });
var ai_engine_1 = require("../engines/ai/ai-engine");
Object.defineProperty(exports, "AIEngine", { enumerable: true, get: function () { return ai_engine_1.AIEngine; } });
var tactical_combat_engine_1 = require("../engines/tactical/tactical-combat-engine");
Object.defineProperty(exports, "TacticalCombatEngine", { enumerable: true, get: function () { return tactical_combat_engine_1.TacticalCombatEngine; } });
// Components
var menu_system_1 = require("../components/menus/menu-system");
Object.defineProperty(exports, "MenuSystem", { enumerable: true, get: function () { return menu_system_1.MenuSystem; } });
var hud_builder_1 = require("../components/hud/hud-builder");
Object.defineProperty(exports, "HUDBuilder", { enumerable: true, get: function () { return hud_builder_1.HUDBuilder; } });
var level_manager_1 = require("../components/level/level-manager");
Object.defineProperty(exports, "LevelManager", { enumerable: true, get: function () { return level_manager_1.LevelManager; } });
var save_manager_1 = require("../components/save/save-manager");
Object.defineProperty(exports, "SaveManager", { enumerable: true, get: function () { return save_manager_1.SaveManager; } });
var inventory_system_1 = require("../components/inventory/inventory-system");
Object.defineProperty(exports, "InventorySystem", { enumerable: true, get: function () { return inventory_system_1.InventorySystem; } });
var dialogue_system_1 = require("../components/dialogue/dialogue-system");
Object.defineProperty(exports, "DialogueSystem", { enumerable: true, get: function () { return dialogue_system_1.DialogueSystem; } });
var quest_system_1 = require("../components/quest/quest-system");
Object.defineProperty(exports, "QuestSystem", { enumerable: true, get: function () { return quest_system_1.QuestSystem; } });
var class_system_1 = require("../components/tactical/class-system");
Object.defineProperty(exports, "ClassSystem", { enumerable: true, get: function () { return class_system_1.ClassSystem; } });
// Tools
var packer_1 = require("../tools/packer");
Object.defineProperty(exports, "ReleasePacker", { enumerable: true, get: function () { return packer_1.ReleasePacker; } });
var debug_overlay_1 = require("../tools/debug/debug-overlay");
Object.defineProperty(exports, "DebugOverlay", { enumerable: true, get: function () { return debug_overlay_1.DebugOverlay; } });
// Version
exports.SDK_VERSION = '1.0.0';
/**
 * Quick start helper - Creates a door with sensible defaults
 *
 * @param name - Door name
 * @param callback - Main door logic
 *
 * @example
 * ```typescript
 * import { quickStart } from '@amiexpress/sdk';
 *
 * quickStart('My Game', async (door, user) => {
 *   door.send(`Welcome ${user.name}!`);
 *   // Your game logic here
 * });
 * ```
 */
function quickStart(name, callback) {
    const door = new door_api_1.Door({
        name,
        version: '1.0.0',
        author: 'Unknown',
    });
    door.onConnect(async (user) => {
        await callback(door, user);
    });
    door.start();
}
