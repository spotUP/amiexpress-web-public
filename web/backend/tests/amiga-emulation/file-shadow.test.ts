/**
 * Session-scoped Empire file shadows: narrow callers read single-column
 * configs while the disk file - and every other node - is untouched.
 *
 * Live driver 2026-09-11: Bulls DUAL_LISTING=YES lays two columns no
 * 40-column screen can hold. The provider serves narrow sessions the same
 * file with the declared narrowValue in place, byte-identical otherwise.
 */

import {
  artDeclsFor,
  createEmpireNarrowShadow,
  narrowDeclsFor,
  sessionIsNarrow,
} from '../../src/amiga-emulation/api/file-shadow';
import { getSectionBody, parseEmpireFile } from '../../src/doors/text-cfg/empire';

const CFG = [
  'DUAL_LISTING       YES                 ; Use 2 Listings [YES/NO]',
  'CURSOR_KEYS        YES                 ; Use cursor keys',
  '[Init_END] ====================================================================',
].join('\n');

const MANIFEST = {
  command: 'B',
  cfgFile: 'Bulls.CFG',
  cfgFormat: 'empire',
  settings: [
    { key: 'dual_listing', label: 'Dual listing (bulletins)', type: 'choice', default: 'YES',
      cfgKey: 'DUAL_LISTING', narrowValue: 'NO' },
    { key: 'cursor_keys', label: 'Cursor keys', type: 'choice', default: 'YES', cfgKey: 'CURSOR_KEYS' },
  ],
};

const ANSI80 = { petsciiMode: false, texttvMode: false, screenWidth: 80 };
const C64 = { petsciiMode: true, texttvMode: false, petsciiColumns: 40, screenWidth: 40, terminalType: 'c64' };
const P8 = { petsciiMode: true, texttvMode: false, petsciiColumns: 80, screenWidth: 80 };
const TELETEXT = { petsciiMode: false, texttvMode: true, screenWidth: 40 };

function provider(session: any, manifest: any = MANIFEST, cfg: string = CFG) {
  return createEmpireNarrowShadow({
    session,
    doorDir: '/doors/emp_tools',
    readManifest: () => manifest,
    readFile: () => Buffer.from(cfg, 'latin1'),
  });
}

describe('sessionIsNarrow', () => {
  test('ansi-80 is wide, c64 and teletext are narrow, wide-petscii is wide', () => {
    expect(sessionIsNarrow(ANSI80)).toBe(false);
    expect(sessionIsNarrow(C64)).toBe(true);
    expect(sessionIsNarrow(TELETEXT)).toBe(true);
    expect(sessionIsNarrow(P8)).toBe(false);
    expect(sessionIsNarrow(undefined)).toBe(false);
  });
});

describe('narrowDeclsFor', () => {
  test('collects only narrowValue settings with file bindings', () => {
    expect(narrowDeclsFor(MANIFEST)).toEqual([
      { file: 'Bulls.CFG', key: 'DUAL_LISTING', section: 'init', value: 'NO' },
    ]);
  });
  test('malformed manifests declare nothing, never throw', () => {
    expect(narrowDeclsFor(null)).toEqual([]);
    expect(narrowDeclsFor({})).toEqual([]);
    expect(narrowDeclsFor({ settings: 'nope' })).toEqual([]);
  });
});

describe('createEmpireNarrowShadow', () => {
  test('narrow session reads DUAL_LISTING as NO, padded to the field', () => {
    const shadow = provider(C64)('PROGDIR:Bulls.CFG', '/doors/emp_tools/Bulls.CFG', 1005)!;
    expect(shadow).not.toBeNull();
    const text = shadow.toString('latin1');
    expect(text).toContain('DUAL_LISTING       NO');
    // Same length, same everything else: one value changed, not a rewrite.
    expect(shadow.length).toBe(Buffer.from(CFG, 'latin1').length);
    expect(text).toContain('CURSOR_KEYS        YES');
    expect(text).toContain('[Init_END]');
  });

  test('wide session takes the disk path', () => {
    expect(provider(ANSI80)('PROGDIR:Bulls.CFG', '/doors/emp_tools/Bulls.CFG', 1005)).toBeNull();
  });

  test('already-narrow file takes the disk path (no-op shadow)', () => {
    const narrow = CFG.replace('YES                 ; Use 2', 'NO                  ; Use 2');
    const p = provider(C64, MANIFEST, narrow);
    expect(p('PROGDIR:Bulls.CFG', '/doors/emp_tools/Bulls.CFG', 1005)).toBeNull();
  });

  test('undeclared files and missing keys take the disk path', () => {
    const p = provider(C64);
    expect(p('PROGDIR:joincnf.cfg', '/doors/emp_tools/joincnf.cfg', 1005)).toBeNull();
    const noKey = provider(C64, MANIFEST, 'CURSOR_KEYS        YES\n[Init_END] ===\n');
    expect(noKey('PROGDIR:Bulls.CFG', '/doors/emp_tools/Bulls.CFG', 1005)).toBeNull();
  });

  test('filename matches case-insensitively', () => {
    const p = provider(C64);
    expect(p('PROGDIR:bulls.cfg', '/doors/emp_tools/BULLS.CFG', 1005)).not.toBeNull();
  });

  test('garbage bytes, missing manifest and missing file never throw', () => {
    const garbage = provider(C64, MANIFEST, '\x00\x01\x02binary\xff\xfe');
    expect(garbage('PROGDIR:Bulls.CFG', '/x/Bulls.CFG', 1005)).toBeNull();
    const noManifest = createEmpireNarrowShadow({
      session: C64, doorDir: '/x', readManifest: () => { throw new Error('nope'); },
      readFile: () => Buffer.from(CFG, 'latin1'),
    });
    expect(noManifest('PROGDIR:Bulls.CFG', '/x/Bulls.CFG', 1005)).toBeNull();
    const noFile = createEmpireNarrowShadow({
      session: C64, doorDir: '/x', readManifest: () => MANIFEST, readFile: () => null,
    });
    expect(noFile('PROGDIR:Bulls.CFG', '/x/Bulls.CFG', 1005)).toBeNull();
  });
});

describe('FileManager shadow branch', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { FileManager } = require('../../src/amiga-emulation/api/FileManager');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PathManager } = require('../../src/amiga-emulation/api/PathManager');

  function stageDoor(cfg: string, artSections?: unknown): string {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-door-'));
    fs.writeFileSync(path.join(dir, 'Bulls.CFG'), cfg, 'latin1');
    fs.writeFileSync(
      path.join(dir, 'door.settings.json'),
      JSON.stringify({
        command: 'B', cfgFile: 'Bulls.CFG', cfgFormat: 'empire',
        settings: [
          { key: 'dual_listing', label: 'Dual listing (bulletins)', type: 'choice',
            default: 'YES', cfgKey: 'DUAL_LISTING', narrowValue: 'NO',
            choices: [{ value: 'YES', label: 'Yes' }, { value: 'NO', label: 'No' }] },
        ],
        ...(artSections ? { artSections } : {}),
      }),
    );
    return dir;
  }

  function managerFor(dir: string, session: any, artRoot?: string) {
    const pm = new PathManager(dir);
    pm.setProgDir(dir);
    const fm = new FileManager(dir, pm);
    fm.setCurrentDir('progdir:');
    fm.setShadowProvider(
      createEmpireNarrowShadow({ session, doorDir: dir, artRoot }),
    );
    return fm;
  }

  function readAll(fm: any, bptr: number): string {
    let out = '';
    for (;;) {
      const chunk = fm.read(bptr, 512);
      if (!chunk || chunk.length === 0) break;
      out += chunk.toString('latin1');
    }
    return out;
  }

  test('narrow open reads NO, wide open reads YES, disk never changes', () => {
    const fs = require('fs');
    const path = require('path');
    const dir = stageDoor(CFG);
    const narrow = managerFor(dir, C64);
    const bptr = narrow.open('PROGDIR:Bulls.CFG', 1005);
    expect(bptr).toBeGreaterThan(0);
    expect(readAll(narrow, bptr)).toContain('DUAL_LISTING       NO');
    narrow.close(bptr);

    const wide = managerFor(dir, ANSI80);
    const bptr2 = wide.open('PROGDIR:Bulls.CFG', 1005);
    expect(bptr2).toBeGreaterThan(0);
    expect(readAll(wide, bptr2)).toContain('DUAL_LISTING       YES');
    wide.close(bptr2);

    expect(fs.readFileSync(path.join(dir, 'Bulls.CFG'), 'latin1')).toContain('DUAL_LISTING       YES');
  });

  /**
   * REACHABILITY: the drawing reaches the DOOR, not just the provider.
   *
   * Bulls opens `DOORS:EmP_Tools/Bulls.CFG` and prints what it finds between
   * the body and `[Title_END]`. This drives the same FileManager open the
   * door drives, through the real provider and the real store on disk, and
   * reads the bytes the door would have been handed.
   */
  describe('the drawing reaches the door', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { writeVariant } = require('../../src/doors/door-art-variants');
    const fs = require('fs');
    const os = require('os');
    const path = require('path');

    const TITLE_CFG = [
      'DUAL_LISTING       YES                 ; Use 2 Listings [YES/NO]',
      '[Init_END] ====================================================================',
      '\x1b[36m     ________  EIGHTY COLUMN LOGO',
      '[Title_END] ==================================================================',
    ].join('\n');

    const ART = [
      { file: 'Bulls.CFG', section: 'title', label: 'Title logo', maxLines: 20, maxLineLength: 200, commands: ['B'] },
    ];

    function artRootDir(): string {
      return fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-art-'));
    }

    /** The title body of the bytes the door reads for its own config. */
    function titleTheDoorReads(session: any, artRoot: string, dir: string): string[] | undefined {
      const fm = managerFor(dir, session, artRoot);
      const bptr = fm.open('PROGDIR:Bulls.CFG', 1005);
      expect(bptr).toBeGreaterThan(0);
      const served = readAll(fm, bptr);
      fm.close(bptr);
      return getSectionBody(parseEmpireFile(served), 'title');
    }

    test('a 40-column PETSCII caller reads the drawing the sysop made for him', () => {
      const dir = stageDoor(TITLE_CFG, ART);
      const artRoot = artRootDir();
      try {
        writeVariant(artRoot, 'B', 'title', 'c64', ['  UP ROUGH BULLS']);
        expect(titleTheDoorReads({ ...C64, doorCommand: 'B' }, artRoot, dir))
          .toEqual(['  UP ROUGH BULLS']);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
        fs.rmSync(artRoot, { recursive: true, force: true });
      }
    });

    test('a teletext caller with no drawing of his own reads the wide art', () => {
      const dir = stageDoor(TITLE_CFG, ART);
      const artRoot = artRootDir();
      try {
        writeVariant(artRoot, 'B', 'title', 'c64', ['  UP ROUGH BULLS']);
        expect(titleTheDoorReads({ ...TELETEXT, doorCommand: 'B' }, artRoot, dir))
          .toEqual(['\x1b[36m     ________  EIGHTY COLUMN LOGO']);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
        fs.rmSync(artRoot, { recursive: true, force: true });
      }
    });

    test('an 80-column caller reads the file on disk, byte for byte', () => {
      const dir = stageDoor(TITLE_CFG, ART);
      const artRoot = artRootDir();
      try {
        writeVariant(artRoot, 'B', 'title', 'c64', ['  UP ROUGH BULLS']);
        const fm = managerFor(dir, { ...ANSI80, doorCommand: 'B' }, artRoot);
        const bptr = fm.open('PROGDIR:Bulls.CFG', 1005);
        const served = readAll(fm, bptr);
        fm.close(bptr);
        expect(served).toBe(fs.readFileSync(path.join(dir, 'Bulls.CFG'), 'latin1'));
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
        fs.rmSync(artRoot, { recursive: true, force: true });
      }
    });

    test('the drawing on disk is never written by the door reading it', () => {
      const dir = stageDoor(TITLE_CFG, ART);
      const artRoot = artRootDir();
      try {
        writeVariant(artRoot, 'B', 'title', 'c64', ['  UP ROUGH BULLS']);
        const before = fs.readFileSync(path.join(dir, 'Bulls.CFG'), 'latin1');
        titleTheDoorReads({ ...C64, doorCommand: 'B' }, artRoot, dir);
        expect(fs.readFileSync(path.join(dir, 'Bulls.CFG'), 'latin1')).toBe(before);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
        fs.rmSync(artRoot, { recursive: true, force: true });
      }
    });
  });

  test('no provider means no shadow, and unshadowed doors behave as before', () => {
    const dir = stageDoor(CFG);
    const pm = new PathManager(dir);
    pm.setProgDir(dir);
    const fm = new FileManager(dir, pm);
    fm.setCurrentDir('progdir:');
    const bptr = fm.open('PROGDIR:Bulls.CFG', 1005);
    expect(bptr).toBeGreaterThan(0);
    expect(readAll(fm, bptr)).toContain('DUAL_LISTING       YES');
    fm.close(bptr);
  });
});

/**
 * Narrow ART, not just narrow VALUES.
 *
 * An 80-column logo has no seams to fold on, so the frame adapter can only
 * crop it and the caller reads half a drawing (sysop, 2026-09-14). The
 * sysop draws a 40-column one and the shadow serves it in the door's own
 * file, where the door will print it itself.
 */
const ART_CFG = [
  'DUAL_LISTING       YES                 ; Use 2 Listings [YES/NO]',
  'CURSOR_KEYS        YES                 ; Use cursor keys',
  '[Init_END] ====================================================================',
  '\x1b[36m     ________  WIDE LOGO ROW ONE',
  '     \\______/  WIDE LOGO ROW TWO',
  '[Title_END] ==================================================================',
].join('\n');

const ART_MANIFEST = {
  ...MANIFEST,
  artSections: [
    { file: 'Bulls.CFG', section: 'title', label: 'Title logo', maxLines: 20, maxLineLength: 200, commands: ['B'] },
  ],
};

const NARROW_ART = ['\x1b[36m  NARROW LOGO', '  -----------'];

function artProvider(session: any, variants: Record<string, string[]> = {}) {
  return createEmpireNarrowShadow({
    session,
    doorDir: '/doors/emp_tools',
    readManifest: () => ART_MANIFEST,
    readFile: () => Buffer.from(ART_CFG, 'latin1'),
    readVariantLines: (command: string, section: string, alphabet: string) =>
      variants[`${command}:${section}:${alphabet}`] ?? null,
  });
}

/** The body of one section of a served file, as lines. */
function servedSection(bytes: Buffer | null, section: string): string[] | undefined {
  if (!bytes) return undefined;
  return getSectionBody(parseEmpireFile(bytes.toString('latin1')), section);
}

const DISK_TITLE = servedSection(Buffer.from(ART_CFG, 'latin1'), 'title');

describe('artDeclsFor', () => {
  test('collects the manifest art sections, and nothing from a malformed one', () => {
    expect(artDeclsFor(ART_MANIFEST)).toEqual([
      { file: 'Bulls.CFG', section: 'title', commands: ['B'] },
    ]);
    expect(artDeclsFor(null)).toEqual([]);
    expect(artDeclsFor({})).toEqual([]);
    expect(artDeclsFor({ artSections: 'nope' })).toEqual([]);
    expect(artDeclsFor({ artSections: [{ file: 'x' }] })).toEqual([]);
  });
  test('art with no commands belongs to every command', () => {
    expect(artDeclsFor({ artSections: [{ file: 'a.cfg', section: 'title' }] }))
      .toEqual([{ file: 'a.cfg', section: 'title', commands: null }]);
  });
});

describe('narrow art variants', () => {
  const C64_SESSION = { ...C64, doorCommand: 'B' };
  const TTX_SESSION = { ...TELETEXT, doorCommand: 'B' };

  test('a 40-column PETSCII caller is served the c64 drawing', () => {
    const p = artProvider(C64_SESSION, { 'B:title:c64': NARROW_ART });
    expect(servedSection(p('', '/doors/emp_tools/Bulls.CFG', 1005), 'title')).toEqual(NARROW_ART);
  });

  test('a teletext caller is served the teletext drawing, not the c64 one', () => {
    const p = artProvider(TTX_SESSION, { 'B:title:c64': NARROW_ART, 'B:title:ttx': ['TTX ART'] });
    expect(servedSection(p('', '/doors/emp_tools/Bulls.CFG', 1005), 'title')).toEqual(['TTX ART']);
  });

  test('an 80-column caller reads the file on disk: the provider declines', () => {
    const p = artProvider({ ...ANSI80, doorCommand: 'B' }, { 'B:title:c64': NARROW_ART });
    expect(p('', '/doors/emp_tools/Bulls.CFG', 1005)).toBeNull();
  });

  test('no drawing for this alphabet leaves the wide art in place', () => {
    const p = artProvider(C64_SESSION, { 'B:title:ttx': ['TTX ART'] });
    expect(servedSection(p('', '/doors/emp_tools/Bulls.CFG', 1005), 'title')).toEqual(DISK_TITLE);
  });

  test('art for ANOTHER door is not served for this one', () => {
    const p = artProvider({ ...C64, doorCommand: 'J' }, { 'B:title:c64': NARROW_ART });
    expect(servedSection(p('', '/doors/emp_tools/Bulls.CFG', 1005), 'title')).toEqual(DISK_TITLE);
  });

  test('EVERY OTHER BYTE of the file is what it was: only the title body moves', () => {
    const p = artProvider(C64_SESSION, { 'B:title:c64': NARROW_ART });
    const served = p('', '/doors/emp_tools/Bulls.CFG', 1005)!.toString('latin1');
    // `setKv` keeps the column the comment sits in, so a shorter value is
    // padded - that alignment is part of "every other byte".
    const expected = ART_CFG
      .replace('DUAL_LISTING       YES', 'DUAL_LISTING       NO ')
      .replace(
        '\x1b[36m     ________  WIDE LOGO ROW ONE\n     \\______/  WIDE LOGO ROW TWO',
        NARROW_ART.join('\n'),
      );
    expect(served).toBe(expected);
  });

  test('a drawing is served even when no narrow VALUE changed', () => {
    const p = createEmpireNarrowShadow({
      session: C64_SESSION,
      doorDir: '/doors/emp_tools',
      readManifest: () => ({ ...ART_MANIFEST, settings: [] }),
      readFile: () => Buffer.from(ART_CFG, 'latin1'),
      readVariantLines: () => NARROW_ART,
    });
    expect(servedSection(p('', '/doors/emp_tools/Bulls.CFG', 1005), 'title')).toEqual(NARROW_ART);
  });

  test('an empty drawing is not a drawing: the wide art stands', () => {
    // The file is still served - DUAL_LISTING changed - but the logo it
    // carries is the door's own. A variant saved and then emptied must
    // restore the wide art, never blank the screen.
    const p = artProvider(C64_SESSION, { 'B:title:c64': [] });
    expect(servedSection(p('', '/doors/emp_tools/Bulls.CFG', 1005), 'title')).toEqual(DISK_TITLE);
  });
});
