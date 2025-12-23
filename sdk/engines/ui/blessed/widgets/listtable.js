"use strict";
/**
 * ListTable - Enhanced table with list-like selection behavior
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ListTable = void 0;
const box_1 = require("./box");
class ListTable extends box_1.Box {
    constructor(options = {}) {
        // Destructure ListTable-specific properties
        const { rows, headers, columnWidths, align, interactive, noCellBorders, ...boxOptions } = options;
        super({
            ...boxOptions,
            scrollable: true,
            mouse: true,
            tags: true, // Enable tag parsing for selection highlighting
            wrap: false, // Tables should NOT wrap - it breaks column layout
            style: {
                fg: 'white',
                ...(options.style || {}),
            },
        });
        this.rows = [];
        this.headers = [];
        this.columnWidths = [];
        this.align = [];
        this.selectedRow = 0;
        this.headers = headers || [];
        this.rows = rows || [];
        this.columnWidths = columnWidths || [];
        this.align = align || [];
        this.interactive = interactive !== false;
        this.noCellBorders = noCellBorders || false;
        // Auto-calculate column widths if not provided
        if (this.columnWidths.length === 0) {
            this.calculateColumnWidths();
        }
        this.updateContent();
        if (this.interactive) {
            this.enableMouse();
            this.enableKeys();
            // Navigation keys
            this.key(['up', 'k'], () => {
                this.selectPrevious();
            });
            this.key(['down', 'j'], () => {
                this.selectNext();
            });
            this.key(['enter', 'space'], () => {
                this.emit('select', this.selectedRow, this.rows[this.selectedRow]);
            });
            this.on('click', (data) => {
                const rowIndex = this.getRowFromY(data.y);
                if (rowIndex >= 0) {
                    this.selectRow(rowIndex);
                }
            });
            // Mouse wheel handlers - move selection up/down
            this.on('wheelup', () => {
                this.selectPrevious();
            });
            this.on('wheeldown', () => {
                this.selectNext();
            });
        }
    }
    /**
     * Calculate column widths automatically
     */
    calculateColumnWidths() {
        const numCols = Math.max(this.headers.length, ...this.rows.map(row => row.length));
        this.columnWidths = new Array(numCols).fill(0);
        // Check headers
        for (let i = 0; i < this.headers.length; i++) {
            this.columnWidths[i] = Math.max(this.columnWidths[i], this.headers[i].length);
        }
        // Check all rows
        for (const row of this.rows) {
            for (let i = 0; i < row.length; i++) {
                this.columnWidths[i] = Math.max(this.columnWidths[i], row[i].length);
            }
        }
        // Add padding
        this.columnWidths = this.columnWidths.map(w => w + 2);
    }
    /**
     * Format a cell value
     */
    formatCell(value, colIndex) {
        const width = this.columnWidths[colIndex] || 10;
        const alignment = this.align[colIndex] || 'left';
        let formatted = value;
        if (formatted.length > width - 2) {
            formatted = formatted.substring(0, width - 3) + '...';
        }
        const padding = width - formatted.length;
        if (alignment === 'center') {
            const leftPad = Math.floor(padding / 2);
            const rightPad = padding - leftPad;
            formatted = ' '.repeat(leftPad) + formatted + ' '.repeat(rightPad);
        }
        else if (alignment === 'right') {
            formatted = ' '.repeat(padding) + formatted;
        }
        else {
            formatted = formatted + ' '.repeat(padding);
        }
        return formatted;
    }
    /**
     * Generate table content
     */
    updateContent() {
        const lines = [];
        const border = this.noCellBorders ? ' ' : '│';
        // Header row
        if (this.headers.length > 0) {
            const headerCells = this.headers.map((h, i) => this.formatCell(h, i));
            lines.push(border + headerCells.join(border) + border);
            // Header separator
            const separators = this.columnWidths.map(w => '─'.repeat(w));
            lines.push(this.noCellBorders ? separators.join(' ') : '├' + separators.join('┼') + '┤');
        }
        // Data rows
        for (let rowIdx = 0; rowIdx < this.rows.length; rowIdx++) {
            const row = this.rows[rowIdx];
            const cells = row.map((cell, i) => this.formatCell(cell, i));
            const line = border + cells.join(border) + border;
            if (this.interactive && rowIdx === this.selectedRow) {
                // Highlight selected row
                lines.push(`{blue-fg}{white-bg}${line}{/}`);
            }
            else {
                lines.push(line);
            }
        }
        this.setContent(lines.join('\n'));
    }
    /**
     * Get row index from Y coordinate
     */
    getRowFromY(y) {
        const relY = y - this.itop;
        const headerOffset = this.headers.length > 0 ? 2 : 0;
        const rowIndex = relY - headerOffset;
        return rowIndex >= 0 && rowIndex < this.rows.length ? rowIndex : -1;
    }
    /**
     * Select a row
     */
    selectRow(index) {
        if (index < 0 || index >= this.rows.length)
            return;
        this.selectedRow = index;
        this.updateContent();
        this.emit('select row', index, this.rows[index]);
        if (this.screen) {
            this.screen.render();
        }
    }
    /**
     * Select previous row
     */
    selectPrevious() {
        if (this.selectedRow > 0) {
            this.selectRow(this.selectedRow - 1);
        }
    }
    /**
     * Select next row
     */
    selectNext() {
        if (this.selectedRow < this.rows.length - 1) {
            this.selectRow(this.selectedRow + 1);
        }
    }
    /**
     * Set table data
     * First row is treated as headers (blessed-contrib compatible)
     */
    setData(rows) {
        if (rows.length > 0) {
            // First row is headers, rest is data (blessed-contrib compatibility)
            this.headers = rows[0];
            this.rows = rows.slice(1);
        }
        else {
            this.headers = [];
            this.rows = [];
        }
        this.calculateColumnWidths();
        this.updateContent();
        if (this.screen) {
            this.screen.render();
        }
    }
    /**
     * Set headers
     */
    setHeaders(headers) {
        this.headers = headers;
        this.calculateColumnWidths();
        this.updateContent();
        if (this.screen) {
            this.screen.render();
        }
    }
    /**
     * Get selected row index
     */
    getSelected() {
        return this.selectedRow;
    }
    /**
     * Get selected row data
     */
    getSelectedRow() {
        return this.rows[this.selectedRow];
    }
}
exports.ListTable = ListTable;
