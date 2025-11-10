# blessed-contrib Demos Door

A showcase of blessed-contrib widgets for creating professional terminal dashboards in BBS doors.

## Features

This door demonstrates the following blessed-contrib widgets:

- **Line Charts**: Multi-series data with legends
- **Bar Charts**: Horizontal and vertical bar graphs
- **Gauges**: Single and stacked progress indicators
- **Donut Charts**: Percentage-based circular visualizations
- **Tables**: Data grids with headers and formatting
- **Sparklines**: Compact inline trend graphs
- **Logs**: Real-time scrolling log displays
- **LCD Displays**: Digital number displays

## Installation

```bash
cd sdk/examples/blessed-contrib-demos
npm install
npm run build
```

## Usage

Press any key to cycle through the demos. Press 'Q' to quit at any time.

## Demo Screens

1. **Line Chart** - BBS user activity over 30 days
2. **Bar Chart** - File downloads by category
3. **Gauges** - CPU usage, system resources, storage, active nodes
4. **Donut Chart** - User level distribution
5. **Table** - Top users leaderboard
6. **Sparklines** - Multi-node activity monitoring
7. **Log** - Real-time system log viewer

## Integration

These widgets can be integrated into any BBS door using the SDK's blessed integration:

```typescript
import blessed from 'neo-blessed';
import contrib from 'blessed-contrib';
import { DoorRuntime } from '@amiexpress/bbs-door-sdk/server';

const door = new DoorRuntime();
await door.initialize();

const screen = blessed.screen({
  smartCSR: true,
  output: door.getOutputStream(),
  input: door.getInputStream()
});

// Create widgets using contrib...
screen.render();
```

## Notes

- All demos use the SDK's stream integration for seamless BBS operation
- Widgets automatically adapt to terminal size
- Compatible with all ANSI/ASCII terminals
- Perfect for sysop dashboards, statistics, and monitoring tools
