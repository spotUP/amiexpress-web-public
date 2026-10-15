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
import { LanguageConfigService } from '../../src/services/config-services/language-config.service';
import { AmigaDoorManager } from '../../src/doors/amigaDoorManager';
import { infoEditorRouter } from '../../src/api/info-editor-routes';
import { config as appConfig } from '../../src/config';
import express from 'express';
import request from 'supertest';

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

  /*
   * The rule lives in one place (isRealInfoFile); these are the other scans
   * that walk a directory of .info files, each driven with a sidecar beside a
   * real icon and asked what it found. (This used to be a text check that
   * each file mentioned the name, which an unused import satisfied.)
   */
  describe('in every other scan that walks a directory of .info files', () => {
    let root: string;
    let previousDataDir: string;

    beforeEach(() => {
      root = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-sidecar-scan-'));
      previousDataDir = appConfig.get('dataDir');
      appConfig.set('dataDir', root);
    });

    afterEach(() => {
      appConfig.set('dataDir', previousDataDir);
      fs.rmSync(root, { recursive: true, force: true });
    });

    /** A real icon and its AppleDouble shadow, side by side in `dir`. */
    function iconAndShadow(dir: string, name: string, body: string): void {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${name}.info`), body);
      fs.writeFileSync(path.join(dir, `._${name}.info`), body);
    }

    it('the admin language list (Languages/)', async () => {
      iconAndShadow(path.join(root, 'Languages'), 'EnglishFrench', 'CODE=en\n');
      const repo = { getLanguages: () => [], logConfigChange: () => undefined };
      const service = new LanguageConfigService({ getConfigRepository: () => repo } as never);

      const titles = (await service.getLanguages()).map((l) => l.title);

      expect(titles).toEqual(['EnglishFrench']);
    });

    it('the installed-door scan (Commands/BBSCmd/)', async () => {
      fs.mkdirSync(path.join(root, 'Doors', 'a-door'), { recursive: true });
      iconAndShadow(
        path.join(root, 'Commands', 'BBSCmd'),
        'REALDOOR',
        'TYPE=XIM\nLOCATION=Doors/a-door\n',
      );

      const doors = await new AmigaDoorManager(root).scanInstalledDoors();
      const commands = doors.map((d) => d.command);

      // The real one is found - otherwise the absence below proves nothing.
      expect(commands).toContain('REALDOOR');
      expect(commands.some((c) => c.startsWith('._'))).toBe(false);
    });

    it('the door-archive analysis (an uploaded .zip)', async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const AdmZip = require('adm-zip');
      const zip = new AdmZip();
      const icon = Buffer.from('TYPE=XIM\nLOCATION=Doors/Foo/foo\n');
      zip.addFile('Commands/BBSCmd/FOO.info', icon);
      zip.addFile('Commands/BBSCmd/._FOO.info', icon);
      zip.addFile('Doors/Foo/foo', Buffer.from([0x00, 0x00, 0x03, 0xf3]));
      const archive = path.join(root, 'foo.zip');
      zip.writeZip(archive);

      const analysis = await new AmigaDoorManager(root).analyzeDoorArchive(archive);

      expect(analysis?.bbsCommands).toEqual(['FOO']);
      expect(analysis?.infoFiles).toEqual(['Commands/BBSCmd/FOO.info']);
    });

    it('the admin .info editor file list', async () => {
      iconAndShadow(path.join(root, 'Commands', 'BBSCmd'), 'EXAMPLE', 'TYPE=XIM\n');
      const app = express();
      app.use('/api/info-editor', infoEditorRouter);

      const res = await request(app).get('/api/info-editor/files');
      const names: string[] = res.body.data.files.map((f: { basename: string }) => f.basename);

      expect(names).toContain('EXAMPLE.info');
      expect(names.some((n) => n.startsWith('._'))).toBe(false);
    });
  });
});
