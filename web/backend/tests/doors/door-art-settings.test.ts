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

import {
  readManifestFromDir,
  listDoorArtSections,
  readDoorArtSections,
  writeDoorArtSection,
} from '../../src/doors/door-settings.service';

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


/**
 * A door that keeps its art in FILES rather than in a section of its config.
 *
 * REQUESTS' bulletin header and tail are whole files named by settings, and
 * the twenty alternates it inherited from the classic Request door live one
 * directory down. The slot is the SETTING, so the picker that swaps the file
 * is the same thing the admin form writes - no second place holds a filename.
 */
function requestsDoor(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ae-req-'));
  fs.mkdirSync(path.join(dir, 'headers'));
  fs.writeFileSync(path.join(dir, 'Bulletin_Header.txt'), 'one\ntwo\n', 'latin1');
  fs.writeFileSync(path.join(dir, 'headers', 'Header3.ansi'), 'a\nb\nc\n', 'latin1');
  fs.writeFileSync(path.join(dir, 'door.settings.json'), JSON.stringify({
    command: 'REQ',
    cfgFile: 'REQUESTS.cfg',
    settings: [
      { key: 'bulletinHeader', label: 'Bulletin header art', type: 'string',
        default: 'Bulletin_Header.txt', cfgKey: 'BulletinHeader', art: true },
    ],
  }));
  // The door's CURRENT value lives in the saved settings (VALUES_FILE, which
  // is `settings.json`), not in the default. It is deliberately DIFFERENT from
  // the default: a fixture whose saved value equals the default passes whether
  // the code reads the value or the default, and proves neither.
  fs.writeFileSync(path.join(dir, 'settings.json'),
    JSON.stringify({ bulletinHeader: 'headers/Header3.ansi' }));
  return dir;
}

describe('an art setting is a Studio slot', () => {
  it('lists as a slot addressed by its key, with the file it currently names', () => {
    const dir = requestsDoor();

    const slots = listDoorArtSections(dir, 'REQ');

    expect(slots).toEqual([expect.objectContaining({
      section: 'setting:bulletinHeader',
      file: 'headers/Header3.ansi',   // the SAVED value, not the default
      label: 'Bulletin header art',
      lines: 3,
    })]);
  });

  it('falls back to the default when the sysop has saved nothing', () => {
    const dir = requestsDoor();
    fs.unlinkSync(path.join(dir, 'settings.json'));

    const [slot] = listDoorArtSections(dir, 'REQ');

    expect(slot.file).toBe('Bulletin_Header.txt');
    expect(slot.lines).toBe(2);
  });

  it('offers the alternates as choices', () => {
    const dir = requestsDoor();

    const [slot] = listDoorArtSections(dir, 'REQ');

    expect(slot.choices).toEqual(expect.arrayContaining([
      { file: 'Bulletin_Header.txt', lines: 2 },
      { file: 'headers/Header3.ansi', lines: 3 },
    ]));
  });

  it('reads the whole file, bytes intact', () => {
    const dir = requestsDoor();
    fs.writeFileSync(path.join(dir, 'headers', 'Header3.ansi'), '\x1b[35m\xa6art\n', 'latin1');

    const [content] = readDoorArtSections(dir, 'REQ');

    expect(Buffer.from(content.content, 'base64').toString('latin1')).toBe('\x1b[35m\xa6art\n');
  });

  it('writes the whole file, bytes intact', () => {
    const dir = requestsDoor();

    writeDoorArtSection(dir, 'headers/Header3.ansi', 'setting:bulletinHeader',
      Buffer.from('\x1b[34m\xa6new\n', 'latin1').toString('base64'), 'REQ');

    expect(fs.readFileSync(path.join(dir, 'headers', 'Header3.ansi'), 'latin1'))
      .toBe('\x1b[34m\xa6new\n');
  });

  it('reports a setting naming a file that is not there, rather than throwing', () => {
    const dir = requestsDoor();
    fs.unlinkSync(path.join(dir, 'headers', 'Header3.ansi'));

    const [slot] = listDoorArtSections(dir, 'REQ');

    // The Studio offers the picker, not the editor. A throw here would take
    // the whole door-art tab down over one door's unset setting.
    expect(slot.missing).toBe(true);
    expect(slot.lines).toBe(0);
  });

  it('refuses to write through a value that escapes the door', () => {
    const dir = requestsDoor();

    expect(() => writeDoorArtSection(dir, '../escape.txt', 'setting:bulletinHeader',
      Buffer.from('x', 'latin1').toString('base64'), 'REQ')).toThrow();
    expect(fs.existsSync(path.join(path.dirname(dir), 'escape.txt'))).toBe(false);
  });
});
