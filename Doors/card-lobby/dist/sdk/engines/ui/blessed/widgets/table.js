"use strict";
/**
 * Table widget - Tabular data display
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Table = void 0;
const element_1 = require("../core/element");
class Table extends element_1.Element {
    constructor(options = {}) {
        super({
            scrollable: true,
            ...options,
        });
        this.rows = [];
        this.headers = [];
        this.columnWidth = [];
        this.columnSpacing = 1;
        this.rows = options.rows || options.data || [];
        this.headers = options.headers || [];
        this.columnWidth = options.columnWidth || [];
        this.columnSpacing = options.columnSpacing || 1;
        this._updateContent();
    }
    _updateContent() {
        // Calculate column widths if not provided
        const widths = this.columnWidth.length > 0 ? this.columnWidth : this._calculateColumnWidths();
        // Build table
        const lines = [];
        // Headers
        if (this.headers.length > 0) {
            const headerLine = this.headers
                .map((h, i) => this._padCell(h, widths[i] || 10))
                .join(' '.repeat(this.columnSpacing));
            lines.push(headerLine);
            // Separator
            const separator = widths.map((w) => '─'.repeat(w)).join(' '.repeat(this.columnSpacing));
            lines.push(separator);
        }
        // Rows
        for (const row of this.rows) {
            const rowLine = row.map((cell, i) => this._padCell(cell, widths[i] || 10)).join(' '.repeat(this.columnSpacing));
            lines.push(rowLine);
        }
        this.setContent(lines.join('\n'));
    }
    _calculateColumnWidths() {
        const widths = [];
        // Start with headers
        for (let i = 0; i < this.headers.length; i++) {
            widths[i] = this.headers[i].length;
        }
        // Check rows
        for (const row of this.rows) {
            for (let i = 0; i < row.length; i++) {
                widths[i] = Math.max(widths[i] || 0, row[i].length);
            }
        }
        return widths;
    }
    _padCell(text, width) {
        if (text.length > width) {
            return text.slice(0, width);
        }
        return text + ' '.repeat(width - text.length);
    }
    setRows(rows) {
        this.rows = rows;
        this._updateContent();
    }
    setData(data) {
        this.setRows(data);
    }
    setHeaders(headers) {
        this.headers = headers;
        this._updateContent();
    }
    getRows() {
        return this.rows.slice();
    }
}
exports.Table = Table;
