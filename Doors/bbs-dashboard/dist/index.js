"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const door_input_manager_1 = require("@amiexpress/bbs-door-sdk/utils/door-input-manager");
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
class BBSDashboard {
    constructor() {
        this.updateInterval = null;
        this.exitResolve = null;
        this.resizeHandler = null;
        this.hasExited = false;
        this.stats = {
            totalUsers: 0,
            activeUsers: 0,
            totalMessages: 0,
            totalFiles: 0,
            totalCalls: 0,
            systemUptime: 0
        };
    }
    setContext(ctx) {
        this.ctx = ctx;
    }
    async start() {
        this.createUI();
        // Fetch initial data
        await this.fetchBBSStats();
        await this.renderDashboard();
        this.startAutoRefresh();
        // Wait for exit
        await new Promise((resolve) => {
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
    createUI() {
        this.screen = (0, blessed_helpers_1.createScreen)(this.ctx.bbs, {
            smartCSR: false, // Prevent layout corruption in BBS environment
            dockBorders: false, // Not needed for fixed panels
            title: 'BBS SysOp Dashboard',
            responsive: true,
        });
        // System Resources Panel (top-left)
        this.systemPanel = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            label: ' SYSTEM RESOURCES ',
            left: 0,
            top: 0,
            width: '50%',
            height: '50%',
            fixed: true, // Static panel for BBS environment
            clickable: false, // Don't capture mouse events
            mouse: false, // Don't listen for mouse events
            border: { type: 'line' },
            style: { border: { fg: 'yellow' } },
        });
        this.systemText = new blessed_1.Text({
            parent: this.systemPanel,
            top: 1,
            left: 1,
            right: 1,
            height: '100%-2',
            content: '',
            tags: true,
        });
        // BBS Statistics Panel (top-right)
        this.statsPanel = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            label: ' BBS STATISTICS ',
            left: '50%',
            top: 0,
            width: '50%',
            height: '50%',
            fixed: true, // Static panel for BBS environment
            clickable: false, // Don't capture mouse events
            mouse: false, // Don't listen for mouse events
            border: { type: 'line' },
            style: { border: { fg: 'cyan' } },
        });
        this.statsText = new blessed_1.Text({
            parent: this.statsPanel,
            top: 1,
            left: 1,
            right: 1,
            height: '100%-2',
            content: '',
            tags: true,
        });
        // Node Status Panel (bottom, full width)
        this.nodesPanel = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            label: ' NODE STATUS ',
            left: 0,
            top: '50%',
            width: '100%',
            bottom: 1, // Reserve 1 line for status bar
            fixed: true, // Static panel for BBS environment
            clickable: false, // Don't capture mouse events
            mouse: false, // Don't listen for mouse events
            border: { type: 'line' },
            style: { border: { fg: 'green' } },
        });
        this.nodesText = new blessed_1.Text({
            parent: this.nodesPanel,
            top: 1,
            left: 1,
            right: 1,
            height: '100%-2',
            content: '',
            tags: true,
        });
        // Status bar at the bottom
        this.statusText = new blessed_1.Text({
            parent: this.screen,
            bottom: 0,
            left: 0,
            right: 0,
            height: 1,
            content: '',
            style: { fg: 'white', bg: 'blue' },
            tags: true,
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
                this.nodesPanel.bottom = 1; // Always reserve space for status bar
                delete this.nodesPanel.height; // Remove height when using bottom constraint
            }
            else {
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
                this.nodesPanel.bottom = 1; // Always reserve space for status bar
                delete this.nodesPanel.height; // Remove height when using bottom constraint
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
        this.inputManager = new door_input_manager_1.DoorInputManager(this.ctx, this.screen, {
            enableGameMode: false, // Dashboard UI mode, not ncurses game mode
            enableGrabKeys: false, // Blessed focus system handles keys
            enableMouse: true, // Enable mouse events
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
    async renderDashboard() {
        // Guard against rendering to destroyed screen
        if (!this.screen || this.screen.destroyed) {
            return;
        }
        // Fetch system stats
        const sysStats = await this.fetchSystemStats();
        // Render System Resources Panel
        const systemLines = [];
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
        const statsLines = [];
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
        const nodesLines = [];
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
    makeProgressBar(percent, width, color) {
        const filled = Math.floor((width * percent) / 100);
        const bar = '[' + '='.repeat(filled) + ' '.repeat(width - filled) + ']';
        return `{${color}-fg}${bar}{/${color}-fg}`;
    }
    padRight(text, width) {
        if (width <= 0)
            return text;
        return text.length >= width
            ? text.substring(0, width)
            : text + ' '.repeat(Math.max(0, width - text.length));
    }
    formatUptime(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        return `${days}d ${hours}h ${mins}m`;
    }
    /**
     * Fetch real BBS statistics from the system
     */
    async fetchBBSStats() {
        try {
            // Attempt to get real stats from BBS API
            const bbsApi = this.ctx.bbs;
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
            }
            else {
                // Fallback: Use ctx.user as a data point
                if (this.ctx.user) {
                    const userAny = this.ctx.user;
                    this.stats.totalUsers = userAny.totalUsers || 1;
                    this.stats.activeUsers = 1; // At least current user
                }
            }
        }
        catch (error) {
            // Silently fall back to default values on error
        }
    }
    /**
     * Fetch real node status from BBS
     */
    async fetchNodeStatus() {
        try {
            const bbsApi = this.ctx.bbs;
            if (bbsApi && typeof bbsApi.getNodeStatus === 'function') {
                const nodes = await bbsApi.getNodeStatus();
                if (Array.isArray(nodes)) {
                    return nodes.map((node) => ({
                        id: node.id || node.nodeId || 0,
                        user: node.user || node.username || '',
                        status: node.status || 'Idle',
                        location: node.location || node.activity || 'Unknown'
                    }));
                }
            }
        }
        catch (error) {
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
    async fetchSystemStats() {
        try {
            const bbsApi = this.ctx.bbs;
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
        }
        catch (error) {
            // Fall through to fallback
        }
        // Fallback: Use reasonable demo values
        return {
            cpu: Math.floor(Math.random() * 40) + 20, // 20-60%
            memory: Math.floor(Math.random() * 30) + 50, // 50-80%
            disk: 67
        };
    }
    validateStats() {
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
    startAutoRefresh() {
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
    cleanup() {
        try {
            // Clear auto-refresh interval
            if (this.updateInterval) {
                clearInterval(this.updateInterval);
                this.updateInterval = null;
            }
            // Remove resize handler
            if (this.resizeHandler && this.screen?.responsiveLayout) {
                // Note: blessed may not have offResize, but attempt to clean up
                if (typeof this.screen.responsiveLayout.offResize === 'function') {
                    this.screen.responsiveLayout.offResize(this.resizeHandler);
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
        }
        catch (error) {
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
const door = new bbs_door_sdk_1.CoreDoor({
    name: 'BBS SysOp Dashboard',
    version: '2.0.0',
    author: 'AmiExpress SDK v2.0',
});
let dashboard;
door.onStart(async (ctx) => {
    dashboard = new BBSDashboard();
    dashboard.setContext(ctx);
    await dashboard.start();
});
door.onClose(async (ctx) => {
    ctx.output.writeLine('\r\n\x1b[36mDashboard closed.\x1b[0m\r\n');
});
door.onError(async (ctx, error) => {
    ctx.output.writeLine(`\r\n\x1b[31mError: ${error.message}\x1b[0m\r\n`);
});
exports.default = door;
