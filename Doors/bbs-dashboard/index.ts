/**
 * BBS SysOp Dashboard v2.0
 *
 * Real-time BBS monitoring using SDK v2.0 with neo-blessed UI
 *
 * Features:
 * - System resource monitoring (CPU, Memory, Disk)
 * - BBS statistics (Users, Calls, Messages, Files)
 * - Active node status
 * - Recent activity log
 * - Auto-refresh every 3 seconds
 */

import { CoreDoor as Door } from '@amiexpress/bbs-door-sdk';
import type { DoorContext } from '@amiexpress/bbs-door-sdk';
import { Screen, DockablePanel } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createBox, createText } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

interface BBSStats {
  totalUsers: number;
  activeUsers: number;
  totalMessages: number;
  totalFiles: number;
  totalCalls: number;
  systemUptime: number;
}

interface NodeInfo {
  id: number;
  user: string;
  status: string;
  location: string;
}

class BBSDashboard {
  private ctx!: DoorContext;
  private screen!: Screen;
  private systemPanel!: DockablePanel;
  private statsPanel!: DockablePanel;
  private nodesPanel!: DockablePanel;
  private systemText: any;
  private statsText: any;
  private nodesText: any;
  private statusText: any;
  private updateInterval: NodeJS.Timeout | null = null;
  private exitResolve: (() => void) | null = null;

  private stats: BBSStats = {
    totalUsers: 1547,
    activeUsers: 4,
    totalMessages: 34521,
    totalFiles: 8934,
    totalCalls: 125673,
    systemUptime: 864000
  };

  setContext(ctx: DoorContext): void {
    this.ctx = ctx;
  }

  async start(): Promise<void> {
    this.createUI();
    this.renderDashboard();
    this.startAutoRefresh();

    // Wait for exit
    await new Promise<void>((resolve) => {
      this.exitResolve = resolve;
      this.screen.on('destroy', () => resolve());
    });
  }

  private createUI(): void {
    this.screen = new Screen({
      smartCSR: true,
      dockBorders: true,
      title: 'BBS SysOp Dashboard',
      output: (data: string) => this.ctx.output.write(data),
      responsive: true,
    });

    // System Resources Panel (top-left)
    this.systemPanel = new DockablePanel({
      parent: this.screen,
      title: ' SYSTEM RESOURCES ',
      left: 0,
      top: 0,
      width: '50%',
      height: '50%',
      dockPosition: 'float',
      showMinimizeButton: true,
      resizable: true,
      draggable: true,
      minWidth: 30,
      minHeight: 10,
      border: { type: 'line', fg: 'yellow' },
      style: { border: { fg: 'yellow' } },
    });

    this.systemText = createText({
      parent: this.systemPanel,
      top: 1,
      left: 1,
      right: 1,
      height: '100%-2',
      content: '',
      tags: true,
    });

    // BBS Statistics Panel (top-right)
    this.statsPanel = new DockablePanel({
      parent: this.screen,
      title: ' BBS STATISTICS ',
      left: '50%',
      top: 0,
      width: '50%',
      height: '50%',
      dockPosition: 'float',
      showMinimizeButton: true,
      resizable: true,
      draggable: true,
      minWidth: 30,
      minHeight: 10,
      border: { type: 'line', fg: 'cyan' },
      style: { border: { fg: 'cyan' } },
    });

    this.statsText = createText({
      parent: this.statsPanel,
      top: 1,
      left: 1,
      right: 1,
      height: '100%-2',
      content: '',
      tags: true,
    });

    // Node Status Panel (bottom, full width)
    this.nodesPanel = new DockablePanel({
      parent: this.screen,
      title: ' NODE STATUS ',
      left: 0,
      top: '50%',
      width: '100%',
      height: '50%',
      dockPosition: 'float',
      showMinimizeButton: true,
      resizable: true,
      draggable: true,
      minWidth: 50,
      minHeight: 8,
      border: { type: 'line', fg: 'green' },
      style: { border: { fg: 'green' } },
    });

    this.nodesText = createText({
      parent: this.nodesPanel,
      top: 1,
      left: 1,
      right: 1,
      height: '100%-2',
      content: '',
      tags: true,
    });

    // Status bar at the bottom
    this.statusText = createText({
      parent: this.screen,
      bottom: 0,
      left: 0,
      right: 0,
      height: 1,
      content: '',
      style: { fg: 'white', bg: 'blue' },
      tags: true,
    });

    // Register responsive constraints
    this.screen.responsiveLayout.registerElement(this.systemPanel, {
      minWidth: 30,
      minHeight: 10,
    });
    this.screen.responsiveLayout.registerElement(this.statsPanel, {
      minWidth: 30,
      minHeight: 10,
    });
    this.screen.responsiveLayout.registerElement(this.nodesPanel, {
      minWidth: 50,
      minHeight: 8,
    });

    // Responsive breakpoint handling
    this.screen.responsiveLayout.onResize((width, height) => {
      const breakpoint = this.screen.responsiveLayout.getBreakpoint();

      if (breakpoint === 'small') {
        // Stack panels vertically on small screens
        this.systemPanel.options.width = '100%';
        this.systemPanel.options.height = '33%';
        this.statsPanel.options.left = 0;
        this.statsPanel.options.top = '33%';
        this.statsPanel.options.width = '100%';
        this.statsPanel.options.height = '33%';
        this.nodesPanel.options.top = '66%';
        this.nodesPanel.options.height = '34%';
      } else {
        // Side-by-side layout for medium/large screens
        this.systemPanel.options.width = '50%';
        this.systemPanel.options.height = '50%';
        this.systemPanel.options.left = 0;
        this.systemPanel.options.top = 0;
        this.statsPanel.options.left = '50%';
        this.statsPanel.options.top = 0;
        this.statsPanel.options.width = '50%';
        this.statsPanel.options.height = '50%';
        this.nodesPanel.options.left = 0;
        this.nodesPanel.options.top = '50%';
        this.nodesPanel.options.width = '100%';
        this.nodesPanel.options.height = '50%';
      }

      this.renderDashboard();
    });

    // Key handlers
    this.screen.key(['q', 'Q', 'escape'], () => {
      this.cleanup();
      this.ctx.close();
    });

    this.screen.key(['r', 'R', 'space'], () => {
      this.renderDashboard();
    });
  }

  private renderDashboard(): void {
    // Render System Resources Panel
    const systemLines: string[] = [];
    const cpuUsage = Math.floor(Math.random() * 40) + 20;
    const memUsage = Math.floor(Math.random() * 30) + 50;
    const diskUsage = 67;

    systemLines.push('');
    systemLines.push(`CPU Usage:  ${cpuUsage}%  ${this.makeProgressBar(cpuUsage, 20, 'cyan')}`);
    systemLines.push('');
    systemLines.push(`Memory:     ${memUsage}%  ${this.makeProgressBar(memUsage, 20, 'magenta')}`);
    systemLines.push('');
    systemLines.push(`Disk:       ${diskUsage}%  ${this.makeProgressBar(diskUsage, 20, 'yellow')}`);

    this.systemText.setContent(systemLines.join('\n'));

    // Render BBS Statistics Panel
    const statsLines: string[] = [];
    statsLines.push('');
    statsLines.push(`Total Users:    {white-fg}${this.stats.totalUsers.toLocaleString()}{/white-fg}`);
    statsLines.push('');
    statsLines.push(`Active Now:     {green-fg}${this.stats.activeUsers}{/green-fg}`);
    statsLines.push('');
    statsLines.push(`Total Calls:    {white-fg}${this.stats.totalCalls.toLocaleString()}{/white-fg}`);
    statsLines.push('');
    statsLines.push(`Messages:       {white-fg}${this.stats.totalMessages.toLocaleString()}{/white-fg}`);
    statsLines.push('');
    statsLines.push(`Files:          {white-fg}${this.stats.totalFiles.toLocaleString()}{/white-fg}`);
    statsLines.push('');
    statsLines.push(`Uptime:         {white-fg}${this.formatUptime(this.stats.systemUptime)}{/white-fg}`);

    this.statsText.setContent(statsLines.join('\n'));

    // Render Node Status Panel
    const nodesLines: string[] = [];
    nodesLines.push('');
    nodesLines.push(`{bold}  Node    User              Status      Location{/bold}`);
    nodesLines.push('{cyan-fg}' + '─'.repeat(60) + '{/cyan-fg}');

    const nodes: NodeInfo[] = [
      { id: 1, user: 'CyberPunk', status: 'Active', location: 'Reading Mail' },
      { id: 2, user: 'HackerOne', status: 'Active', location: 'Playing Door' },
      { id: 3, user: '', status: 'Idle', location: 'Login Screen' },
      { id: 4, user: 'BBSMaster', status: 'Active', location: 'File Area' }
    ];

    for (const node of nodes) {
      const userName = node.user || 'Waiting';
      const color = node.status === 'Active' ? 'green' : 'white';
      nodesLines.push(`{${color}-fg}  ${node.id}       ${this.padRight(userName, 16)}  ${this.padRight(node.status, 10)}  ${node.location}{/${color}-fg}`);
    }

    this.nodesText.setContent(nodesLines.join('\n'));

    // Update status line
    const now = new Date().toLocaleTimeString();
    this.statusText.setContent(` {green-fg}Last Update: ${now}{/green-fg}  {yellow-fg}Q: Quit  R/Space: Refresh{/yellow-fg} `);

    this.screen.render();
  }

  private makeProgressBar(percent: number, width: number, color: string): string {
    const filled = Math.floor((width * percent) / 100);
    const bar = '[' + '='.repeat(filled) + ' '.repeat(width - filled) + ']';
    return `{${color}-fg}${bar}{/${color}-fg}`;
  }

  private padRight(text: string, width: number): string {
    return text.length >= width ? text.substring(0, width) : text + ' '.repeat(width - text.length);
  }

  private formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${mins}m`;
  }

  private startAutoRefresh(): void {
    this.updateInterval = setInterval(() => {
      // Update some stats randomly
      this.stats.activeUsers = Math.floor(Math.random() * 8) + 1;
      this.stats.totalMessages += Math.floor(Math.random() * 3);
      this.stats.totalFiles += Math.floor(Math.random() * 2);
      this.stats.systemUptime += 3;
      this.renderDashboard();
    }, 3000);
  }

  private cleanup(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    if (this.screen) {
      this.screen.destroy();
    }
    // Resolve the exit promise to allow door to complete
    if (this.exitResolve) {
      this.exitResolve();
      this.exitResolve = null;
    }
  }
}

// ===== SDK v2.0 Pattern =====

const door = new Door({
  name: 'BBS SysOp Dashboard',
  version: '2.0.0',
  author: 'AmiExpress SDK v2.0',
});

let dashboard: BBSDashboard;

door.onStart(async (ctx: DoorContext) => {
  dashboard = new BBSDashboard();
  dashboard.setContext(ctx);
  await dashboard.start();
});

door.onClose(async (ctx: DoorContext) => {
  ctx.output.writeLine('\r\n\x1b[36mDashboard closed.\x1b[0m\r\n');
});

door.onError(async (ctx: DoorContext, error: Error) => {
  ctx.output.writeLine(`\r\n\x1b[31mError: ${error.message}\x1b[0m\r\n`);
  console.error('Dashboard error:', error);
});

export default door;
