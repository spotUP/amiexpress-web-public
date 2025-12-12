# Ultimate Neo-Blessed & Blessed-Contrib Showcase Door - Implementation Prompt

## Mission Statement

Create the **definitive interactive demo door** that teaches BBS door developers everything they need to know about neo-blessed and blessed-contrib. After exploring this door, a developer should understand all 49 available widgets (34 core + 15 contrib), 2 layout systems, interactive features, best practices, and real-world usage patterns.

This is not a simple demo - this is a **comprehensive educational experience** that showcases the full power and flexibility of the neo-blessed UI framework in a BBS environment.

---

## Technical Foundation

### Implementation Location
- **Create new door**: `~/Code/amiexpress-web/Doors/neoblessed-showcase/`
- **Package structure**: Standard SDK door with package.json, tsconfig.json, index.ts
- **Main file**: `index.ts` - Door entry point extending SDK Door class

### Required Imports
```typescript
import { Door, getTerminalDimensions } from '@amiexpress/bbs-door-sdk';
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import contrib from '@amiexpress/bbs-door-sdk/engines/ui/blessed/contrib';

// Individual widget imports for advanced usage
import { Grid, Carousel } from '@amiexpress/bbs-door-sdk/engines/ui/blessed/contrib';
```

### BBS Terminal Constraints (CRITICAL)
- **Width**: ALWAYS 80 columns (fixed, non-negotiable)
- **Height**: User-configurable (use `context.user.linesPerScreen` or default 23)
- **Total rows**: User's linesPerScreen + 2 for prompts (typically 25 total)
- **Line truncation**: All lines MUST truncate at 80 columns
- **No wrapping errors**: Content must respect terminal boundaries

---

## Architecture Overview

### Multi-Page Carousel Structure

The demo door uses a **Carousel layout** with 8-10 distinct pages, each showcasing different widget categories and features. Navigation is via arrow keys, page numbers, or a main menu.

**Page Structure:**
1. **Welcome & Introduction** - Animated welcome, feature overview
2. **Core Widgets Tour (Part 1)** - Containers, text, input widgets
3. **Core Widgets Tour (Part 2)** - Lists, tables, forms
4. **Contrib Charts** - Line, bar, stacked bar charts with live data
5. **Contrib Gauges** - Gauges, gauge lists, LCD displays
6. **Contrib Data** - Tree and table widgets with real data
7. **Contrib Display** - Donut, sparkline, log, markdown
8. **Layout Systems** - Grid layout examples, nested layouts
9. **Interactive Features** - Mouse, keyboard, focus, events
10. **Best Practices** - Code examples, tips, common patterns

### Navigation System

**Global Navigation Bar** (bottom 2 lines):
```
┌────────────────────────────────────────────────────────────────────────────┐
│ ← PREV │ ↑/↓ SCROLL │ → NEXT │ M:MENU │ H:HELP │ Q:QUIT │ Page 3/10      │
└────────────────────────────────────────────────────────────────────────────┘
```

**Key Bindings:**
- Left/Right arrows: Previous/Next page
- Up/Down: Scroll within page (if scrollable)
- M: Jump to main menu
- H: Context-sensitive help overlay
- Q: Quit door
- Numbers 1-9: Jump to specific pages
- Tab: Cycle through interactive elements
- Enter: Activate/interact with focused element
- Escape: Cancel/back

---

## Page 1: Welcome & Introduction

### Layout
```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│    ███╗   ██╗███████╗ ██████╗       ██████╗ ██╗     ███████╗███████╗███████╗│
│    ████╗  ██║██╔════╝██╔═══██╗      ██╔══██╗██║     ██╔════╝██╔════╝██╔════╝│
│    ██╔██╗ ██║█████╗  ██║   ██║█████╗██████╔╝██║     █████╗  ███████╗███████╗│
│    ██║╚██╗██║██╔══╝  ██║   ██║╚════╝██╔══██╗██║     ██╔══╝  ╚════██║╚════██║│
│    ██║ ╚████║███████╗╚██████╔╝      ██████╔╝███████╗███████╗███████║███████║│
│    ╚═╝  ╚═══╝╚══════╝ ╚═════╝       ╚═════╝ ╚══════╝╚══════╝╚══════╝╚══════╝│
│                                                                              │
│              & BLESSED-CONTRIB INTERACTIVE SHOWCASE                         │
│                    Complete Widget Demonstration                            │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Welcome to the ultimate neo-blessed framework demo! This interactive door  │
│  showcases ALL 49 widgets (34 core + 15 contrib) with live examples.       │
│                                                                              │
│  What You'll Learn:                                                         │
│   ✓ 34 Core blessed widgets (containers, input, display, interactive)      │
│   ✓ 15 Contrib widgets (charts, gauges, data, visualization)               │
│   ✓ 2 Layout systems (Grid, Carousel)                                      │
│   ✓ Mouse & keyboard interaction                                           │
│   ✓ Real-time data updates & animation                                     │
│   ✓ Best practices for BBS door development                                │
│   ✓ 80×25 terminal constraint handling                                     │
│                                                                              │
│  [████████████████████░░░░░░░░░] Loading demo... 75%                        │
│                                                                              │
│                    Press any key to begin tour →                            │
├──────────────────────────────────────────────────────────────────────────────┤
│ ← PREV │ ↑/↓ SCROLL │ → NEXT │ M:MENU │ H:HELP │ Q:QUIT │ Page 1/10        │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Implementation Details
- **BigText widget** for ASCII art title (use neo-blessed BigText)
- **Animated progress bar** showing "loading" (use ProgressBar widget)
- **Box widget** with centered text content
- **Smooth fade-in animation** (update content over frames)
- **Key handler**: Any key advances to page 2

### Code Pattern
```typescript
const welcomeBox = blessed.box({
  top: 0,
  left: 0,
  width: '100%',
  height: dims.contentHeight,
  content: generateWelcomeContent(),
  tags: true,
  border: {
    type: 'line'
  },
  style: {
    fg: 'white',
    bg: 'blue',
    border: {
      fg: 'cyan'
    }
  }
});

const progressBar = blessed.progressbar({
  bottom: 4,
  left: 'center',
  width: '50%',
  height: 3,
  orientation: 'horizontal',
  filled: 75,
  style: {
    bar: {
      bg: 'cyan'
    }
  }
});
```

---

## Page 2: Core Widgets Tour (Part 1)

### Focus: Containers, Text, and Basic Display

### Layout - Grid 2×3
```
┌──────────────────────────────────────────────────────────────────────────────┐
│                     CORE WIDGETS - CONTAINERS & TEXT                         │
├────────────────────────────────┬─────────────────────────────────────────────┤
│ Box Widget (left)              │ ScrollableBox (right)                       │
│ ─────────────────              │ ──────────────────────                      │
│ Basic container with:          │ Long scrollable content:                    │
│ • Optional border              │ Line 1                                      │
│ • Padding/margins              │ Line 2                                      │
│ • Background color             │ Line 3                                      │
│ • Child element support        │ ...scroll down for more...                  │
│                                │ ↓↓↓                                         │
├────────────────────────────────┼─────────────────────────────────────────────┤
│ Text Widget                    │ BigText Widget                              │
│ ───────────                    │ ───────────                                 │
│ Simple text display with       │  ██╗  ██╗██╗                                │
│ ANSI color support:            │  ██║  ██║██║                                │
│ {red-fg}Red text{/red-fg}      │  ███████║██║                                │
│ {bold}Bold text{/bold}         │  ██╔══██║╚═╝                                │
│ {underline}Underline{/}        │  ██║  ██║██╗                                │
│                                │  ╚═╝  ╚═╝╚═╝                                │
├────────────────────────────────┼─────────────────────────────────────────────┤
│ Line Widget (separator)        │ Layout Widget                               │
│ ────────────────────────       │ ─────────────                               │
│ ───────────────────────────    │ Auto-arranging container:                   │
│                                │ [A] [B] [C]                                 │
│ Horizontal/vertical lines      │ [D] [E] [F]                                 │
│                                │ Inline or Grid mode                         │
├────────────────────────────────┴─────────────────────────────────────────────┤
│ ← PREV │ ↑/↓ SCROLL │ → NEXT │ M:MENU │ H:HELP │ Q:QUIT │ Page 2/10        │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Widgets to Demonstrate
1. **Box** - Show border types (line, heavy, double, round, ascii, none)
2. **ScrollableBox** - Content longer than height, demonstrate scrolling
3. **Text** - ANSI tags: {red-fg}, {bold}, {underline}, {cyan-fg}
4. **BigText** - ASCII art text ("HI" example)
5. **Line** - Horizontal separator (orientation: 'horizontal')
6. **Layout** - Multiple boxes arranged automatically

### Interactive Elements
- **Click on ScrollableBox** to scroll (mouse wheel support)
- **Hover over boxes** to highlight (change border color)
- **Tab through elements** to show focus changes

### Implementation Notes
```typescript
// Use Grid layout for this page
const grid = new contrib.Grid({
  rows: 3,
  cols: 2,
  screen: screen
});

// Position widgets with grid.set(row, col, rowSpan, colSpan, widget, options)
const box = grid.set(0, 0, 1, 1, blessed.box, {
  content: 'Box Widget Demo...',
  border: { type: 'line' }
});

const scrollable = grid.set(0, 1, 1, 1, blessed.scrollablebox, {
  content: generateLongContent(),
  scrollbar: {
    ch: '█',
    style: { bg: 'cyan' }
  }
});
```

---

## Page 3: Core Widgets Tour (Part 2)

### Focus: Lists, Tables, and Selection

### Layout - Grid 2×2 + Bottom
```
┌──────────────────────────────────────────────────────────────────────────────┐
│                   CORE WIDGETS - LISTS, TABLES & SELECTION                   │
├────────────────────────────────┬─────────────────────────────────────────────┤
│ List Widget (interactive)      │ ListTable Widget                            │
│ ──────────────────────         │ ────────────────                            │
│  > Item 1 (selected)           │  Name          City         Status          │
│    Item 2                      │  ─────────────────────────────────────      │
│    Item 3                      │  > Alice        NYC          Online         │
│    Item 4                      │    Bob          LA           Away            │
│    Item 5                      │    Charlie      CHI          Offline         │
│ ↓ More items below...          │    Dave         SEA          Online          │
│                                │                                             │
│ Vi-mode: j/k or arrow keys     │ Selectable rows with styling                │
├────────────────────────────────┼─────────────────────────────────────────────┤
│ Form with Multiple Inputs      │ Selection Widgets                           │
│ ─────────────────────────      │ ─────────────────                           │
│ Username: [input_______]       │ ☑ Checkbox 1 (checked)                      │
│ Password: [************]       │ ☐ Checkbox 2 (unchecked)                    │
│ Message:  [text area    ]      │                                             │
│           [multi-line   ]      │ ◉ Radio Option A (selected)                 │
│           [____________ ]      │ ○ Radio Option B                            │
│ [Submit] [Cancel]              │ ○ Radio Option C                            │
├────────────────────────────────┴─────────────────────────────────────────────┤
│ TIP: Use TAB to navigate between inputs. Press ENTER on focused elements.    │
├──────────────────────────────────────────────────────────────────────────────┤
│ ← PREV │ ↑/↓ SCROLL │ → NEXT │ M:MENU │ H:HELP │ Q:QUIT │ Page 3/10        │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Widgets to Demonstrate
1. **List** - Selectable items, arrow key navigation, vi-mode
2. **ListTable** - Tabular data with selectable rows
3. **Form** - Container for inputs with data binding
4. **Textbox** - Single-line text input
5. **Textarea** - Multi-line text input
6. **PassBox** - Password input (censored display)
7. **Button** - Clickable with click handler
8. **Checkbox** - Boolean toggle
9. **RadioButton** - Single option
10. **RadioSet** - Radio button group

### Interactive Elements
- **Navigate list**: Up/down arrows or j/k (vi-mode)
- **Select table row**: Click or arrow keys + Enter
- **Tab through form**: Tab/Shift+Tab to cycle inputs
- **Click buttons**: Mouse click or Enter when focused
- **Toggle checkbox**: Click or Space when focused
- **Select radio**: Click or arrow keys

### Implementation Pattern
```typescript
// Create interactive list
const list = blessed.list({
  items: ['Item 1', 'Item 2', 'Item 3', 'Item 4', 'Item 5'],
  keys: true,
  vi: true,
  mouse: true,
  selectedBg: 'blue',
  selectedFg: 'white',
  style: {
    selected: {
      bg: 'blue'
    }
  }
});

list.on('select', (item, index) => {
  showMessage(`Selected: ${item.getText()}`);
});

// Create form with inputs
const form = blessed.form({
  keys: true,
  vi: false
});

const textbox = blessed.textbox({
  parent: form,
  name: 'username',
  inputOnFocus: true
});

const button = blessed.button({
  parent: form,
  content: 'Submit',
  mouse: true
});

button.on('press', () => {
  form.submit();
});

form.on('submit', (data) => {
  console.log('Form data:', data);
});
```

---

## Page 4: Contrib Charts - Real-Time Data Visualization

### Layout - Grid 2×2
```
┌──────────────────────────────────────────────────────────────────────────────┐
│                      BLESSED-CONTRIB CHARTS SHOWCASE                         │
├────────────────────────────────┬─────────────────────────────────────────────┤
│ Line Chart (Multi-line)        │ Bar Chart                                   │
│                                │                                             │
│  120│                   •      │      █                                      │
│  100│           •       │      │      █                                      │
│   80│   •   •   │   •   │      │  █   █                                      │
│   60│   │   │   │   │   │      │  █   █   █                                  │
│   40│───┼───┼───┼───┼───┼──    │  █   █   █   █                              │
│      Mon Tue Wed Thu Fri Sat   │ Mon Tue Wed Thu Fri                         │
│                                │                                             │
│ Legend: ─ Logins ─ Messages    │ Daily Uploads                               │
├────────────────────────────────┼─────────────────────────────────────────────┤
│ Stacked Bar Chart              │ Chart Controls                              │
│                                │                                             │
│  █████████████ 65%             │  Update Interval: [___5___] seconds         │
│  █████████ 45%                 │                                             │
│  ████████████ 60%              │  [Start Animation]  [Stop]                  │
│  ██████ 30%                    │                                             │
│  Mon  Tue  Wed  Thu            │  Data Points: 247                           │
│                                │  Last Update: 12:34:56                      │
│ Legend: Files Msgs Calls       │  [Export Data]  [Reset]                     │
├────────────────────────────────┴─────────────────────────────────────────────┤
│ NOTE: Charts update in real-time. Data simulates BBS activity metrics.       │
├──────────────────────────────────────────────────────────────────────────────┤
│ ← PREV │ ↑/↓ SCROLL │ → NEXT │ M:MENU │ H:HELP │ Q:QUIT │ Page 4/10        │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Widgets to Demonstrate
1. **Line Chart** (`contrib.line`)
   - Multi-line series with different colors
   - Auto-scaling Y-axis
   - Legend positioning
   - Abbreviated numbers (1k, 1.5m)
   - Custom styling per line

2. **Bar Chart** (`contrib.bar`)
   - Vertical bars with labels
   - Color customization
   - Value display on bars
   - Dynamic height based on max value

3. **Stacked Bar Chart** (`contrib.stackedBar`)
   - Multiple segments per bar
   - Color-coded legend
   - Percentage display per segment
   - Category labels

### Real-Time Animation
- **Update every 5 seconds** with new data points
- **Smooth transitions** as data changes
- **Simulate BBS metrics**: logins, uploads, messages, calls
- **Controls**: Start/stop animation, adjust interval

### Implementation Pattern
```typescript
// Create line chart with multiple series
const lineChart = contrib.line({
  style: {
    line: 'yellow',
    text: 'green',
    baseline: 'white'
  },
  xLabelPadding: 3,
  xPadding: 5,
  showLegend: true,
  wholeNumbersOnly: false,
  legend: { width: 12 }
});

// Set initial data
lineChart.setData([
  {
    title: 'Logins',
    x: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    y: [45, 67, 89, 72, 95],
    style: { line: 'red' }
  },
  {
    title: 'Messages',
    x: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    y: [23, 34, 56, 43, 67],
    style: { line: 'blue' }
  }
]);

// Animate with real-time updates
let dataPoints = generateInitialData();
setInterval(() => {
  dataPoints = updateDataPoints(dataPoints);
  lineChart.setData(dataPoints);
  screen.render();
}, 5000);
```

### Data Generation
```typescript
function generateBBSMetrics() {
  return {
    logins: Math.floor(Math.random() * 50) + 20,
    uploads: Math.floor(Math.random() * 30) + 10,
    messages: Math.floor(Math.random() * 100) + 50,
    calls: Math.floor(Math.random() * 20) + 5
  };
}
```

---

## Page 5: Contrib Gauges - Progress & Status Indicators

### Layout - Grid 3×2
```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    BLESSED-CONTRIB GAUGES & INDICATORS                       │
├────────────────────────────────┬─────────────────────────────────────────────┤
│ Simple Gauge                   │ Stacked Gauge (Multi-segment)               │
│                                │                                             │
│ CPU Usage:                     │ Disk Space:                                 │
│ ████████████████░░░░ 75%       │ ███████████░░░░░░░░░                        │
│                                │ Used Files Temp Free                        │
│ Memory:                        │ 45%  25%   10%  20%                         │
│ █████████████░░░░░░░ 65%       │                                             │
├────────────────────────────────┼─────────────────────────────────────────────┤
│ Gauge List (Multiple)          │ LCD Display (16-Segment)                    │
│                                │                                             │
│ 0 ██████████░░░░ 50%           │   ╔═══════════════════════╗                 │
│ 1 ███████░░░░░░░ 35%           │   ║  ████  ████  ████  ║                 │
│ 2 █████████████░ 70%           │   ║  ████  ████  ████  ║                 │
│ 3 ████████░░░░░░ 40%           │   ║    12:34:56 PM     ║                 │
│ 4 ███████████░░░ 60%           │   ╚═══════════════════════╝                 │
│                                │                                             │
│ Node Status (1-5)              │ Classic LCD appearance                      │
├────────────────────────────────┼─────────────────────────────────────────────┤
│ ProgressBar (Horizontal)       │ ProgressBar (Vertical)                      │
│                                │                      ██                      │
│ File Transfer:                 │  Node 3 Load:       ██                      │
│ [████████████░░░░░░░] 60%      │                     ██                      │
│ 6.5 MB / 10.8 MB               │                     ██                      │
│ ETA: 2m 34s                    │                     ██                      │
│                                │                     ░░                      │
│ [Pause] [Cancel]               │                     ░░    85%               │
├────────────────────────────────┴─────────────────────────────────────────────┤
│ TIP: Gauges update in real-time to show system status and progress.          │
├──────────────────────────────────────────────────────────────────────────────┤
│ ← PREV │ ↑/↓ SCROLL │ → NEXT │ M:MENU │ H:HELP │ Q:QUIT │ Page 5/10        │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Widgets to Demonstrate
1. **Gauge** (`contrib.gauge`)
   - Single percent display
   - Stacked multi-segment
   - Color per segment
   - Label toggle

2. **GaugeList** (`contrib.gaugeList`)
   - Multiple gauges vertically
   - Individual styling
   - Compact layout
   - Node/server status

3. **LCD** (`contrib.lcd`)
   - Sixteen-segment display
   - Alphanumeric characters
   - Time/date display
   - Customizable segments

4. **ProgressBar** (core blessed)
   - Horizontal/vertical orientation
   - Percentage or value-based
   - Custom styling
   - Animation support

### Real-Time Updates
- **CPU/Memory gauges**: Update every 2 seconds
- **Node status**: Update every 3 seconds
- **LCD time**: Update every second
- **File transfer**: Simulate progress animation

### Implementation Pattern
```typescript
// Simple gauge
const cpuGauge = contrib.gauge({
  label: 'CPU Usage',
  stroke: 'green',
  fill: 'white',
  showLabel: true
});

cpuGauge.setPercent(75);

// Stacked gauge
const diskGauge = contrib.gauge({
  label: 'Disk Space',
  showLabel: true
});

diskGauge.setStack([
  { percent: 45, stroke: 'red' },      // Used
  { percent: 25, stroke: 'yellow' },   // Files
  { percent: 10, stroke: 'blue' },     // Temp
  { percent: 20, stroke: 'green' }     // Free
]);

// LCD display with time
const lcd = contrib.lcd({
  elements: 8,
  display: '12:34:56',
  elementSpacing: 1,
  elementPadding: 1
});

// Update time every second
setInterval(() => {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour12: false });
  lcd.setDisplay(timeStr);
  screen.render();
}, 1000);

// Gauge list for node status
const gaugeList = contrib.gaugeList({
  gaugeSpacing: 1,
  gaugeHeight: 1,
  gauges: [
    { stack: [{ percent: 50, stroke: 'green' }], showLabel: true },
    { stack: [{ percent: 35, stroke: 'yellow' }], showLabel: true },
    { stack: [{ percent: 70, stroke: 'red' }], showLabel: true },
    { stack: [{ percent: 40, stroke: 'blue' }], showLabel: true },
    { stack: [{ percent: 60, stroke: 'cyan' }], showLabel: true }
  ]
});
```

---

## Page 6: Contrib Data - Tree & Table Widgets

### Layout - Split Screen
```
┌──────────────────────────────────────────────────────────────────────────────┐
│                      BLESSED-CONTRIB DATA WIDGETS                            │
├────────────────────────────────┬─────────────────────────────────────────────┤
│ Tree Widget (Hierarchical)     │ Table Widget (Tabular Data)                 │
│                                │                                             │
│ BBS Structure                  │  ID   Username    Calls  Uploads  Status    │
│ └┬ Conferences                 │  ════════════════════════════════════════   │
│  ├─ General [-]                │  001  SysOp       1,234  567       Online   │
│  │  ├─ Main Board             │  002  Alice       892    234       Away     │
│  │  └─ Tech Support           │  003  Bob         456    123       Online   │
│  ├─ File Areas [+]             │  004  Charlie     234    89        Offline  │
│  └─ Games [+]                  │  005  Dave        678    345       Online   │
│ └┬ Doors                       │  006  Eve         123    56        Away     │
│  ├─ Games [-]                  │  007  Frank       890    456       Online   │
│  │  ├─ TradeWars              │  008  Grace       345    178       Online   │
│  │  └─ LORD                   │                                             │
│  └─ Utils [+]                  │ ↓ Scroll for more users...                  │
│                                │                                             │
│ Use +/Enter to expand          │ Use arrows to select, Enter to view         │
├────────────────────────────────┴─────────────────────────────────────────────┤
│ FEATURES: Click nodes to expand/collapse. Select rows to view details.       │
├──────────────────────────────────────────────────────────────────────────────┤
│ ← PREV │ ↑/↓ SCROLL │ → NEXT │ M:MENU │ H:HELP │ Q:QUIT │ Page 6/10        │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Widgets to Demonstrate
1. **Tree** (`contrib.tree`)
   - Hierarchical data display
   - Expand/collapse nodes
   - Keyboard navigation (+, Enter, arrows)
   - Mouse click to expand
   - Tree lines (├, └, │, ─)
   - Custom templates

2. **Table** (`contrib.table`)
   - Column headers
   - Selectable rows
   - Scrolling support
   - ANSI colors in cells
   - Column width control
   - Interactive mode

### Interactive Features
- **Tree navigation**: Arrow keys, +/- to expand/collapse, Enter to select
- **Table navigation**: Arrow keys, Enter to view details
- **Mouse support**: Click tree nodes, click table rows
- **Detail popup**: Show overlay with selected item details

### Implementation Pattern
```typescript
// Create tree with BBS structure
const tree = contrib.tree({
  template: {
    lines: true
  },
  style: {
    fg: 'green'
  }
});

// Set tree data
tree.setData({
  name: 'BBS Structure',
  extended: true,
  children: {
    'Conferences': {
      extended: true,
      children: {
        'General': {
          extended: false,
          children: {
            'Main Board': {},
            'Tech Support': {}
          }
        },
        'File Areas': {
          extended: false
        },
        'Games': {
          extended: false
        }
      }
    },
    'Doors': {
      extended: true,
      children: {
        'Games': {
          extended: false,
          children: {
            'TradeWars': {},
            'LORD': {}
          }
        },
        'Utils': {
          extended: false
        }
      }
    }
  }
});

tree.on('select', (node) => {
  showNodeDetails(node);
});

// Create table with user data
const table = contrib.table({
  columnWidth: [5, 12, 8, 10, 10],
  columnSpacing: 1,
  interactive: true,
  keys: true,
  vi: true,
  selectedFg: 'white',
  selectedBg: 'blue'
});

table.setData({
  headers: ['ID', 'Username', 'Calls', 'Uploads', 'Status'],
  data: [
    ['001', 'SysOp', '1,234', '567', 'Online'],
    ['002', 'Alice', '892', '234', 'Away'],
    ['003', 'Bob', '456', '123', 'Online'],
    ['004', 'Charlie', '234', '89', 'Offline'],
    ['005', 'Dave', '678', '345', 'Online']
  ]
});
```

---

## Page 7: Contrib Display - Donut, Sparkline, Log, Markdown

### Layout - Grid 2×2
```
┌──────────────────────────────────────────────────────────────────────────────┐
│                     BLESSED-CONTRIB DISPLAY WIDGETS                          │
├────────────────────────────────┬─────────────────────────────────────────────┤
│ Donut Charts                   │ Sparkline Charts                            │
│                                │                                             │
│    ████      ████      ████    │ CPU:     ▁▂▃▄▅▆▇█▇▆▅▄▃▂▁                   │
│  ██    ██  ██    ██  ██    ██  │                                             │
│  ██ 75 ██  ██ 60 ██  ██ 90 ██  │ Memory:  ▂▃▄▄▅▅▆▆▇▇▇▆▅▄▃                   │
│  ██    ██  ██    ██  ██    ██  │                                             │
│    ████      ████      ████    │ Network: ▁▁▂▃▄▅▆▇▆▅▄▃▂▁▁                   │
│   Disk     Memory    CPU       │                                             │
│                                │ Calls:   ▄▅▆▇█▇▆▅▄▃▃▄▅▆▇                   │
├────────────────────────────────┼─────────────────────────────────────────────┤
│ Log Widget (Scrollable)        │ Markdown Widget                             │
│                                │                                             │
│ [12:34:01] User login: Alice   │ # BBS Door Development                      │
│ [12:34:15] File upload: test.z │                                             │
│ [12:35:02] Message posted      │ ## Getting Started                          │
│ [12:35:30] Door launched: TTT  │                                             │
│ [12:36:45] User logout         │ **Neo-Blessed** provides:                   │
│ [12:37:12] System backup start │ - 34 core widgets                           │
│ [12:38:30] Backup complete     │ - 15 contrib widgets                        │
│ ↓ Auto-scroll on new logs      │ - Full mouse support                        │
│                                │                                             │
│ [Clear Log] [Export]           │ See `README.md` for details                 │
├────────────────────────────────┴─────────────────────────────────────────────┤
│ NOTE: Sparklines show trends. Log auto-scrolls. Markdown renders formatting. │
├──────────────────────────────────────────────────────────────────────────────┤
│ ← PREV │ ↑/↓ SCROLL │ → NEXT │ M:MENU │ H:HELP │ Q:QUIT │ Page 7/10        │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Widgets to Demonstrate
1. **Donut** (`contrib.donut`)
   - Circular progress rings
   - Multiple donuts
   - Percentage labels
   - Color customization

2. **Sparkline** (`contrib.sparkline`)
   - Inline trend charts
   - Unicode characters (▁▂▃▄▅▆▇█)
   - Multiple series
   - Real-time updates

3. **Log** (`contrib.log`)
   - Scrollable log display
   - Auto-scroll option
   - Timestamped entries
   - Color-coded messages

4. **Markdown** (`contrib.markdown`)
   - Headers (H1-H6)
   - Bold, italic, code
   - Lists, blockquotes
   - Links

### Real-Time Features
- **Sparklines update** every 2 seconds with new data
- **Log entries append** every 3-5 seconds
- **Donut values animate** smoothly
- **Auto-scroll** log to bottom on new entry

### Implementation Pattern
```typescript
// Donut charts
const donutChart = contrib.donut({
  radius: 8,
  arcWidth: 3,
  spacing: 2,
  yPadding: 2
});

donutChart.setData([
  { label: 'Disk', percent: 75, color: 'red' },
  { label: 'Memory', percent: 60, color: 'yellow' },
  { label: 'CPU', percent: 90, color: 'green' }
]);

// Sparklines
const sparkline = contrib.sparkline({
  style: { titleFg: 'white' }
});

sparkline.setData(
  ['CPU', 'Memory', 'Network', 'Calls'],
  [
    [1, 2, 3, 4, 5, 6, 7, 8, 7, 6, 5, 4, 3, 2, 1],
    [2, 3, 4, 4, 5, 5, 6, 6, 7, 7, 7, 6, 5, 4, 3],
    [1, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1, 1],
    [4, 5, 6, 7, 8, 7, 6, 5, 4, 3, 3, 4, 5, 6, 7]
  ]
);

// Log widget
const log = contrib.log({
  bufferLength: 30,
  style: { fg: 'green' }
});

// Add log entries
function addLogEntry(message: string) {
  const timestamp = new Date().toLocaleTimeString();
  log.log(`[${timestamp}] ${message}`);
  screen.render();
}

// Markdown widget
const markdown = contrib.markdown({
  markdown: `# BBS Door Development\n\n## Getting Started\n\n**Neo-Blessed** provides:\n- 34 core widgets\n- 15 contrib widgets\n- Full mouse support`
});
```

---

## Page 8: Layout Systems - Grid & Carousel

### Layout - Demonstration of Grid
```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         LAYOUT SYSTEMS SHOWCASE                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Grid Layout (Row/Column Based)                                             │
│  ──────────────────────────────                                             │
│                                                                              │
│  ┌─────────────┬─────────────┬─────────────┬─────────────┐                 │
│  │  Cell 1,1   │  Cell 1,2   │  Cell 1,3   │  Cell 1,4   │                 │
│  │  (Gauge)    │  (Chart)    │  (Sparkline)│  (Log)      │                 │
│  ├─────────────┴─────────────┼─────────────┴─────────────┤                 │
│  │  Cell 2,1 (span=2)        │  Cell 2,3 (span=2)        │                 │
│  │  (Large Chart)            │  (Table)                  │                 │
│  ├───────────────────────────┴───────────────────────────┤                 │
│  │  Cell 3,1 (span=4 - Full Width)                       │                 │
│  │  (Status Bar / Info Panel)                            │                 │
│  └────────────────────────────────────────────────────────┘                 │
│                                                                              │
│  Code Example:                                                              │
│  const grid = new Grid({ rows: 3, cols: 4, screen });                      │
│  grid.set(0, 0, 1, 1, contrib.gauge, { label: 'CPU' });                    │
│  grid.set(0, 1, 1, 1, contrib.line, { /* chart opts */ });                 │
│  grid.set(1, 0, 1, 2, contrib.bar, { /* large chart */ });                 │
│  grid.set(2, 0, 1, 4, blessed.box, { /* full width */ });                  │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│ Carousel Layout (Multi-Page Navigation)                                     │
│ This entire demo IS a carousel! Use arrows to navigate pages.               │
│                                                                              │
│ const carousel = new Carousel(pages, { screen, controlKeys: true });        │
│ carousel.start();                                                           │
├──────────────────────────────────────────────────────────────────────────────┤
│ ← PREV │ ↑/↓ SCROLL │ → NEXT │ M:MENU │ H:HELP │ Q:QUIT │ Page 8/10        │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Widgets to Demonstrate
1. **Grid Layout** - Row/column positioning
2. **Cell spanning** - rowSpan, colSpan
3. **Dynamic sizing** - Percentage-based
4. **Nested layouts** - Grid within grid
5. **Carousel** - This demo itself uses carousel

### Live Grid Demo
Create a mini dashboard showing:
- Top row: 4 gauges (1×1 each)
- Middle row: Line chart (1×2), Table (1×2)
- Bottom row: Status bar (1×4)

### Implementation Notes
```typescript
// Create grid layout
const grid = new contrib.Grid({
  rows: 3,
  cols: 4,
  screen: screen
});

// Add widgets to grid cells
const gauge1 = grid.set(0, 0, 1, 1, contrib.gauge, {
  label: 'CPU',
  percent: 75
});

const lineChart = grid.set(1, 0, 1, 2, contrib.line, {
  showLegend: true,
  data: lineData
});

const table = grid.set(1, 2, 1, 2, contrib.table, {
  columnWidth: [10, 10, 10]
});

const statusBar = grid.set(2, 0, 1, 4, blessed.box, {
  content: 'Status: All systems operational',
  style: { fg: 'green' }
});
```

---

## Page 9: Interactive Features - Mouse, Keyboard, Events

### Layout - Split with Event Log
```
┌──────────────────────────────────────────────────────────────────────────────┐
│                      INTERACTIVE FEATURES SHOWCASE                           │
├──────────────────────────────────────────────────────────────────────────────┤
│ Interactive Element Test Area                                               │
│ ────────────────────────────────                                            │
│                                                                              │
│  [Button 1]  [Button 2]  [Button 3]  ☑ Enable Mouse  ☑ Enable Keys         │
│                                                                              │
│  Draggable Box (click & drag):                                              │
│  ┌─────────────────────┐                                                    │
│  │  Drag me around!    │                                                    │
│  │  Mouse: Hold & Drag │                                                    │
│  └─────────────────────┘                                                    │
│                                                                              │
│  Focus Test (use TAB):                                                      │
│  [Input 1___] [Input 2___] [Input 3___]                                     │
│                                                                              │
│  Hover Box (hover to highlight):                                            │
│  ╔═══════════════╗  ╔═══════════════╗  ╔═══════════════╗                   │
│  ║  Hover Box 1  ║  ║  Hover Box 2  ║  ║  Hover Box 3  ║                   │
│  ╚═══════════════╝  ╚═══════════════╝  ╚═══════════════╝                   │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│ Event Log (Real-Time)                                                       │
│ ─────────────────────                                                       │
│ [12:34:01] Button 1 clicked at (x:15, y:3)                                  │
│ [12:34:03] Mouse entered Hover Box 2                                        │
│ [12:34:04] Mouse left Hover Box 2                                           │
│ [12:34:07] Focus changed: Input 1 -> Input 2 (Tab key)                      │
│ [12:34:09] Draggable box moved to (x:25, y:8)                               │
│ [12:34:12] Wheel scrolled down (deltaY: -1)                                 │
│ [12:34:15] Key pressed: 'h' (keycode: 104)                                  │
│ ↓ More events...                                                            │
├──────────────────────────────────────────────────────────────────────────────┤
│ TIP: Try clicking, hovering, dragging, scrolling, and pressing keys!        │
├──────────────────────────────────────────────────────────────────────────────┤
│ ← PREV │ ↑/↓ SCROLL │ → NEXT │ M:MENU │ H:HELP │ Q:QUIT │ Page 9/10        │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Features to Demonstrate

**Mouse Events:**
1. **Click** - Button clicks, widget activation
2. **Hover** - mouseenter/mouseleave events
3. **Drag** - Click and drag to move box
4. **Wheel** - Scroll wheel up/down
5. **Right-click** - Context menu (if supported)

**Keyboard Events:**
1. **Key press** - Individual key detection
2. **Modifiers** - Ctrl, Shift, Alt combinations
3. **Special keys** - Enter, Escape, Tab, arrows
4. **Vi-mode** - hjkl navigation
5. **Key sequences** - Multiple key combinations

**Focus Management:**
1. **Tab navigation** - Cycle through focusable elements
2. **Shift+Tab** - Reverse tab order
3. **Focus events** - focus/blur handlers
4. **Auto-scroll** - Scroll to focused element
5. **Focus stack** - Push/pop focus

**Events to Log:**
- `click` - Mouse click with coordinates
- `mouseenter` / `mouseleave` - Hover state
- `mousemove` - Mouse position
- `wheeldown` / `wheelup` - Scroll wheel
- `keypress` - Key with code
- `focus` / `blur` - Focus changes
- `resize` - Screen/widget resize

### Implementation Pattern
```typescript
// Enable mouse support
screen.enableMouse();

// Create interactive buttons
const button1 = blessed.button({
  content: 'Button 1',
  mouse: true,
  keys: true
});

button1.on('press', () => {
  logEvent('Button 1 clicked');
});

// Draggable box
const draggableBox = blessed.box({
  content: 'Drag me around!',
  draggable: true,
  mouse: true
});

draggableBox.on('move', () => {
  logEvent(`Box moved to (${draggableBox.left}, ${draggableBox.top})`);
});

// Hover boxes
const hoverBox = blessed.box({
  content: 'Hover Box 1',
  mouse: true
});

hoverBox.on('mouseenter', () => {
  hoverBox.style.border.fg = 'yellow';
  logEvent('Mouse entered Hover Box 1');
  screen.render();
});

hoverBox.on('mouseleave', () => {
  hoverBox.style.border.fg = 'cyan';
  logEvent('Mouse left Hover Box 1');
  screen.render();
});

// Mouse wheel scrolling
screen.on('wheeldown', () => {
  logEvent('Wheel scrolled down');
});

screen.on('wheelup', () => {
  logEvent('Wheel scrolled up');
});

// Key press logging
screen.on('keypress', (ch, key) => {
  logEvent(`Key pressed: '${ch}' (code: ${key.full})`);
});

// Focus management
input1.on('focus', () => {
  logEvent('Input 1 focused');
});

input1.on('blur', () => {
  logEvent('Input 1 blurred');
});

// Event logging function
const eventLog = contrib.log();
function logEvent(message: string) {
  const timestamp = new Date().toLocaleTimeString();
  eventLog.log(`[${timestamp}] ${message}`);
}
```

---

## Page 10: Best Practices & Code Examples

### Layout - Reference Guide
```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    BEST PRACTICES & CODE EXAMPLES                            │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ 1. ALWAYS Respect 80×25 Terminal Constraints                                │
│    ✓ Use getTerminalDimensions(context) for user's screen size              │
│    ✓ Truncate lines exceeding 80 columns                                    │
│    ✓ Reserve 2 lines for prompts/status                                     │
│                                                                              │
│ 2. Proper Resource Cleanup                                                  │
│    ✓ Call screen.destroy() on door exit                                     │
│    ✓ Clear intervals/timers before exiting                                  │
│    ✓ Remove event listeners when done                                       │
│                                                                              │
│ 3. Use Grid Layout for Dashboards                                           │
│    const grid = new Grid({ rows: 3, cols: 3, screen });                     │
│    grid.set(row, col, rowSpan, colSpan, widgetFactory, options);            │
│                                                                              │
│ 4. Handle Keyboard & Mouse Gracefully                                       │
│    screen.enableMouse();                                                    │
│    element.on('click', handler);                                            │
│    element.key(['escape', 'q'], () => exitDoor());                          │
│                                                                              │
│ 5. Real-Time Updates                                                        │
│    setInterval(() => {                                                      │
│      widget.setData(newData);                                               │
│      screen.render();                                                       │
│    }, updateInterval);                                                      │
│                                                                              │
│ 6. Error Handling                                                           │
│    try {                                                                    │
│      // Widget operations                                                   │
│    } catch (err) {                                                          │
│      showErrorDialog(err.message);                                          │
│    }                                                                         │
│                                                                              │
│ 7. Common Patterns                                                          │
│    • Use blessed.box for containers                                         │
│    • Use contrib.table for data lists                                       │
│    • Use contrib.line for trends                                            │
│    • Use contrib.gauge for progress                                         │
│    • Use blessed.list for selections                                        │
│                                                                              │
│ 8. Complete Door Template Available                                         │
│    See: /sdk/examples/neoblessed-starter-template.ts                        │
│                                                                              │
│                                                                              │
│                  [View Template]  [Export Examples]  [Done]                 │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│ ← PREV │ ↑/↓ SCROLL │ → NEXT │ M:MENU │ H:HELP │ Q:QUIT │ Page 10/10       │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Content Sections
1. **Terminal Constraints** - 80×25 rules
2. **Resource Cleanup** - Proper shutdown
3. **Grid Layouts** - Dashboard creation
4. **Event Handling** - Mouse/keyboard
5. **Real-Time Updates** - Animation patterns
6. **Error Handling** - Graceful failures
7. **Common Patterns** - Widget usage
8. **Code Templates** - Starter files

---

## Main Menu (Accessible via 'M' key)

### Layout - Centered Dialog
```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│                                                                              │
│                       ╔════════════════════════════════╗                     │
│                       ║   SHOWCASE MAIN MENU          ║                     │
│                       ╠════════════════════════════════╣                     │
│                       ║                                ║                     │
│                       ║  1. Welcome & Introduction     ║                     │
│                       ║  2. Core Widgets (Part 1)      ║                     │
│                       ║  3. Core Widgets (Part 2)      ║                     │
│                       ║  4. Contrib Charts             ║                     │
│                       ║  5. Contrib Gauges             ║                     │
│                       ║  6. Contrib Data Widgets       ║                     │
│                       ║  7. Contrib Display Widgets    ║                     │
│                       ║  8. Layout Systems             ║                     │
│                       ║  9. Interactive Features       ║                     │
│                       ║ 10. Best Practices             ║                     │
│                       ║                                ║                     │
│                       ║  H. Help & Documentation       ║                     │
│                       ║  Q. Quit Showcase              ║                     │
│                       ║                                ║                     │
│                       ║  Select page (1-10):           ║                     │
│                       ╚════════════════════════════════╝                     │
│                                                                              │
│                                                                              │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│ Use number keys (1-10) or arrows + Enter to navigate                        │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Implementation
- **Overlay widget** with semi-transparent background
- **List widget** for menu items
- **Number key shortcuts** (1-10)
- **Arrow key navigation**
- **Escape to close** menu

---

## Help System (Accessible via 'H' key)

### Context-Sensitive Help Overlay
```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ╔═══════════════════════════════════════════════════════════════════════════╗│
│ ║ HELP - Page 4: Contrib Charts                                           ║│
│ ╠═══════════════════════════════════════════════════════════════════════════╣│
│ ║                                                                          ║│
│ ║ This page demonstrates blessed-contrib chart widgets:                   ║│
│ ║                                                                          ║│
│ ║ • Line Chart (contrib.line)                                             ║│
│ ║   - Multi-line series with customizable colors                          ║│
│ ║   - Auto-scaling Y-axis with label formatting                           ║│
│ ║   - Legend support and abbreviated numbers (k, m, b)                    ║│
│ ║   - Usage: const chart = contrib.line(options);                         ║│
│ ║            chart.setData([{ title, x, y, style }]);                     ║│
│ ║                                                                          ║│
│ ║ • Bar Chart (contrib.bar)                                               ║│
│ ║   - Vertical bars with labels and value display                         ║│
│ ║   - Customizable width, spacing, and colors                             ║│
│ ║   - Usage: const chart = contrib.bar({ barWidth: 6 });                  ║│
│ ║            chart.setData({ titles, data });                             ║│
│ ║                                                                          ║│
│ ║ • Stacked Bar Chart (contrib.stackedBar)                                ║│
│ ║   - Multiple segments per bar with legend                               ║│
│ ║   - Color-coded sections with percentage labels                         ║│
│ ║   - Usage: const chart = contrib.stackedBar(options);                   ║│
│ ║            chart.setData({ barCategory, stackedCategory, data });       ║│
│ ║                                                                          ║│
│ ║ Key Bindings:                                                           ║│
│ ║  → Next Page    ← Previous Page    M Main Menu    Q Quit                ║│
│ ║                                                                          ║│
│ ║                         [Close Help]                                    ║│
│ ╚═══════════════════════════════════════════════════════════════════════════╝│
└──────────────────────────────────────────────────────────────────────────────┘
```

### Help Content for Each Page
- Widget descriptions
- Code examples
- Key bindings
- Tips and tricks
- Common issues

---

## Technical Implementation Requirements

### 1. Door Structure

**File: `/Doors/neoblessed-showcase/index.ts`**
```typescript
import { Door, getTerminalDimensions } from '@amiexpress/bbs-door-sdk';
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import contrib from '@amiexpress/bbs-door-sdk/engines/ui/blessed/contrib';

class NeoBlessedShowcase extends Door {
  private screen: any;
  private carousel: any;
  private currentPage: number = 0;
  private pages: Function[] = [];
  private intervals: NodeJS.Timeout[] = [];

  async onStart() {
    // Get terminal dimensions
    const dims = getTerminalDimensions(this.context);

    // Create screen
    this.screen = blessed.screen({
      height: dims.height,
      output: (data: string) => this.context.output.write(data)
    });

    // Enable mouse support
    this.screen.enableMouse();

    // Create all pages
    this.pages = [
      this.createPage1Welcome,
      this.createPage2CoreWidgets1,
      this.createPage3CoreWidgets2,
      this.createPage4Charts,
      this.createPage5Gauges,
      this.createPage6Data,
      this.createPage7Display,
      this.createPage8Layouts,
      this.createPage9Interactive,
      this.createPage10BestPractices
    ];

    // Setup carousel
    this.carousel = new contrib.Carousel(
      this.pages.map((page, idx) => (screen: any) => page.call(this, screen, idx)),
      {
        screen: this.screen,
        controlKeys: true,
        rotate: true
      }
    );

    // Setup global key handlers
    this.setupGlobalKeys();

    // Start carousel
    this.carousel.start();
  }

  private setupGlobalKeys() {
    // Main menu
    this.screen.key(['m', 'M'], () => this.showMainMenu());

    // Help
    this.screen.key(['h', 'H'], () => this.showHelp());

    // Quit
    this.screen.key(['q', 'Q', 'escape'], () => this.quit());

    // Page numbers
    for (let i = 1; i <= 10; i++) {
      this.screen.key([String(i)], () => {
        this.currentPage = i - 1;
        this.carousel.currPage = this.currentPage;
        this.carousel.move();
      });
    }
  }

  private createPage1Welcome(screen: any, pageNum: number) {
    // Implementation for welcome page
    // ... (as detailed above)
  }

  // ... more page creation methods

  private showMainMenu() {
    // Create overlay with menu
  }

  private showHelp() {
    // Create context-sensitive help overlay
  }

  private quit() {
    // Cleanup
    this.intervals.forEach(clearInterval);
    this.screen.destroy();
    process.exit(0);
  }
}

export default NeoBlessedShowcase;
```

### 2. Animation & Real-Time Updates

**Pattern for Live Data:**
```typescript
// Store interval IDs for cleanup
private intervals: NodeJS.Timeout[] = [];

// Create animated widget
private createLiveChart(parent: any) {
  const chart = contrib.line({ /* options */ });
  parent.append(chart);

  // Initial data
  let dataPoints = this.generateInitialData();
  chart.setData(dataPoints);

  // Update every 2 seconds
  const interval = setInterval(() => {
    dataPoints = this.updateDataPoints(dataPoints);
    chart.setData(dataPoints);
    this.screen.render();
  }, 2000);

  // Store for cleanup
  this.intervals.push(interval);
}

// Cleanup on page change or exit
private cleanup() {
  this.intervals.forEach(clearInterval);
  this.intervals = [];
}
```

### 3. Data Generation Utilities

**Realistic BBS Metrics:**
```typescript
private generateBBSMetrics() {
  const hour = new Date().getHours();
  const peakMultiplier = (hour >= 18 && hour <= 23) ? 1.5 : 1.0;

  return {
    logins: Math.floor((Math.random() * 30 + 20) * peakMultiplier),
    uploads: Math.floor((Math.random() * 15 + 5) * peakMultiplier),
    downloads: Math.floor((Math.random() * 25 + 10) * peakMultiplier),
    messages: Math.floor((Math.random() * 50 + 30) * peakMultiplier),
    calls: Math.floor((Math.random() * 10 + 5) * peakMultiplier)
  };
}

private generateUserList(count: number = 20) {
  const statuses = ['Online', 'Away', 'Offline'];
  const users: any[] = [];

  for (let i = 1; i <= count; i++) {
    users.push({
      id: String(i).padStart(3, '0'),
      username: `User${i}`,
      calls: Math.floor(Math.random() * 1000) + 100,
      uploads: Math.floor(Math.random() * 500),
      status: statuses[Math.floor(Math.random() * statuses.length)]
    });
  }

  return users;
}

private generateTreeData() {
  return {
    name: 'BBS Structure',
    extended: true,
    children: {
      'Conferences': {
        extended: true,
        children: {
          'General': {
            children: {
              'Main Board': {},
              'Tech Support': {},
              'Off-Topic': {}
            }
          },
          'File Areas': {
            children: {
              'Uploads': {},
              'Downloads': {}
            }
          }
        }
      },
      'Doors': {
        extended: true,
        children: {
          'Games': {
            children: {
              'TradeWars': {},
              'LORD': {},
              'Tetris': {}
            }
          },
          'Utilities': {
            children: {
              'File Manager': {},
              'User Editor': {}
            }
          }
        }
      }
    }
  };
}
```

### 4. Error Handling

**Robust Error Handling:**
```typescript
private safeWidgetOperation(operation: () => void, widgetName: string) {
  try {
    operation();
  } catch (error) {
    this.showErrorDialog(`Error in ${widgetName}: ${error.message}`);
    console.error(`Widget error [${widgetName}]:`, error);
  }
}

private showErrorDialog(message: string) {
  const errorBox = blessed.message({
    parent: this.screen,
    top: 'center',
    left: 'center',
    width: '50%',
    height: 'shrink',
    border: {
      type: 'line'
    },
    style: {
      fg: 'white',
      bg: 'red',
      border: {
        fg: 'red'
      }
    }
  });

  errorBox.display(message, 0, () => {
    errorBox.destroy();
    this.screen.render();
  });
}
```

### 5. Navigation Bar Component

**Reusable Navigation:**
```typescript
private createNavigationBar(pageNum: number, totalPages: number) {
  const navBar = blessed.box({
    bottom: 0,
    left: 0,
    width: '100%',
    height: 2,
    content: this.getNavigationText(pageNum, totalPages),
    tags: true,
    border: {
      type: 'line'
    },
    style: {
      fg: 'white',
      bg: 'blue',
      border: {
        fg: 'cyan'
      }
    }
  });

  return navBar;
}

private getNavigationText(pageNum: number, totalPages: number): string {
  return ` {bold}←{/bold} PREV │ {bold}↑/↓{/bold} SCROLL │ {bold}→{/bold} NEXT │ {bold}M{/bold}:MENU │ {bold}H{/bold}:HELP │ {bold}Q{/bold}:QUIT │ Page ${pageNum + 1}/${totalPages}`;
}
```

---

## Package Configuration

**File: `/Doors/neoblessed-showcase/package.json`**
```json
{
  "name": "neoblessed-showcase",
  "version": "1.0.0",
  "description": "Ultimate Neo-Blessed & Blessed-Contrib Interactive Showcase",
  "main": "index.ts",
  "scripts": {
    "build": "tsc",
    "dev": "ts-node index.ts"
  },
  "dependencies": {
    "@amiexpress/bbs-door-sdk": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0"
  }
}
```

**File: `/Doors/neoblessed-showcase/tsconfig.json`**
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node"
  },
  "include": ["*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

**File: `/Doors/neoblessed-showcase/neoblessed-showcase.info`**
```
DESCRIPTION=Ultimate Neo-Blessed & Blessed-Contrib Interactive Showcase
COMMAND=neoblessed-showcase
RUNTIME=typescript
ACCESS=10
```

---

## Success Criteria

After exploring this showcase door, a developer should be able to:

1. ✓ **Identify all 49 widgets** (34 core + 15 contrib) and know when to use each
2. ✓ **Create interactive UIs** with mouse and keyboard support
3. ✓ **Build real-time dashboards** using Grid layout and live data
4. ✓ **Handle terminal constraints** (80×25) properly
5. ✓ **Implement best practices** for resource management and error handling
6. ✓ **Use charts and gauges** for data visualization
7. ✓ **Create navigation systems** with carousels and menus
8. ✓ **Understand event systems** (click, hover, focus, keypress)
9. ✓ **Apply styling and theming** (colors, borders, alignment)
10. ✓ **Build production-ready doors** with proper cleanup and error handling

---

## Implementation Notes

### Performance Optimization
- **Debounce rapid updates** (render at most 30fps)
- **Lazy load page content** (create on-demand)
- **Clean up resources** when switching pages
- **Use intervals sparingly** (max 5 concurrent)

### Accessibility
- **Keyboard navigation** for all features
- **Vi-mode support** where applicable
- **Screen reader friendly** labels
- **High contrast** color schemes

### Testing
- Test with different terminal sizes (user linesPerScreen)
- Test mouse enabled/disabled
- Test keyboard-only navigation
- Test with slow update intervals
- Test resource cleanup on quit

### Documentation
- Inline code comments
- Help system with examples
- Best practices page
- Error messages with solutions

---

## Deliverables

1. **Complete door implementation** in `/Doors/neoblessed-showcase/`
2. **All 10 pages** fully functional with real demonstrations
3. **Main menu** with page selection
4. **Help system** with context-sensitive documentation
5. **Real-time animations** for gauges, charts, sparklines
6. **Interactive elements** with mouse and keyboard
7. **Error handling** throughout
8. **Resource cleanup** on exit
9. **Package configuration** (package.json, tsconfig.json, .info file)
10. **README.md** with usage instructions

---

## Final Notes

This is not just a demo - this is the **definitive learning tool** for neo-blessed development. Every widget must be demonstrated with:
- Visual example
- Code snippet
- Interactive element
- Best practice note
- Common pitfall warning

Make it **beautiful**, **interactive**, **educational**, and **comprehensive**.

The door should make developers say: "Now I understand everything I can do with neo-blessed!"
