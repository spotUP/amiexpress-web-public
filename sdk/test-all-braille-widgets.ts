/**
 * Test all braille-based widgets to verify they render correctly
 */
import * as contrib from './engines/ui/blessed/contrib';
import * as blessed from './engines/ui/blessed';

interface TestResult {
  widget: string;
  canvasSize: { width: number; height: number } | undefined;
  brailleCount: number;
  status: 'PASS' | 'FAIL';
}

const results: TestResult[] = [];

// Create a mock screen
const screen = blessed.screen({
  smartCSR: true,
  title: 'Braille Widget Test',
  output: () => {},
});

function testWidget(name: string, widget: any, setupFn?: () => void) {
  try {
    if (setupFn) setupFn();
    widget.render();

    let brailleCount = 0;
    if (widget.ctx) {
      const frame = widget.ctx._canvas.frame('\n');
      brailleCount = (frame.match(/[\u2800-\u28FF]/g) || []).length;
    }

    results.push({
      widget: name,
      canvasSize: widget.canvasSize,
      brailleCount,
      status: widget.canvasSize && widget.canvasSize.width > 0 && widget.canvasSize.height > 0 ? 'PASS' : 'FAIL',
    });
  } catch (e: any) {
    results.push({
      widget: name,
      canvasSize: undefined,
      brailleCount: 0,
      status: 'FAIL',
    });
    console.error(`  Error in ${name}:`, e.message);
  }
}

console.log('\n=== Testing All Braille-Based Widgets ===\n');

// Test LCD
const lcd = contrib.lcd({
  parent: screen,
  top: 0, left: 0, width: 50, height: 10,
  elements: 6, display: '123456',
});
testWidget('LCD', lcd, () => lcd.setDisplay('123456'));

// Test Gauge
const gauge = contrib.gauge({
  parent: screen,
  top: 0, left: 0, width: 30, height: 6,
  stroke: 'green', showLabel: true,
});
testWidget('Gauge', gauge, () => gauge.setPercent(75));

// Test GaugeList
const gaugeList = contrib.gaugeList({
  parent: screen,
  top: 0, left: 0, width: 40, height: 12,
  gauges: [
    { showLabel: true, stack: [{ percent: 50, stroke: 'green' }] },
    { showLabel: true, stack: [{ percent: 75, stroke: 'blue' }] },
  ],
});
testWidget('GaugeList', gaugeList);

// Test Line Chart
const lineChart = contrib.line({
  parent: screen,
  top: 0, left: 0, width: 50, height: 15,
  showLegend: true,
});
testWidget('Line Chart', lineChart, () => {
  lineChart.setData([
    { title: 'Series 1', x: ['A', 'B', 'C'], y: [10, 20, 15], style: { line: 'yellow' } },
  ]);
});

// Test Bar Chart
const barChart = contrib.bar({
  parent: screen,
  top: 0, left: 0, width: 50, height: 15,
  barWidth: 6, barSpacing: 3,
});
testWidget('Bar Chart', barChart, () => {
  barChart.setData({ titles: ['A', 'B', 'C'], data: [10, 25, 15] });
});

// Test Stacked Bar
const stackedBar = contrib.stackedBar({
  parent: screen,
  top: 0, left: 0, width: 50, height: 15,
  barWidth: 8, barSpacing: 4,
});
testWidget('Stacked Bar', stackedBar, () => {
  stackedBar.setData({
    barCategory: ['Q1', 'Q2'],
    stackedCategory: ['A', 'B'],
    data: [[30, 20], [40, 25]],
  });
});

// Test Donut
const donut = contrib.donut({
  parent: screen,
  top: 0, left: 0, width: 40, height: 15,
  radius: 14, arcWidth: 4,
});
testWidget('Donut', donut, () => {
  donut.setData([
    { percent: 50, label: 'Test1', color: 'green' },
    { percent: 30, label: 'Test2', color: 'blue' },
  ]);
});

// Test Sparkline
const sparkline = contrib.sparkline({
  parent: screen,
  top: 0, left: 0, width: 50, height: 10,
});
testWidget('Sparkline', sparkline, () => {
  sparkline.setData(['CPU', 'Mem'], [[10, 20, 30, 40], [15, 25, 35, 45]]);
});

// Test Map
const map = contrib.map({
  parent: screen,
  top: 0, left: 0, width: 60, height: 20,
});
testWidget('Map', map, () => {
  map.addMarker({ lon: '-74', lat: '40', color: 'red', char: 'X' });
});

// Print results
console.log('\n=== Results ===\n');
console.log('Widget          | Canvas Size    | Braille | Status');
console.log('----------------|----------------|---------|-------');
for (const r of results) {
  const size = r.canvasSize ? `${r.canvasSize.width}x${r.canvasSize.height}` : 'N/A';
  console.log(
    `${r.widget.padEnd(15)} | ${size.padEnd(14)} | ${String(r.brailleCount).padEnd(7)} | ${r.status}`
  );
}

const passed = results.filter((r) => r.status === 'PASS').length;
const failed = results.filter((r) => r.status === 'FAIL').length;
console.log(`\nTotal: ${passed} passed, ${failed} failed`);

// Clean up
screen.destroy();
process.exit(failed > 0 ? 1 : 0);
