/**
 * A manifest's art flag survives the schema.
 *
 * Zod STRIPS unknown keys. A manifest carrying `art: true` against a schema
 * that does not declare it loses the flag between the file and every reader,
 * and the Studio shows nothing with no error anywhere - the same silent shape
 * as a board setting missing from its zod schema, which has cost this board a
 * save that did nothing before.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { readManifestFromDir } from '../../src/doors/door-settings.service';

function doorWith(settings: unknown[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ae-door-art-'));
  fs.writeFileSync(
    path.join(dir, 'door.settings.json'),
    JSON.stringify({ command: 'REQ', cfgFile: 'REQUESTS.cfg', settings }),
  );
  return dir;
}

describe('an art-valued setting', () => {
  it('keeps its flag through the schema', () => {
    const dir = doorWith([
      { key: 'bulletinHeader', label: 'Bulletin header art', type: 'string',
        default: 'Bulletin_Header.txt', cfgKey: 'BulletinHeader', art: true },
    ]);

    const manifest = readManifestFromDir(dir);

    expect(manifest?.settings[0].art).toBe(true);
  });

  it('carries optional editor limits', () => {
    const dir = doorWith([
      { key: 'h', label: 'H', type: 'string', default: 'a.txt', art: true,
        artMaxLines: 12, artMaxLineLength: 80 },
    ]);

    const manifest = readManifestFromDir(dir);

    expect(manifest?.settings[0].artMaxLines).toBe(12);
    expect(manifest?.settings[0].artMaxLineLength).toBe(80);
  });

  it('refuses art on a setting that is not a string', () => {
    // A number cannot name a file. Rejected at the manifest, the way a
    // `choice` with no choices already is - and by THROWING, not by returning
    // null: null is this reader's answer for "the door declares no settings
    // at all", and a broken declaration is a different thing that a sysop
    // needs told about.
    const dir = doorWith([
      { key: 'n', label: 'N', type: 'number', default: 1, art: true },
    ]);

    expect(() => readManifestFromDir(dir)).toThrow(/art is only meaningful on a string/);
  });

  it('leaves an ordinary setting alone', () => {
    const dir = doorWith([
      { key: 'host', label: 'Host', type: 'string', default: 'doors.uprough.net' },
    ]);

    expect(readManifestFromDir(dir)?.settings[0].art).toBeUndefined();
  });
});
