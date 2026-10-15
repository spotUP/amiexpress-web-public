#!/usr/bin/env npx tsx
/**
 * XIM Debugging Report
 *
 * Turns an XIM debug log into a markdown (or HTML) report: what the session
 * was, what XIMAnalyzer found in it, and which messages it was made of.
 *
 * Usage:
 *   npm run xim:report
 *   npm run xim:report -- --door WHO
 *   npm run xim:report -- --file logs/xim-debug.json --output report.md
 *   npm run xim:report -- --door WHO --html --output report.html
 *
 * With no --output it prints to stdout, so it pipes.
 *
 * The issue detection is XIMAnalyzer's, not a second copy of it: this script
 * only reads, renders and writes.
 */

/* eslint-disable no-console */

import * as fs from 'fs';
import * as path from 'path';

import { XIMAnalyzer } from './xim-analyzer';
import { loadXimLog, summarise } from './lib/xim-log';
import { renderHtml, renderMarkdown } from './lib/xim-report';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (name: string): boolean => process.argv.includes(`--${name}`);

async function main(): Promise<void> {
  if (has('help')) {
    console.log('Usage: npm run xim:report -- [--door WHO] [--file logs/xim-debug.json] [--output report.md] [--html]');
    process.exit(0);
  }

  const logFile = arg('file') || process.env.XIM_LOG_FILE || 'logs/xim-debug.json';
  const door = arg('door');

  if (!fs.existsSync(logFile)) {
    // Exit 2, not 0: a report generated from a log that is not there would be
    // an empty clean bill of health for a door nobody looked at.
    console.error(`[ERROR] no XIM log at ${logFile}`);
    console.error('        Set XIM_DEBUG_JSON=1 and run the door, or pass --file.');
    process.exit(2);
  }

  const messages = await loadXimLog(logFile, { door });
  const stats = summarise(messages);

  const analyzer = new XIMAnalyzer();
  const issues = await analyzer.analyze(logFile, door);

  const input = {
    stats,
    issues,
    logFile,
    door,
    generatedAt: new Date().toISOString(),
  };
  const body = has('html') ? renderHtml(input) : renderMarkdown(input);

  const output = arg('output');
  if (output) {
    fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
    fs.writeFileSync(output, body, 'utf-8');
    console.log(`[OK] wrote ${output} (${stats.total} message(s), ${issues.length} issue(s))`);
  } else {
    console.log(body);
  }
}

main().catch((err) => {
  console.error(`[ERROR] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(2);
});
