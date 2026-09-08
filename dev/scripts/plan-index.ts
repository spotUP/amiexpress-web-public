#!/usr/bin/env ts-node
/**
 * plan-index.ts — the single, GENERATED status index for thoughts/shared/plans/.
 *
 * WHY: plan status kept drifting because it lived in each plan's frontmatter but
 * the work landed in a commit elsewhere, and nobody reopened the plan to flip
 * the field. A hand-maintained INDEX.md would rot the same way and become a
 * SECOND source of truth. So this index is *derived* from the plan frontmatter
 * (the one source) and, where a plan declares a `verify:` grep, cross-checked
 * against the actual tree so a lie is flagged instead of trusted.
 *
 * Frontmatter contract (per plan .md):
 *   status:  implemented | in-progress | not-started | superseded
 *            (legacy values are mapped: complete->implemented, partial->
 *             in-progress, draft/final/none-> UNKNOWN, which reads as needs-triage)
 *   landed:  <commit sha / PR # / short note>   — required once status=implemented
 *   verify:  <extended-regex>                    — optional; a pattern that MUST
 *            be present in the tracked tree once the plan is implemented. Cheap
 *            presence proof (a source pin, not a runtime proof) — enough to catch
 *            "status says done but the code is gone" and the reverse.
 *
 * Usage:
 *   ts-node -P dev/scripts/tsconfig.json dev/scripts/plan-index.ts          # regenerate INDEX.md
 *   ts-node -P dev/scripts/tsconfig.json dev/scripts/plan-index.ts --check  # CI/pre-push: exit 1 on drift or stale INDEX
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import * as yaml from 'js-yaml';

const PLANS_DIR = path.resolve(__dirname, '../../thoughts/shared/plans');
const INDEX_PATH = path.join(PLANS_DIR, 'INDEX.md');
const REGEN_CMD = 'ts-node -P dev/scripts/tsconfig.json dev/scripts/plan-index.ts';

type Status = 'partial' | 'not-started' | 'implemented' | 'superseded' | 'unknown';

const STATUS_ORDER: Status[] = ['partial', 'not-started', 'unknown', 'implemented', 'superseded'];
const STATUS_LABEL: Record<Status, string> = {
  partial: 'Partial — started, work remains (parked, not necessarily active)',
  'not-started': 'Not started',
  unknown: 'Needs triage (legacy status)',
  implemented: 'Implemented',
  superseded: 'Superseded / obsolete',
};

interface PlanRow {
  file: string;
  topic: string;
  date: string;
  status: Status;
  landed: string;
  verify: string;
  verifyResult: 'found' | 'missing' | 'n/a';
  drift: string; // '' when consistent
}

function normaliseStatus(raw: unknown): Status {
  const s = String(raw ?? '').trim().toLowerCase();
  if (s === 'implemented' || s === 'complete' || s === 'done') return 'implemented';
  if (s === 'partial' || s === 'in-progress' || s === 'in progress' || s === 'wip' || s === 'stalled') return 'partial';
  if (s === 'not-started' || s === 'not started' || s === 'todo') return 'not-started';
  if (s === 'superseded' || s === 'obsolete' || s === 'withdrawn' || s === 'abandoned') return 'superseded';
  // draft/final/none/empty: the plan is written but its landing state is unrecorded.
  return 'unknown';
}

function parseFrontmatter(text: string): Record<string, unknown> {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  try {
    const doc = yaml.load(m[1]);
    return doc && typeof doc === 'object' ? (doc as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Presence check: is the plan's verify pattern anywhere in the tracked tree? */
function runVerify(pattern: string): 'found' | 'missing' {
  try {
    // git grep over tracked files only; -q = quiet, exit 0 iff a match exists.
    execFileSync('git', ['grep', '-qE', '--', pattern], { cwd: PLANS_DIR, stdio: 'ignore' });
    return 'found';
  } catch {
    return 'missing';
  }
}

function collect(): PlanRow[] {
  const files = fs
    .readdirSync(PLANS_DIR)
    .filter((f) => f.endsWith('.md') && f !== 'INDEX.md')
    .sort();

  return files.map((file) => {
    const fm = parseFrontmatter(fs.readFileSync(path.join(PLANS_DIR, file), 'utf8'));
    const status = normaliseStatus(fm.status);
    const landed = String(fm.landed ?? '').trim();
    const verify = String(fm.verify ?? '').trim();
    const verifyResult = verify ? runVerify(verify) : 'n/a';

    let drift = '';
    if (status === 'implemented' && !landed) drift = 'implemented but no `landed:`';
    else if (status === 'implemented' && verifyResult === 'missing') drift = 'implemented but verify pattern MISSING from tree';
    else if ((status === 'not-started' || status === 'unknown') && verifyResult === 'found')
      drift = 'status says not-implemented but verify pattern IS in the tree';

    return {
      file,
      topic: String(fm.topic ?? '').replace(/\s+/g, ' ').trim() || '(no topic)',
      date: String(fm.date ?? '').trim(),
      status,
      landed,
      verify,
      verifyResult,
      drift,
    };
  });
}

function render(rows: PlanRow[]): string {
  const now = new Date().toISOString().slice(0, 10);
  const counts = STATUS_ORDER.map((s) => `${STATUS_LABEL[s]}: ${rows.filter((r) => r.status === s).length}`).join(' · ');
  const drifts = rows.filter((r) => r.drift);

  const out: string[] = [];
  out.push('<!-- AUTO-GENERATED by dev/scripts/plan-index.ts — DO NOT EDIT BY HAND.');
  out.push(`     Regenerate:  ${REGEN_CMD}`);
  out.push('     Source of truth is each plan\'s frontmatter (status / landed / verify), not this file. -->');
  out.push('');
  out.push('# Plans index');
  out.push('');
  out.push(`_Generated ${now}. ${rows.length} plans. ${counts}._`);
  out.push('');

  if (drifts.length) {
    out.push('## ⚠ Drift (frontmatter disagrees with the tree)');
    out.push('');
    out.push('| plan | status | problem |');
    out.push('| --- | --- | --- |');
    for (const r of drifts) out.push(`| ${r.file} | ${r.status} | ${r.drift} |`);
    out.push('');
  }

  for (const s of STATUS_ORDER) {
    const group = rows.filter((r) => r.status === s);
    if (!group.length) continue;
    out.push(`## ${STATUS_LABEL[s]} (${group.length})`);
    out.push('');
    out.push('| plan | topic | landed | verify |');
    out.push('| --- | --- | --- | --- |');
    for (const r of group) {
      const v = r.verify ? (r.verifyResult === 'found' ? 'OK' : 'MISSING') : '—';
      out.push(`| ${r.file} | ${r.topic} | ${r.landed || '—'} | ${v} |`);
    }
    out.push('');
  }
  return out.join('\n') + '\n';
}

function main(): void {
  const check = process.argv.includes('--check');
  const rows = collect();
  const generated = render(rows);

  if (check) {
    const problems: string[] = [];
    const onDisk = fs.existsSync(INDEX_PATH) ? fs.readFileSync(INDEX_PATH, 'utf8') : '';
    // Ignore the generated-on date line when comparing staleness.
    const strip = (s: string) => s.replace(/^_Generated .*?\._$/m, '');
    if (strip(onDisk) !== strip(generated)) problems.push(`INDEX.md is stale — regenerate: ${REGEN_CMD}`);
    for (const r of rows.filter((x) => x.drift)) problems.push(`${r.file}: ${r.drift}`);
    if (problems.length) {
      console.error('[plan-index] FAIL:');
      for (const p of problems) console.error('  - ' + p);
      process.exit(1);
    }
    console.log('[plan-index] OK — INDEX.md current, no drift.');
    return;
  }

  fs.writeFileSync(INDEX_PATH, generated);
  const drift = rows.filter((r) => r.drift).length;
  console.log(`[plan-index] wrote ${path.relative(process.cwd(), INDEX_PATH)} (${rows.length} plans, ${drift} drift).`);
}

main();
