/**
 * The markdown (and HTML) body of an XIM debugging report.
 *
 * Pure: statistics and issues in, a string out. The CLI reads the log, calls
 * XIMAnalyzer, and writes the file. Keeping the rendering here is what lets a
 * fixture prove the report says the right thing without a door, a board or a
 * log on disk.
 */

import type { DetectedIssue } from '../xim-analyzer';
import type { LogStats } from './xim-log';

export interface ReportInput {
  stats: LogStats;
  issues: DetectedIssue[];
  logFile: string;
  door?: string;
  /** Injected, never read from the clock, so the output is reproducible. */
  generatedAt: string;
}

const SEVERITY_ORDER: Record<DetectedIssue['severity'], number> = {
  critical: 0, warning: 1, info: 2,
};

/** ASCII tokens, never emoji - this lands in terminals, logs and PRs. */
const SEVERITY_TOKEN: Record<DetectedIssue['severity'], string> = {
  critical: '[CRITICAL]', warning: '[WARNING]', info: '[INFO]',
};

function duration(ms: number | null): string {
  if (ms === null) return 'unknown';
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

export function renderMarkdown(input: ReportInput): string {
  const { stats, issues, logFile, door, generatedAt } = input;
  const out: string[] = [];

  out.push(`# XIM debugging report${door ? `: ${door}` : ''}`);
  out.push('');
  out.push(`Generated ${generatedAt} from \`${logFile}\`.`);
  out.push('');

  // The headline first: a report nobody reads past line 10 must still say
  // whether anything is wrong.
  const critical = issues.filter((i) => i.severity === 'critical').length;
  if (stats.total === 0) {
    out.push('**No XIM messages in this log.** Nothing below is measured from a real session.');
  } else if (critical > 0) {
    out.push(`**${critical} critical issue${critical === 1 ? '' : 's'}.** See Issues below.`);
  } else if (issues.length > 0) {
    out.push(`**No critical issues.** ${issues.length} other finding${issues.length === 1 ? '' : 's'}.`);
  } else {
    out.push('**Nothing detected.** The session looks clean.');
  }
  out.push('');

  out.push('## Session');
  out.push('');
  out.push('| | |');
  out.push('|---|---|');
  out.push(`| Messages | ${stats.total} (${stats.sent} sent, ${stats.received} received) |`);
  out.push(`| Doors | ${stats.doors.length ? stats.doors.join(', ') : 'none'} |`);
  out.push(`| Nodes | ${stats.nodes.length ? stats.nodes.join(', ') : 'none'} |`);
  out.push(`| Duration | ${duration(stats.durationMs)} |`);
  out.push(`| First | ${stats.firstTimestamp ?? 'unknown'} |`);
  out.push(`| Last | ${stats.lastTimestamp ?? 'unknown'} |`);
  out.push(`| Errors | ${stats.errors} |`);
  out.push(`| Warnings | ${stats.warnings} |`);
  out.push('');

  out.push('## Issues');
  out.push('');
  if (!issues.length) {
    out.push('None detected.');
    out.push('');
  } else {
    const sorted = [...issues].sort(
      (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.confidence - a.confidence,
    );
    for (const issue of sorted) {
      out.push(`### ${SEVERITY_TOKEN[issue.severity]} ${issue.title}`);
      out.push('');
      out.push(`Pattern \`${issue.pattern}\`, confidence ${issue.confidence}%.`);
      out.push('');
      if (issue.evidence?.length) {
        out.push('Evidence:');
        out.push('');
        for (const line of issue.evidence) out.push(`- ${line}`);
        out.push('');
      }
      if (issue.suggestedFix) {
        out.push(`**Fix:** ${issue.suggestedFix}`);
        out.push('');
      }
      if (issue.code) {
        out.push('```');
        out.push(issue.code);
        out.push('```');
        out.push('');
      }
      if (issue.documentation) {
        out.push(`Documentation: ${issue.documentation}`);
        out.push('');
      }
    }
  }

  out.push('## Message types');
  out.push('');
  if (!stats.byType.length) {
    out.push('No messages.');
    out.push('');
  } else {
    out.push('| type | sent | received | total |');
    out.push('|---|---:|---:|---:|');
    for (const row of stats.byType) {
      out.push(`| ${row.type} | ${row.sent} | ${row.received} | ${row.total} |`);
    }
    out.push('');
  }

  return out.join('\n');
}

/** Minimal self-contained HTML - no CDN, because this is read offline. */
export function renderHtml(input: ReportInput): string {
  const escape = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return [
    '<!doctype html>',
    '<meta charset="utf-8">',
    `<title>XIM report${input.door ? `: ${escape(input.door)}` : ''}</title>`,
    '<style>',
    'body{font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;max-width:60rem;margin:2rem auto;padding:0 1rem}',
    'table{border-collapse:collapse}td,th{border:1px solid #8884;padding:.25rem .5rem;text-align:left}',
    'pre{background:#8881;padding:.5rem;overflow-x:auto}',
    '</style>',
    '<pre>' + escape(renderMarkdown(input)) + '</pre>',
  ].join('\n');
}
