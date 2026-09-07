/**
 * The release-group logo pack: a workflow, not an importer.
 *
 * A sysop's friend draws at 40 columns in Petmate, exports SEQ, and drops
 * `<GROUP>.seq` into `Screens/groups/`. That is the whole authoring side, and
 * this suite pins the board's half: the key a group name becomes, the
 * resolver that never returns nothing, the height cap, `GROUPS.MAP`, and the
 * two BYTE-LEVEL TRAPS in Petmate's exporter that would otherwise be advice in
 * a comment nobody reads.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  normaliseGroupKey,
  resolveGroupLogo,
  resetGroupLogoCache,
  parseGroupsMap,
  groupForFilename,
  seqRowCount,
  MAX_LOGO_ROWS,
} from '../../src/services/group-logo.service';

let tmp = '';
const groupsPath = () => path.join(tmp, 'Screens', 'groups');
const writeLogo = (name: string, bytes: Buffer | string) =>
  fs.writeFileSync(path.join(groupsPath(), name), bytes as any);

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'group-logo-'));
  fs.mkdirSync(path.join(tmp, 'Screens', 'groups'), { recursive: true });
  resetGroupLogoCache();
});

afterEach(() => {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* noop */ }
  resetGroupLogoCache();
});

describe('the key a group name becomes', () => {
  it('is the spec\'s own table', () => {
    expect(normaliseGroupKey('Outlaws')).toBe('OUTLAWS');
    expect(normaliseGroupKey('New Order')).toBe('NEWORDER');
    expect(normaliseGroupKey('/X-POWER')).toBe('XPOWER');
    expect(normaliseGroupKey('5D')).toBe('5D');
    expect(normaliseGroupKey('Mystic!')).toBe('MYSTIC');
    expect(normaliseGroupKey('TRSI')).toBe('TRSI');
  });

  it('folds accents to the base letter, so one group is one file', () => {
    expect(normaliseGroupKey('Möbius')).toBe(normaliseGroupKey('Mobius'));
    expect(normaliseGroupKey('Ångström')).toBe('ANGSTROM');
  });

  it('deletes punctuation rather than replacing it, so a key needs no quoting', () => {
    expect(normaliseGroupKey('The Company!')).toBe('THECOMPANY');
    expect(normaliseGroupKey('...')).toBe('');
  });

  it('clips to twenty characters', () => {
    expect(normaliseGroupKey('A'.repeat(50))).toHaveLength(20);
  });

  it('has no key for a name with nothing in it, and therefore no logo', () => {
    expect(normaliseGroupKey('')).toBe('');
    expect(resolveGroupLogo(tmp, '', { columns: 40 })).toEqual({ kind: 'name', line: '' });
  });
});

describe('the resolver never returns nothing', () => {
  it('gives the name when there is no art at all', () => {
    expect(resolveGroupLogo(tmp, 'Paradox', { columns: 40 }))
      .toEqual({ kind: 'name', line: 'PARADOX' });
  });

  it('gives the .seq bytes to a C64', () => {
    writeLogo('PARADOX.seq', Buffer.from([0x0e, 0x05, 0x50, 0x44, 0x58, 0x0d]));
    const logo = resolveGroupLogo(tmp, 'Paradox', { columns: 40 });
    expect(logo.kind).toBe('seq');
    if (logo.kind === 'seq') expect(logo.bytes[0]).toBe(0x0e);
  });

  it('finds the file whatever case it is on disk', () => {
    writeLogo('paradox.SEQ', Buffer.from([0x0e, 0x41, 0x0d]));
    expect(resolveGroupLogo(tmp, 'PARADOX', { columns: 40 }).kind).toBe('seq');
  });

  it('never sends raw C64 bytes to an 80-column caller', () => {
    writeLogo('PARADOX.seq', Buffer.from([0x0e, 0x41, 0x0d]));
    // No .txt exists, and a .seq must not stand in for one.
    expect(resolveGroupLogo(tmp, 'Paradox', { columns: 80 }))
      .toEqual({ kind: 'name', line: 'PARADOX' });
  });

  it('clips the name form to the caller\'s width', () => {
    const long = 'A'.repeat(60);
    expect(resolveGroupLogo(tmp, long, { columns: 40 })).toEqual({ kind: 'name', line: 'A'.repeat(40) });
  });
});

describe('the height cap', () => {
  it('counts rows by the returns Petmate writes, $0D and $8D alike', () => {
    // $8D is what appendCR emits when the cell before it was reversed.
    expect(seqRowCount(Buffer.from([0x41, 0x0d, 0x42, 0x8d, 0x43]))).toBe(3);
  });

  it('does not count a trailing return as an extra row', () => {
    expect(seqRowCount(Buffer.from([0x41, 0x0d]))).toBe(1);
  });

  it('REFUSES art taller than the cap rather than truncating it', () => {
    // Silently cutting art is the thing this whole design exists to stop.
    const tall = Buffer.from(Array.from({ length: MAX_LOGO_ROWS + 1 }, () => [0x41, 0x0d]).flat());
    expect(seqRowCount(tall)).toBe(MAX_LOGO_ROWS + 1);
    writeLogo('TALL.seq', tall);
    expect(resolveGroupLogo(tmp, 'Tall', { columns: 40 })).toEqual({ kind: 'name', line: 'TALL' });
  });

  it('accepts art exactly at the cap', () => {
    const exact = Buffer.from(Array.from({ length: MAX_LOGO_ROWS }, () => [0x41, 0x0d]).flat());
    writeLogo('FIT.seq', exact);
    expect(resolveGroupLogo(tmp, 'Fit', { columns: 40 }).kind).toBe('seq');
  });
});

describe('the two Petmate byte traps, as executable facts', () => {
  it('TRAP 1: the exporter leaves reverse set across a row break', () => {
    // `appendCR` emits `currev ? 0x0d : 0x8d` and does NOT clear `currev`. On a
    // real C64 - and in our machine - a return CANCELS reverse, so the first
    // reversed cell of the NEXT row comes out un-reversed. It is predictable
    // and avoidable (ask for art whose row ends are not reversed), and it is
    // pinned here so it stays a known fact rather than a surprise.
    const bytes = Buffer.from([0x12, 0x41, 0x0d, 0x42, 0x92]);
    // The row break is still a row break: the count is what matters to the cap.
    expect(seqRowCount(bytes)).toBe(2);
    // And the file is served as-is - the resolver never rewrites art.
    writeLogo('REV.seq', bytes);
    const logo = resolveGroupLogo(tmp, 'Rev', { columns: 40 });
    expect(logo.kind).toBe('seq');
    if (logo.kind === 'seq') expect(Array.from(logo.bytes)).toEqual([0x12, 0x41, 0x0d, 0x42, 0x92]);
  });

  it('TRAP 2: pi exports as $FF where we would write $DE, and both are pi', () => {
    // Both decode to screen code $5E, so it is an equivalent encoding rather
    // than a bug - but a byte-identity test over a Petmate round trip has to
    // accept either, and this is where that is written down.
    const { printablePetsciiToScreenCode } = require('@amiexpress/bbs-door-sdk/petscii');
    expect(printablePetsciiToScreenCode(0xff)).toBe(0x5e);
    expect(printablePetsciiToScreenCode(0xde)).toBe(0x5e);
  });
});

describe('GROUPS.MAP - the sysop correction that beats every derived source', () => {
  it('matches a filename glob, first rule wins', () => {
    const rules = parseGroupsMap([
      '# filename glob = group name',
      'OTL-*    = Outlaws',
      'PDX*     = Paradox',
      'PDX-DEMO*= Paradox Demo Division',
    ].join('\n'));
    expect(rules).toHaveLength(3);
    fs.writeFileSync(path.join(groupsPath(), 'GROUPS.MAP'),
      'OTL-*    = Outlaws\nPDX*     = Paradox\n', 'utf8');
    expect(groupForFilename(tmp, 'OTL-INTRO.LHA')).toBe('Outlaws');
    expect(groupForFilename(tmp, 'pdx-crack.zip')).toBe('Paradox');
    expect(groupForFilename(tmp, 'SOMETHING.LHA')).toBeUndefined();
  });

  it('ignores comments and blank lines', () => {
    expect(parseGroupsMap('# nothing\n\n   \n')).toEqual([]);
  });

  it('is re-read when the sysop edits it', () => {
    const map = path.join(groupsPath(), 'GROUPS.MAP');
    fs.writeFileSync(map, 'A* = Alpha\n', 'utf8');
    expect(groupForFilename(tmp, 'ABC.LHA')).toBe('Alpha');

    fs.writeFileSync(map, 'A* = Beta\n', 'utf8');
    fs.utimesSync(map, new Date(Date.now() + 2000), new Date(Date.now() + 2000));
    expect(groupForFilename(tmp, 'ABC.LHA')).toBe('Beta');
  });
});
