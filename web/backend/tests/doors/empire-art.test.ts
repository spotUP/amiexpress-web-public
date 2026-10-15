/**
 * Door art sections for the ANSI Studio (Bulls Title logo).
 *
 * The art lives INSIDE Bulls.CFG, where no screen path can name it. These
 * endpoints read/write the Title section through the Empire driver so the
 * artists get a real canvas: unmapped bytes (settings, masks, delimiters)
 * survive every save, and the DOC limits (20 lines, 200 chars/line) are
 * enforced by name.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readDoorArtSections, writeDoorArtSection } from '../../src/doors/door-settings.service';

const repoEmp = path.resolve(__dirname, '..', '..', '..', '..', 'Doors', 'emp_tools');

function stage(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'empire-art-'));
  for (const f of ['Bulls.CFG', 'joincnf.cfg', 'door.settings.json']) {
    fs.copyFileSync(path.join(repoEmp, f), path.join(dir, f));
  }
  return dir;
}

const toLatin1 = (b64: string) => Buffer.from(b64, 'base64').toString('latin1');
const toB64 = (s: string) => Buffer.from(s, 'latin1').toString('base64');

describe('door art sections (Studio)', () => {
  test('a shared directory offers each door only its own art', () => {
    // emp_tools is two doors in one directory: Bulls (B) with its title logo
    // in Bulls.CFG, Joincnf (J) with the conference banner in joincnf.cfg.
    // The banner was on disk and editable by nobody until it was declared.
    const dir = stage();
    try {
      const bulls = readDoorArtSections(dir, 'B');
      const join = readDoorArtSections(dir, 'J');
      expect(bulls.map(a => a.file)).toEqual(['Bulls.CFG']);
      expect(join.map(a => a.file)).toEqual(['joincnf.cfg']);
      expect(join[0].label).toBe('Conference list banner');
      expect(toLatin1(join[0].content)).toContain('___/');
      expect(join[0].lines).toBeGreaterThan(3);
      // And no command at all still sees the whole manifest.
      expect(readDoorArtSections(dir)).toHaveLength(2);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a write in one door\'s name cannot reach the other door\'s art', () => {
    const dir = stage();
    try {
      const before = fs.readFileSync(path.join(dir, 'joincnf.cfg'), 'latin1');
      expect(() =>
        writeDoorArtSection(dir, 'joincnf.cfg', 'title', toB64('HACKED'), 'B'),
      ).toThrow(/art section/i);
      expect(fs.readFileSync(path.join(dir, 'joincnf.cfg'), 'latin1')).toBe(before);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('reads the Title body the door will show', () => {
    const dir = stage();
    try {
      // Asked as Bulls: emp_tools also holds Joincnf's banner, and each door
      // is offered its own (door-settings-scoping.test.ts).
      const sections = readDoorArtSections(dir, 'B');
      expect(sections).toHaveLength(1);
      expect(sections[0].section).toBe('title');
      expect(sections[0].label).toBe('Title logo');
      const body = toLatin1(sections[0].content);
      expect(body).toContain('____');
      expect(sections[0].lines).toBeGreaterThan(5);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('write replaces only the art, settings survive byte-for-byte', () => {
    const dir = stage();
    try {
      const beforeSettings = readDoorArtSections(dir);
      void beforeSettings;
      const cfgBefore = fs.readFileSync(path.join(dir, 'Bulls.CFG'), 'latin1');
      const art = ['line one', '\x1b[36mline two\x1b[0m'];
      const out = writeDoorArtSection(dir, 'Bulls.CFG', 'title', toB64(art.join('\n')));
      expect(out.lines).toBe(2);
      expect(toLatin1(out.content)).toBe(art.join('\n'));
      const cfgAfter = fs.readFileSync(path.join(dir, 'Bulls.CFG'), 'latin1');
      // Settings rows untouched.
      expect(cfgAfter).toContain('DUAL_LISTING       YES');
      expect(cfgAfter).toContain('Top Uploaders');
      expect(cfgAfter).toContain('; Conference 1');
      expect(cfgAfter).toContain('[Title_END]');
      // Only the art section changed: re-reading shows the new body, and
      // the line-count delta equals old art lines minus new ones.
      const { parseEmpireFile: parse2, getSectionBody: body2 } =
        require('../../src/doors/text-cfg/empire');
      const beforeBody = body2(parse2(cfgBefore), 'title')!;
      const afterBody = body2(parse2(cfgAfter), 'title')!;
      expect(afterBody).toEqual(art);
      expect(cfgAfter.split('\n')).toHaveLength(cfgBefore.split('\n').length - (beforeBody.length - art.length));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('DOC limits enforced, unknown sections refused', () => {
    const dir = stage();
    try {
      const tooMany = Array.from({ length: 21 }, (_, i) => `line ${i}`).join('\n');
      expect(() => writeDoorArtSection(dir, 'Bulls.CFG', 'title', toB64(tooMany))).toThrow(/at most 20/);
      const tooWide = `x${'y'.repeat(200)}`;
      expect(() => writeDoorArtSection(dir, 'Bulls.CFG', 'title', toB64(tooWide))).toThrow(/at most 200/);
      expect(() => writeDoorArtSection(dir, 'Bulls.CFG', 'nope', toB64('x'))).toThrow(/must declare it/);
      expect(() => writeDoorArtSection(dir, 'nope.CFG', 'title', toB64('x'))).toThrow(/must declare it/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('doors without art sections get a clear answer, not a crash', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'empire-noart-'));
    try {
      fs.writeFileSync(path.join(dir, 'door.settings.json'), JSON.stringify({ command: 'X', settings: [] }));
      expect(() => readDoorArtSections(dir)).toThrow(/no art sections/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
