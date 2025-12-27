"use strict";
/**
 * Table Widget
 *
 * 1:1 port from blessed-contrib/lib/widget/table.js
 * Data table with headers and selectable rows
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Table = void 0;
exports.table = table;
const box_1 = require("../../widgets/box");
const list_1 = require("../../widgets/list");
const colors_1 = require("../../core/colors");
/**
 * Table Widget
 * Displays tabular data with headers and selectable rows
 */
class Table extends box_1.Box {
    constructor(options) {
        if (Array.isArray(options.columnSpacing)) {
            throw new Error('Error: columnSpacing cannot be an array.\r\n' +
                'Note: From release 2.0.0 use property columnWidth instead of columnSpacing.\r\n' +
                'Please refer to the README or to https://github.com/yaronn/blessed-contrib/issues/39');
        }
        if (!options.columnWidth) {
            throw new Error('Error: A table must get columnWidth as a property. Please refer to the README.');
        }
        options.columnSpacing = options.columnSpacing == null ? 10 : options.columnSpacing;
        options.bold = true;
        options.selectedFg = options.selectedFg || 'white';
        options.selectedBg = options.selectedBg || 'blue';
        options.fg = options.fg || 'green';
        options.bg = options.bg || '';
        options.interactive = typeof options.interactive === 'undefined' ? true : options.interactive;
        super(options);
        this.rows = new list_1.List({
            top: 2,
            width: 0,
            left: 1,
            style: {
                selected: {
                    fg: options.selectedFg,
                    bg: options.selectedBg
                },
                item: {
                    fg: options.fg,
                    bg: options.bg
                }
            },
            keys: this.options.keys,
            vi: this.options.vi,
            mouse: this.options.mouse,
            tags: true,
            interactive: options.interactive,
            screen: this.screen
        });
        this.append(this.rows);
        this.on('attach', () => {
            if (this.options.data) {
                this.setData(this.options.data);
            }
        });
    }
    focus() {
        this.rows.focus();
    }
    render() {
        if (this.screen.focused == this.rows) {
            this.rows.focus();
        }
        // Update dimensions using type assertion for internal access
        this.rows.width = this.width - 3;
        this.rows.height = this.height - 4;
        return super.render();
    }
    setData(table) {
        const dataToString = (d) => {
            let str = '';
            d.forEach((r, i) => {
                const colsize = this.options.columnWidth[i];
                const strip = (0, colors_1.stripAnsi)(r.toString());
                const ansiLen = r.toString().length - strip.length;
                let spaceLength = colsize - strip.length + this.options.columnSpacing;
                // Compensate for ansi len
                let formatted = r.toString().substring(0, colsize + ansiLen);
                if (spaceLength < 0) {
                    spaceLength = 0;
                }
                const spaces = new Array(spaceLength).join(' ');
                str += formatted + spaces;
            });
            return str;
        };
        const formatted = [];
        table.data.forEach((d) => {
            const str = dataToString(d);
            formatted.push(str);
        });
        this.setContent(dataToString(table.headers));
        this.rows.setItems(formatted);
    }
    getOptionsPrototype() {
        return {
            keys: true,
            fg: 'white',
            interactive: false,
            label: 'Active Processes',
            width: '30%',
            height: '30%',
            border: { type: 'line', fg: 'cyan' },
            columnSpacing: 10,
            columnWidth: [16, 12],
            data: {
                headers: ['col1', 'col2'],
                data: [
                    ['a', 'b'],
                    ['5', 'u'],
                    ['x', '16.1']
                ]
            }
        };
    }
    get type() {
        return 'table';
    }
}
exports.Table = Table;
/**
 * Factory function
 */
function table(options) {
    return new Table(options);
}
