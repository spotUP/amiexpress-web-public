/**
 * Table Widget
 *
 * 1:1 port from blessed-contrib/lib/widget/table.js
 * Data table with headers and selectable rows
 *
 * Responsive features:
 * - Auto-adjusts column layout on resize
 */
import { Box } from './box';
import { List } from './list';
import { stripAnsi } from '../core/colors';
/**
 * Table Widget
 * Displays tabular data with headers and selectable rows
 */
export class ContribTable extends Box {
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
        this.rows = new List({
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
                const strip = stripAnsi(r.toString());
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
    // ============================================================================
    // Responsive Lifecycle Hooks
    // ============================================================================
    _handleBreakpointChange(breakpoint, previousBreakpoint, state) {
        super._handleBreakpointChange(breakpoint, previousBreakpoint, state);
        // Re-render table with new dimensions
        if (this.options.data) {
            this.setData(this.options.data);
        }
        this.emit('breakpoint-change', breakpoint, previousBreakpoint);
    }
}
/**
 * Factory function
 */
export function contribTable(options) {
    return new ContribTable(options);
}
