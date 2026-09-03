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
import {
  createTerminalModeSwitch, type TerminalModeSwitch,
} from '@amiexpress/bbs-door-sdk/utils/terminal-mode';
import type { DoorContext } from '@amiexpress/bbs-door-sdk';
import { createScreen, createBox } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import {
  themeStyles,
  themeById,
  attachDoorChrome,
  footerStyle,
  type DoorChrome,
  type Theme,
  type ThemeTokens,
  type ThemeStyles,
} from '@amiexpress/bbs-door-sdk/engines/ui/theme';

/** The caller's tokens, for the stats lines' inline tags. */
let T: ThemeTokens = themeById('classic').tokens;
import { DoorInputManager } from '@amiexpress/bbs-door-sdk/utils/door-input-manager';
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { Text } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

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
  /**
   * The caller's theme, resolved once.
   *
   * Every colour on this screen used to be a literal - three panels in
   * yellow, cyan and green, a white-on-blue bar, three progress bars in
   * three more hues. That is six colours competing before any data is on
   * screen, and none of them move when the user picks a theme.
   */
  private s = themeStyles(themeById('classic'));
  private screen!: Screen;
  private inputManager!: DoorInputManager;
  private systemPanel!: any;  // Box widget
  private statsPanel!: any;   // Box widget
  private nodesPanel!: any;   // Box widget
  private systemText!: Text;
  private statsText!: Text;
  private nodesText!: Text;
  private statusText!: Text;
  private header!: any;
  /** The masthead, the rail, the glitches and the hint line - one handle. */
  private chrome: DoorChrome | null = null;
  private theme: Theme = themeById('classic');
  private updateInterval: NodeJS.Timeout | null = null;
  private terminalMode: TerminalModeSwitch | null = null;
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
    const bbsTheme = (this.ctx.bbs as any)?.getTheme;
    const resolved = bbsTheme ? (this.ctx.bbs as any).getTheme() : themeById('classic');
    this.s = themeStyles(resolved);
    this.theme = resolved;
    T = resolved.tokens;

    this.screen = createScreen(this.ctx.bbs, {
      smartCSR: false,   // Prevent layout corruption in BBS environment
      dockBorders: false, // Not needed for fixed panels
      title: 'BBS SysOp Dashboard',
      responsive: true,
    });

    // 80x25 like the board, or the caller's whole terminal on Alt+Enter.
    // This dashboard is written in percentages, so following a resize is a
    // repaint; asking the terminal to grow at all is the part no door gets
    // for free (sdk/utils/terminal-mode.ts).
    this.terminalMode = createTerminalModeSwitch({
      bbs: this.ctx.bbs,
      screen: this.screen,
      start: 'fixed',
      onRelayout: () => { this.screen?.render(); },
    });
    this.screen.program.write('\x1b[2J');
    this.screen.program.write('\x1b[H');
    this.screen.clearRegion(0, this.screen.width, 0, this.screen.height);
    this.screen.alloc();

    // The masthead: branding slashes, then the title.
    //
    // The colour pass alone left this door looking like a plain green
    // terminal next to DOORS, which has the rail, the leaders and the
    // glitches. Colour was never what made that screen read as designed.
    // A theme with no rail (classic) gets exactly the bar it always had.
    this.header = createBox({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: 1,
      fixed: true,
      focusable: false,
      clickable: false,
      mouse: false,
      border: undefined,
      content: '',
      style: this.s.bar.style,
    });

    // System Resources Panel (top-left)
    this.systemPanel = createBox({
      parent: this.screen,
      label: ' SYSTEM RESOURCES ',
      left: 0,
      top: 1,                 // below the masthead
      width: '50%',
      // Full half-height. Taking the masthead's row out of HERE cost this
      // panel its last line, and the Disk gauge silently fell off the
      // bottom - the row comes out of Node Status below instead, which has
      // space to spare.
      height: '50%',
      fixed: true,  // Static panel for BBS environment
      focusable: false,  // Display-only panel
      clickable: false,  // Don't capture mouse events
      mouse: false,      // Don't listen for mouse events
      ...this.s.panel,
    });

    this.systemText = new Text({
      parent: this.systemPanel,
      top: 1,
      left: 1,
      right: 1,
      height: '100%-2',
      content: '',
      tags: true,
    });

    // BBS Statistics Panel (top-right)
    this.statsPanel = createBox({
      parent: this.screen,
      label: ' BBS STATISTICS ',
      left: '50%',
      top: 1,                 // below the masthead
      width: '50%',
      height: '50%',          // matches the system panel
      fixed: true,  // Static panel for BBS environment
      focusable: false,  // Display-only panel
      clickable: false,  // Don't capture mouse events
      mouse: false,      // Don't listen for mouse events
      ...this.s.panel,
    });

    this.statsText = new Text({
      parent: this.statsPanel,
      top: 1,
      left: 1,
      right: 1,
      height: '100%-2',
      content: '',
      tags: true,
    });

    // Node Status Panel (bottom, full width)
    this.nodesPanel = createBox({
      parent: this.screen,
      label: ' NODE STATUS ',
      left: 0,
      top: '50%+1',           // one row down, to pay for the masthead
      width: '100%',
      bottom: 1,  // Reserve 1 line for status bar
      fixed: true,  // Static panel for BBS environment
      focusable: false,  // Display-only panel
      clickable: false,  // Don't capture mouse events
      mouse: false,      // Don't listen for mouse events
      ...this.s.panel,
    });

    this.nodesText = new Text({
      parent: this.nodesPanel,
      top: 1,
      left: 1,
      right: 1,
      height: '100%-2',
      content: '',
      tags: true,
    });

    // Status bar at the bottom
    // A one-row footer in the bar's colours, not a bare line of text. The
    // key CAP carries the accent and the description sits dim, so the hints
    // do not compete with the panels above them.
    this.statusText = new Text({
      parent: this.screen,
      bottom: 0,
      left: 0,
      right: 0,
      height: 1,
      content: '',
      style: footerStyle(this.theme),
      tags: true,
    });

    /**
     * The whole chrome, from the ONE SDK call.
     *
     * This door was the closest to complete and still wired the pieces
     * separately - and with no width gate at all, so on a 40-column C64 the
     * rail animated and the glitches fired, which is exactly the stray
     * glyphs mid-row the sysop reported from DOORMAN. attachDoorChrome
     * carries the gate, so a door cannot forget it.
     *
     * Glitches go on the NODE list, the only thing here with rows to
     * spare: damaging the masthead or the status line would read as the
     * door being broken rather than as atmosphere.
     */
    this.chrome = attachDoorChrome(this.theme, {
      width: ((this.screen as any).width as number) || 80,
      title: 'SYSOP DASHBOARD',
      masthead: this.header,
      footer: this.statusText as any,
      hints: [
        { key: 'Q', does: 'Quit' },
        { key: 'R/Space', does: 'Refresh' },
      ],
      footerPad: ' ',
      glitch: this.nodesText,
      glitchOptions: { tickMs: 400 },
      styles: this.s,
      render: () => this.screen.render(),
      seed: ((this.ctx as any)?.nodeId ?? 1) * 7 + 3,
    });

    // Responsive breakpoint handling
    this.resizeHandler = (width, height) => {
      const breakpoint = this.screen.responsiveLayout.getBreakpoint();

      if (breakpoint === 'small') {
        // Stack panels vertically on small screens
        this.systemPanel.width = '100%';
        this.systemPanel.height = '33%';
        this.systemPanel.left = 0;
        this.systemPanel.top = 0;
        this.statsPanel.left = 0;
        this.statsPanel.top = '33%';
        this.statsPanel.width = '100%';
        this.statsPanel.height = '33%';
        this.nodesPanel.left = 0;
        this.nodesPanel.top = '66%';
        this.nodesPanel.width = '100%';
        this.nodesPanel.bottom = 1;  // Always reserve space for status bar
        delete this.nodesPanel.height;  // Remove height when using bottom constraint
      } else {
        // Side-by-side layout for medium/large screens
        this.systemPanel.width = '50%';
        this.systemPanel.height = '50%';
        this.systemPanel.left = 0;
        this.systemPanel.top = 0;
        this.statsPanel.left = '50%';
        this.statsPanel.top = 0;
        this.statsPanel.width = '50%';
        this.statsPanel.height = '50%';
        this.nodesPanel.left = 0;
        this.nodesPanel.top = '50%';
        this.nodesPanel.width = '100%';
        this.nodesPanel.bottom = 1;  // Always reserve space for status bar
        delete this.nodesPanel.height;  // Remove height when using bottom constraint
      }

      if (this.screen && !this.screen.destroyed) {
        // Don't await here to avoid blocking resize handler
        this.renderDashboard().catch(() => {
          // Silently handle render errors during resize
        });
      }
    };
    this.screen.responsiveLayout.onResize(this.resizeHandler);

    // Set up input management (enables mouse, keyboard routing)
    this.inputManager = new DoorInputManager(this.ctx, this.screen, {
      enableGameMode: false,  // Dashboard UI mode, not ncurses game mode
      enableGrabKeys: false,  // Blessed focus system handles keys
      enableMouse: true,      // Enable mouse events
      debug: false,
      debugName: 'BBSDashboard'
    });
    this.inputManager.enable();

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
    systemLines.push(`CPU Usage:  ${cpuUsage}%  ${this.makeProgressBar(cpuUsage, 20, this.s.accent)}`);
    systemLines.push('');
    systemLines.push(`Memory:     ${memUsage}%  ${this.makeProgressBar(memUsage, 20, this.s.accentAlt)}`);
    systemLines.push('');
    systemLines.push(`Disk:       ${diskUsage}%  ${this.makeProgressBar(diskUsage, 20, this.s.warn)}`);

    this.systemText.setContent(systemLines.join('\n'));

    // Render BBS Statistics Panel
    const statsLines: string[] = [];
    statsLines.push('');
    statsLines.push(`Total Users:    {${T.ink}-fg}${this.stats.totalUsers.toLocaleString()}{/${T.ink}-fg}`);
    statsLines.push('');
    statsLines.push(`Active Now:     {${T.ok}-fg}${this.stats.activeUsers}{/${T.ok}-fg}`);
    statsLines.push('');
    statsLines.push(`Total Calls:    {${T.ink}-fg}${this.stats.totalCalls.toLocaleString()}{/${T.ink}-fg}`);
    statsLines.push('');
    statsLines.push(`Messages:       {${T.ink}-fg}${this.stats.totalMessages.toLocaleString()}{/${T.ink}-fg}`);
    statsLines.push('');
    statsLines.push(`Files:          {${T.ink}-fg}${this.stats.totalFiles.toLocaleString()}{/${T.ink}-fg}`);
    statsLines.push('');
    statsLines.push(`Uptime:         {${T.ink}-fg}${this.formatUptime(this.stats.systemUptime)}{/${T.ink}-fg}`);

    this.statsText.setContent(statsLines.join('\n'));

    // Render Node Status Panel
    const nodesLines: string[] = [];
    nodesLines.push('');
    nodesLines.push(`{bold}  Node    User              Status      Location{/bold}`);
    nodesLines.push(`{${T.accent}-fg}` + '─'.repeat(60) + `{/${T.accent}-fg}`);

    // Fetch real node status
    const nodes = await this.fetchNodeStatus();

    for (const node of nodes) {
      const userName = node.user || 'Waiting';
      // Active is the theme's "good" role; anything else is ordinary text.
      const paint = node.status === 'Active' ? this.s.ok : this.s.ink;
      nodesLines.push(paint(`  ${node.id}       ${this.padRight(userName, 16)}  ${this.padRight(node.status, 10)}  ${node.location}`));
    }

    this.nodesText.setContent(nodesLines.join('\n'));

    // Update status line. The hints belong to the chrome; only the clock
    // after them is this door's, so only the clock is repainted here.
    const now = new Date().toLocaleTimeString();
    this.chrome?.setFooterSuffix(`  ${this.s.dim('Last Update: ' + now)}`);

    this.screen.render();
  }

  /**
   * A progress bar, painted by a theme role rather than a colour name.
   *
   * CPU, memory and disk were cyan, magenta and yellow - three hues chosen
   * for variety, which a one-hue theme has no way to honour. They take
   * three ROLES now, so they still read as three different things and a
   * theme decides how far apart they look.
   */
  private makeProgressBar(percent: number, width: number, paint: (t: string) => string): string {
    const filled = Math.floor((width * percent) / 100);
    const bar = '[' + '='.repeat(filled) + ' '.repeat(width - filled) + ']';
    return paint(bar);
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
    // Gives the board its 80 columns back and unhooks resize and Alt+Enter.
    this.terminalMode?.dispose();
    this.terminalMode = null;
    try {
      // Clear auto-refresh interval
      if (this.updateInterval) {
        clearInterval(this.updateInterval);
        this.updateInterval = null;
      }
      // Stops every chrome timer, and puts the true rows back - so a door
      // that exits mid-glitch never leaves the damage as the last thing on
      // screen.
      if (this.chrome) {
        try { this.chrome.stop(); } catch { /* leaving anyway */ }
        this.chrome = null;
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

      // CRITICAL: Disable input manager FIRST (restores BBS input state)
      if (this.inputManager) {
        this.inputManager.disable();
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
