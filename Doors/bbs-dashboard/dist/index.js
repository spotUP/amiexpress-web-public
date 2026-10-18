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
const terminal_mode_1 = require("@amiexpress/bbs-door-sdk/utils/terminal-mode");
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const layout_1 = require("./layout");
const bbs_door_sdk_2 = require("@amiexpress/bbs-door-sdk");
const DoorLoader_1 = require("@amiexpress/bbs-door-sdk/utils/DoorLoader");
const theme_1 = require("@amiexpress/bbs-door-sdk/engines/ui/theme");
/** The caller's tokens, for the stats lines' inline tags. */
let T = (0, theme_1.themeById)('classic').tokens;
const door_input_manager_1 = require("@amiexpress/bbs-door-sdk/utils/door-input-manager");
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
const settings_1 = require("./settings");
class BBSDashboard {
    constructor() {
        /**
         * The caller's theme, resolved once.
         *
         * Every colour on this screen used to be a literal - three panels in
         * yellow, cyan and green, a white-on-blue bar, three progress bars in
         * three more hues. That is six colours competing before any data is on
         * screen, and none of them move when the user picks a theme.
         */
        this.s = (0, theme_1.themeStyles)((0, theme_1.themeById)('classic'));
        /** The masthead, the rail, the glitches and the hint line - one handle. */
        this.chrome = null;
        this.theme = (0, theme_1.themeById)('classic');
        this.updateInterval = null;
        /** Seconds between refreshes, from door.settings.json; default 3. */
        this.refreshSeconds = 3;
        this.terminalMode = null;
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
        /**
         * The board is asked for its stats before anything can be drawn, and
         * that wait was shown to the caller as an empty dashboard. The SDK's
         * loader covers the screen and says what is happening, the way
         * card-lobby does - one loader for every door that waits (sysop,
         * 2026-09-14: "apply the door loader").
         */
        const loader = new DoorLoader_1.DoorLoader(this.screen);
        loader.show('Asking the board for its statistics...');
        this.screen.render();
        // Fetch initial data
        await this.fetchBBSStats();
        loader.update(60, 'Reading node status...');
        await this.renderDashboard();
        loader.hide();
        this.screen.render();
        this.refreshSeconds = (0, settings_1.loadSettings)().refreshSeconds;
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
        const bbsTheme = this.ctx.bbs?.getTheme;
        const resolved = bbsTheme ? this.ctx.bbs.getTheme() : (0, theme_1.themeById)('classic');
        this.s = (0, theme_1.themeStyles)(resolved);
        this.theme = resolved;
        T = resolved.tokens;
        this.screen = (0, blessed_helpers_1.createScreen)(this.ctx.bbs, {
            smartCSR: false, // Prevent layout corruption in BBS environment
            dockBorders: false, // Not needed for fixed panels
            title: 'BBS SysOp Dashboard',
            responsive: true,
        });
        // 80x25 like the board, or the caller's whole terminal on Alt+Enter.
        // This dashboard is written in percentages, so following a resize is a
        // repaint; asking the terminal to grow at all is the part no door gets
        // for free (sdk/utils/terminal-mode.ts).
        this.terminalMode = (0, terminal_mode_1.createTerminalModeSwitch)({
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
        this.header = (0, blessed_helpers_1.createBox)({
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
        /*
         * WHERE THE PANELS GO, from the caller's width - `./layout.ts`. This was
         * `width: '50%'` with the stacking left to a resize that a C64 caller
         * never performs, so he opened the door on two twenty-column panels.
         */
        const panels = (0, layout_1.dashboardPanels)(this.screen.width);
        // System Resources Panel (top-left, or the top third at forty columns)
        this.systemPanel = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            label: ' SYSTEM RESOURCES ',
            left: panels.system.left,
            top: panels.system.top,
            width: panels.system.width,
            // Full half-height. Taking the masthead's row out of HERE cost this
            // panel its last line, and the Disk gauge silently fell off the
            // bottom - the row comes out of Node Status below instead, which has
            // space to spare.
            height: panels.system.height,
            fixed: true, // Static panel for BBS environment
            focusable: false, // Display-only panel
            clickable: false, // Don't capture mouse events
            mouse: false, // Don't listen for mouse events
            ...this.s.panel,
        });
        /*
         * THE TEXT STARTS AT THE PANEL'S FIRST INTERIOR ROW when the rows are
         * scarce. `top: 1` inside a bordered box is one row BELOW the interior,
         * which is a row of air an eighty-column panel can afford and a
         * five-row one cannot: with three gauges to draw in three rows, that
         * offset cost two of them and the sysop got a panel holding CPU alone
         * ("dashboard has no content", 2026-09-22).
         */
        const { top: textTop, height: textHeight } = (0, layout_1.panelTextPlacement)(panels.stacked);
        this.systemText = new blessed_1.Text({
            parent: this.systemPanel,
            top: textTop,
            left: 1,
            right: 1,
            height: textHeight,
            content: '',
            tags: true,
        });
        // BBS Statistics Panel (top-right)
        this.statsPanel = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            label: ' BBS STATISTICS ',
            left: panels.stats.left,
            top: panels.stats.top,
            width: panels.stats.width,
            height: panels.stats.height, // matches the system panel
            fixed: true, // Static panel for BBS environment
            focusable: false, // Display-only panel
            clickable: false, // Don't capture mouse events
            mouse: false, // Don't listen for mouse events
            ...this.s.panel,
        });
        this.statsText = new blessed_1.Text({
            parent: this.statsPanel,
            top: textTop,
            left: 1,
            right: 1,
            height: textHeight,
            content: '',
            tags: true,
        });
        // Node Status Panel (bottom, full width)
        this.nodesPanel = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            label: ' NODE STATUS ',
            left: panels.nodes.left,
            top: panels.nodes.top, // one row down, to pay for the masthead
            width: panels.nodes.width,
            bottom: panels.nodes.bottom, // Reserve 1 line for status bar
            fixed: true, // Static panel for BBS environment
            focusable: false, // Display-only panel
            clickable: false, // Don't capture mouse events
            mouse: false, // Don't listen for mouse events
            ...this.s.panel,
        });
        this.nodesText = new blessed_1.Text({
            parent: this.nodesPanel,
            top: textTop,
            left: 1,
            right: 1,
            height: textHeight,
            content: '',
            tags: true,
        });
        // Status bar at the bottom
        // A one-row footer in the bar's colours, not a bare line of text. The
        // key CAP carries the accent and the description sits dim, so the hints
        // do not compete with the panels above them.
        this.statusText = new blessed_1.Text({
            parent: this.screen,
            bottom: 0,
            left: 0,
            right: 0,
            height: 1,
            content: '',
            style: (0, theme_1.footerStyle)(this.theme),
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
        this.chrome = (0, theme_1.attachDoorChrome)(this.theme, {
            width: this.screen.width || 80,
            title: 'SYSOP DASHBOARD',
            masthead: this.header,
            footer: this.statusText,
            hints: [
                { key: 'Q', does: 'Quit' },
                { key: 'R/Space', does: 'Refresh' },
            ],
            footerPad: ' ',
            glitch: this.nodesText,
            glitchOptions: { tickMs: 400 },
            styles: this.s,
            render: () => this.screen.render(),
            seed: (this.ctx?.nodeId ?? 1) * 7 + 3,
        });
        // Responsive breakpoint handling
        this.resizeHandler = (width, height) => {
            /*
             * THE SAME FUNCTION THE PANELS WERE BUILT FROM. This handler used to
             * carry its own copy of both layouts, and the copies disagreed with
             * the build - the masthead's row, which the build pays for and the
             * handler did not - so a resize moved every panel up one and the
             * status row was painted over.
             */
            const next = (0, layout_1.dashboardPanels)(width);
            this.systemPanel.left = next.system.left;
            this.systemPanel.top = next.system.top;
            this.systemPanel.width = next.system.width;
            this.systemPanel.height = next.system.height;
            this.statsPanel.left = next.stats.left;
            this.statsPanel.top = next.stats.top;
            this.statsPanel.width = next.stats.width;
            this.statsPanel.height = next.stats.height;
            this.nodesPanel.left = next.nodes.left;
            this.nodesPanel.top = next.nodes.top;
            this.nodesPanel.width = next.nodes.width;
            this.nodesPanel.bottom = next.nodes.bottom;
            delete this.nodesPanel.height; // the bottom anchor owns the height
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
            debugName: 'BBSDashboard',
            // Ctrl+C and a Ctrl+K palette pick end the dashboard through its own quit.
            onClose: () => this.cleanup(),
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
        /*
         * NO SPACERS WHERE THERE ARE NO ROWS TO SPARE.
         *
         * These rows are written with a blank line above each gauge - the
         * spacing of an eight-row panel. The panel is FIVE rows at forty
         * columns now (`./layout.ts`, sized to what it holds), which leaves
         * three, and three gauges with a blank above each is six: what the
         * caller got was an empty box, because the first line of the content is
         * the blank. Sizing the box and not its CONTENT is half a job.
         */
        const compact = (0, bbs_door_sdk_2.isCompactWidth)(this.screen.width);
        const gap = () => { if (!compact)
            systemLines.push(''); };
        // The gauge is what the panel has left after the label - twenty columns
        // of it ran off a C64's screen, closing bracket and all.
        const gauge = (0, layout_1.gaugeWidth)(this.screen.width);
        gap();
        systemLines.push(`CPU Usage:  ${cpuUsage}%  ${this.makeProgressBar(cpuUsage, gauge, this.s.accent)}`);
        gap();
        systemLines.push(`Memory:     ${memUsage}%  ${this.makeProgressBar(memUsage, gauge, this.s.accentAlt)}`);
        gap();
        systemLines.push(`Disk:       ${diskUsage}%  ${this.makeProgressBar(diskUsage, gauge, this.s.warn)}`);
        this.systemText.setContent(systemLines.join('\n'));
        /*
         * Render BBS Statistics Panel. Six statistics with a blank line between
         * each is thirteen rows; the panel is FOUR at forty columns, which
         * leaves two. So at that width the two a sysop opens this door for -
         * how many users there are and how many are on RIGHT NOW - are the two
         * it shows, and the rest are a keypress away in the board's own stats.
         */
        const statsLines = [];
        const statGap = () => { if (!compact)
            statsLines.push(''); };
        statGap();
        statsLines.push(`Total Users:    {${T.ink}-fg}${this.stats.totalUsers.toLocaleString()}{/${T.ink}-fg}`);
        statGap();
        statsLines.push(`Active Now:     {${T.ok}-fg}${this.stats.activeUsers}{/${T.ok}-fg}`);
        if (!compact) {
            statsLines.push('');
            statsLines.push(`Total Calls:    {${T.ink}-fg}${this.stats.totalCalls.toLocaleString()}{/${T.ink}-fg}`);
            statsLines.push('');
            statsLines.push(`Messages:       {${T.ink}-fg}${this.stats.totalMessages.toLocaleString()}{/${T.ink}-fg}`);
            statsLines.push('');
            statsLines.push(`Files:          {${T.ink}-fg}${this.stats.totalFiles.toLocaleString()}{/${T.ink}-fg}`);
            statsLines.push('');
            statsLines.push(`Uptime:         {${T.ink}-fg}${this.formatUptime(this.stats.systemUptime)}{/${T.ink}-fg}`);
        }
        this.statsText.setContent(statsLines.join('\n'));
        // Render Node Status Panel
        const nodesLines = [];
        if (!compact)
            nodesLines.push('');
        /*
         * THE HEADER IS BUILT FROM THE SAME COLUMNS AS THE ROWS. It was a
         * literal, so at forty columns it named a Location column the rows below
         * it no longer have - and ran off the screen saying so.
         */
        const headCols = (0, layout_1.nodeColumns)(this.screen.width);
        const head = `  Node   ${this.padRight('User', headCols.handle)}  ${this.padRight('Status', headCols.status)}`;
        nodesLines.push(`{bold}${headCols.showLocation ? `${head}  Location` : head}{/bold}`);
        // The panel's own interior, not sixty columns: this rule ran twenty past
        // the right edge of a C64's screen.
        nodesLines.push(`{${T.accent}-fg}` + '─'.repeat((0, layout_1.panelRuleWidth)(this.screen.width)) + `{/${T.accent}-fg}`);
        // Fetch real node status
        const nodes = await this.fetchNodeStatus();
        for (const node of nodes) {
            const userName = node.user || 'Waiting';
            // Active is the theme's "good" role; anything else is ordinary text.
            const paint = node.status === 'Active' ? this.s.ok : this.s.ink;
            /*
             * The columns are the panel's, not a constant: at forty the location
             * goes rather than all four fields being squeezed until none of them
             * is legible (`./layout.ts`).
             */
            const cols = (0, layout_1.nodeColumns)(this.screen.width);
            const row = `  ${node.id}   ${this.padRight(userName, cols.handle)}  ${this.padRight(node.status, cols.status)}`;
            nodesLines.push(paint(cols.showLocation ? `${row}  ${node.location}` : row));
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
    makeProgressBar(percent, width, paint) {
        const filled = Math.floor((width * percent) / 100);
        const bar = '[' + '='.repeat(filled) + ' '.repeat(width - filled) + ']';
        return paint(bar);
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
            // Increment uptime by one refresh period (the configured interval).
            this.stats.systemUptime += this.refreshSeconds;
            this.validateStats();
            if (this.screen && !this.screen.destroyed) {
                await this.renderDashboard();
            }
        }, this.refreshSeconds * 1000);
    }
    cleanup() {
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
                try {
                    this.chrome.stop();
                }
                catch { /* leaving anyway */ }
                this.chrome = null;
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
