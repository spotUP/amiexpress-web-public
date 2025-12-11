"use strict";
/**
 * Analytics Module - Dashboard and Metrics
 *
 * Provides comprehensive analytics:
 * - Open bugs by category
 * - Resolution times
 * - Top reporters
 * - Trend analysis
 * - SLA tracking
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsEngine = void 0;
class AnalyticsEngine {
    constructor(bugs) {
        this.bugs = bugs;
    }
    calculateMetrics() {
        const openBugs = this.bugs.filter(b => !['Fixed', 'Closed', 'Won\'t Fix'].includes(b.status));
        const closedBugs = this.bugs.filter(b => ['Fixed', 'Closed'].includes(b.status));
        return {
            totalBugs: this.bugs.length,
            openBugs: openBugs.length,
            closedBugs: closedBugs.length,
            byCategory: this.countByField('category'),
            byPriority: this.countByField('priority'),
            byStatus: this.countByField('status'),
            averageResolutionTime: this.calculateAverageResolutionTime(),
            topReporters: this.getTopReporters(5),
            recentActivity: this.getRecentActivity(7),
            criticalBugs: this.bugs.filter(b => b.priority === 'Critical' && b.status !== 'Fixed').length,
            staleBugs: this.getStaleBugs(30)
        };
    }
    countByField(field) {
        const counts = {};
        for (const bug of this.bugs) {
            const value = String(bug[field] || 'Unknown');
            counts[value] = (counts[value] || 0) + 1;
        }
        return counts;
    }
    calculateAverageResolutionTime() {
        const resolved = this.bugs.filter(b => b.resolvedAt);
        if (resolved.length === 0)
            return 0;
        const totalTime = resolved.reduce((sum, bug) => {
            const time = (bug.resolvedAt - bug.reportedAt) / (1000 * 60 * 60); // Convert to hours
            return sum + time;
        }, 0);
        return Math.round(totalTime / resolved.length);
    }
    getTopReporters(limit) {
        const reporterCounts = {};
        for (const bug of this.bugs) {
            reporterCounts[bug.reporter] = (reporterCounts[bug.reporter] || 0) + 1;
        }
        return Object.entries(reporterCounts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);
    }
    getRecentActivity(days) {
        const now = Date.now();
        const dayMs = 24 * 60 * 60 * 1000;
        const activity = {};
        // Initialize dates
        for (let i = 0; i < days; i++) {
            const date = new Date(now - i * dayMs);
            const dateStr = date.toISOString().split('T')[0];
            activity[dateStr] = 0;
        }
        // Count bugs reported on each day
        for (const bug of this.bugs) {
            const bugDate = new Date(bug.reportedAt).toISOString().split('T')[0];
            if (bugDate in activity) {
                activity[bugDate]++;
            }
        }
        return Object.entries(activity)
            .map(([date, count]) => ({ date, count }))
            .sort((a, b) => a.date.localeCompare(b.date));
    }
    getStaleBugs(days) {
        const now = Date.now();
        const cutoff = now - days * 24 * 60 * 60 * 1000;
        return this.bugs.filter(bug => {
            const isOpen = !['Fixed', 'Closed', 'Won\'t Fix'].includes(bug.status);
            const isOld = bug.reportedAt < cutoff;
            return isOpen && isOld;
        }).length;
    }
    generateBarChart(data, width = 50) {
        const entries = Object.entries(data);
        if (entries.length === 0)
            return [];
        const maxValue = Math.max(...entries.map(([_, v]) => v));
        if (maxValue === 0)
            return entries.map(([k, _]) => `${k}: 0`);
        const lines = [];
        for (const [label, value] of entries) {
            const barLength = Math.floor((value / maxValue) * width);
            const bar = '█'.repeat(barLength);
            const padding = ' '.repeat(Math.max(0, width - barLength));
            lines.push(`${label.padEnd(20)} ${bar}${padding} ${value}`);
        }
        return lines;
    }
    generateTrendLine(activity, height = 8) {
        if (activity.length === 0)
            return [];
        const values = activity.map(a => a.count);
        const maxValue = Math.max(...values, 1);
        const lines = [];
        // Draw graph from top to bottom
        for (let h = height; h >= 0; h--) {
            let line = '';
            const threshold = (h / height) * maxValue;
            for (let i = 0; i < values.length; i++) {
                if (values[i] >= threshold) {
                    line += '█';
                }
                else if (values[i] >= threshold - (maxValue / height / 2)) {
                    line += '▄';
                }
                else {
                    line += ' ';
                }
            }
            const label = h === height ? maxValue.toString() : h === 0 ? '0' : '';
            lines.push(`${label.padStart(4)} │${line}`);
        }
        // X-axis
        lines.push('     └' + '─'.repeat(values.length));
        return lines;
    }
}
exports.AnalyticsEngine = AnalyticsEngine;
