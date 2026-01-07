/**
 * Grid Layout
 *
 * 1:1 port from blessed-contrib/lib/layout/grid.js
 * Grid-based layout system for arranging widgets
 */
import { MergeRecursive } from '../utils/contrib-utils/utils';
/**
 * Grid Layout
 * Provides grid-based widget positioning
 */
export class Grid {
    constructor(options) {
        this.widgetSpacing = 0;
        if (!options.screen) {
            throw new Error('Error: A screen property must be specified in the grid options.\r\n' +
                'Note: Release 2.0.0 has breaking changes. Please refer to the README or to https://github.com/yaronn/blessed-contrib/issues/39');
        }
        this.options = options;
        this.options.dashboardMargin = this.options.dashboardMargin || 0;
        this.cellWidth = (100 - this.options.dashboardMargin * 2) / this.options.cols;
        this.cellHeight = (100 - this.options.dashboardMargin * 2) / this.options.rows;
    }
    set(row, col, rowSpan, colSpan, obj, opts = {}) {
        if (obj instanceof Grid) {
            throw new Error('Error: A Grid is not allowed to be nested inside another grid.\r\n' +
                'Note: Release 2.0.0 has breaking changes. Please refer to the README or to https://github.com/yaronn/blessed-contrib/issues/39');
        }
        const top = row * this.cellHeight + (this.options.dashboardMargin || 0);
        const left = col * this.cellWidth + (this.options.dashboardMargin || 0);
        let options = {};
        options = MergeRecursive(options, opts);
        options.top = top + '%';
        options.left = left + '%';
        options.width = this.cellWidth * colSpan - this.widgetSpacing + '%';
        options.height = this.cellHeight * rowSpan - this.widgetSpacing + '%';
        if (!this.options.hideBorder) {
            options.border = { type: 'line', fg: this.options.color || 'cyan' };
        }
        const instance = obj(options);
        this.options.screen.append(instance);
        return instance;
    }
}
/**
 * Factory function
 */
export function grid(options) {
    return new Grid(options);
}
