/**
 * A declared logo slot nobody has drawn yet is an EMPTY canvas, not a broken
 * reference. The admin hides "Open in ANSI editor" for a slot flagged
 * `missing`, so a door that ships no art file (the code draws its logo) could
 * never get its first drawing. Only a value that names a file which is gone
 * stays "missing".
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  listDoorArtSections,
  readDoorArtSections,
  writeDoorArtSection,
} from '../../src/doors/door-settings.service';

function logoDoor(values?: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ae-empty-logo-'));
  fs.writeFileSync(
    path.join(dir, 'door.settings.json'),
    JSON.stringify({
      command: 'GALAGA',
      settings: [
        { key: 'logo', label: 'Logo', type: 'string', default: 'art/logo.ans', art: true,
          artMaxLines: 8, artMaxLineLength: 43 },
      ],
    }),
  );
  if (values) fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(values));
  return dir;
}

describe('an empty declared logo slot', () => {
  it('is openable: not missing, zero lines, empty body', () => {
    const dir = logoDoor();
    const [slot] = listDoorArtSections(dir, 'GALAGA');
    expect(slot.missing).toBe(false);
    expect(slot.lines).toBe(0);
    expect(readDoorArtSections(dir, 'GALAGA')[0].content).toBeDefined();
  });

  it('takes its first drawing, creating the art folder', () => {
    const dir = logoDoor();
    writeDoorArtSection(dir, 'art/logo.ans', 'setting:logo',
      Buffer.from('\x1b[31mHI\x1b[0m', 'latin1').toString('base64'), 'GALAGA');
    expect(fs.readFileSync(path.join(dir, 'art', 'logo.ans'), 'latin1')).toContain('HI');
    expect(listDoorArtSections(dir, 'GALAGA')[0].lines).toBeGreaterThan(0);
  });
});
