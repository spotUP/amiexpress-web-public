#!/usr/bin/env npx tsx
/**
 * XIM Regression Tester
 *
 * Replays one recording against another and says what changed. The comparison
 * itself lives in `lib/xim-regression.ts` and is pure; this file reads files,
 * prints, and decides the exit code.
 *
 * Usage:
 *   npm run xim:regression -- --baseline baselines/WHO-v1.0.json --current run.json
 *   npm run xim:regression -- --baseline baselines/WHO-v1.0.json --current run.json --strict
 *   npm run xim:regression -- --baseline baselines/WHO-v1.0.json --current run.json --json
 *
 * Record the two sides with `npm run xim:record`.
 *
 * Exit codes, so this can gate something:
 *   0  no fatal findings
 *   1  a regression (sequence always; timing too under --strict)
 *   2  the tool could not run - a missing file, unreadable JSON
 *
 * A missing baseline exits 2, NOT 0. A gate that passes because its baseline
 * was not there is worse than no gate: it reports success for a door nobody
 * checked.
 */

/* eslint-disable no-console */

import * as fs from 'fs';
import {
  compareRecordings,
  failed,
  formatReport,
  type Recording,
  type RegressionOptions,
} from './lib/xim-regression';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (name: string): boolean => process.argv.includes(`--${name}`);

function readRecording(file: string, label: string): Recording {
  if (!fs.existsSync(file)) {
    console.error(`[ERROR] ${label} recording not found: ${file}`);
    process.exit(2);
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (!Array.isArray(parsed?.messages)) {
      console.error(`[ERROR] ${label} recording has no messages array: ${file}`);
      process.exit(2);
    }
    return parsed as Recording;
  } catch (err) {
    console.error(`[ERROR] ${label} recording is not readable JSON: ${file}`);
    console.error(`        ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  }
}

function main(): void {
  const baselineFile = arg('baseline');
  const currentFile = arg('current');

  if (!baselineFile || !currentFile) {
    console.error('Usage: npm run xim:regression -- --baseline <file> --current <file> [--strict] [--json]');
    console.error('       [--ratio 0.10] [--floor-ms 5] [--compare-data]');
    process.exit(2);
  }

  const baseline = readRecording(baselineFile, 'baseline');
  const current = readRecording(currentFile, 'current');

  if (baseline.door && current.door && baseline.door !== current.door) {
    console.error(`[ERROR] these are different doors: baseline ${baseline.door}, current ${current.door}`);
    process.exit(2);
  }

  const options: RegressionOptions = {};
  const ratio = arg('ratio');
  const floor = arg('floor-ms');
  if (ratio !== undefined) options.timingRatio = Number(ratio);
  if (floor !== undefined) options.timingFloorMs = Number(floor);
  if (has('compare-data')) options.compareData = true;

  const strict = has('strict');
  const report = compareRecordings(baseline, current, options);

  if (has('json')) {
    console.log(JSON.stringify({ ...report, strict, failed: failed(report, strict) }, null, 2));
  } else {
    console.log(formatReport(report, strict));
  }

  process.exit(failed(report, strict) ? 1 : 0);
}

main();
