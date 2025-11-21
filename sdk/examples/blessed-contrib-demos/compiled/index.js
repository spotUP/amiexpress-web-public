"use strict";
/**
 * blessed-contrib Demos Door
 * Showcases various blessed-contrib widgets for terminal dashboards
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDoor = runDoor;
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
const runDoorSession_1 = require("@amiexpress/bbs-door-sdk/tools/runDoorSession");
const door = new bbs_door_sdk_1.Door({
    name: 'blessed-contrib Demos',
    version: '1.0.0',
    author: 'AmiExpress SDK',
    description: 'Showcase blessed-contrib widgets for terminal dashboards'
});
const gfx = new bbs_door_sdk_1.GraphicsEngine({ width: 80, height: 24 });
let currentDemo = 0;
const totalDemos = 7;
door.onConnect((user) => {
    console.log(`User ${user.name} connected to blessed-contrib Demos`);
    // Show welcome screen
    showWelcome(user);
});
door.onInput((user, key) => {
    const keyPressed = key.key?.toUpperCase();
    if (keyPressed === 'Q' || key.name === 'escape') {
        gfx.clear(bbs_door_sdk_1.AnsiColor.Black);
        gfx.drawText(25, 10, 'Thanks for watching!', bbs_door_sdk_1.AnsiColor.BrightCyan);
        door.sendAnsi(gfx.render(), user.id);
        setTimeout(() => door.disconnect(user.id), 1000);
        return;
    }
    // Show next demo
    currentDemo = (currentDemo + 1) % totalDemos;
    showDemo(user, currentDemo);
});
door.onDisconnect((user) => {
    console.log(`User ${user.name} disconnected from blessed-contrib Demos`);
});
function showWelcome(user) {
    gfx.clear(bbs_door_sdk_1.AnsiColor.Black);
    gfx.drawBox({ x: 10, y: 5, width: 60, height: 12 }, 'single', bbs_door_sdk_1.AnsiColor.Cyan);
    gfx.drawText(15, 7, 'blessed-contrib Widget Demos', bbs_door_sdk_1.AnsiColor.BrightCyan);
    gfx.drawText(15, 9, 'This door showcases various dashboard widgets', bbs_door_sdk_1.AnsiColor.White);
    gfx.drawText(15, 10, 'for creating professional terminal UIs.', bbs_door_sdk_1.AnsiColor.White);
    gfx.drawText(15, 12, 'Widgets demonstrated:', bbs_door_sdk_1.AnsiColor.Yellow);
    gfx.drawText(17, 13, '* Line Charts  * Bar Charts', bbs_door_sdk_1.AnsiColor.Green);
    gfx.drawText(17, 14, '* Gauges       * Donuts', bbs_door_sdk_1.AnsiColor.Green);
    gfx.drawText(17, 15, '* Tables       * Sparklines', bbs_door_sdk_1.AnsiColor.Green);
    gfx.drawText(17, 16, '* Logs         * LCD Displays', bbs_door_sdk_1.AnsiColor.Green);
    gfx.drawText(15, 18, 'Press any key to start  |  Q to quit', bbs_door_sdk_1.AnsiColor.BrightYellow);
    door.sendAnsi(gfx.render(), user.id);
}
function showDemo(user, demoIndex) {
    gfx.clear(bbs_door_sdk_1.AnsiColor.Black);
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
    gfx.drawText(2, 1, `Demo ${demoIndex + 1}/${totalDemos}: ${demoNames[demoIndex]}`, bbs_door_sdk_1.AnsiColor.BrightCyan);
    gfx.drawText(2, 2, demoDescriptions[demoIndex], bbs_door_sdk_1.AnsiColor.White);
    gfx.drawText(2, 3, '─'.repeat(76), bbs_door_sdk_1.AnsiColor.Cyan);
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
    gfx.drawText(2, 22, 'Press any key for next demo  |  Q to quit', bbs_door_sdk_1.AnsiColor.BrightYellow);
    door.sendAnsi(gfx.render(), user.id);
}
function drawLineChartAscii(x, y) {
    gfx.drawText(x, y, '     User Activity (24h)', bbs_door_sdk_1.AnsiColor.Yellow);
    gfx.drawText(x, y + 1, ' 50+                *    *', bbs_door_sdk_1.AnsiColor.Cyan);
    gfx.drawText(x, y + 2, ' 40+            *       *', bbs_door_sdk_1.AnsiColor.Cyan);
    gfx.drawText(x, y + 3, ' 30+        *               *', bbs_door_sdk_1.AnsiColor.Cyan);
    gfx.drawText(x, y + 4, ' 20+    *                       *', bbs_door_sdk_1.AnsiColor.Cyan);
    gfx.drawText(x, y + 5, ' 10+*                               *', bbs_door_sdk_1.AnsiColor.Cyan);
    gfx.drawText(x, y + 6, '   +--------------------------------', bbs_door_sdk_1.AnsiColor.White);
    gfx.drawText(x, y + 7, '    0  4  8  12 16 20 24 (hours)', bbs_door_sdk_1.AnsiColor.White);
    gfx.drawText(x, y + 9, '    Legend:', bbs_door_sdk_1.AnsiColor.Green);
    gfx.drawText(x, y + 10, '    * = Logins', bbs_door_sdk_1.AnsiColor.Cyan);
}
function drawBarChartAscii(x, y) {
    gfx.drawText(x, y, '  File Downloads by Category', bbs_door_sdk_1.AnsiColor.Yellow);
    gfx.drawText(x, y + 2, '  50+', bbs_door_sdk_1.AnsiColor.White);
    gfx.drawText(x, y + 3, '  40+    ██', bbs_door_sdk_1.AnsiColor.White);
    gfx.drawText(x, y + 4, '  30+    ██  ██      ██', bbs_door_sdk_1.AnsiColor.White);
    gfx.drawText(x, y + 5, '  20+    ██  ██  ██  ██  ██', bbs_door_sdk_1.AnsiColor.White);
    gfx.drawText(x, y + 6, '  10+    ██  ██  ██  ██  ██', bbs_door_sdk_1.AnsiColor.White);
    gfx.drawText(x, y + 7, '   0+----██--██--██--██--██----', bbs_door_sdk_1.AnsiColor.White);
    gfx.drawText(x, y + 8, '       Game Util Doc Music Art', bbs_door_sdk_1.AnsiColor.Green);
}
function drawGaugeAscii(x, y) {
    gfx.drawText(x, y, '      CPU Usage', bbs_door_sdk_1.AnsiColor.Yellow);
    gfx.drawText(x, y + 1, '     ___________', bbs_door_sdk_1.AnsiColor.Cyan);
    gfx.drawText(x, y + 2, '    /           \\', bbs_door_sdk_1.AnsiColor.Cyan);
    gfx.drawText(x, y + 3, '   |     73%     |', bbs_door_sdk_1.AnsiColor.BrightWhite);
    gfx.drawText(x, y + 4, '   |   ========  |', bbs_door_sdk_1.AnsiColor.Green);
    gfx.drawText(x, y + 5, '    \\_________/', bbs_door_sdk_1.AnsiColor.Cyan);
    gfx.drawText(x + 25, y, '   Active Nodes', bbs_door_sdk_1.AnsiColor.Yellow);
    gfx.drawText(x + 25, y + 1, '   ___  ___', bbs_door_sdk_1.AnsiColor.Green);
    gfx.drawText(x + 25, y + 2, '  |   ||   |', bbs_door_sdk_1.AnsiColor.Green);
    gfx.drawText(x + 25, y + 3, '  | 0 || 4 |', bbs_door_sdk_1.AnsiColor.BrightGreen);
    gfx.drawText(x + 25, y + 4, '  |___||___|', bbs_door_sdk_1.AnsiColor.Green);
}
function drawDonutAscii(x, y) {
    gfx.drawText(x, y, '   User Level Distribution', bbs_door_sdk_1.AnsiColor.Yellow);
    gfx.drawText(x, y + 2, '          ***', bbs_door_sdk_1.AnsiColor.Cyan);
    gfx.drawText(x, y + 3, '       ***   ***', bbs_door_sdk_1.AnsiColor.Magenta);
    gfx.drawText(x, y + 4, '      *    O    *', bbs_door_sdk_1.AnsiColor.Green);
    gfx.drawText(x, y + 5, '       ***   ***', bbs_door_sdk_1.AnsiColor.Yellow);
    gfx.drawText(x, y + 6, '          ***', bbs_door_sdk_1.AnsiColor.Red);
    gfx.drawText(x, y + 8, '   SysOp(15%)  Co-SysOp(10%)', bbs_door_sdk_1.AnsiColor.White);
    gfx.drawText(x, y + 9, '   Elite(25%)  Regular(30%)', bbs_door_sdk_1.AnsiColor.White);
    gfx.drawText(x, y + 10, '   Newbie(20%)', bbs_door_sdk_1.AnsiColor.White);
}
function drawTableAscii(x, y) {
    gfx.drawText(x, y, '   Top Users (This Week)', bbs_door_sdk_1.AnsiColor.Yellow);
    gfx.drawText(x, y + 1, '+------------------+-------+-------+-------+', bbs_door_sdk_1.AnsiColor.Cyan);
    gfx.drawText(x, y + 2, '| Username         | Login | Msgs  | Files |', bbs_door_sdk_1.AnsiColor.White);
    gfx.drawText(x, y + 3, '+------------------+-------+-------+-------+', bbs_door_sdk_1.AnsiColor.Cyan);
    gfx.drawText(x, y + 4, '| CyberPunk        |  127  |  453  |  89   |', bbs_door_sdk_1.AnsiColor.Green);
    gfx.drawText(x, y + 5, '| HackerOne        |   98  |  342  |  67   |', bbs_door_sdk_1.AnsiColor.Green);
    gfx.drawText(x, y + 6, '| BBSMaster        |   85  |  298  |  54   |', bbs_door_sdk_1.AnsiColor.Green);
    gfx.drawText(x, y + 7, '| RetroGamer       |   72  |  234  |  43   |', bbs_door_sdk_1.AnsiColor.Green);
    gfx.drawText(x, y + 8, '| AsciiArtist      |   64  |  189  |  38   |', bbs_door_sdk_1.AnsiColor.Green);
    gfx.drawText(x, y + 9, '+------------------+-------+-------+-------+', bbs_door_sdk_1.AnsiColor.Cyan);
}
function drawSparklineAscii(x, y) {
    gfx.drawText(x, y, '   Node Activity Monitor', bbs_door_sdk_1.AnsiColor.Yellow);
    gfx.drawText(x, y + 2, '   Node 1: ▁▂▃▄▅▆▇█▇▆▅▄▃▂▁▁▂▃▄▅', bbs_door_sdk_1.AnsiColor.Cyan);
    gfx.drawText(x, y + 3, '   Node 2: ▃▄▅▄▃▂▁▂▃▄▅▆▇█▇▆▅▄▃▂', bbs_door_sdk_1.AnsiColor.Magenta);
    gfx.drawText(x, y + 4, '   Node 3: ▅▆▇█▇▆▅▄▃▂▁▁▂▃▄▅▆▇▆▅', bbs_door_sdk_1.AnsiColor.Yellow);
    gfx.drawText(x, y + 5, '   Node 4: ▂▃▄▃▂▁▂▃▄▅▆▇█▇▆▅▄▃▂▁', bbs_door_sdk_1.AnsiColor.Green);
    gfx.drawText(x, y + 7, '   Network: ▄▅▆▅▄▃▄▅▆▇█▇▆▅▄▃▄▅▆▅', bbs_door_sdk_1.AnsiColor.Red);
    gfx.drawText(x, y + 8, '   Disk I/O: ▂▂▃▂▂▁▁▂▃▃▄▃▃▂▂▁▂▂▃▂', bbs_door_sdk_1.AnsiColor.Blue);
}
function drawLogAscii(x, y) {
    gfx.drawText(x, y, '   System Log (Real-time)', bbs_door_sdk_1.AnsiColor.Yellow);
    gfx.drawText(x, y + 1, '+' + '─'.repeat(58) + '+', bbs_door_sdk_1.AnsiColor.Cyan);
    gfx.drawText(x, y + 2, '| [10:23:45] User CyberPunk logged in from node 1        |', bbs_door_sdk_1.AnsiColor.Green);
    gfx.drawText(x, y + 3, '| [10:24:12] File downloaded: COOL_DEMO.ZIP (2.3MB)      |', bbs_door_sdk_1.AnsiColor.Green);
    gfx.drawText(x, y + 4, '| [10:25:33] Message posted in General area              |', bbs_door_sdk_1.AnsiColor.Green);
    gfx.drawText(x, y + 5, '| [10:26:01] User HackerOne logged in from node 2        |', bbs_door_sdk_1.AnsiColor.Green);
    gfx.drawText(x, y + 6, '| [10:27:15] Door game started: TradeWars 2002           |', bbs_door_sdk_1.AnsiColor.Green);
    gfx.drawText(x, y + 7, '| [10:28:42] User BBSMaster logged out                   |', bbs_door_sdk_1.AnsiColor.Green);
    gfx.drawText(x, y + 8, '| [10:29:18] New file uploaded: AWESOME.MOD              |', bbs_door_sdk_1.AnsiColor.Green);
    gfx.drawText(x, y + 9, '| [10:30:05] System backup completed                     |', bbs_door_sdk_1.AnsiColor.Green);
    gfx.drawText(x, y + 10, '+' + '─'.repeat(58) + '+', bbs_door_sdk_1.AnsiColor.Cyan);
}
async function runDoor(doorSession) {
    // @ts-ignore
    await runDoorSession_1.runDoorWithSession(door, doorSession);
}
// @ts-nocheck
/// <reference path="./types.d.ts" />
