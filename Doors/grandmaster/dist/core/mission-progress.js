"use strict";
/**
 * MISSION mode - who has cleared what.
 *
 * Free selection was the call: every mission in a pack is playable from the
 * start, and this file is the record of which ones a player has beaten and
 * how quickly. That makes the select screen a progress board rather than a
 * lock screen.
 *
 * Stored as JSON beside the door's other data, resolved through
 * resolveDoorRoot() - never `process.cwd()` or a bare `__dirname`, which two
 * repo tests fail on.
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
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.MissionProgress = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const settings_1 = require("@amiexpress/bbs-door-sdk/settings");
const EMPTY = { version: '1.0.0', players: {} };
class MissionProgress {
    constructor(filePath, startDir = __dirname) {
        this.filePath = filePath ?? path.join((0, settings_1.resolveDoorRoot)(startDir), 'data', 'mission-progress.json');
        this.data = this.load();
    }
    load() {
        try {
            if (fs.existsSync(this.filePath)) {
                const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
                if (parsed && typeof parsed === 'object' && parsed.players)
                    return parsed;
            }
        }
        catch {
            // A corrupt or unreadable record must not stop anyone playing; it is
            // progress, not save data, and it rebuilds itself from the next clear.
        }
        return { ...EMPTY, players: {} };
    }
    save() {
        try {
            fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
            fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
        }
        catch {
            // Same again: a read-only data directory costs the record, not the game.
        }
    }
    /** Every clear this player has in this pack. */
    getClears(player, pack) {
        return this.data.players[player]?.[pack] ?? {};
    }
    getClear(player, pack, missionId) {
        return this.getClears(player, pack)[missionId] ?? null;
    }
    /**
     * Record a clear. A slower repeat is kept out: the record is the best time,
     * so beating a mission again never makes the board look worse.
     */
    recordClear(player, pack, missionId, seconds) {
        const existing = this.getClear(player, pack, missionId);
        if (existing && existing.seconds <= seconds)
            return existing;
        const clear = { seconds, date: new Date().toISOString() };
        const packs = this.data.players[player] ?? (this.data.players[player] = {});
        const missions = packs[pack] ?? (packs[pack] = {});
        missions[missionId] = clear;
        this.save();
        return clear;
    }
    /** How many of `total` this player has cleared, for the pack's header line. */
    countClears(player, pack) {
        return Object.keys(this.getClears(player, pack)).length;
    }
}
exports.MissionProgress = MissionProgress;
//# sourceMappingURL=mission-progress.js.map