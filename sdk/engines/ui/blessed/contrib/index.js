"use strict";
/**
 * Blessed Contrib - 1:1 Port
 *
 * Complete port of blessed-contrib widgets and layouts for browser-based blessed
 * Maintains API compatibility with original blessed-contrib
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MergeRecursive = exports.getColorCode = exports.abbreviateNumber = exports.Canvas = exports.sparkline = exports.Sparkline = exports.markdown = exports.Markdown = exports.picture = exports.Picture = exports.map = exports.Map = exports.log = exports.Log = exports.donut = exports.Donut = exports.table = exports.Table = exports.tree = exports.Tree = exports.lcd = exports.LCD = exports.gaugeList = exports.GaugeList = exports.gauge = exports.Gauge = exports.stackedBar = exports.StackedBar = exports.bar = exports.Bar = exports.line = exports.Line = exports.carousel = exports.Carousel = exports.grid = exports.Grid = void 0;
// Import all classes first for default export
const grid_1 = require("./layouts/grid");
Object.defineProperty(exports, "Grid", { enumerable: true, get: function () { return grid_1.Grid; } });
Object.defineProperty(exports, "grid", { enumerable: true, get: function () { return grid_1.grid; } });
const carousel_1 = require("./layouts/carousel");
Object.defineProperty(exports, "Carousel", { enumerable: true, get: function () { return carousel_1.Carousel; } });
Object.defineProperty(exports, "carousel", { enumerable: true, get: function () { return carousel_1.carousel; } });
const line_1 = require("./widgets/line");
Object.defineProperty(exports, "Line", { enumerable: true, get: function () { return line_1.Line; } });
Object.defineProperty(exports, "line", { enumerable: true, get: function () { return line_1.line; } });
const bar_1 = require("./widgets/bar");
Object.defineProperty(exports, "Bar", { enumerable: true, get: function () { return bar_1.Bar; } });
Object.defineProperty(exports, "bar", { enumerable: true, get: function () { return bar_1.bar; } });
const stacked_bar_1 = require("./widgets/stacked-bar");
Object.defineProperty(exports, "StackedBar", { enumerable: true, get: function () { return stacked_bar_1.StackedBar; } });
Object.defineProperty(exports, "stackedBar", { enumerable: true, get: function () { return stacked_bar_1.stackedBar; } });
const gauge_1 = require("./widgets/gauge");
Object.defineProperty(exports, "Gauge", { enumerable: true, get: function () { return gauge_1.Gauge; } });
Object.defineProperty(exports, "gauge", { enumerable: true, get: function () { return gauge_1.gauge; } });
const gauge_list_1 = require("./widgets/gauge-list");
Object.defineProperty(exports, "GaugeList", { enumerable: true, get: function () { return gauge_list_1.GaugeList; } });
Object.defineProperty(exports, "gaugeList", { enumerable: true, get: function () { return gauge_list_1.gaugeList; } });
const lcd_1 = require("./widgets/lcd");
Object.defineProperty(exports, "LCD", { enumerable: true, get: function () { return lcd_1.LCD; } });
Object.defineProperty(exports, "lcd", { enumerable: true, get: function () { return lcd_1.lcd; } });
const tree_1 = require("./widgets/tree");
Object.defineProperty(exports, "Tree", { enumerable: true, get: function () { return tree_1.Tree; } });
Object.defineProperty(exports, "tree", { enumerable: true, get: function () { return tree_1.tree; } });
const table_1 = require("./widgets/table");
Object.defineProperty(exports, "Table", { enumerable: true, get: function () { return table_1.Table; } });
Object.defineProperty(exports, "table", { enumerable: true, get: function () { return table_1.table; } });
const donut_1 = require("./widgets/donut");
Object.defineProperty(exports, "Donut", { enumerable: true, get: function () { return donut_1.Donut; } });
Object.defineProperty(exports, "donut", { enumerable: true, get: function () { return donut_1.donut; } });
const log_1 = require("./widgets/log");
Object.defineProperty(exports, "Log", { enumerable: true, get: function () { return log_1.Log; } });
Object.defineProperty(exports, "log", { enumerable: true, get: function () { return log_1.log; } });
const map_1 = require("./widgets/map");
Object.defineProperty(exports, "Map", { enumerable: true, get: function () { return map_1.Map; } });
Object.defineProperty(exports, "map", { enumerable: true, get: function () { return map_1.map; } });
const picture_1 = require("./widgets/picture");
Object.defineProperty(exports, "Picture", { enumerable: true, get: function () { return picture_1.Picture; } });
Object.defineProperty(exports, "picture", { enumerable: true, get: function () { return picture_1.picture; } });
const markdown_1 = require("./widgets/markdown");
Object.defineProperty(exports, "Markdown", { enumerable: true, get: function () { return markdown_1.Markdown; } });
Object.defineProperty(exports, "markdown", { enumerable: true, get: function () { return markdown_1.markdown; } });
const sparkline_1 = require("./widgets/sparkline");
Object.defineProperty(exports, "Sparkline", { enumerable: true, get: function () { return sparkline_1.Sparkline; } });
Object.defineProperty(exports, "sparkline", { enumerable: true, get: function () { return sparkline_1.sparkline; } });
const canvas_1 = require("./widgets/canvas");
Object.defineProperty(exports, "Canvas", { enumerable: true, get: function () { return canvas_1.Canvas; } });
// Utilities
var utils_1 = require("./utils/utils");
Object.defineProperty(exports, "abbreviateNumber", { enumerable: true, get: function () { return utils_1.abbreviateNumber; } });
Object.defineProperty(exports, "getColorCode", { enumerable: true, get: function () { return utils_1.getColorCode; } });
Object.defineProperty(exports, "MergeRecursive", { enumerable: true, get: function () { return utils_1.MergeRecursive; } });
// Default export for convenience
exports.default = {
    // Layouts
    Grid: grid_1.Grid,
    Carousel: carousel_1.Carousel,
    // Charts
    Line: line_1.Line,
    Bar: bar_1.Bar,
    StackedBar: stacked_bar_1.StackedBar,
    // Gauges
    Gauge: gauge_1.Gauge,
    GaugeList: gauge_list_1.GaugeList,
    LCD: lcd_1.LCD,
    // Data
    Tree: tree_1.Tree,
    Table: table_1.Table,
    // Display
    Donut: donut_1.Donut,
    Log: log_1.Log,
    Map: map_1.Map,
    Picture: picture_1.Picture,
    Markdown: markdown_1.Markdown,
    Sparkline: sparkline_1.Sparkline,
    // Base
    Canvas: canvas_1.Canvas
};
