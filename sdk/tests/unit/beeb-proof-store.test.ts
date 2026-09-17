/**
 * Both doors read the same record.
 *
 * BEEB owns the machine and TELETEXT is a second way in to it, so a caller
 * who proved their ROMs in one must not be asked again by the other. That
 * is exactly what happened: BEEB wrote to `Doors/beeb/data/proven.json`
 * while TELETEXT, one `..` short of the board root, read
 * `Doors/teletext/beeb/data/proven.json` - a directory that does not exist.
 * The answer was always "not proved", and nothing said why.
 *
 * The location is resolved from the board root in ONE function now, so
 * there is no relative-depth arithmetic left to get wrong.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { beebProofFile, hasProved, recordProof } from '../../beeb/proof-store';

/** A board root, laid out the way a real one is. */
function board(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'proof-root-'));
  // resolveBbsRoot walks up looking for the board's own marks.
  fs.mkdirSync(path.join(root, 'Commands', 'BBSCmd'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Doors', 'beeb', 'dist'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Doors', 'teletext', 'dist'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Access'), '');
  return root;
}

describe('where the proof is kept', () => {
  it('is the same file whichever door asks', () => {
    const root = board();
    const fromBeeb = beebProofFile(path.join(root, 'Doors', 'beeb', 'dist'));
    const fromTeletext = beebProofFile(path.join(root, 'Doors', 'teletext', 'dist'));
    expect(fromTeletext).toBe(fromBeeb);
  });

  it('is under the BEEB door, which owns the machine', () => {
    const root = board();
    const file = beebProofFile(path.join(root, 'Doors', 'beeb', 'dist'));
    expect(file.endsWith(path.join('Doors', 'beeb', 'data', 'proven.json'))).toBe(true);
  });

  it('proving in one door proves in the other', () => {
    // The whole point: "i uploaded roms but teletext still asks for them".
    const root = board();
    const written = beebProofFile(path.join(root, 'Doors', 'beeb', 'dist'));
    recordProof(written, 42);

    const read = beebProofFile(path.join(root, 'Doors', 'teletext', 'dist'));
    expect(hasProved(read, 42)).toBe(true);
  });
});

describe('the record itself', () => {
  const file = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'proofs-')), 'proven.json');

  it('knows nobody before anyone has proved', () => {
    expect(hasProved(file(), 1)).toBe(false);
  });

  it('keeps everyone who has', () => {
    const at = file();
    recordProof(at, 1);
    recordProof(at, 2);
    expect(hasProved(at, 1)).toBe(true);
    expect(hasProved(at, 2)).toBe(true);
    expect(hasProved(at, 3)).toBe(false);
  });

  it('treats a caller with no id as unproved rather than as everybody', () => {
    const at = file();
    recordProof(at, 1);
    expect(hasProved(at, undefined)).toBe(false);
    expect(hasProved(at, '')).toBe(false);
  });

  it('survives a damaged file by asking again, not by falling over', () => {
    const at = file();
    fs.writeFileSync(at, '{ this is not json');
    expect(hasProved(at, 1)).toBe(false);
    recordProof(at, 1);
    expect(hasProved(at, 1)).toBe(true);
  });
});
