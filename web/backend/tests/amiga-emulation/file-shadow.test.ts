/**
 * Session-scoped Empire file shadows: narrow callers read single-column
 * configs while the disk file - and every other node - is untouched.
 *
 * Live driver 2026-09-11: Bulls DUAL_LISTING=YES lays two columns no
 * 40-column screen can hold. The provider serves narrow sessions the same
 * file with the declared narrowValue in place, byte-identical otherwise.
 */

import {
  createEmpireNarrowShadow,
  narrowDeclsFor,
  sessionIsNarrow,
} from '../../src/amiga-emulation/api/file-shadow';

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

  function stageDoor(cfg: string): string {
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
      }),
    );
    return dir;
  }

  function managerFor(dir: string, session: any) {
    const pm = new PathManager(dir);
    pm.setProgDir(dir);
    const fm = new FileManager(dir, pm);
    fm.setCurrentDir('progdir:');
    fm.setShadowProvider(
      createEmpireNarrowShadow({ session, doorDir: dir }),
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
