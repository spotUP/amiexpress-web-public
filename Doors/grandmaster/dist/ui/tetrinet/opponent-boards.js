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
 * A field drawn at FULL size, as the player's own board is drawn.
 *
 * The played board is a 22x22 box with a border - 20x20 inside - and its
 * cells are two characters wide, so a full field is the board's own column
 * count at CELL_WIDTH each. TGM fields are 10 wide, TetriNET's are 12, so
 * the width is taken from the board rather than assumed.
 */
const CELL_WIDTH = 2;
/** How many full-size fields fit side by side in the panel. */
function fullBoardsThatFit(innerWidth, boardCols) {
    const each = boardCols * CELL_WIDTH + 2; // + its own frame
    return Math.max(0, Math.floor(innerWidth / each));
}
/**
 * Opponent Boards component
 */
class OpponentBoards {
    constructor(options) {
        this.miniBoards = new Map();
        // 6 scaled columns + 2 borders, and 8 scaled rows + name + 2 borders.
        // Five of these tile a 28x24 panel: three across (3 * 9 = 27 <= 26 inner
        // plus the last board's own width) and two down.
        this.boardWidth = 8;
        this.boardHeight = 11;
        this.perRow = 3;
        /** True while a single opponent is being shown at full size. */
        this.solo = false;
        /**
         * Which opponent the viewer has focused.
         *
         * Only matters once there are more fields than fit at full size: the
         * focused one is drawn full and the rest as minimaps. Tab moves it.
         */
        this.focusIndex = 0;
        /** How many boards were drawn full last time, for the layout to stay put. */
        this.fullCount = 0;
        /** The ceiling on full-size boards for this panel. */
        this.maxFullBoards = 1;
        this.maxOpponents = options.maxOpponents || 5;
        // The spectator view has the whole screen and lays six fields out in a
        // single row; the in-game panel is a narrow column and keeps its 3x2.
        if (options.boardWidth)
            this.boardWidth = options.boardWidth;
        if (options.boardHeight)
            this.boardHeight = options.boardHeight;
        if (options.perRow)
            this.perRow = options.perRow;
        if (options.maxFullBoards !== undefined)
            this.maxFullBoards = options.maxFullBoards;
        // Calculate container size
        const width = options.width || (this.boardWidth * this.perRow + 4);
        const height = options.height || (this.boardHeight * 2 + 2); // 2 rows
        this.container = (0, blessed_helpers_1.createBox)({
            parent: options.parent,
            top: options.top,
            left: options.left,
            width,
            height,
            border: { type: 'line' },
            style: { border: { fg: 'cyan' } },
            label: options.label ?? ' Opponents ',
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
    /** Move the viewer's focus on by one, wrapping. */
    cycleFocus(total) {
        if (total <= 0)
            return 0;
        this.focusIndex = (this.focusIndex + 1) % total;
        // The layout is rebuilt on the next update, because which board is drawn
        // full has changed.
        for (const [, widget] of this.miniBoards)
            widget.container.destroy();
        this.miniBoards.clear();
        return this.focusIndex;
    }
    /** Who the viewer is focused on. */
    getFocus() {
        return this.focusIndex;
    }
    /** True when every field is being shown at full size. */
    isShowingAllFull() {
        return this.fullCount > 0 && this.fullCount === this.miniBoards.size;
    }
    updateBoards(opponents) {
        // One opponent gets the whole panel at 1:1; minimaps only from two.
        //
        // Reported 2026-08-30: "in TetriNet mode the opponent's board is drawn
        // as a minimap even when there is only ONE bot", where there is room to
        // draw it properly and the minimap costs readability for nothing. The
        // panel's 26x22 interior fits a 12x22 field exactly, so nothing has to
        // be scaled away - the area scaler below degenerates to 1:1 when its
        // box matches the field.
        // How many of these can be shown at FULL size, side by side.
        //
        // A full field is the board's own columns at two characters each plus its
        // frame; three of them come to 66 of the panel's 78, so up to three fit.
        // Beyond that the focused one is drawn full and the rest as minimaps.
        const cols = opponents[0]?.board?.width ?? 10;
        const fits = Math.min(fullBoardsThatFit(this.innerSize().width, cols), this.maxFullBoards);
        // All of them, or none - except a panel that allows several full boards,
        // which falls back to showing the FOCUSED one full with the rest as
        // minimaps. The in-game side panel has room for one, so it goes straight
        // from a lone bot at full size to all-minimaps the moment a second
        // arrives; promoting one of two there would just make the other look
        // broken.
        const full = opponents.length <= fits ? opponents.length :
            this.maxFullBoards > 1 && fits > 0 ? 1 :
                0;
        if (this.focusIndex >= Math.max(1, opponents.length))
            this.focusIndex = 0;
        // The focused player is drawn FIRST, so when only some fit at full size
        // the focused one is the one that gets it. Tab moves the focus.
        if (this.focusIndex > 0 && this.focusIndex < opponents.length) {
            opponents = [
                opponents[this.focusIndex],
                ...opponents.filter((_, i) => i !== this.focusIndex),
            ];
        }
        const solo = full > 0;
        if (solo !== this.solo || full !== this.fullCount) {
            this.solo = solo;
            this.fullCount = full;
            for (const [, widget] of this.miniBoards)
                widget.container.destroy();
            this.miniBoards.clear();
        }
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
            widget = this.createMiniBoard(opponent.id, index, opponent.board?.width ?? 10);
            this.miniBoards.set(opponent.id, widget);
        }
        // Update content
        this.renderMiniBoard(widget, opponent);
    }
    /**
     * Create a mini-board widget
     */
    createMiniBoard(id, index, boardCols = 10) {
        if (index < this.fullCount)
            return this.createFullBoard(index, boardCols);
        // Calculate position (3 columns, 2 rows layout)
        // Tile inside the panel's border: 3 across, 2 down, no gap at the bottom.
        // The old +1 offsets pushed the second row to top 13, so with a 24-row
        // panel the bottom board hung off the end.
        const col = index % this.perRow;
        const row = Math.floor(index / this.perRow);
        const left = col * (this.boardWidth + 1);
        const top = row * this.boardHeight;
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
            // createBox() draws a border BY DEFAULT. Without this the name strip
            // and the field below drew their own frames inside the mini board's
            // frame - the stack of nested rectangles seen live on 2026-08-25.
            border: { type: 'none' },
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
            border: { type: 'none' },
            focusable: false,
            mouse: false,
            clickable: false,
        });
        return {
            container,
            boardBox,
            nameLabel,
            cols: this.boardWidth - 2,
            rows: this.boardHeight - 3,
            cellWidth: 1,
        };
    }
    /**
     * The lone opponent, drawn at full size across the whole panel.
     *
     * No inner border and no name strip: the panel's own frame is the only
     * frame, and the name goes in its label. That is what buys the 22 rows a
     * full field needs - an inner border plus a name row leaves only 19, which
     * is why the tiled layout has to scale at all.
     */
    createFullBoard(index, boardCols) {
        const inner = this.innerSize();
        const cols = boardCols;
        const rows = inner.height;
        const boxWidth = cols * CELL_WIDTH + 2;
        // Side by side, in the order the fields arrive, so a board does not jump
        // about as other players top out.
        const container = (0, blessed_helpers_1.createBox)({
            parent: this.container,
            top: 0,
            left: index * boxWidth,
            width: boxWidth,
            height: inner.height,
            // createBox() draws a border by default; the panel already has one.
            border: { type: 'none' },
            focusable: false,
            mouse: false,
            clickable: false,
        });
        const boardBox = (0, blessed_helpers_1.createBox)({
            parent: container,
            top: 0,
            left: 0,
            width: cols * CELL_WIDTH,
            height: rows,
            content: '',
            border: { type: 'none' },
            focusable: false,
            mouse: false,
            clickable: false,
        });
        // A zero-height strip: the name lives in the panel label instead, but the
        // widget shape stays the same so renderMiniBoard needs no special case.
        const nameLabel = (0, blessed_helpers_1.createBox)({
            parent: container,
            top: 0,
            left: 0,
            width: inner.width,
            height: 1,
            content: '',
            border: { type: 'none' },
            hidden: true,
            focusable: false,
            mouse: false,
            clickable: false,
        });
        return { container, boardBox, nameLabel, cols, rows, cellWidth: CELL_WIDTH };
    }
    /** Usable space inside the panel's border. */
    innerSize() {
        const width = (this.container.width ?? this.boardWidth * this.perRow + 4) - 2;
        const height = (this.container.height ?? this.boardHeight * 2 + 2) - 2;
        return { width, height };
    }
    /**
     * Render a mini-board with scaled content
     */
    renderMiniBoard(widget, opponent) {
        // Update name label with status
        let nameContent = opponent.name.substring(0, 10);
        let frame = 'white';
        if (!opponent.alive) {
            nameContent = `{red-fg}[X] ${nameContent}{/red-fg}`;
            frame = 'red';
        }
        else if (opponent.hasImmunity) {
            nameContent = `{cyan-fg}[I] ${nameContent}{/cyan-fg}`;
            frame = 'cyan';
        }
        else {
            nameContent = `{white-fg}${nameContent}{/white-fg}`;
        }
        nameContent += ` {gray-fg}L${opponent.level}{/gray-fg}`;
        if (this.solo) {
            // The full-size board has no frame of its own - the panel's is the
            // only one - so the name goes in the panel's label and the status
            // colour on the panel's border.
            const status = !opponent.alive ? ' [X]' : opponent.hasImmunity ? ' [I]' : '';
            this.container.setLabel?.(` ${opponent.name.substring(0, 12)}${status} L${opponent.level} `);
            if (this.container.style?.border)
                this.container.style.border.fg = frame;
        }
        else {
            if (widget.container.style?.border)
                widget.container.style.border.fg = frame;
            widget.nameLabel.setContent(nameContent);
        }
        // Render scaled board
        const boardContent = this.renderScaledBoard(opponent.board, opponent.alive, widget);
        widget.boardBox.setContent(boardContent);
    }
    /**
     * Render board scaled to mini size
     * Full board is 12x22, mini is 12x8 (every 3 rows -> 1 row)
     */
    renderScaledBoard(board, alive, widget) {
        if (!alive) {
            return '\n\n{red-fg} DEAD{/red-fg}';
        }
        // Area scaler: every mini cell covers a rectangle of the real field and
        // lights up if ANY cell in it is filled, so a one-cell tower still shows.
        //
        // The old version wrote board.width (12) characters into a SIX column
        // box, and sampled rows 4 + n*3 - reading past the end of a 22-row field
        // and never showing the bottom of the stack, which is the part that
        // matters. Both dimensions now derive from the box.
        // From the widget when there is one, so a full-size board renders 1:1 -
        // the area scaler below degenerates to a copy when the box matches the
        // field. Falls back to the tiled figures for direct callers (tests).
        const miniRows = widget ? widget.rows : this.boardHeight - 3;
        const miniCols = widget ? widget.cols : this.boardWidth - 2;
        const lines = [];
        for (let my = 0; my < miniRows; my++) {
            const y0 = Math.floor((my * board.height) / miniRows);
            const y1 = Math.max(y0 + 1, Math.floor(((my + 1) * board.height) / miniRows));
            let line = '';
            for (let mx = 0; mx < miniCols; mx++) {
                const x0 = Math.floor((mx * board.width) / miniCols);
                const x1 = Math.max(x0 + 1, Math.floor(((mx + 1) * board.width) / miniCols));
                let hit = null;
                for (let y = y0; y < y1 && !hit; y++) {
                    for (let x = x0; x < x1; x++) {
                        const cell = board.grid[y]?.[x];
                        if (cell?.filled) {
                            hit = cell;
                            break;
                        }
                    }
                }
                const pad = widget ? widget.cellWidth : 1;
                if (hit) {
                    const color = this.getCellColor(hit);
                    // At full size the cell is a solid block, as the played board draws
                    // it; a minimap keeps one character so six fields still fit.
                    line += `{${color}-bg}{${color}-fg}${'#'.repeat(pad)}{/}`;
                }
                else {
                    line += ' '.repeat(pad);
                }
            }
            lines.push(line);
        }
        return lines.join('\n');
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