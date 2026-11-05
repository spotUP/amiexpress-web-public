"use strict";
/**
 * TetriNET winlist
 *
 * TetriNET does not rank players by score - it ranks them by wins, and the
 * points are fixed by the reference server (TetriNET2.Server/Game.cs, end of
 * game): the winner takes 3, the player who died LAST before them takes 2,
 * the one before that takes 1, and nobody else scores. Entries accumulate
 * across games and are keyed by player and team, so the same nick on two
 * teams keeps two records.
 *
 * The lobby's Winlist tab used to be filled from the door's own high score
 * table, which is a different thing entirely - a big solo score outranked
 * somebody who actually won matches.
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
exports.WinList = exports.WIN_POINTS = void 0;
exports.awardPoints = awardPoints;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/** Points the reference server awards, best placement first. */
exports.WIN_POINTS = [3, 2, 1];
/**
 * Award points for one finished game.
 *
 * @param finishers players in FINISHING order - the winner first, then the
 *   others by how long they survived (last death first), which is the order
 *   the reference server walks when handing out 2 and 1.
 */
function awardPoints(entries, finishers) {
    const updated = entries.map(entry => ({ ...entry }));
    finishers.slice(0, exports.WIN_POINTS.length).forEach((player, place) => {
        const team = player.team ?? '';
        let entry = updated.find(e => e.name === player.name && e.team === team);
        if (!entry) {
            entry = { name: player.name, team, points: 0, games: 0 };
            updated.push(entry);
        }
        entry.points += exports.WIN_POINTS[place];
        entry.games += 1;
    });
    return updated.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
}
class WinList {
    constructor(filePath) {
        this.filePath = filePath || path.join(__dirname, '../../data/tetrinet-winlist.json');
        this.data = this.load();
    }
    load() {
        try {
            if (fs.existsSync(this.filePath)) {
                return JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
            }
        }
        catch (error) {
            console.error('Failed to load TetriNET winlist:', error);
        }
        return { version: '1.0.0', entries: [] };
    }
    save() {
        try {
            fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
            fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
        }
        catch (error) {
            console.error('Failed to save TetriNET winlist:', error);
        }
    }
    /** Standings, highest first. */
    getEntries(limit = 10) {
        return this.data.entries.slice(0, limit);
    }
    /** Record one finished game and persist the new standings. */
    recordGame(finishers) {
        if (finishers.length === 0)
            return this.getEntries();
        this.data.entries = awardPoints(this.data.entries, finishers);
        this.save();
        return this.getEntries();
    }
    /** Replace the standings wholesale - used by the external server's winlist. */
    setEntries(entries) {
        this.data.entries = [...entries].sort((a, b) => b.points - a.points);
        this.save();
    }
}
exports.WinList = WinList;
//# sourceMappingURL=winlist.js.map