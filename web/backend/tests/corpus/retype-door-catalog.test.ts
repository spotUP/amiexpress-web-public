/**
 * Regression tests for dev/scripts/door-corpus/retype-door-catalog.ts — the
 * one-time sweep that re-types door_catalog.door_type rows against the
 * CURRENT detectDoorType (door-installer.ts), which grew DD (DreamDoor) and
 * SIM branches after the catalog was originally built. The script composes
 * entirely tested/reused pieces (resolveArchivePath, getExtractorForFile,
 * matchEntriesByBasename, detectDoorType — none modified here), so per the
 * task's own guidance the one piece of genuinely new logic worth a focused
 * unit test is the classification decision function, classifyRetype: given
 * a row's currently-stored door_type and either a freshly detected type or
 * a skip reason, what should the sweep DO with that row.
 */
// better-sqlite3 lives in web/backend/node_modules and is only resolvable at
// runtime via NODE_PATH (see dev/scripts/door-corpus/retype-door-catalog.ts
// usage comment) — not resolvable from jest's module graph without a virtual
// mock. Mirrors match-installed-doors.test.ts's identical pattern for the
// same reason; nothing under test here touches the DB.
jest.mock('better-sqlite3', () => ({ __esModule: true, default: class {} }), { virtual: true });

import { classifyRetype, RetypeOutcome } from '../../../../dev/scripts/door-corpus/retype-door-catalog';

describe('retype-door-catalog: classifyRetype', () => {
  it('excludes REXX rows unconditionally, even when a detected type is supplied', () => {
    const outcome = classifyRetype({ door_type: 'REXX' }, 'DD');
    expect(outcome).toEqual<RetypeOutcome>({ kind: 'excluded-rexx' });
  });

  it('excludes REXX rows even when detection failed (skip reason present) — REXX is TYPE=-based, never binary-detected', () => {
    const outcome = classifyRetype({ door_type: 'REXX' }, null, 'archive not found');
    expect(outcome).toEqual<RetypeOutcome>({ kind: 'excluded-rexx' });
  });

  it('reports a skip with the given reason when detection failed on a non-REXX row', () => {
    const outcome = classifyRetype({ door_type: 'XIM' }, null, 'no binary_name recorded on row');
    expect(outcome).toEqual<RetypeOutcome>({ kind: 'skip', reason: 'no binary_name recorded on row' });
  });

  it('defaults the skip reason to "unknown" if none was supplied alongside a null detection', () => {
    const outcome = classifyRetype({ door_type: 'XIM' }, null);
    expect(outcome).toEqual<RetypeOutcome>({ kind: 'skip', reason: 'unknown' });
  });

  it('reports unchanged when the freshly detected type matches the stored door_type', () => {
    const outcome = classifyRetype({ door_type: 'XIM' }, 'XIM');
    expect(outcome).toEqual<RetypeOutcome>({ kind: 'unchanged', type: 'XIM' });
  });

  it('reports a changed transition (the DD backfill case: stale XIM re-typed to DD)', () => {
    const outcome = classifyRetype({ door_type: 'XIM' }, 'DD');
    expect(outcome).toEqual<RetypeOutcome>({ kind: 'changed', from: 'XIM', to: 'DD' });
  });

  it('reports a changed transition in the SIM direction too', () => {
    const outcome = classifyRetype({ door_type: 'XIM' }, 'SIM');
    expect(outcome).toEqual<RetypeOutcome>({ kind: 'changed', from: 'XIM', to: 'SIM' });
  });

  it('reports a changed transition even when it is a reversion away from a non-XIM type (stale FIM row whose binary carries no FAMEDoorPort/AEDoorPort marker)', () => {
    const outcome = classifyRetype({ door_type: 'FIM' }, 'XIM');
    expect(outcome).toEqual<RetypeOutcome>({ kind: 'changed', from: 'FIM', to: 'XIM' });
  });
});
