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
  writeDoorArtVariant,
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

  it('finds REQUESTS own art in the repo, not just a fixture', () => {
    // THE REACHABILITY GATE. Every case above builds its own door; this one
    // drives the folder the board actually ships, so a slot that works on a
    // fixture and not on the real manifest fails here.
    const repoDoor = path.join(__dirname, '..', '..', '..', '..', 'Doors', 'REQUESTS');

    const slots = listDoorArtSections(repoDoor, 'REQ');

    expect(slots.map((s) => s.section)).toEqual(
      expect.arrayContaining(['setting:bulletinHeader', 'setting:bulletinTail']),
    );
    const header = slots.find((s) => s.section === 'setting:bulletinHeader')!;
    expect(header.file).toBe('Bulletin_Header.txt');
    expect(header.lines).toBe(8);
    expect(header.missing).toBe(false);
    // The twenty alternates that moved across from the classic Request door.
    expect(header.choices!.length).toBeGreaterThanOrEqual(20);
  });

  it('refuses to write through a value that escapes the door', () => {
    const dir = requestsDoor();

    expect(() => writeDoorArtSection(dir, '../escape.txt', 'setting:bulletinHeader',
      Buffer.from('x', 'latin1').toString('base64'), 'REQ')).toThrow();
    expect(fs.existsSync(path.join(path.dirname(dir), 'escape.txt'))).toBe(false);
  });
});

describe('a slot offers only the files that are its own', () => {
  /*
   * The picker listed every art file in the door's folder for every slot, so
   * the magazine's title slot was offered all fifteen banners and REQUESTS'
   * header was offered the tails. A slot offers what its `artChoices` names,
   * its default alone when it names nothing, and the file it holds now.
   */
  function twoSlotDoor(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ae-req-choices-'));
    fs.mkdirSync(path.join(dir, 'headers'));
    fs.mkdirSync(path.join(dir, 'bulletindesign'));
    for (const f of ['Bulletin_Header.txt', 'Bulletin_Tail.txt', 'headers/Header1.ansi',
      'bulletindesign/Header2.ansi', 'bulletindesign/Tail2.ansi']) {
      fs.writeFileSync(path.join(dir, f), 'x\n', 'latin1');
    }
    fs.writeFileSync(path.join(dir, 'door.settings.json'), JSON.stringify({
      command: 'REQ',
      settings: [
        { key: 'bulletinHeader', label: 'Header', type: 'string', art: true, default: 'Bulletin_Header.txt',
          artChoices: ['Bulletin_Header.txt', 'headers/*', 'bulletindesign/Header*'] },
        { key: 'bulletinTail', label: 'Tail', type: 'string', art: true, default: 'Bulletin_Tail.txt' },
      ],
    }));
    return dir;
  }

  it('never offers a header slot the tails, nor a tail slot anything but itself', () => {
    const slots = listDoorArtSections(twoSlotDoor(), 'REQ');
    const header = slots.find((s) => s.section === 'setting:bulletinHeader')!;
    const tail = slots.find((s) => s.section === 'setting:bulletinTail')!;
    expect(header.choices!.map((c) => c.file).sort()).toEqual(
      ['Bulletin_Header.txt', 'bulletindesign/Header2.ansi', 'headers/Header1.ansi'],
    );
    expect(tail.choices!.map((c) => c.file)).toEqual(['Bulletin_Tail.txt']);
  });

  it('keeps the file a slot holds now on offer, declared or not', () => {
    const dir = twoSlotDoor();
    fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ bulletinTail: 'bulletindesign/Tail2.ansi' }));
    const tail = listDoorArtSections(dir, 'REQ').find((s) => s.section === 'setting:bulletinTail')!;
    expect(tail.choices!.map((c) => c.file).sort()).toEqual(['Bulletin_Tail.txt', 'bulletindesign/Tail2.ansi']);
  });

  it('offers each magazine screen only itself, from the repo manifest', () => {
    const repoDoor = path.join(__dirname, '..', '..', '..', '..', 'Doors', 'magazine');
    const slots = listDoorArtSections(repoDoor, 'MAG').filter((s) => s.section.startsWith('setting:'));
    expect(slots).toHaveLength(15);
    for (const slot of slots) expect(slot.choices!.map((c) => c.file)).toEqual([slot.file]);
  });

  it('offers REQUESTS header its header alternates and its tail its tails, from the repo manifest', () => {
    const repoDoor = path.join(__dirname, '..', '..', '..', '..', 'Doors', 'REQUESTS');
    const slots = listDoorArtSections(repoDoor, 'REQ');
    const header = slots.find((s) => s.section === 'setting:bulletinHeader')!;
    const tail = slots.find((s) => s.section === 'setting:bulletinTail')!;
    expect(header.choices!.some((c) => /Tail/.test(c.file))).toBe(false);
    expect(tail.choices!.some((c) => /Header/.test(c.file))).toBe(false);
    expect(tail.choices!.length).toBeGreaterThan(1);
  });
});

describe('a narrow drawing is offered only where the door reads one', () => {
  it('lists no tab for a slot that declares none, and refuses a drawing for it', () => {
    const dir = requestsDoor();
    const [slot] = listDoorArtSections(dir, 'REQ');
    expect(slot.offers).toEqual([]);
    const screens = fs.mkdtempSync(path.join(os.tmpdir(), 'ae-req-screens-'));
    expect(() => writeDoorArtVariant(dir, screens, 'REQ', slot.file, slot.section, 'ttx',
      Buffer.from('x', 'latin1').toString('base64'))).toThrow(/does not read a ttx drawing/);
  });
});
