"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Grid = void 0;
exports.grid = grid;
const utils_1 = require("../utils/contrib-utils/utils");
class Grid {
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
        options = (0, utils_1.MergeRecursive)(options, opts);
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
exports.Grid = Grid;
function grid(options) {
    return new Grid(options);
}
