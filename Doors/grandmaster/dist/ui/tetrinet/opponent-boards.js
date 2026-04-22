"use strict";
/**
 * TetriNET Opponent Boards Display
 *
 * Shows mini-boards for up to 5 opponents in a grid layout.
 * Each mini-board shows:
 * - Scaled representation of their field (6x10 blocks)
 * - Player name and level
 * - Dead/alive status with visual indicator
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpponentBoards = void 0;
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
/**
 * Opponent Boards component
 */
class OpponentBoards {
    constructor(options) {
        this.miniBoards = new Map();
        this.boardWidth = 8; // 6 cols * 1 char + 2 borders (compact for 80-column terminals)
        this.boardHeight = 12; // 10 visible rows + name + status
        this.maxOpponents = options.maxOpponents || 5;
        // Calculate container size
        const width = options.width || (this.boardWidth * 3 + 4); // 3 boards per row
        const height = options.height || (this.boardHeight * 2 + 2); // 2 rows
        this.container = (0, blessed_helpers_1.createBox)({
            parent: options.parent,
            top: options.top,
            left: options.left,
            width,
            height,
            border: { type: 'line' },
            style: { border: { fg: 'cyan' } },
            label: ' Opponents ',
            content: '',
            fixed: true, // Fixed during gameplay, not dockable
            focusable: false,
            mouse: false,
            clickable: false,
        });
    }
    /**
     * Update all opponent boards
     */
    updateBoards(opponents) {
        // Remove boards for players who left
        const currentIds = new Set(opponents.map(o => o.id));
        for (const [id, widget] of this.miniBoards) {
            if (!currentIds.has(id)) {
                widget.container.destroy();
                this.miniBoards.delete(id);
            }
        }
        // Add/update boards for current players
        for (let i = 0; i < Math.min(opponents.length, this.maxOpponents); i++) {
            const opponent = opponents[i];
            this.updateSingleBoard(opponent, i);
        }
    }
    /**
     * Update a single opponent's board
     */
    updateSingleBoard(opponent, index) {
        let widget = this.miniBoards.get(opponent.id);
        // Create widget if doesn't exist
        if (!widget) {
            widget = this.createMiniBoard(opponent.id, index);
            this.miniBoards.set(opponent.id, widget);
        }
        // Update content
        this.renderMiniBoard(widget, opponent);
    }
    /**
     * Create a mini-board widget
     */
    createMiniBoard(id, index) {
        // Calculate position (3 columns, 2 rows layout)
        const col = index % 3;
        const row = Math.floor(index / 3);
        const left = 1 + col * (this.boardWidth + 1);
        const top = 1 + row * this.boardHeight;
        const container = (0, blessed_helpers_1.createBox)({
            parent: this.container,
            top,
            left,
            width: this.boardWidth,
            height: this.boardHeight,
            border: { type: 'line' },
            style: { border: { fg: 'white' } },
            focusable: false,
            mouse: false,
            clickable: false,
        });
        const nameLabel = (0, blessed_helpers_1.createBox)({
            parent: container,
            top: 0,
            left: 0,
            width: this.boardWidth - 2,
            height: 1,
            content: '',
            focusable: false,
            mouse: false,
            clickable: false,
        });
        const boardBox = (0, blessed_helpers_1.createBox)({
            parent: container,
            top: 1,
            left: 0,
            width: this.boardWidth - 2,
            height: this.boardHeight - 3,
            content: '',
            focusable: false,
            mouse: false,
            clickable: false,
        });
        return { container, boardBox, nameLabel };
    }
    /**
     * Render a mini-board with scaled content
     */
    renderMiniBoard(widget, opponent) {
        // Update name label with status
        let nameContent = opponent.name.substring(0, 10);
        if (!opponent.alive) {
            nameContent = `{red-fg}[X] ${nameContent}{/red-fg}`;
            widget.container.style.border.fg = 'red';
        }
        else if (opponent.hasImmunity) {
            nameContent = `{cyan-fg}[I] ${nameContent}{/cyan-fg}`;
            widget.container.style.border.fg = 'cyan';
        }
        else {
            nameContent = `{white-fg}${nameContent}{/white-fg}`;
            widget.container.style.border.fg = 'white';
        }
        nameContent += ` {gray-fg}L${opponent.level}{/gray-fg}`;
        widget.nameLabel.setContent(nameContent);
        // Render scaled board
        const boardContent = this.renderScaledBoard(opponent.board, opponent.alive);
        widget.boardBox.setContent(boardContent);
    }
    /**
     * Render board scaled to mini size
     * Full board is 12x22, mini is 12x8 (every 3 rows -> 1 row)
     */
    renderScaledBoard(board, alive) {
        if (!alive) {
            // Show dead indicator
            return '\n\n{red-fg}  DEAD{/red-fg}';
        }
        let content = '';
        const scaleY = 3; // Every 3 rows becomes 1
        const visibleRows = 8;
        for (let miniY = 0; miniY < visibleRows; miniY++) {
            if (miniY > 0)
                content += '\n';
            for (let x = 0; x < board.width; x++) {
                // Sample from the middle of each 3-row chunk
                const actualY = 4 + (miniY * scaleY) + 1; // Start from row 4, sample middle
                const cell = board.grid[actualY]?.[x];
                if (cell?.filled) {
                    // Show filled cells with color
                    const color = this.getCellColor(cell);
                    content += `{${color}-fg}#{/${color}-fg}`;
                }
                else {
                    content += ' ';
                }
            }
        }
        return content;
    }
    /**
     * Get color for cell based on special or piece color
     */
    getCellColor(cell) {
        if (cell.special) {
            // Special block colors
            return 'yellow';
        }
        // Regular piece colors
        const colors = {
            I: 'cyan',
            O: 'yellow',
            T: 'magenta',
            S: 'green',
            Z: 'red',
            J: 'blue',
            L: 'white',
        };
        return colors[cell.color] || 'gray';
    }
    /**
     * Show attack animation on opponent
     */
    showAttackAnimation(targetId, type) {
        const widget = this.miniBoards.get(targetId);
        if (!widget)
            return;
        const color = type === 'immunity' ? 'cyan' : 'red';
        const originalColor = widget.container.style.border.fg;
        widget.container.style.border.fg = color;
        setTimeout(() => {
            widget.container.style.border.fg = originalColor;
        }, 300);
    }
    /**
     * Mark opponent as dead
     */
    markDead(id) {
        const widget = this.miniBoards.get(id);
        if (widget) {
            widget.container.style.border.fg = 'red';
            widget.boardBox.setContent('\n\n{red-fg}  DEAD{/red-fg}');
        }
    }
    /**
     * Get container element
     */
    getElement() {
        return this.container;
    }
    /**
     * Destroy all widgets
     */
    destroy() {
        for (const widget of this.miniBoards.values()) {
            widget.container.destroy();
        }
        this.miniBoards.clear();
        this.container.destroy();
    }
}
exports.OpponentBoards = OpponentBoards;
//# sourceMappingURL=opponent-boards.js.map