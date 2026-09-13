/**
 * Run every door's own test runner.
 *
 * Twenty-two doors carry `Doors/<door>/tests/run-tests.ts` and NOTHING ran
 * them: `npm run test:doors` runs `dev/tests/run-tests.ts`, which is the
 * cross-door regression set, and the one workflow that mentioned doors is
 * `door-ci.yml.disabled`. So the thirteen WHIP suites, the tip-of-day suites
 * and the rest were decoration - green or red, nobody found out. This is the
 * script that makes them reachable from `npm test`.
 *
 * Each runner is a separate process on purpose: they are blessed/terminal
 * doors that set global state, and one crashing must not take the rest with
 * it. Every failure is reported, and the exit code is the whole set's.
 *
 * Usage:  npx tsx dev/scripts/run-door-suites.ts [door ...]
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DOORS_DIR = path.join(REPO_ROOT, 'Doors');

interface Outcome {
  door: string;
  ok: boolean;
  ms: number;
  tail: string;
}

function doorsWithSuites(only: string[]): string[] {
  const all = fs
    .readdirSync(DOORS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => fs.existsSync(path.join(DOORS_DIR, name, 'tests', 'run-tests.ts')))
    .sort();
  if (only.length === 0) return all;
  const unknown = only.filter((name) => !all.includes(name));
  if (unknown.length) {
    console.error(`[ERROR] no test runner for: ${unknown.join(', ')}`);
    process.exit(2);
  }
  return only;
}

function runOne(door: string): Outcome {
  const started = Date.now();
  const result = spawnSync('npx', ['tsx', path.join('tests', 'run-tests.ts')], {
    cwd: path.join(DOORS_DIR, door),
    encoding: 'utf8',
    timeout: 5 * 60 * 1000,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  return {
    door,
    ok: result.status === 0,
    ms: Date.now() - started,
    // Enough to name the cause without pasting a whole suite's output.
    tail: output.trim().split('\n').slice(-12).join('\n'),
  };
}

function main(): void {
  const doors = doorsWithSuites(process.argv.slice(2));
  console.log(`[INFO] ${doors.length} door test runner(s)`);

  const outcomes: Outcome[] = [];
  for (const door of doors) {
    process.stdout.write(`  ${door} ... `);
    const outcome = runOne(door);
    outcomes.push(outcome);
    console.log(`${outcome.ok ? '[OK]' : '[FAIL]'} ${(outcome.ms / 1000).toFixed(1)}s`);
  }

  const failed = outcomes.filter((o) => !o.ok);
  if (failed.length === 0) {
    console.log(`[OK] all ${outcomes.length} door suites passed`);
    return;
  }

  for (const outcome of failed) {
    console.error(`\n[FAIL] ${outcome.door}\n${outcome.tail}`);
  }
  console.error(`\n[ERROR] ${failed.length} of ${outcomes.length} door suites failed: ${failed.map((o) => o.door).join(', ')}`);
  process.exit(1);
}

main();
