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

export interface BugReport {
  id: number;
  category: string;
  subcategory?: string;
  priority: string;
  status: string;
  reporter: string;
  reporterId: number;
  reportedAt: number;
  updatedAt: number;
  resolvedAt?: number;
  tags?: string[];
}

export interface AnalyticsMetrics {
  totalBugs: number;
  openBugs: number;
  closedBugs: number;
  byCategory: Record<string, number>;
  byPriority: Record<string, number>;
  byStatus: Record<string, number>;
  averageResolutionTime: number;  // in hours
  topReporters: Array<{ name: string; count: number }>;
  recentActivity: Array<{ date: string; count: number }>;
  criticalBugs: number;
  staleBugs: number;  // Open > 30 days
}

export class AnalyticsEngine {
  private bugs: BugReport[];

  constructor(bugs: BugReport[]) {
    this.bugs = bugs;
  }

  calculateMetrics(): AnalyticsMetrics {
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

  private countByField(field: keyof BugReport): Record<string, number> {
    const counts: Record<string, number> = {};

    for (const bug of this.bugs) {
      const value = String(bug[field] || 'Unknown');
      counts[value] = (counts[value] || 0) + 1;
    }

    return counts;
  }

  private calculateAverageResolutionTime(): number {
    const resolved = this.bugs.filter(b => b.resolvedAt);

    if (resolved.length === 0) return 0;

    const totalTime = resolved.reduce((sum, bug) => {
      const time = (bug.resolvedAt! - bug.reportedAt) / (1000 * 60 * 60); // Convert to hours
      return sum + time;
    }, 0);

    return Math.round(totalTime / resolved.length);
  }

  private getTopReporters(limit: number): Array<{ name: string; count: number }> {
    const reporterCounts: Record<string, number> = {};

    for (const bug of this.bugs) {
      reporterCounts[bug.reporter] = (reporterCounts[bug.reporter] || 0) + 1;
    }

    return Object.entries(reporterCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  private getRecentActivity(days: number): Array<{ date: string; count: number }> {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const activity: Record<string, number> = {};

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

  private getStaleBugs(days: number): number {
    const now = Date.now();
    const cutoff = now - days * 24 * 60 * 60 * 1000;

    return this.bugs.filter(bug => {
      const isOpen = !['Fixed', 'Closed', 'Won\'t Fix'].includes(bug.status);
      const isOld = bug.reportedAt < cutoff;
      return isOpen && isOld;
    }).length;
  }

  generateBarChart(data: Record<string, number>, width: number = 50): string[] {
    const entries = Object.entries(data);
    if (entries.length === 0) return [];

    const maxValue = Math.max(...entries.map(([_, v]) => v));
    if (maxValue === 0) return entries.map(([k, _]) => `${k}: 0`);

    const lines: string[] = [];

    for (const [label, value] of entries) {
      const barLength = Math.floor((value / maxValue) * width);
      const bar = '█'.repeat(barLength);
      const padding = ' '.repeat(Math.max(0, width - barLength));
      lines.push(`${label.padEnd(20)} ${bar}${padding} ${value}`);
    }

    return lines;
  }

  generateTrendLine(activity: Array<{ date: string; count: number }>, height: number = 8): string[] {
    if (activity.length === 0) return [];

    const values = activity.map(a => a.count);
    const maxValue = Math.max(...values, 1);

    const lines: string[] = [];

    // Draw graph from top to bottom
    for (let h = height; h >= 0; h--) {
      let line = '';
      const threshold = (h / height) * maxValue;

      for (let i = 0; i < values.length; i++) {
        if (values[i] >= threshold) {
          line += '█';
        } else if (values[i] >= threshold - (maxValue / height / 2)) {
          line += '▄';
        } else {
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
