/**
 * Library call ledger — Tier 2 measurement. Verifies the aggregation that
 * turns raw per-call records into a ranked implement-me backlog.
 */
import { libraryCallLedger } from '../../src/amiga-emulation/instrumentation/library-call-ledger';

// The singleton reads LEDGER at construction; force-enable for the test.
(libraryCallLedger as unknown as { enabled: boolean }).enabled = true;

describe('libraryCallLedger', () => {
  beforeEach(() => libraryCallLedger.reset());

  it('counts calls and attributes them to the current door', () => {
    libraryCallLedger.setCurrentDoor('doorA');
    libraryCallLedger.record('exec.library', -198, 'OpenScreen', 'missing');
    libraryCallLedger.record('exec.library', -198, 'OpenScreen', 'missing');
    libraryCallLedger.setCurrentDoor('doorB');
    libraryCallLedger.record('exec.library', -198, 'OpenScreen', 'missing');

    const snap = libraryCallLedger.snapshot();
    const e = snap.find(s => s.name === 'OpenScreen')!;
    expect(e.count).toBe(3);
    expect(e.doors).toEqual(['doorA', 'doorB']);
    expect(e.resolution).toBe('missing');
  });

  it('keeps the most-implemented resolution when an LVO is seen multiple ways', () => {
    libraryCallLedger.setCurrentDoor('d');
    libraryCallLedger.record('dos.library', -30, 'Open', 'missing');
    libraryCallLedger.record('dos.library', -30, 'Open', 'real'); // real wins
    const e = libraryCallLedger.snapshot().find(s => s.name === 'Open')!;
    expect(e.resolution).toBe('real');
  });

  it('ranks missing and stub ahead of real, then by call count (the backlog)', () => {
    libraryCallLedger.setCurrentDoor('d');
    libraryCallLedger.record('exec.library', -1, 'RealBig', 'real');
    for (let i = 0; i < 5; i++) libraryCallLedger.record('exec.library', -2, 'RealBig', 'real');
    libraryCallLedger.record('exec.library', -3, 'MissingRare', 'missing');
    for (let i = 0; i < 9; i++) libraryCallLedger.record('exec.library', -4, 'MissingHot', 'missing');
    libraryCallLedger.record('exec.library', -5, 'StubOne', 'stub');

    const snap = libraryCallLedger.snapshot();
    // Everything not-real comes first; within that, most-called first.
    expect(snap[0].name).toBe('MissingHot');
    expect(['missing', 'stub']).toContain(snap[0].resolution);
    // real entries sink to the bottom
    expect(snap[snap.length - 1].resolution).toBe('real');
  });

  it('upgrades a placeholder name to a real function name', () => {
    libraryCallLedger.setCurrentDoor('d');
    libraryCallLedger.record('exec.library', -100, 'offset -100', 'missing');
    libraryCallLedger.record('exec.library', -100, 'FindTask', 'missing');
    const e = libraryCallLedger.snapshot().find(s => s.offset === -100)!;
    expect(e.name).toBe('FindTask');
  });

  it('summary tallies resolutions', () => {
    libraryCallLedger.setCurrentDoor('d');
    libraryCallLedger.record('exec.library', -1, 'A', 'real');
    libraryCallLedger.record('exec.library', -2, 'B', 'stub');
    libraryCallLedger.record('exec.library', -3, 'C', 'missing');
    libraryCallLedger.record('exec.library', -4, 'D', 'missing');
    expect(libraryCallLedger.summary()).toEqual({ real: 1, stub: 1, missing: 2 });
  });
});
