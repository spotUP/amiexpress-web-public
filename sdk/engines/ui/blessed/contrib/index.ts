/**
 * Blessed Contrib - 1:1 Port
 *
 * Complete port of blessed-contrib widgets and layouts for browser-based blessed
 * Maintains API compatibility with original blessed-contrib
 */

// Import all classes first for default export
import { Grid, grid } from './layouts/grid';
import { Carousel, carousel } from './layouts/carousel';
import { Line, line } from './widgets/line';
import { Bar, bar } from './widgets/bar';
import { StackedBar, stackedBar } from './widgets/stacked-bar';
import { Gauge, gauge } from './widgets/gauge';
import { GaugeList, gaugeList } from './widgets/gauge-list';
import { LCD, lcd } from './widgets/lcd';
import { Tree, tree } from './widgets/tree';
import { Table, table } from './widgets/table';
import { Donut, donut } from './widgets/donut';
import { Log, log } from './widgets/log';
import { Map, map } from './widgets/map';
import { Picture, picture } from './widgets/picture';
import { Markdown, markdown } from './widgets/markdown';
import { Sparkline, sparkline } from './widgets/sparkline';
import { Canvas } from './widgets/canvas';

// Re-export all classes
export { Grid, grid, Carousel, carousel };
export { Line, line, Bar, bar, StackedBar, stackedBar };
export { Gauge, gauge, GaugeList, gaugeList, LCD, lcd };
export { Tree, tree, Table, table };
export { Donut, donut, Log, log, Map, map, Picture, picture, Markdown, markdown, Sparkline, sparkline };
export { Canvas };

// Export types
export type { GridOptions } from './layouts/grid';
export type { CarouselOptions, CarouselPage } from './layouts/carousel';
export type { LineData, LineOptions } from './widgets/line';
export type { BarData, BarOptions } from './widgets/bar';
export type { StackedBarData, StackedBarOptions } from './widgets/stacked-bar';
export type { GaugeStack, GaugeOptions } from './widgets/gauge';
export type { GaugeListStack, GaugeListItem, GaugeListOptions } from './widgets/gauge-list';
export type { LCDOptions } from './widgets/lcd';
export type { TreeNode, TreeTemplate, TreeOptions } from './widgets/tree';
export type { TableData, TableOptions } from './widgets/table';
export type { DonutData, DonutOptions } from './widgets/donut';
export type { LogOptions } from './widgets/log';
export type { MapMarker, MapOptions } from './widgets/map';
export type { PictureOptions } from './widgets/picture';
export type { MarkdownStyle, MarkdownOptions } from './widgets/markdown';
export type { SparklineOptions } from './widgets/sparkline';
export type { CanvasOptions } from './widgets/canvas';

// Utilities
export {
  abbreviateNumber,
  getColorCode,
  MergeRecursive
} from './utils/utils';

// Default export for convenience
export default {
  // Layouts
  Grid,
  Carousel,

  // Charts
  Line,
  Bar,
  StackedBar,

  // Gauges
  Gauge,
  GaugeList,
  LCD,

  // Data
  Tree,
  Table,

  // Display
  Donut,
  Log,
  Map,
  Picture,
  Markdown,
  Sparkline,

  // Base
  Canvas
};
