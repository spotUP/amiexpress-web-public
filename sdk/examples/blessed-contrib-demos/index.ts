/**
 * blessed-contrib Demos Door
 * Showcases various blessed-contrib widgets for terminal dashboards
 */

import { Door, GraphicsEngine, AnsiColor } from '@amiexpress/bbs-door-sdk';
import { runDoorWithSession } from '../../tools/runDoorSession';
// @ts-ignore - neo-blessed doesn't have complete type definitions
import * as blessed from 'neo-blessed';
// @ts-ignore - blessed-contrib doesn't have type definitions
import * as contrib from 'blessed-contrib';

const door = new Door({
  name: 'blessed-contrib Demos',
  version: '1.0.0',
  author: 'AmiExpress SDK',
  description: 'Showcase blessed-contrib widgets for terminal dashboards'
});

const gfx = new GraphicsEngine({ width: 80, height: 24 });
let currentDemo = 0;
const totalDemos = 7;

door.onConnect((user: any) => {
  console.log(`User ${user.name} connected to blessed-contrib Demos`);

  // Show welcome screen
  showWelcome(user);
});

door.onInput((user: any, key: any) => {
  const keyPressed = key.key?.toUpperCase();

  if (keyPressed === 'Q' || key.name === 'escape') {
    gfx.clear(AnsiColor.Black);
    gfx.drawText(25, 10, 'Thanks for watching!', AnsiColor.BrightCyan);
    door.sendAnsi(gfx.render(), user.id);
    setTimeout(() => door.disconnect(user.id), 1000);
    return;
  }

  // Show next demo
  currentDemo = (currentDemo + 1) % totalDemos;
  showDemo(user, currentDemo);
});

door.onDisconnect((user: any) => {
  console.log(`User ${user.name} disconnected from blessed-contrib Demos`);
});

function showWelcome(user: any) {
  gfx.clear(AnsiColor.Black);
  gfx.drawBox({ x: 10, y: 5, width: 60, height: 12 }, 'single', AnsiColor.Cyan);
  gfx.drawText(15, 7, 'blessed-contrib Widget Demos', AnsiColor.BrightCyan);
  gfx.drawText(15, 9, 'This door showcases various dashboard widgets', AnsiColor.White);
  gfx.drawText(15, 10, 'for creating professional terminal UIs.', AnsiColor.White);
  gfx.drawText(15, 12, 'Widgets demonstrated:', AnsiColor.Yellow);
  gfx.drawText(17, 13, '* Line Charts  * Bar Charts', AnsiColor.Green);
  gfx.drawText(17, 14, '* Gauges       * Donuts', AnsiColor.Green);
  gfx.drawText(17, 15, '* Tables       * Sparklines', AnsiColor.Green);
  gfx.drawText(17, 16, '* Logs         * LCD Displays', AnsiColor.Green);
  gfx.drawText(15, 18, 'Press any key to start  |  Q to quit', AnsiColor.BrightYellow);
  door.sendAnsi(gfx.render(), user.id);
}

function showDemo(user: any, demoIndex: number) {
  gfx.clear(AnsiColor.Black);

  const demoNames = [
    'Line Chart Demo',
    'Bar Chart Demo',
    'Gauge Demo',
    'Donut Chart Demo',
    'Table Demo',
    'Sparkline Demo',
    'Log Demo'
  ];

  const demoDescriptions = [
    'Multi-series line charts with legends',
    'Vertical bar charts for category data',
    'Progress gauges and LCD displays',
    'Circular percentage charts',
    'Data grids with headers',
    'Compact inline trend graphs',
    'Real-time scrolling logs'
  ];

  // Header
  gfx.drawText(2, 1, `Demo ${demoIndex + 1}/${totalDemos}: ${demoNames[demoIndex]}`, AnsiColor.BrightCyan);
  gfx.drawText(2, 2, demoDescriptions[demoIndex], AnsiColor.White);
  gfx.drawText(2, 3, '─'.repeat(76), AnsiColor.Cyan);

  // Demo visualization (ASCII art representation)
  const y = 5;

  switch (demoIndex) {
    case 0: // Line Chart
      drawLineChartAscii(10, y);
      break;
    case 1: // Bar Chart
      drawBarChartAscii(15, y);
      break;
    case 2: // Gauges
      drawGaugeAscii(15, y);
      break;
    case 3: // Donut
      drawDonutAscii(20, y);
      break;
    case 4: // Table
      drawTableAscii(10, y);
      break;
    case 5: // Sparklines
      drawSparklineAscii(10, y);
      break;
    case 6: // Log
      drawLogAscii(10, y);
      break;
  }

  // Footer
  gfx.drawText(2, 22, 'Press any key for next demo  |  Q to quit', AnsiColor.BrightYellow);
  door.sendAnsi(gfx.render(), user.id);
}

function drawLineChartAscii(x: number, y: number) {
  gfx.drawText(x, y, '     User Activity (24h)', AnsiColor.Yellow);
  gfx.drawText(x, y + 1, ' 50+                *    *', AnsiColor.Cyan);
  gfx.drawText(x, y + 2, ' 40+            *       *', AnsiColor.Cyan);
  gfx.drawText(x, y + 3, ' 30+        *               *', AnsiColor.Cyan);
  gfx.drawText(x, y + 4, ' 20+    *                       *', AnsiColor.Cyan);
  gfx.drawText(x, y + 5, ' 10+*                               *', AnsiColor.Cyan);
  gfx.drawText(x, y + 6, '   +--------------------------------', AnsiColor.White);
  gfx.drawText(x, y + 7, '    0  4  8  12 16 20 24 (hours)', AnsiColor.White);
  gfx.drawText(x, y + 9, '    Legend:', AnsiColor.Green);
  gfx.drawText(x, y + 10, '    * = Logins', AnsiColor.Cyan);
}

function drawBarChartAscii(x: number, y: number) {
  gfx.drawText(x, y, '  File Downloads by Category', AnsiColor.Yellow);
  gfx.drawText(x, y + 2, '  50+', AnsiColor.White);
  gfx.drawText(x, y + 3, '  40+    ██', AnsiColor.White);
  gfx.drawText(x, y + 4, '  30+    ██  ██      ██', AnsiColor.White);
  gfx.drawText(x, y + 5, '  20+    ██  ██  ██  ██  ██', AnsiColor.White);
  gfx.drawText(x, y + 6, '  10+    ██  ██  ██  ██  ██', AnsiColor.White);
  gfx.drawText(x, y + 7, '   0+----██--██--██--██--██----', AnsiColor.White);
  gfx.drawText(x, y + 8, '       Game Util Doc Music Art', AnsiColor.Green);
}

function drawGaugeAscii(x: number, y: number) {
  gfx.drawText(x, y, '      CPU Usage', AnsiColor.Yellow);
  gfx.drawText(x, y + 1, '     ___________', AnsiColor.Cyan);
  gfx.drawText(x, y + 2, '    /           \\', AnsiColor.Cyan);
  gfx.drawText(x, y + 3, '   |     73%     |', AnsiColor.BrightWhite);
  gfx.drawText(x, y + 4, '   |   ========  |', AnsiColor.Green);
  gfx.drawText(x, y + 5, '    \\_________/', AnsiColor.Cyan);

  gfx.drawText(x + 25, y, '   Active Nodes', AnsiColor.Yellow);
  gfx.drawText(x + 25, y + 1, '   ___  ___', AnsiColor.Green);
  gfx.drawText(x + 25, y + 2, '  |   ||   |', AnsiColor.Green);
  gfx.drawText(x + 25, y + 3, '  | 0 || 4 |', AnsiColor.BrightGreen);
  gfx.drawText(x + 25, y + 4, '  |___||___|', AnsiColor.Green);
}

function drawDonutAscii(x: number, y: number) {
  gfx.drawText(x, y, '   User Level Distribution', AnsiColor.Yellow);
  gfx.drawText(x, y + 2, '          ***', AnsiColor.Cyan);
  gfx.drawText(x, y + 3, '       ***   ***', AnsiColor.Magenta);
  gfx.drawText(x, y + 4, '      *    O    *', AnsiColor.Green);
  gfx.drawText(x, y + 5, '       ***   ***', AnsiColor.Yellow);
  gfx.drawText(x, y + 6, '          ***', AnsiColor.Red);
  gfx.drawText(x, y + 8, '   SysOp(15%)  Co-SysOp(10%)', AnsiColor.White);
  gfx.drawText(x, y + 9, '   Elite(25%)  Regular(30%)', AnsiColor.White);
  gfx.drawText(x, y + 10, '   Newbie(20%)', AnsiColor.White);
}

function drawTableAscii(x: number, y: number) {
  gfx.drawText(x, y, '   Top Users (This Week)', AnsiColor.Yellow);
  gfx.drawText(x, y + 1, '+------------------+-------+-------+-------+', AnsiColor.Cyan);
  gfx.drawText(x, y + 2, '| Username         | Login | Msgs  | Files |', AnsiColor.White);
  gfx.drawText(x, y + 3, '+------------------+-------+-------+-------+', AnsiColor.Cyan);
  gfx.drawText(x, y + 4, '| CyberPunk        |  127  |  453  |  89   |', AnsiColor.Green);
  gfx.drawText(x, y + 5, '| HackerOne        |   98  |  342  |  67   |', AnsiColor.Green);
  gfx.drawText(x, y + 6, '| BBSMaster        |   85  |  298  |  54   |', AnsiColor.Green);
  gfx.drawText(x, y + 7, '| RetroGamer       |   72  |  234  |  43   |', AnsiColor.Green);
  gfx.drawText(x, y + 8, '| AsciiArtist      |   64  |  189  |  38   |', AnsiColor.Green);
  gfx.drawText(x, y + 9, '+------------------+-------+-------+-------+', AnsiColor.Cyan);
}

function drawSparklineAscii(x: number, y: number) {
  gfx.drawText(x, y, '   Node Activity Monitor', AnsiColor.Yellow);
  gfx.drawText(x, y + 2, '   Node 1: ▁▂▃▄▅▆▇█▇▆▅▄▃▂▁▁▂▃▄▅', AnsiColor.Cyan);
  gfx.drawText(x, y + 3, '   Node 2: ▃▄▅▄▃▂▁▂▃▄▅▆▇█▇▆▅▄▃▂', AnsiColor.Magenta);
  gfx.drawText(x, y + 4, '   Node 3: ▅▆▇█▇▆▅▄▃▂▁▁▂▃▄▅▆▇▆▅', AnsiColor.Yellow);
  gfx.drawText(x, y + 5, '   Node 4: ▂▃▄▃▂▁▂▃▄▅▆▇█▇▆▅▄▃▂▁', AnsiColor.Green);
  gfx.drawText(x, y + 7, '   Network: ▄▅▆▅▄▃▄▅▆▇█▇▆▅▄▃▄▅▆▅', AnsiColor.Red);
  gfx.drawText(x, y + 8, '   Disk I/O: ▂▂▃▂▂▁▁▂▃▃▄▃▃▂▂▁▂▂▃▂', AnsiColor.Blue);
}

function drawLogAscii(x: number, y: number) {
  gfx.drawText(x, y, '   System Log (Real-time)', AnsiColor.Yellow);
  gfx.drawText(x, y + 1, '+' + '─'.repeat(58) + '+', AnsiColor.Cyan);
  gfx.drawText(x, y + 2, '| [10:23:45] User CyberPunk logged in from node 1        |', AnsiColor.Green);
  gfx.drawText(x, y + 3, '| [10:24:12] File downloaded: COOL_DEMO.ZIP (2.3MB)      |', AnsiColor.Green);
  gfx.drawText(x, y + 4, '| [10:25:33] Message posted in General area              |', AnsiColor.Green);
  gfx.drawText(x, y + 5, '| [10:26:01] User HackerOne logged in from node 2        |', AnsiColor.Green);
  gfx.drawText(x, y + 6, '| [10:27:15] Door game started: TradeWars 2002           |', AnsiColor.Green);
  gfx.drawText(x, y + 7, '| [10:28:42] User BBSMaster logged out                   |', AnsiColor.Green);
  gfx.drawText(x, y + 8, '| [10:29:18] New file uploaded: AWESOME.MOD              |', AnsiColor.Green);
  gfx.drawText(x, y + 9, '| [10:30:05] System backup completed                     |', AnsiColor.Green);
  gfx.drawText(x, y + 10, '+' + '─'.repeat(58) + '+', AnsiColor.Cyan);
}

export async function runDoor(doorSession: any): Promise<void> {
  await runDoorWithSession(door, doorSession);
}
