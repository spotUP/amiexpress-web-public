/**
 * Regression test for the FAME/FIM archive-catalog indexing added to
 * dev/scripts/door-corpus/build-door-catalog.ts.
 *
 * Two behaviors under test:
 *  - resolveDoorType: the catalog's door_type column must prefer the
 *    ground-truth binary sniff (detectDoorType on extracted bytes) over
 *    the corpus.json hint, and fall back to 'XIM' when neither is present.
 *    Before this change every catalog row was stamped
 *    `corpusEntry?.doorType ?? 'XIM'` — a FAMEDoorPort binary filed under a
 *    corpus entry with no doorType (or a stale 'XIM' one) would be
 *    mis-stamped XIM instead of FIM.
 *  - isCandidateBinaryEntry: the archive-scan loop that looks for a
 *    primary door binary excluded any filename containing a '.', which
 *    silently skipped every FAME door binary (they ship as `*.fim`, e.g.
 *    `COCAiNE-StAtS.fiM`) and left binary_name/door_type unset for FAME
 *    archives entirely.
 */
import { resolveDoorType, isCandidateBinaryEntry } from '../../../../dev/scripts/door-corpus/build-door-catalog';
import { detectDoorType } from '../../src/doors/door-installer';

describe('build-door-catalog: FAME door_type resolution', () => {
  it('prefers the binary sniff over the corpus.json hint (FAMEDoorPort -> FIM)', () => {
    const hunk = Buffer.from([0x00, 0x00, 0x03, 0xf3]);
    const bin = Buffer.concat([hunk, Buffer.from('...FAMEDoorPort...', 'latin1')]);
    const detected = detectDoorType(bin);
    // Even a stale/incorrect corpus hint of XIM must not win.
    expect(resolveDoorType(detected, 'XIM')).toBe('FIM');
  });

  it('falls back to the corpus.json doorType when no binary was found', () => {
    expect(resolveDoorType(null, 'SIM')).toBe('SIM');
  });

  it('falls back to the historical XIM default when neither is present', () => {
    expect(resolveDoorType(null, undefined)).toBe('XIM');
  });
});

describe('build-door-catalog: primary-binary candidate detection', () => {
  it('still recognizes dot-less binaries (classic AmiExpress convention)', () => {
    expect(isCandidateBinaryEntry('COCAiNE-StAtS/COCAiNE-StAtS')).toBe(true);
  });

  it('recognizes FAME .fim binaries by extension (regression: used to be excluded by the "no dot" rule)', () => {
    expect(isCandidateBinaryEntry('COCAiNE-StAtS/COCAiNE-StAtS.fiM')).toBe(true);
  });

  it('still recognizes .xim/.exe binaries by extension', () => {
    expect(isCandidateBinaryEntry('door.xim')).toBe(true);
    expect(isCandidateBinaryEntry('door.exe')).toBe(true);
  });

  it('rejects doc/text files as binary candidates', () => {
    expect(isCandidateBinaryEntry('COCAiNE-StAtS/COCAiNE-StAtS.doc')).toBe(false);
    expect(isCandidateBinaryEntry('readme.txt')).toBe(false);
  });
});
