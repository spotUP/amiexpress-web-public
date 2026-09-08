/**
 * The RIP document model: parse a .rip screen, edit one thing, write it back.
 *
 * The invariant every test here defends is the same one: a screen the sysop
 * did NOT change comes back byte for byte. A .rip file is a program whose
 * extension is routing (screen-security.util.ts), so a "harmless"
 * normalisation - a re-wrapped line, a dropped continuation, a MegaNum
 * repadded - is a silent divergence for every RIP caller, and the manager
 * writes through the same backup/fan-out path an upload does.
 *
 * Measured baseline, 2026-09-07, on this board's 149 .rip files: the existing
 * RIPParser (packages/terminal/src/rip/RIPParser.ts) round-trips ZERO of
 * them, and loses about two thirds of a typical file's bytes - it drops the
 * commands it cannot parse, drops the physical line layout, and its field
 * widths for the two commands an authoring UI cares about (1M mouse fields,
 * 1U buttons) disagree with the renderer that actually draws the board.
 * Hence a document model that keeps raw argument text, and a typed view only
 * over the commands being edited.
 */
import fs from 'fs';
import path from 'path';
import {
  parseRipDocument,
  serializeRipDocument,
  readRipHotspots,
  writeRipHotspot,
  removeRipHotspot,
  addRipMouseField,
  decodeRipArgs,
  encodeRipArgs,
  unescapeRipText,
  escapeRipText,
  RIP_ARG_FORMATS,
} from '../../src/screens/rip-document';

const REPO = path.resolve(__dirname, '../../../..');

function findRipFiles(dir: string, out: string[] = []): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) findRipFiles(p, out);
    else if (/\.rip$/i.test(e.name)) out.push(p);
  }
  return out;
}

/** The board's own .rip files, read as bytes and widened one byte per char. */
function boardRipFiles(): { rel: string; text: string }[] {
  return findRipFiles(REPO).map(file => ({
    rel: path.relative(REPO, file),
    text: fs.readFileSync(file).toString('latin1'),
  }));
}

describe('a RIP screen survives being read and written back', () => {
  const corpus = boardRipFiles();

  it('finds the board RIP corpus at all', () => {
    // A glob miss would make every assertion below vacuously true.
    expect(corpus.length).toBeGreaterThan(100);
  });

  it('every .rip file on this board serializes back byte-identically', () => {
    const changed: string[] = [];
    for (const { rel, text } of corpus) {
      const back = serializeRipDocument(parseRipDocument(text));
      if (back !== text) changed.push(rel);
    }
    expect(changed).toEqual([]);
  });

  it('keeps the physical layout a RIP file was written with', () => {
    // Mixed line endings, a backslash continuation mid-argument, a plain
    // text line among the commands, and no newline at the end: all four
    // appear in this board's corpus, and each one is a byte a naive
    // "join the commands with CRLF" writer loses.
    const text =
      '!|c0F|m0000\r\n' +
      'RIPscrip 2.0 technology\n' +
      '!|@0A0BHello|1M010A0K2S141000000quit\r\n' +
      '!|P0300005K00\\\r\n' +
      '5K5K|#';
    expect(serializeRipDocument(parseRipDocument(text))).toBe(text);
  });

  it('reads the instructions on a line, not just the line', () => {
    const doc = parseRipDocument('!|c0F|m0000|@0A0BHi|\r\n');
    expect(doc.lines).toHaveLength(1);
    expect(doc.lines[0].instructions.map(i => i.opcode)).toEqual(['c', 'm', '@', '']);
    expect(doc.lines[0].instructions[2].args).toBe('0A0BHi');
  });

  it('reads a command whose opcode is an escape character', () => {
    // RIP_QUERY is "1" + ESC. The renderer maps the control byte to a symbol
    // before dispatch; the file on disk carries the raw byte, and that is
    // what the document has to hand back.
    const doc = parseRipDocument('!|1\x1b00000$MUSIC$\r\n');
    expect(doc.lines[0].instructions[0].opcode).toBe('1\x1b');
  });
});

describe('MegaNum arguments decode and encode', () => {
  it('round-trips the argument widths the renderer uses', () => {
    // 1M is num:2 x0:2 y0:2 x1:2 y1:2 invert:1 clear:1 reserved:5 text - the
    // widths RIPtermJS dispatches on. RIPParser reads invert and clear as two
    // digits each, which is why it is not the foundation here.
    const args = '010A0K2S141000000JOIN 3';
    const values = decodeRipArgs('1M', args);
    expect(values).toEqual([1, 10, 20, 100, 40, 1, 0, 0, 'JOIN 3']);
    expect(encodeRipArgs('1M', values!)).toBe(args);
  });

  it('round-trips a polygon, whose argument count is in its arguments', () => {
    const args = '0300005K005K5K';
    expect(decodeRipArgs('P', args)).toEqual([3, 0, 0, 200, 0, 200, 200]);
    expect(encodeRipArgs('P', [3, 0, 0, 200, 0, 200, 200])).toBe(args);
  });

  it('knows the same commands the renderer does', () => {
    for (const opcode of ['c', 'm', '@', 'T', 'L', 'B', 'P', '1M', '1U', '1B', '1\x1b']) {
      expect(RIP_ARG_FORMATS[opcode]).toBeDefined();
    }
  });

  it('escapes the characters that would end an instruction', () => {
    expect(escapeRipText('a|b!|c\\d')).toBe('a\\|b\\!\\|c\\\\d');
    expect(unescapeRipText('a\\|b\\!\\|c\\\\d')).toBe('a|b!|c\\d');
  });

  it('leaves a bang alone unless it would start the next command', () => {
    // 20 gallery screens on this board label a button "Help !!" or send
    // "!^M", unescaped, and the renderer reads those as ordinary characters.
    // Escaping every bang would rewrite all of them.
    expect(escapeRipText('Help !! now')).toBe('Help !! now');
    expect(escapeRipText('<>Instant Logoff<>!^M')).toBe('<>Instant Logoff<>!^M');
    // A trailing bang is a different matter: the separator that follows it
    // would complete `!|` and end the instruction early.
    expect(escapeRipText('Help !')).toBe('Help \\!');
  });

  it('refuses a value that does not fit its field', () => {
    // A y coordinate of 1300 is past what two MegaNum digits hold (1295) and
    // would silently overrun into the next field.
    expect(() => encodeRipArgs('m', [0, 1300])).toThrow(/does not fit/i);
  });
});

describe('the interactive parts of a RIP screen are addressable', () => {
  const screen =
    '!|c0F|B00003F27\r\n' +
    '!|1B0A040200E8010F000F080700000F00\r\n' +
    '!|1U0A0K2S141Y10<>Files<>F\r\n' +
    '!|1M010A0K2S141000000JOIN 3\r\n' +
    '!|#\r\n';

  it('lists the buttons and mouse fields with their commands', () => {
    const spots = readRipHotspots(parseRipDocument(screen));
    expect(spots.map(s => ({ kind: s.kind, command: s.command }))).toEqual([
      { kind: 'button', command: 'F' },
      { kind: 'mouse', command: 'JOIN 3' },
    ]);
    expect(spots[0].label).toBe('Files');
    expect(spots[1].x0).toBe(10);
  });

  it('rewrites one field and leaves every other byte alone', () => {
    const doc = parseRipDocument(screen);
    const spots = readRipHotspots(doc);
    const out = serializeRipDocument(
      writeRipHotspot(doc, { ...spots[1], command: 'JOIN 7', x0: 40 }),
    );

    const before = screen.split('\r\n');
    const after = out.split('\r\n');
    const differing = before
      .map((l, i) => (l === after[i] ? null : i))
      .filter(i => i !== null);
    expect(differing).toEqual([3]);
    expect(after[3]).toBe('!|1M01140K2S141000000JOIN 7');
  });

  it('removes a mouse field without touching the artwork', () => {
    const doc = parseRipDocument(screen);
    const spots = readRipHotspots(doc);
    const out = serializeRipDocument(removeRipHotspot(doc, spots[1]));
    expect(out).toBe(
      '!|c0F|B00003F27\r\n' +
      '!|1B0A040200E8010F000F080700000F00\r\n' +
      '!|1U0A0K2S141Y10<>Files<>F\r\n' +
      '!|#\r\n',
    );
  });

  it('adds a mouse field ahead of the end-of-scene marker', () => {
    // RIP_NO_MORE (#) ends the scene: a field written after it never runs.
    const doc = parseRipDocument(screen);
    const out = serializeRipDocument(addRipMouseField(doc, {
      x0: 10, y0: 20, x1: 100, y1: 40, command: 'B',
    }));
    expect(out.split('\r\n')[4]).toBe('!|1M020A0K2S141000000B');
    expect(out.split('\r\n')[5]).toBe('!|#');
    expect(readRipHotspots(parseRipDocument(out))).toHaveLength(3);
  });

  it('numbers a new mouse field after the ones already there', () => {
    const doc = parseRipDocument(screen);
    const grown = serializeRipDocument(
      addRipMouseField(doc, { x0: 1, y0: 2, x1: 3, y1: 4, command: 'X' }),
    );
    const spots = readRipHotspots(parseRipDocument(grown));
    expect(spots.filter(s => s.kind === 'mouse').map(s => s.num)).toEqual([1, 2]);
  });

  it('escapes a host command that contains a pipe', () => {
    const doc = parseRipDocument(screen);
    const spots = readRipHotspots(doc);
    const out = serializeRipDocument(writeRipHotspot(doc, { ...spots[1], command: 'A|B' }));
    // Written escaped...
    expect(out).toContain('A\\|B');
    // ...and read back as the one command it is, not two instructions.
    const again = readRipHotspots(parseRipDocument(out));
    expect(again).toHaveLength(2);
    expect(again[1].command).toBe('A|B');
  });
});

describe('the editable subset, measured against this board', () => {
  const corpus = boardRipFiles();

  it('rewrites every mouse field and button on the board without changing a byte', () => {
    // The commonest thing a sysop will do is open a screen, look at a region
    // and save. Writing every hotspot back UNCHANGED must be the identity, or
    // that harmless-looking save is a diff on a live screen.
    const changed: string[] = [];
    let seen = 0;
    for (const { rel, text } of corpus) {
      const doc = parseRipDocument(text);
      const spots = readRipHotspots(doc);
      if (spots.length === 0) continue;
      seen += spots.length;
      let next = doc;
      for (const spot of spots) next = writeRipHotspot(next, spot);
      if (serializeRipDocument(next) !== text) changed.push(rel);
    }
    expect(seen).toBeGreaterThan(100);
    expect(changed).toEqual([]);
  });

  it('re-encodes their arguments from scratch, bar a known escaping quirk', () => {
    // Measured 2026-09-07, re-measured 2026-09-08 after the template stopped
    // carrying the twelve dead Conf*/Screens/BBSTITLE.rip copies and the
    // Screens/BBSTITLE.RIP twin (BBSTITLE is a node screen; nothing read
    // them). Every 1M and 1U on this board re-encodes to its own bytes from
    // the decoded values alone, EXCEPT two PLAYPOOL buttons. The writer keeps
    // the original bytes when the value has not changed, so this residue never
    // reaches a file. It is measured here so a change in the escaping rules is
    // a decision.
    const residue: string[] = [];
    let seen = 0;
    for (const { rel, text } of corpus) {
      for (const line of parseRipDocument(text).lines) {
        for (const inst of line.instructions) {
          if (inst.opcode !== '1M' && inst.opcode !== '1U') continue;
          seen++;
          const values = decodeRipArgs(inst.opcode, unescapeRipText(inst.args));
          if (!values || encodeRipArgs(inst.opcode, values) !== inst.args) {
            residue.push(`${rel}: !|${inst.opcode}${inst.args}`);
          }
        }
      }
    }
    expect(seen).toBeGreaterThan(200); // 254 in a clean checkout, 2026-09-08

    /*
     * The CLASSES of residue, never how many files carry them.
     *
     * Two are known and benign: an art program escaped a `!` in the BBSTITLE
     * set that needs no escape, and two PLAYPOOL buttons wrap their label
     * across a line with a continuation, which is layout rather than content.
     * A third class is news, and that is what this asserts.
     *
     * The COUNT was pinned here until 2026-09-08 and was wrong the moment it
     * was written: it counts copies of the same art, and how many copies a
     * checkout has depends on how many node directories it happens to carry -
     * 2 in the worktree it was measured in, 14 in the shared one. That is a
     * property of the disk, not of the encoder.
     */
    const known = (entry: string) =>
      /BBSTITLE\.rip: /i.test(entry) || /PLAYPOOL\.RIP: /i.test(entry);
    expect(residue.filter(entry => !known(entry))).toEqual([]);
  });
});
