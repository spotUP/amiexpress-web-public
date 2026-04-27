"use strict";
/**
 * Minimap Renderer
 *
 * Compact opponent board visualization using single-character blocks
 * Optimized for Battle Royale mode (up to 99 players)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpponentTracker = exports.MinimapRenderer = void 0;
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
/**
 * Minimap Renderer
 *
 * Renders opponent boards in compact single-character format
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
     * Render a single opponent minimap
     */
    renderMinimap(opponent) {
        const board = opponent.board;
        let output = '';
        // Header (name, level, grade)
        if (!this.config.compact) {
            if (this.config.showName) {
                const nameColor = opponent.targeting ? 'red' : opponent.alive ? 'white' : 'gray';
                const name = opponent.name.substring(0, this.config.width);
                output += `{${nameColor}-fg}${name.padEnd(this.config.width)}{/${nameColor}-fg}\n`;
            }
            if (this.config.showLevel || this.config.showGrade) {
                let info = '';
                if (this.config.showLevel)
                    info += `L${opponent.level}`;
                if (this.config.showGrade)
                    info += ` ${opponent.grade}`;
                output += `{gray-fg}${info.substring(0, this.config.width).padEnd(this.config.width)}{/gray-fg}\n`;
            }
        }
        // Board - render top N rows (reversed, so top of board is at top)
        const startY = Math.max(0, board.height - this.config.height);
        for (let y = startY; y < board.height; y++) {
            for (let x = 0; x < board.width; x++) {
                const cell = board.grid[y][x];
                if (cell.filled) {
                    const color = this.getPieceColor(cell.color);
                    output += `{${color}-fg}█{/${color}-fg}`;
                }
                else {
                    output += ' ';
                }
            }
            output += '\n';
        }
        return output;
    }
    /**
     * Render multiple opponent minimaps in a grid layout
     */
    renderMinimapGrid(parent, opponents, maxVisible = 6) {
        // Clear existing minimaps
        parent.children
            .filter(c => c.minimapId)
            .forEach(c => c.destroy());
        // Sort opponents: targeting you first, then by rank
        const sorted = [...opponents]
            .filter(o => o.alive)
            .sort((a, b) => {
            if (a.targeting && !b.targeting)
                return -1;
            if (!a.targeting && b.targeting)
                return 1;
            return (a.rank || 99) - (b.rank || 99);
        })
            .slice(0, maxVisible);
        // Layout: fit into the parent container width dynamically.
        // Use up to 3 columns; each minimap is 13w (10 content + 2 border + 1 pad).
        const count = sorted.length;
        const cols = count === 1 ? 1 : count <= 4 ? 2 : 3;
        const minimapWidth = cols === 1 ? 26 : cols === 2 ? 20 : 13;
        const minimapHeight = this.config.compact ? 12 : 15;
        // Render each minimap
        sorted.forEach((opponent, index) => {
            const col = index % cols;
            const row = Math.floor(index / cols);
            const minimapBox = (0, blessed_helpers_1.createBox)({
                parent,
                top: row * minimapHeight,
                left: col * minimapWidth,
                width: minimapWidth,
                height: minimapHeight,
                border: {
                    type: 'line',
                },
                style: {
                    border: {
                        fg: opponent.targeting ? 'red' : opponent.rank === 1 ? 'yellow' : 'gray',
                    },
                },
                content: this.renderMinimap(opponent),
                focusable: false,
                mouse: false,
                clickable: false,
            });
            // Mark as minimap for cleanup
            minimapBox.minimapId = opponent.id;
        });
        parent.screen?.render();
    }
    /**
     * Render Battle Royale HUD with rank and alive count
     */
    renderBattleRoyaleHUD(screen, rank, aliveCount, totalPlayers) {
        const hudBox = (0, blessed_helpers_1.createBox)({
            parent: screen,
            top: 0,
            right: 0,
            width: 20,
            height: 5,
            border: { type: 'line' },
            style: {
                border: { fg: 'yellow' },
            },
            content: `{bold}BATTLE ROYALE{/bold}\n\n` +
                `  Rank:  {yellow-fg}#${rank}{/yellow-fg}\n` +
                `  Alive: {green-fg}${aliveCount}{/green-fg}/{gray-fg}${totalPlayers}{/gray-fg}`,
            fixed: true,
        });
        hudBox.isBattleRoyaleHUD = true;
    }
    /**
     * Get ANSI color for piece type (single character display)
     */
    getPieceColor(type) {
        const colors = {
            I: 'cyan',
            O: 'yellow',
            T: 'magenta',
            S: 'green',
            Z: 'red',
            J: 'blue',
            L: 'white',
        };
        return colors[type] || 'white';
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
 * Opponent Tracker
 *
 * Manages opponent states for minimap display
 */
class OpponentTracker {
    constructor() {
        this.opponents = new Map();
    }
    /**
     * Add or update opponent
     */
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
    /**
     * Remove opponent
     */
    removeOpponent(id) {
        this.opponents.delete(id);
    }
    /**
     * Get all opponents
     */
    getOpponents() {
        return Array.from(this.opponents.values());
    }
    /**
     * Get alive opponents
     */
    getAliveOpponents() {
        return this.getOpponents().filter(o => o.alive);
    }
    /**
     * Get opponents targeting you
     */
    getTargetingOpponents() {
        return this.getOpponents().filter(o => o.targeting && o.alive);
    }
    /**
     * Clear all opponents
     */
    clear() {
        this.opponents.clear();
    }
    /**
     * Get opponent count
     */
    count() {
        return this.opponents.size;
    }
    /**
     * Get alive count
     */
    aliveCount() {
        return this.getAliveOpponents().length;
    }
}
exports.OpponentTracker = OpponentTracker;
//# sourceMappingURL=minimap.js.map