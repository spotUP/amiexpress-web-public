"use strict";
/**
 * BBS Dashboard Door
 * Comprehensive real-time dashboard for System Operators
 */
Object.defineProperty(exports, "__esModule", { value: true });
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
const door = new bbs_door_sdk_1.Door({
    name: 'BBS SysOp Dashboard',
    version: '1.0.0',
    author: 'AmiExpress SDK',
    description: 'Comprehensive real-time dashboard for System Operators'
});
const gfx = new bbs_door_sdk_1.GraphicsEngine({ width: 80, height: 24 });
let updateInterval = null;
// Mock BBS statistics
const stats = {
    totalUsers: 1547,
    activeUsers: 4,
    totalMessages: 34521,
    totalFiles: 8934,
    totalCalls: 125673,
    systemUptime: 864000
};
door.onConnect((user) => {
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
door.onInput((user, key) => {
    const keyPressed = key.key?.toUpperCase();
    if (keyPressed === 'Q' || key.name === 'escape') {
        if (updateInterval) {
            clearInterval(updateInterval);
            updateInterval = null;
        }
        gfx.clear(bbs_door_sdk_1.AnsiColor.Black);
        gfx.drawText(30, 10, 'Dashboard Closed', bbs_door_sdk_1.AnsiColor.BrightCyan);
        door.sendAnsi(gfx.render(), user.id);
        setTimeout(() => door.disconnect(user.id), 1000);
        return;
    }
    // Refresh on any other key
    renderDashboard(user);
});
door.onDisconnect((user) => {
    console.log(`User ${user.name} disconnected from BBS Dashboard`);
    if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
    }
});
function renderDashboard(user) {
    gfx.clear(bbs_door_sdk_1.AnsiColor.Black);
    // Header
    gfx.drawBox({ x: 0, y: 0, width: 80, height: 24 }, 'single', bbs_door_sdk_1.AnsiColor.Cyan);
    gfx.drawText(25, 0, ' BBS SYSOP DASHBOARD ', bbs_door_sdk_1.AnsiColor.BrightCyan);
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
    gfx.drawText(2, 22, `Last Update: ${now}`, bbs_door_sdk_1.AnsiColor.Green);
    gfx.drawText(55, 22, 'Q: Quit  Any Key: Refresh', bbs_door_sdk_1.AnsiColor.Yellow);
    door.sendAnsi(gfx.render(), user.id);
}
function drawSystemResources(x, y) {
    gfx.drawText(x, y, 'SYSTEM RESOURCES', bbs_door_sdk_1.AnsiColor.BrightYellow);
    gfx.drawText(x, y + 1, '─'.repeat(36), bbs_door_sdk_1.AnsiColor.Cyan);
    // CPU Usage
    const cpuUsage = getCPUUsage();
    gfx.drawText(x, y + 2, `CPU Usage:  ${cpuUsage}%`, bbs_door_sdk_1.AnsiColor.White);
    drawProgressBar(x, y + 3, 30, cpuUsage, bbs_door_sdk_1.AnsiColor.Cyan);
    // Memory Usage
    const memUsage = getMemoryUsage();
    gfx.drawText(x, y + 4, `Memory:     ${memUsage}%`, bbs_door_sdk_1.AnsiColor.White);
    drawProgressBar(x, y + 5, 30, memUsage, bbs_door_sdk_1.AnsiColor.Magenta);
    // Disk Usage (mock)
    const diskUsage = 67;
    gfx.drawText(x, y + 6, `Disk:       ${diskUsage}%`, bbs_door_sdk_1.AnsiColor.White);
    drawProgressBar(x, y + 7, 30, diskUsage, bbs_door_sdk_1.AnsiColor.Yellow);
}
function drawBBSStatistics(x, y) {
    gfx.drawText(x, y, 'BBS STATISTICS', bbs_door_sdk_1.AnsiColor.BrightYellow);
    gfx.drawText(x, y + 1, '─'.repeat(36), bbs_door_sdk_1.AnsiColor.Cyan);
    gfx.drawText(x, y + 2, `Total Users:    ${stats.totalUsers.toLocaleString()}`, bbs_door_sdk_1.AnsiColor.White);
    gfx.drawText(x, y + 3, `Active Now:     ${stats.activeUsers}`, bbs_door_sdk_1.AnsiColor.BrightGreen);
    gfx.drawText(x, y + 4, `Total Calls:    ${stats.totalCalls.toLocaleString()}`, bbs_door_sdk_1.AnsiColor.White);
    gfx.drawText(x, y + 5, `Messages:       ${stats.totalMessages.toLocaleString()}`, bbs_door_sdk_1.AnsiColor.White);
    gfx.drawText(x, y + 6, `Files:          ${stats.totalFiles.toLocaleString()}`, bbs_door_sdk_1.AnsiColor.White);
    gfx.drawText(x, y + 7, `Uptime:         ${formatUptime(stats.systemUptime)}`, bbs_door_sdk_1.AnsiColor.White);
}
function drawNodeStatus(x, y) {
    gfx.drawText(x, y, 'NODE STATUS', bbs_door_sdk_1.AnsiColor.BrightYellow);
    gfx.drawText(x, y + 1, '─'.repeat(76), bbs_door_sdk_1.AnsiColor.Cyan);
    // Table header
    gfx.drawText(x + 2, y + 2, 'Node', bbs_door_sdk_1.AnsiColor.BrightWhite);
    gfx.drawText(x + 10, y + 2, 'User', bbs_door_sdk_1.AnsiColor.BrightWhite);
    gfx.drawText(x + 30, y + 2, 'Status', bbs_door_sdk_1.AnsiColor.BrightWhite);
    gfx.drawText(x + 50, y + 2, 'Location', bbs_door_sdk_1.AnsiColor.BrightWhite);
    gfx.drawText(x, y + 3, '─'.repeat(76), bbs_door_sdk_1.AnsiColor.Cyan);
    // Mock node data
    const nodes = [
        { id: 1, user: 'CyberPunk', status: 'Active', location: 'Reading Mail', color: bbs_door_sdk_1.AnsiColor.Green },
        { id: 2, user: 'HackerOne', status: 'Active', location: 'Playing Door', color: bbs_door_sdk_1.AnsiColor.Green },
        { id: 3, user: '', status: 'Idle', location: 'Login Screen', color: bbs_door_sdk_1.AnsiColor.White },
        { id: 4, user: 'BBSMaster', status: 'Active', location: 'File Area', color: bbs_door_sdk_1.AnsiColor.Green }
    ];
    nodes.forEach((node, i) => {
        gfx.drawText(x + 2, y + 4 + i, `${node.id}`, node.color);
        gfx.drawText(x + 10, y + 4 + i, node.user || 'Waiting', node.color);
        gfx.drawText(x + 30, y + 4 + i, node.status, node.color);
        gfx.drawText(x + 50, y + 4 + i, node.location, node.color);
    });
}
function drawRecentActivity(x, y) {
    gfx.drawText(x, y, 'RECENT ACTIVITY', bbs_door_sdk_1.AnsiColor.BrightYellow);
    gfx.drawText(x, y + 1, '─'.repeat(76), bbs_door_sdk_1.AnsiColor.Cyan);
    const now = new Date();
    const time1 = new Date(now.getTime() - 60000).toLocaleTimeString();
    const time2 = new Date(now.getTime() - 120000).toLocaleTimeString();
    const time3 = new Date(now.getTime() - 180000).toLocaleTimeString();
    gfx.drawText(x, y + 2, `[${time1}] User CyberPunk logged in from node 1`, bbs_door_sdk_1.AnsiColor.Green);
    gfx.drawText(x, y + 3, `[${time2}] File download: COOL_DEMO.ZIP (2.3MB)`, bbs_door_sdk_1.AnsiColor.Green);
    gfx.drawText(x, y + 4, `[${time3}] Message posted in General conference`, bbs_door_sdk_1.AnsiColor.Green);
}
function drawProgressBar(x, y, width, percent, color) {
    const filled = Math.floor((width * percent) / 100);
    const bar = '[' + '='.repeat(filled) + ' '.repeat(width - filled) + ']';
    gfx.drawText(x, y, bar, color);
}
function getCPUUsage() {
    // Mock CPU usage for browser environment
    // In a real implementation, this would fetch from BBS API
    return Math.floor(Math.random() * 40) + 20; // Random 20-60%
}
function getMemoryUsage() {
    // Mock memory usage for browser environment
    // In a real implementation, this would fetch from BBS API
    return Math.floor(Math.random() * 30) + 50; // Random 50-80%
}
function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${mins}m`;
}
door.start();
console.log('BBS Dashboard door started!');
