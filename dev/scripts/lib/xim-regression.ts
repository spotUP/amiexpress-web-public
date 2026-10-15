/**
 * Comparing one XIM recording against another.
 *
 * `xim-record.ts` writes a session as JSON: an ordered list of messages, each
 * with a type, a param, its data and the delay since the previous one. A
 * regression is that file changing shape between two runs of the same door -
 * a message that stopped being sent, one that appeared, a parameter that
 * moved, or the whole session getting slower.
 *
 * Everything here is pure: recordings in, a report out, no filesystem and no
 * clock. The CLI (`dev/scripts/xim-regression.ts`) does the reading, the
 * printing and the exit code. That split is what makes the comparison
 * testable without a door, an emulator or a live board.
 *
 * TIMING IS THE PART TO BE CAREFUL WITH. A door's delays are wall-clock
 * measurements taken on a developer's machine while other things were running,
 * so they are noisy in a way sequence never is. Two guards keep that noise out
 * of the report: a slowdown must beat a RATIO (default 10% per the plan) and
 * also clear an ABSOLUTE floor, because 0.1ms becoming 0.2ms is a doubling
 * that means nothing. Without the floor, the fastest messages in a session -
 * the ones whose timings are pure jitter - produce every finding.
 */

export interface RecordedMessage {
  type: string;
  param: number;
  data: string;
  delay: number;
  timestamp?: string;
  comment?: string;
}

export interface Recording {
  version?: string;
  door: string;
  recorded?: string;
  duration?: number;
  messageCount?: number;
  description?: string;
  messages: RecordedMessage[];
}

export type FindingKind =
  | 'missing-message'
  | 'extra-message'
  | 'type-changed'
  | 'param-changed'
  | 'data-changed'
  | 'timing-slower'
  | 'session-slower'
  | 'error-rate-up';

export interface Finding {
  kind: FindingKind;
  /** Index into the baseline sequence, or the current one for `extra-message`. */
  index: number;
  detail: string;
  baseline?: string | number;
  current?: string | number;
}

export interface RegressionOptions {
  /** A message must be at least this much slower to count. 0.10 = 10%. */
  timingRatio?: number;
  /** ...and at least this many milliseconds slower, to keep jitter out. */
  timingFloorMs?: number;
  /** Compare the `data` payloads too. Off by default: data legitimately
   *  carries names, counts and timestamps that differ every run. */
  compareData?: boolean;
}

export interface RegressionReport {
  door: string;
  ok: boolean;
  findings: Finding[];
  baselineCount: number;
  currentCount: number;
  baselineDuration: number;
  currentDuration: number;
}

const DEFAULTS: Required<RegressionOptions> = {
  timingRatio: 0.10,
  timingFloorMs: 5,
  compareData: false,
};

/** A message counts as an error if the door's own recorder named it one. */
export function isErrorMessage(m: RecordedMessage): boolean {
  return /error|fail/i.test(m.type) || /error|fail/i.test(m.comment ?? '');
}

export function errorRate(messages: RecordedMessage[]): number {
  if (!messages.length) return 0;
  return messages.filter(isErrorMessage).length / messages.length;
}

/**
 * Line up two sequences by position, and report where they stop agreeing.
 *
 * Position, not a longest-common-subsequence: a door's protocol is a fixed
 * order, so "the third message changed" is the truthful reading of a changed
 * third message. An LCS would re-align around it and report a delete plus an
 * insert somewhere else, which reads as two unrelated findings and hides
 * which message actually moved.
 */
export function compareRecordings(
  baseline: Recording,
  current: Recording,
  options: RegressionOptions = {},
): RegressionReport {
  const opts = { ...DEFAULTS, ...options };
  const findings: Finding[] = [];
  const b = baseline.messages ?? [];
  const c = current.messages ?? [];

  const shared = Math.min(b.length, c.length);
  for (let i = 0; i < shared; i++) {
    const bm = b[i];
    const cm = c[i];

    if (bm.type !== cm.type) {
      findings.push({
        kind: 'type-changed',
        index: i,
        detail: `message ${i}: ${bm.type} -> ${cm.type}`,
        baseline: bm.type,
        current: cm.type,
      });
      // The parameter of a different message is a different question, and
      // reporting it too would double-count one change.
      continue;
    }

    if (bm.param !== cm.param) {
      findings.push({
        kind: 'param-changed',
        index: i,
        detail: `message ${i} (${bm.type}): param ${bm.param} -> ${cm.param}`,
        baseline: bm.param,
        current: cm.param,
      });
    }

    if (opts.compareData && bm.data !== cm.data) {
      findings.push({
        kind: 'data-changed',
        index: i,
        detail: `message ${i} (${bm.type}): data changed`,
        baseline: bm.data,
        current: cm.data,
      });
    }

    const slower = cm.delay - bm.delay;
    if (
      bm.delay > 0
      && slower >= opts.timingFloorMs
      && slower / bm.delay >= opts.timingRatio
    ) {
      findings.push({
        kind: 'timing-slower',
        index: i,
        detail:
          `message ${i} (${bm.type}): ${bm.delay}ms -> ${cm.delay}ms`
          + ` (+${Math.round((slower / bm.delay) * 100)}%)`,
        baseline: bm.delay,
        current: cm.delay,
      });
    }
  }

  for (let i = shared; i < b.length; i++) {
    findings.push({
      kind: 'missing-message',
      index: i,
      detail: `message ${i} (${b[i].type}) is no longer sent`,
      baseline: b[i].type,
    });
  }

  for (let i = shared; i < c.length; i++) {
    findings.push({
      kind: 'extra-message',
      index: i,
      detail: `message ${i} (${c[i].type}) is new`,
      current: c[i].type,
    });
  }

  const baselineDuration = baseline.duration ?? 0;
  const currentDuration = current.duration ?? 0;
  if (
    baselineDuration > 0
    && currentDuration - baselineDuration >= opts.timingFloorMs / 1000
    && (currentDuration - baselineDuration) / baselineDuration >= opts.timingRatio
  ) {
    findings.push({
      kind: 'session-slower',
      index: -1,
      detail:
        `the session took ${baselineDuration}s and now takes ${currentDuration}s`
        + ` (+${Math.round(((currentDuration - baselineDuration) / baselineDuration) * 100)}%)`,
      baseline: baselineDuration,
      current: currentDuration,
    });
  }

  const before = errorRate(b);
  const after = errorRate(c);
  if (after > before) {
    findings.push({
      kind: 'error-rate-up',
      index: -1,
      detail: `errors went from ${(before * 100).toFixed(1)}% to ${(after * 100).toFixed(1)}% of messages`,
      baseline: before,
      current: after,
    });
  }

  return {
    door: baseline.door || current.door,
    ok: findings.length === 0,
    findings,
    baselineCount: b.length,
    currentCount: c.length,
    baselineDuration,
    currentDuration,
  };
}

/**
 * Which findings fail a run.
 *
 * Without `--strict`, a timing wobble is reported but does not fail: the
 * whole point of the floor and the ratio is that timings are the noisy half,
 * and a gate that cries wolf on a busy laptop is a gate people stop running.
 * A sequence change is never noise, so it always fails.
 */
export function isFatal(finding: Finding, strict: boolean): boolean {
  if (strict) return true;
  return finding.kind !== 'timing-slower' && finding.kind !== 'session-slower';
}

export function failed(report: RegressionReport, strict: boolean): boolean {
  return report.findings.some((f) => isFatal(f, strict));
}

/** ASCII tokens, never emoji: this prints to terminals and CI logs. */
export function formatReport(report: RegressionReport, strict = false): string {
  const lines: string[] = [];
  lines.push(`XIM regression: ${report.door}`);
  lines.push(
    `  baseline ${report.baselineCount} message(s), ${report.baselineDuration}s`
    + `  ->  current ${report.currentCount} message(s), ${report.currentDuration}s`,
  );
  if (report.ok) {
    lines.push('  [OK] no differences');
    return lines.join('\n');
  }
  for (const f of report.findings) {
    lines.push(`  ${isFatal(f, strict) ? '[FAIL]' : '[WARN]'} ${f.kind}: ${f.detail}`);
  }
  const fatal = report.findings.filter((f) => isFatal(f, strict)).length;
  lines.push(
    fatal
      ? `  ${fatal} of ${report.findings.length} finding(s) fail this run`
      : `  ${report.findings.length} finding(s), none fatal without --strict`,
  );
  return lines.join('\n');
}
