"use strict";
/**
 * Minimap Renderer
 *
 * Battle Royale opponent visualization.
 * Two modes driven by opponent count:
 *
 *   Bucket mode  (≤ BUCKET_THRESHOLD opponents):
 *     Each player = a narrow vertical bar that fills from the bottom as
 *     their stack grows.  Color changes green → yellow → red by danger.
 *
 *   Text list mode  (> BUCKET_THRESHOLD opponents):
 *     Ranked leaderboard showing name, level, and stack height.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpponentTracker = exports.MinimapRenderer = void 0;
// Opponents per row before switching to text list
const BUCKET_THRESHOLD = 10;
// Chars per bucket slot (bar width + 1 space separator)
const SLOT_W = 4; // 3-char bar + 1 space
const BAR_W = 3; // printable width of the bar
const BAR_H = 18; // rows dedicated to the bar (below the name row)
/**
 * MinimapRenderer — renders the battle-royale opponent panel.
 */
class MinimapRenderer {
    constructor(config) {
        this.config = {
            width: 10,
            height: 10,
            showName: true,
            showLevel: true,
            showGrade: true,
            compact: false,
            ...config,
        };
    }
    /**
     * Render opponents into `container`.
     * Switches between bucket bars and text list automatically.
     */
    renderBuckets(container, opponents) {
        const alive = opponents.filter(o => o.alive);
        const sorted = [...alive].sort((a, b) => {
            if (a.targeting && !b.targeting)
                return -1;
            if (!a.targeting && b.targeting)
                return 1;
            return (a.rank ?? 99) - (b.rank ?? 99);
        });
        const content = sorted.length > BUCKET_THRESHOLD
            ? this.buildTextList(sorted)
            : this.buildBuckets(sorted);
        container.setContent(content);
        container.screen?.render();
    }
    // ── private ────────────────────────────────────────────────────────────────
    /** Rows the stack occupies (0 = empty board, board.height = topped out). */
    stackHeight(board) {
        for (let y = 0; y < board.height; y++) {
            if (board.grid[y]?.some(c => c.filled)) {
                return board.height - y;
            }
        }
        return 0;
    }
    /** Color string based on fill fraction (0–1). */
    dangerColor(fraction, targeting) {
        if (targeting)
            return 'red';
        if (fraction >= 0.66)
            return 'red';
        if (fraction >= 0.33)
            return 'yellow';
        return 'green';
    }
    /**
     * Bucket bar mode — up to BUCKET_THRESHOLD players as vertical bars.
     *
     * Layout (container content, tags enabled):
     *   Row  0     : 3-char names, space-separated
     *   Rows 1-18  : bar fill (full blocks from bottom up)
     *   Row 19     : level numbers
     */
    buildBuckets(sorted) {
        const boardH = sorted[0]?.board?.height ?? 20;
        const stackH = sorted.map(o => this.stackHeight(o.board));
        // How many bar rows to fill (0 = empty, BAR_H = full)
        const fillH = stackH.map(h => Math.round(h * BAR_H / boardH));
        const fracs = stackH.map(h => h / boardH);
        const rows = [];
        // Row 0 — names
        let nameLine = '';
        for (let i = 0; i < sorted.length; i++) {
            const opp = sorted[i];
            const col = opp.targeting ? 'red' : fracs[i] >= 0.66 ? 'red' : fracs[i] >= 0.33 ? 'yellow' : 'cyan';
            const name = opp.name.substring(0, BAR_W).padEnd(BAR_W);
            nameLine += `{${col}-fg}${name}{/${col}-fg} `;
        }
        rows.push(nameLine);
        // Rows 1-BAR_H — vertical bars
        for (let row = 0; row < BAR_H; row++) {
            // row 0 = top of bar area, row BAR_H-1 = bottom
            let line = '';
            for (let i = 0; i < sorted.length; i++) {
                const fill = fillH[i];
                const filled = row >= BAR_H - fill; // fill from bottom
                if (filled) {
                    const col = this.dangerColor(fracs[i], sorted[i].targeting ?? false);
                    line += `{${col}-fg}${'█'.repeat(BAR_W)}{/${col}-fg} `;
                }
                else {
                    // Empty portion — faint dots so the bar outline is visible
                    line += `{gray-fg}${'·'.repeat(BAR_W)}{/gray-fg} `;
                }
            }
            rows.push(line);
        }
        // Row BAR_H+1 — level numbers
        let lvLine = '';
        for (let i = 0; i < sorted.length; i++) {
            const lv = String(sorted[i].level).padStart(BAR_W);
            const col = this.dangerColor(fracs[i], sorted[i].targeting ?? false);
            lvLine += `{${col}-fg}${lv}{/${col}-fg} `;
        }
        rows.push(lvLine);
        return rows.join('\n');
    }
    /**
     * Text list mode — ranked leaderboard for large lobbies.
     *
     * Format (41 chars wide):
     *   # Name       Lv Ht
     *   ─────────────────────
     *   1 Opponent1  05  12
     *   ...
     */
    buildTextList(sorted) {
        const boardH = sorted[0]?.board?.height ?? 20;
        const lines = [
            '{cyan-fg}# Name        Lv  Ht{/cyan-fg}',
            '{gray-fg}─────────────────────{/gray-fg}',
        ];
        const maxEntries = 18; // content area ≈ 20 rows; 2 used by header
        for (let i = 0; i < Math.min(sorted.length, maxEntries); i++) {
            const opp = sorted[i];
            const ht = this.stackHeight(opp.board);
            const frac = ht / boardH;
            const col = opp.targeting ? 'red'
                : frac >= 0.66 ? 'red'
                    : frac >= 0.33 ? 'yellow'
                        : 'white';
            const rank = String(i + 1).padStart(2);
            const name = opp.name.substring(0, 9).padEnd(9);
            const lv = String(opp.level).padStart(3);
            const htS = String(ht).padStart(3);
            lines.push(`{${col}-fg}${rank} ${name} ${lv} ${htS}{/${col}-fg}`);
        }
        return lines.join('\n');
    }
    /**
     * Update minimap configuration
     */
    setConfig(config) {
        this.config = { ...this.config, ...config };
    }
}
exports.MinimapRenderer = MinimapRenderer;
/**
 * Opponent Tracker — manages live opponent states.
 */
class OpponentTracker {
    constructor() {
        this.opponents = new Map();
    }
    updateOpponent(id, state) {
        const existing = this.opponents.get(id);
        if (existing) {
            this.opponents.set(id, { ...existing, ...state });
        }
        else {
            this.opponents.set(id, {
                id,
                name: state.name || 'Unknown',
                board: state.board,
                level: state.level || 1,
                grade: state.grade || '9',
                alive: state.alive !== false,
                targeting: state.targeting || false,
                rank: state.rank,
            });
        }
    }
    removeOpponent(id) {
        this.opponents.delete(id);
    }
    getOpponents() {
        return Array.from(this.opponents.values());
    }
    getAliveOpponents() {
        return this.getOpponents().filter(o => o.alive);
    }
    getTargetingOpponents() {
        return this.getOpponents().filter(o => o.targeting && o.alive);
    }
    clear() {
        this.opponents.clear();
    }
    count() {
        return this.opponents.size;
    }
    aliveCount() {
        return this.getAliveOpponents().length;
    }
}
exports.OpponentTracker = OpponentTracker;
//# sourceMappingURL=minimap.js.map