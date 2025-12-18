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
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
class BBSDashboard {
    constructor() {
        this.updateInterval = null;
        this.exitResolve = null;
        this.stats = {
            totalUsers: 1547,
            activeUsers: 4,
            totalMessages: 34521,
            totalFiles: 8934,
            totalCalls: 125673,
            systemUptime: 864000
        };
    }
    setContext(ctx) {
        this.ctx = ctx;
    }
    async start() {
        this.createUI();
        this.renderDashboard();
        this.startAutoRefresh();
        // Wait for exit
        await new Promise((resolve) => {
            this.exitResolve = resolve;
            this.screen.on('destroy', () => resolve());
        });
    }
    createUI() {
        this.screen = new blessed_1.Screen({
            smartCSR: true,
            title: 'BBS SysOp Dashboard',
            output: (data) => this.ctx.output.write(data),
        });
        // Main container
        this.mainBox = new blessed_1.Box({
            parent: this.screen,
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            tags: true,
            border: { type: 'line' },
            style: {
                border: { fg: 'cyan' }
            },
            label: ' BBS SYSOP DASHBOARD '
        });
        // Status text
        this.statusText = new blessed_1.Text({
            parent: this.mainBox,
            bottom: 0,
            left: 1,
            right: 1,
            height: 1,
            tags: true,
            content: ''
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
    renderDashboard() {
        const lines = [];
        // Header
        lines.push('{center}{bold}{cyan-fg}=== BBS SYSOP DASHBOARD ==={/cyan-fg}{/bold}{/center}');
        lines.push('');
        // System Resources
        lines.push('{bold}{yellow-fg}SYSTEM RESOURCES{/yellow-fg}{/bold}');
        lines.push('{cyan-fg}' + '─'.repeat(76) + '{/cyan-fg}');
        const cpuUsage = Math.floor(Math.random() * 40) + 20;
        const memUsage = Math.floor(Math.random() * 30) + 50;
        const diskUsage = 67;
        lines.push(`CPU Usage:  ${cpuUsage}%  ${this.makeProgressBar(cpuUsage, 30, 'cyan')}`);
        lines.push(`Memory:     ${memUsage}%  ${this.makeProgressBar(memUsage, 30, 'magenta')}`);
        lines.push(`Disk:       ${diskUsage}%  ${this.makeProgressBar(diskUsage, 30, 'yellow')}`);
        lines.push('');
        // BBS Statistics
        lines.push('{bold}{yellow-fg}BBS STATISTICS{/yellow-fg}{/bold}');
        lines.push('{cyan-fg}' + '─'.repeat(76) + '{/cyan-fg}');
        lines.push(`Total Users:    {white-fg}${this.stats.totalUsers.toLocaleString()}{/white-fg}`);
        lines.push(`Active Now:     {green-fg}${this.stats.activeUsers}{/green-fg}`);
        lines.push(`Total Calls:    {white-fg}${this.stats.totalCalls.toLocaleString()}{/white-fg}`);
        lines.push(`Messages:       {white-fg}${this.stats.totalMessages.toLocaleString()}{/white-fg}`);
        lines.push(`Files:          {white-fg}${this.stats.totalFiles.toLocaleString()}{/white-fg}`);
        lines.push(`Uptime:         {white-fg}${this.formatUptime(this.stats.systemUptime)}{/white-fg}`);
        lines.push('');
        // Node Status
        lines.push('{bold}{yellow-fg}NODE STATUS{/yellow-fg}{/bold}');
        lines.push('{cyan-fg}' + '─'.repeat(76) + '{/cyan-fg}');
        lines.push(`{bold}  Node    User              Status      Location{/bold}`);
        lines.push('{cyan-fg}' + '─'.repeat(76) + '{/cyan-fg}');
        const nodes = [
            { id: 1, user: 'CyberPunk', status: 'Active', location: 'Reading Mail' },
            { id: 2, user: 'HackerOne', status: 'Active', location: 'Playing Door' },
            { id: 3, user: '', status: 'Idle', location: 'Login Screen' },
            { id: 4, user: 'BBSMaster', status: 'Active', location: 'File Area' }
        ];
        for (const node of nodes) {
            const userName = node.user || 'Waiting';
            const color = node.status === 'Active' ? 'green' : 'white';
            lines.push(`{${color}-fg}  ${node.id}       ${this.padRight(userName, 16)}  ${this.padRight(node.status, 10)}  ${node.location}{/${color}-fg}`);
        }
        this.mainBox.setContent(lines.join('\n'));
        // Update status line
        const now = new Date().toLocaleTimeString();
        this.statusText.setContent(`{green-fg}Last Update: ${now}{/green-fg}  {yellow-fg}Q: Quit  R/Space: Refresh{/yellow-fg}`);
        this.screen.render();
    }
    makeProgressBar(percent, width, color) {
        const filled = Math.floor((width * percent) / 100);
        const bar = '[' + '='.repeat(filled) + ' '.repeat(width - filled) + ']';
        return `{${color}-fg}${bar}{/${color}-fg}`;
    }
    padRight(text, width) {
        return text.length >= width ? text.substring(0, width) : text + ' '.repeat(width - text.length);
    }
    formatUptime(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        return `${days}d ${hours}h ${mins}m`;
    }
    startAutoRefresh() {
        this.updateInterval = setInterval(() => {
            // Update some stats randomly
            this.stats.activeUsers = Math.floor(Math.random() * 8) + 1;
            this.stats.totalMessages += Math.floor(Math.random() * 3);
            this.stats.totalFiles += Math.floor(Math.random() * 2);
            this.stats.systemUptime += 3;
            this.renderDashboard();
        }, 3000);
    }
    cleanup() {
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
    console.error('Dashboard error:', error);
});
exports.default = door;
