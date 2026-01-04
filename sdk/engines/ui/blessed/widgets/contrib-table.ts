/**
 * Table Widget
 *
 * 1:1 port from blessed-contrib/lib/widget/table.js
 * Data table with headers and selectable rows
 */

import { Box } from './box';
import { List } from './list';
import { TableData } from './table';
import { stripAnsi } from '../core/colors';
import type { ElementOptions } from '../core/types';

export interface ContribTableOptions extends ElementOptions {
  columnWidth: number[];
  columnSpacing?: number;
  selectedFg?: string | number | number[];
  selectedBg?: string | number | number[];
  interactive?: boolean;
  data?: TableData;
  keys?: boolean;
  vi?: boolean;
  mouse?: boolean;
  bold?: boolean;
  fg?: string | number | number[];
  bg?: string | number | number[];
}

/**
 * Table Widget
 * Displays tabular data with headers and selectable rows
 */
export class ContribTable extends Box {
  declare options: ContribTableOptions;
  rows: List;

  constructor(options: Partial<ContribTableOptions> & { columnWidth: number[] }) {
    if (Array.isArray((options as any).columnSpacing)) {
      throw new Error(
        'Error: columnSpacing cannot be an array.\r\n' +
          'Note: From release 2.0.0 use property columnWidth instead of columnSpacing.\r\n' +
          'Please refer to the README or to https://github.com/yaronn/blessed-contrib/issues/39'
      );
    }

    if (!options.columnWidth) {
      throw new Error(
        'Error: A table must get columnWidth as a property. Please refer to the README.'
      );
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
      } as any,
      keys: this.options.keys,
      vi: this.options.vi,
      mouse: this.options.mouse,
      tags: true,
      interactive: options.interactive,
      screen: this.screen
    } as any);

    this.append(this.rows);

    this.on('attach', () => {
      if (this.options.data) {
        this.setData(this.options.data);
      }
    });
  }

  focus(): void {
    this.rows.focus();
  }

  render(): any {
    if (this.screen.focused == this.rows) {
      this.rows.focus();
    }

    // Update dimensions using type assertion for internal access
    (this.rows as any).width = (this.width as number) - 3;
    (this.rows as any).height = (this.height as number) - 4;
    return super.render();
  }

  setData(table: TableData): void {
    const dataToString = (d: string[]): string => {
      let str = '';
      d.forEach((r, i) => {
        const colsize = this.options.columnWidth[i];
        const strip = stripAnsi(r.toString());
        const ansiLen = r.toString().length - strip.length;
        let spaceLength = colsize - strip.length + this.options.columnSpacing!;

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

    const formatted: string[] = [];

    table.data.forEach((d) => {
      const str = dataToString(d);
      formatted.push(str);
    });

    this.setContent(dataToString(table.headers));
    this.rows.setItems(formatted);
  }

  getOptionsPrototype(): ContribTableOptions {
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
    } as ContribTableOptions;
  }

  get type(): string {
    return 'table';
  }
}

/**
 * Factory function
 */
export function contribTable(options: Partial<ContribTableOptions> & { columnWidth: number[] }): ContribTable {
  return new ContribTable(options);
}
