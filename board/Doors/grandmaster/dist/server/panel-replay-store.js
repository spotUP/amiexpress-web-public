"use strict";
/**
 * Where TETRIS ATTACK replays live.
 *
 * One JSON file per game, in panel-attack's ReplayV3 format, under the door's
 * data directory beside high-scores.json - the pattern this door already uses
 * for anything it must keep.
 *
 * DELIBERATELY NOT the gm_replays table. That table's columns are Tetris
 * shaped - final_grade, snapshots_data - and its rows hang off a foreign key
 * into gm_users that a door session need not have. More to the point, a file
 * IS the deliverable here: the thing on disk is exactly the file Panel Attack
 * opens, so a caller who wants their game can be handed it as it sits.
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
exports.PanelReplayStore = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/** Newest first, and never more than this many are listed. */
const DEFAULT_LIMIT = 50;
class PanelReplayStore {
    constructor(directory) {
        this.directory = directory ?? path.join(__dirname, '../../data/panel-replays');
    }
    /** Write a replay. Returns its id, or null if it could not be written. */
    save(fileName, replay) {
        try {
            fs.mkdirSync(this.directory, { recursive: true });
            // A replay is worth exactly nothing next to the game it came from, so a
            // failure here must never take the game down with it.
            fs.writeFileSync(path.join(this.directory, `${fileName}.json`), JSON.stringify(replay), 'utf-8');
            return fileName;
        }
        catch {
            return null;
        }
    }
    /** What is on disk, newest first. */
    list(limit = DEFAULT_LIMIT) {
        let names;
        try {
            names = fs.readdirSync(this.directory).filter((name) => name.endsWith('.json'));
        }
        catch {
            return [];
        }
        const replays = [];
        for (const name of names) {
            const replay = this.read(name.replace(/\.json$/, ''));
            if (replay)
                replays.push(replay);
        }
        replays.sort((a, b) => b.timestamp - a.timestamp);
        return replays.slice(0, limit);
    }
    /** The listing entry for one replay, or null if it will not parse. */
    read(id) {
        const json = this.load(id);
        if (!json)
            return null;
        try {
            const parsed = JSON.parse(json);
            const player = parsed.metadata.stacks[0];
            return {
                id,
                playerName: player?.name ?? 'UNKNOWN',
                mode: parsed.metadata.gameModeName,
                timestamp: parsed.metadata.timestamp,
                duration: parsed.metadata.duration ?? 0,
                completed: parsed.metadata.completed === true,
            };
        }
        catch {
            return null;
        }
    }
    /** The file itself, for playback. */
    load(id) {
        // The id comes from a listing, but it also comes from a caller typing one,
        // so it must not be able to walk out of the directory.
        if (id.includes('/') || id.includes('\\') || id.includes('..'))
            return null;
        try {
            return fs.readFileSync(path.join(this.directory, `${id}.json`), 'utf-8');
        }
        catch {
            return null;
        }
    }
    delete(id) {
        if (id.includes('/') || id.includes('\\') || id.includes('..'))
            return false;
        try {
            fs.unlinkSync(path.join(this.directory, `${id}.json`));
            return true;
        }
        catch {
            return false;
        }
    }
}
exports.PanelReplayStore = PanelReplayStore;
//# sourceMappingURL=panel-replay-store.js.map