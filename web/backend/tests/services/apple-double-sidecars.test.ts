/**
 * A copy's shadow is not a registration.
 *
 * macOS writes an AppleDouble sidecar beside every file it copies to a
 * non-native filesystem: `._EnglishFrench.info` next to `EnglishFrench.info`.
 * They travel with any archive unpacked on a Mac, and this board has four of
 * them in Languages/ - the admin listed them as languages, with `._` as their
 * code, above the four real ones. Reported 2026-09-01.
 *
 * The same scan builds the COMMAND REGISTRY, and a registration owns its
 * command name whether or not anything is behind it
 * (amiga-command-parser.util.ts) - so a stray `._DOORREPO.info` would take
 * the name DOORREPO with it. One rule, used by every scan.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { isRealInfoFile } from '../../src/utils/info-file.util';
import { scanCommandDirectory } from '../../src/utils/amiga-command-parser.util';

describe('AppleDouble sidecars', () => {
  it('are not .info files', () => {
    expect(isRealInfoFile('EnglishFrench.info')).toBe(true);
    expect(isRealInfoFile('._EnglishFrench.info')).toBe(false);
    expect(isRealInfoFile('/app/data/bbs/Languages/._GermanEnglish.info')).toBe(false);
    expect(isRealInfoFile('.DS_Store')).toBe(false);
    expect(isRealInfoFile('DOORREPO.INFO')).toBe(true);
    expect(isRealInfoFile('readme.txt')).toBe(false);
  });

  it('never own a command name', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-sidecar-'));
    const bbscmd = path.join(root, 'Commands', 'BBSCmd');
    fs.mkdirSync(bbscmd, { recursive: true });
    fs.mkdirSync(path.join(root, 'Doors', 'a-door'), { recursive: true });

    // A real registration pointing at a door that EXISTS in this tree - a
    // registration whose LOCATION resolves to nothing is dropped by
    // commandLocationIsLive, which would hide the sidecar for the wrong
    // reason and let this test pass on the unfiltered scan.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { parseInfoFile, writeInfoFile } = require('../../src/utils/info-file.util');
    const template = path.join(__dirname, '../../../../Commands/BBSCmd/DOORREPO.info');

    for (const name of ['REALDOOR.info', '._REALDOOR.info']) {
      const target = path.join(bbscmd, name);
      fs.copyFileSync(template, target);
      const parsed = parseInfoFile(target);
      parsed.tooltypes = parsed.tooltypes
        // Without a BBSCMD tooltype the FILENAME is the command
        // (loadCommandFromInfo), which is the case a sidecar can steal.
        .filter((t: { key: string }) => t.key !== 'BBSCMD' && t.key !== 'SYSCMD')
        .map((t: { key: string; value: string; originalLine?: string }) =>
          t.key === 'LOCATION'
            ? { ...t, value: 'Doors/a-door', originalLine: 'LOCATION=Doors/a-door' }
            : t
        );
      writeInfoFile(parsed);
    }

    try {
      const commands = scanCommandDirectory(root, 'BBSCMD' as any, undefined, 0);
      const names = [...commands.keys()];

      // The real one registers - otherwise this proves nothing.
      expect(names).toContain('REALDOOR');
      expect(names.some(n => n.startsWith('._'))).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('are filtered by every scan that walks a directory of .info files', () => {
    // The rule lives in one place; these are the callers that must use it.
    for (const file of [
      '../../src/utils/amiga-command-parser.util.ts',
      '../../src/doors/amigaDoorManager.ts',
      '../../src/services/config-services/language-config.service.ts',
      '../../src/api/info-editor-routes.ts',
    ]) {
      const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
      expect(source).toContain('isRealInfoFile');
    }
  });
});
