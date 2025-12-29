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
  private systemText: any;  // TODO: Type as Box when SDK types are exported
  private statsText: any;
  private nodesText: any;
  private statusText: any;
  private updateInterval: NodeJS.Timeout | null = null;
  private exitResolve: (() => void) | null = null;
  private resizeHandler: ((width: number, height: number) => void) | null = null;
  private hasExited = false;

  private stats: BBSStats = {
    totalUsers: 0,
    activeUsers: 0,
    totalMessages: 0,
    totalFiles: 0,
    totalCalls: 0,
    systemUptime: 0
  };

  setContext(ctx: DoorContext): void {
    this.ctx = ctx;
  }

  async start(): Promise<void> {
    this.createUI();

    // Fetch initial data
    await this.fetchBBSStats();

    await this.renderDashboard();
    this.startAutoRefresh();

    // Wait for exit
    await new Promise<void>((resolve) => {
      const resolver = () => {
        if (!this.hasExited) {
          this.hasExited = true;
          resolve();
        }
      };
      this.exitResolve = resolver;
      this.screen.once('destroy', resolver);
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
    this.resizeHandler = (width, height) => {
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

      if (this.screen && !this.screen.destroyed) {
        // Don't await here to avoid blocking resize handler
        this.renderDashboard().catch(() => {
          // Silently handle render errors during resize
        });
      }
    };
    this.screen.responsiveLayout.onResize(this.resizeHandler);

    // Key handlers
    this.screen.key(['q', 'Q', 'escape'], () => {
      this.cleanup();
    });

    this.screen.key(['r', 'R', 'space'], async () => {
      await this.renderDashboard();
    });
  }

  private async renderDashboard(): Promise<void> {
    // Guard against rendering to destroyed screen
    if (!this.screen || this.screen.destroyed) {
      return;
    }

    // Fetch system stats
    const sysStats = await this.fetchSystemStats();

    // Render System Resources Panel
    const systemLines: string[] = [];
    const cpuUsage = sysStats.cpu;
    const memUsage = sysStats.memory;
    const diskUsage = sysStats.disk;

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

    // Fetch real node status
    const nodes = await this.fetchNodeStatus();

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
    if (width <= 0) return text;
    return text.length >= width
      ? text.substring(0, width)
      : text + ' '.repeat(Math.max(0, width - text.length));
  }

  private formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${mins}m`;
  }

  /**
   * Fetch real BBS statistics from the system
   */
  private async fetchBBSStats(): Promise<void> {
    try {
      // Attempt to get real stats from BBS API
      const bbsApi = this.ctx.bbs as any;
      if (bbsApi && typeof bbsApi.getStats === 'function') {
        const stats = await bbsApi.getStats();
        if (stats) {
          this.stats.totalUsers = stats.totalUsers || this.stats.totalUsers;
          this.stats.activeUsers = stats.activeUsers || this.stats.activeUsers;
          this.stats.totalMessages = stats.totalMessages || this.stats.totalMessages;
          this.stats.totalFiles = stats.totalFiles || this.stats.totalFiles;
          this.stats.totalCalls = stats.totalCalls || this.stats.totalCalls;
          this.stats.systemUptime = stats.systemUptime || this.stats.systemUptime;
        }
      } else {
        // Fallback: Use ctx.user as a data point
        if (this.ctx.user) {
          const userAny = this.ctx.user as any;
          this.stats.totalUsers = userAny.totalUsers || 1;
          this.stats.activeUsers = 1; // At least current user
        }
      }
    } catch (error) {
      // Silently fall back to default values on error
    }
  }

  /**
   * Fetch real node status from BBS
   */
  private async fetchNodeStatus(): Promise<NodeInfo[]> {
    try {
      const bbsApi = this.ctx.bbs as any;
      if (bbsApi && typeof bbsApi.getNodeStatus === 'function') {
        const nodes = await bbsApi.getNodeStatus();
        if (Array.isArray(nodes)) {
          return nodes.map((node: any) => ({
            id: node.id || node.nodeId || 0,
            user: node.user || node.username || '',
            status: node.status || 'Idle',
            location: node.location || node.activity || 'Unknown'
          }));
        }
      }
    } catch (error) {
      // Fall through to fallback
    }

    // Fallback: Return current node only
    return [{
      id: this.ctx.nodeId || 1,
      user: this.ctx.user?.username || 'SysOp',
      status: 'Active',
      location: 'Dashboard'
    }];
  }

  /**
   * Get system resource usage (CPU, Memory, Disk)
   */
  private async fetchSystemStats(): Promise<{ cpu: number; memory: number; disk: number }> {
    try {
      const bbsApi = this.ctx.bbs as any;
      if (bbsApi && typeof bbsApi.getSystemStats === 'function') {
        const sysStats = await bbsApi.getSystemStats();
        if (sysStats) {
          return {
            cpu: sysStats.cpuUsage || 0,
            memory: sysStats.memoryUsage || 0,
            disk: sysStats.diskUsage || 0
          };
        }
      }
    } catch (error) {
      // Fall through to fallback
    }

    // Fallback: Use reasonable demo values
    return {
      cpu: Math.floor(Math.random() * 40) + 20,   // 20-60%
      memory: Math.floor(Math.random() * 30) + 50, // 50-80%
      disk: 67
    };
  }

  private validateStats(): void {
    // Ensure active users doesn't exceed total users
    this.stats.activeUsers = Math.min(this.stats.activeUsers, this.stats.totalUsers);

    // Cap unbounded growth to prevent overflow
    if (this.stats.totalMessages > 999999) {
      this.stats.totalMessages = 999999;
    }
    if (this.stats.totalFiles > 999999) {
      this.stats.totalFiles = 999999;
    }
  }

  private startAutoRefresh(): void {
    this.updateInterval = setInterval(async () => {
      // Fetch fresh stats from BBS
      await this.fetchBBSStats();

      // Increment uptime (3 seconds per refresh)
      this.stats.systemUptime += 3;

      this.validateStats();

      if (this.screen && !this.screen.destroyed) {
        await this.renderDashboard();
      }
    }, 3000);
  }

  private cleanup(): void {
    try {
      // Clear auto-refresh interval
      if (this.updateInterval) {
        clearInterval(this.updateInterval);
        this.updateInterval = null;
      }

      // Remove resize handler
      if (this.resizeHandler && this.screen?.responsiveLayout) {
        // Note: blessed may not have offResize, but attempt to clean up
        if (typeof (this.screen.responsiveLayout as any).offResize === 'function') {
          (this.screen.responsiveLayout as any).offResize(this.resizeHandler);
        }
        this.resizeHandler = null;
      }

      // Remove key handlers
      if (this.screen) {
        this.screen.removeAllListeners('keypress');
      }

      // Destroy panels
      if (this.systemPanel) {
        this.systemPanel.destroy?.();
      }
      if (this.statsPanel) {
        this.statsPanel.destroy?.();
      }
      if (this.nodesPanel) {
        this.nodesPanel.destroy?.();
      }

      // Destroy screen
      if (this.screen && !this.screen.destroyed) {
        this.screen.destroy();
      }
    } catch (error) {
      // Silently handle cleanup errors to ensure exit promise resolves
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
});

export default door;
