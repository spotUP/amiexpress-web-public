/**
 * The TP-16 ratchet: the number of UNPROVEN reachability rows may never rise.
 *
 * The plan says "the ratchet (the count of not-DONE IDs) is committed and CI
 * fails if it rises". A checklist in a gitignored directory cannot do that -
 * CI never sees it - so the ledger lives at
 * `thoughts/shared/plans/2026-09-03-ssh-telnet-parity-reachability/` and this
 * test is what actually enforces it.
 *
 * It reads the committed CHECKLIST.md, counts the ticked and unticked IDs, and
 * fails if the open count exceeds OPEN_MAX or if the two disagree with the
 * header's own running count. Lowering OPEN_MAX is the deliberate act of
 * earning a row; raising it should never happen, and a reviewer seeing it in a
 * diff is the point.
 *
 * Deliberately NOT asserted here: whether each row's evidence is sound. That
 * is each row's own test. This only stops the ledger drifting.
 */
import * as fs from 'fs';
import * as path from 'path';

const LEDGER = path.resolve(
  __dirname, '..', '..', '..', '..',
  'thoughts', 'shared', 'plans', '2026-09-03-ssh-telnet-parity-reachability',
);

/** Lower this when a row is earned. Never raise it. */
const OPEN_MAX = 13;
const TOTAL_IDS = 19;

describe('TP-16 reachability ratchet', () => {
  const checklist = fs.readFileSync(path.join(LEDGER, 'CHECKLIST.md'), 'utf8');

  const done = (checklist.match(/^- \[x\] /gmi) ?? []).length;
  const open = (checklist.match(/^- \[ \] /gm) ?? []).length;

  test('every reachability ID is accounted for, ticked or open', () => {
    expect(done + open).toBe(TOTAL_IDS);
  });

  test('the open count has not risen', () => {
    expect(open).toBeLessThanOrEqual(OPEN_MAX);
  });

  test('the header\'s running count matches the boxes', () => {
    const header = /Running count: (\d+) of (\d+) done, (\d+) open/.exec(checklist);
    expect(header).not.toBeNull();
    expect(Number(header![1])).toBe(done);
    expect(Number(header![2])).toBe(TOTAL_IDS);
    expect(Number(header![3])).toBe(open);
  });

  test('REACHED.tsv carries a row for every ticked ID, R0 first', () => {
    const tsv = fs.readFileSync(path.join(LEDGER, 'REACHED.tsv'), 'utf8')
      .split('\n').filter((l) => l.trim().length > 0);
    const header = tsv[0].split('\t');
    expect(header).toEqual(['id', 'entry_point', 'symbols', 'call_counts', 'timestamp', 'commit']);
    const rows = tsv.slice(1);
    expect(rows.length).toBe(done);
    expect(rows[0].split('\t')[0]).toBe('R0');
    // A row whose count is zero is a FAILED item, not a pass.
    for (const r of rows) {
      const counts = r.split('\t')[3] ?? '';
      expect(counts).not.toMatch(/(^|[^A-Z])LIVE=0(\b|$)/);
    }
  });
});
