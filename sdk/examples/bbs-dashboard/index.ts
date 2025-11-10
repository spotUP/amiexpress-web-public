/**
 * BBS Dashboard Door
 * Comprehensive real-time dashboard for System Operators
 */

import { Door, GraphicsEngine, AnsiColor } from '@amiexpress/bbs-door-sdk';
import * as os from 'os';

interface BBSStats {
  totalUsers: number;
  activeUsers: number;
  totalMessages: number;
  totalFiles: number;
  totalCalls: number;
  systemUptime: number;
}

const door = new Door({
  name: 'BBS SysOp Dashboard',
  version: '1.0.0',
  author: 'AmiExpress SDK',
  description: 'Comprehensive real-time dashboard for System Operators'
});

const gfx = new GraphicsEngine({ width: 80, height: 24 });
let updateInterval: NodeJS.Timeout | null = null;

// Mock BBS statistics
const stats: BBSStats = {
  totalUsers: 1547,
  activeUsers: 4,
  totalMessages: 34521,
  totalFiles: 8934,
  totalCalls: 125673,
  systemUptime: 864000
};

door.onConnect((user: any) => {
  console.log(`User ${user.name} connected to BBS Dashboard`);

  // Show dashboard
  renderDashboard(user);

  // Start auto-update (every 3 seconds)
  updateInterval = setInterval(() => {
    // Update some stats randomly
    stats.activeUsers = Math.floor(Math.random() * 8) + 1;
    stats.totalMessages += Math.floor(Math.random() * 3);
    stats.totalFiles += Math.floor(Math.random() * 2);
    renderDashboard(user);
  }, 3000);
});

door.onInput((user: any, key: any) => {
  const keyPressed = key.key?.toUpperCase();

  if (keyPressed === 'Q' || key.name === 'escape') {
    if (updateInterval) {
      clearInterval(updateInterval);
      updateInterval = null;
    }

    gfx.clear(AnsiColor.Black);
    gfx.drawText(30, 10, 'Dashboard Closed', AnsiColor.BrightCyan);
    door.sendAnsi(gfx.render(), user.id);
    setTimeout(() => door.disconnect(user.id), 1000);
    return;
  }

  // Refresh on any other key
  renderDashboard(user);
});

door.onDisconnect((user: any) => {
  console.log(`User ${user.name} disconnected from BBS Dashboard`);
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
});

function renderDashboard(user: any) {
  gfx.clear(AnsiColor.Black);

  // Header
  gfx.drawBox({ x: 0, y: 0, width: 80, height: 24 }, 'single', AnsiColor.Cyan);
  gfx.drawText(25, 0, ' BBS SYSOP DASHBOARD ', AnsiColor.BrightCyan);

  // System Resources (Top Left)
  drawSystemResources(2, 2);

  // BBS Statistics (Top Right)
  drawBBSStatistics(42, 2);

  // Node Status (Middle)
  drawNodeStatus(2, 10);

  // Recent Activity (Bottom)
  drawRecentActivity(2, 17);

  // Footer
  const now = new Date().toLocaleTimeString();
  gfx.drawText(2, 22, `Last Update: ${now}`, AnsiColor.Green);
  gfx.drawText(55, 22, 'Q: Quit  Any Key: Refresh', AnsiColor.Yellow);

  door.sendAnsi(gfx.render(), user.id);
}

function drawSystemResources(x: number, y: number) {
  gfx.drawText(x, y, 'SYSTEM RESOURCES', AnsiColor.BrightYellow);
  gfx.drawText(x, y + 1, '─'.repeat(36), AnsiColor.Cyan);

  // CPU Usage
  const cpuUsage = getCPUUsage();
  gfx.drawText(x, y + 2, `CPU Usage:  ${cpuUsage}%`, AnsiColor.White);
  drawProgressBar(x, y + 3, 30, cpuUsage, AnsiColor.Cyan);

  // Memory Usage
  const memUsage = getMemoryUsage();
  gfx.drawText(x, y + 4, `Memory:     ${memUsage}%`, AnsiColor.White);
  drawProgressBar(x, y + 5, 30, memUsage, AnsiColor.Magenta);

  // Disk Usage (mock)
  const diskUsage = 67;
  gfx.drawText(x, y + 6, `Disk:       ${diskUsage}%`, AnsiColor.White);
  drawProgressBar(x, y + 7, 30, diskUsage, AnsiColor.Yellow);
}

function drawBBSStatistics(x: number, y: number) {
  gfx.drawText(x, y, 'BBS STATISTICS', AnsiColor.BrightYellow);
  gfx.drawText(x, y + 1, '─'.repeat(36), AnsiColor.Cyan);

  gfx.drawText(x, y + 2, `Total Users:    ${stats.totalUsers.toLocaleString()}`, AnsiColor.White);
  gfx.drawText(x, y + 3, `Active Now:     ${stats.activeUsers}`, AnsiColor.BrightGreen);
  gfx.drawText(x, y + 4, `Total Calls:    ${stats.totalCalls.toLocaleString()}`, AnsiColor.White);
  gfx.drawText(x, y + 5, `Messages:       ${stats.totalMessages.toLocaleString()}`, AnsiColor.White);
  gfx.drawText(x, y + 6, `Files:          ${stats.totalFiles.toLocaleString()}`, AnsiColor.White);
  gfx.drawText(x, y + 7, `Uptime:         ${formatUptime(stats.systemUptime)}`, AnsiColor.White);
}

function drawNodeStatus(x: number, y: number) {
  gfx.drawText(x, y, 'NODE STATUS', AnsiColor.BrightYellow);
  gfx.drawText(x, y + 1, '─'.repeat(76), AnsiColor.Cyan);

  // Table header
  gfx.drawText(x + 2, y + 2, 'Node', AnsiColor.BrightWhite);
  gfx.drawText(x + 10, y + 2, 'User', AnsiColor.BrightWhite);
  gfx.drawText(x + 30, y + 2, 'Status', AnsiColor.BrightWhite);
  gfx.drawText(x + 50, y + 2, 'Location', AnsiColor.BrightWhite);
  gfx.drawText(x, y + 3, '─'.repeat(76), AnsiColor.Cyan);

  // Mock node data
  const nodes = [
    { id: 1, user: 'CyberPunk', status: 'Active', location: 'Reading Mail', color: AnsiColor.Green },
    { id: 2, user: 'HackerOne', status: 'Active', location: 'Playing Door', color: AnsiColor.Green },
    { id: 3, user: '', status: 'Idle', location: 'Login Screen', color: AnsiColor.White },
    { id: 4, user: 'BBSMaster', status: 'Active', location: 'File Area', color: AnsiColor.Green }
  ];

  nodes.forEach((node, i) => {
    gfx.drawText(x + 2, y + 4 + i, `${node.id}`, node.color);
    gfx.drawText(x + 10, y + 4 + i, node.user || 'Waiting', node.color);
    gfx.drawText(x + 30, y + 4 + i, node.status, node.color);
    gfx.drawText(x + 50, y + 4 + i, node.location, node.color);
  });
}

function drawRecentActivity(x: number, y: number) {
  gfx.drawText(x, y, 'RECENT ACTIVITY', AnsiColor.BrightYellow);
  gfx.drawText(x, y + 1, '─'.repeat(76), AnsiColor.Cyan);

  const now = new Date();
  const time1 = new Date(now.getTime() - 60000).toLocaleTimeString();
  const time2 = new Date(now.getTime() - 120000).toLocaleTimeString();
  const time3 = new Date(now.getTime() - 180000).toLocaleTimeString();

  gfx.drawText(x, y + 2, `[${time1}] User CyberPunk logged in from node 1`, AnsiColor.Green);
  gfx.drawText(x, y + 3, `[${time2}] File download: COOL_DEMO.ZIP (2.3MB)`, AnsiColor.Green);
  gfx.drawText(x, y + 4, `[${time3}] Message posted in General conference`, AnsiColor.Green);
}

function drawProgressBar(x: number, y: number, width: number, percent: number, color: AnsiColor) {
  const filled = Math.floor((width * percent) / 100);
  const bar = '[' + '='.repeat(filled) + ' '.repeat(width - filled) + ']';
  gfx.drawText(x, y, bar, color);
}

function getCPUUsage(): number {
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;

  cpus.forEach(cpu => {
    for (const type in cpu.times) {
      totalTick += (cpu.times as any)[type];
    }
    totalIdle += cpu.times.idle;
  });

  const idle = totalIdle / cpus.length;
  const total = totalTick / cpus.length;
  const usage = 100 - ~~(100 * idle / total);

  return Math.max(0, Math.min(100, usage));
}

function getMemoryUsage(): number {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  return Math.floor((usedMem / totalMem) * 100);
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${mins}m`;
}

door.start();
console.log('BBS Dashboard door started!');
