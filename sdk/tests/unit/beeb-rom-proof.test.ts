/**
 * Proving a caller owns the BBC ROMs.
 *
 * The board ships none and keeps one copy. A caller shows theirs once - the
 * sysop included - and what is kept afterwards is the fact that they showed
 * it, never the file.
 *
 * THE CHECK IS DELIBERATELY LOOSE. There were many machines, many OS
 * revisions and a great many filing systems, so an honest owner's set will
 * not match the board's byte for byte or even by name. Matching on content
 * would refuse honest people and teach everyone else to rename files. This
 * is a gate against helping yourself, not a proof of purchase.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { verifyRomArchive, MAX_ARCHIVE_BYTES } from '../../beeb/rom-proof';
import { REQUIRED_ROMS, ROM_BYTES } from '../../beeb/roms';

const AdmZip = require('adm-zip');

function scratch(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rom-proof-'));
}

/** A ROM-shaped file whose sideways header names it, the way a real one does. */
function rom(title: string, version = '', size = ROM_BYTES): Buffer {
  const bytes = Buffer.alloc(size, 0xea);
  Buffer.from(title + '\u0000' + version + '\u0000', 'latin1').copy(bytes, 9);
  return bytes;
}

function archive(entries: Record<string, Buffer>): string {
  const zip = new AdmZip();
  for (const [name, data] of Object.entries(entries)) zip.addFile(name, data);
  const file = path.join(scratch(), 'roms.zip');
  zip.writeZip(file);
  return file;
}

function boardWith(roms: Record<string, Buffer>): string {
  const dir = path.join(scratch(), 'roms');
  for (const [name, data] of Object.entries(roms)) {
    const to = path.join(dir, name);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.writeFileSync(to, data);
  }
  return dir;
}

const OS = rom('OS', '1.20');
const BASIC = rom('BASIC', '2.00');
const DFS = rom('DFS', '1.20');
const FULL_SET = { 'os.rom': OS, 'BASIC.ROM': BASIC, 'b/DFS-1.2.rom': DFS };
const STOCKED = () => boardWith(FULL_SET);

describe('showing that you own the ROMs', () => {
  it('accepts a set named the way this board names them', () => {
    const result = verifyRomArchive(archive(FULL_SET), STOCKED());
    expect(result.proven).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.seeded).toBe(false);
  });

  it('does not care how the archive filed them', () => {
    // People zip a folder, not three loose files.
    const nested = {
      'beeb/roms/os.rom': OS,
      'beeb/roms/BASIC.ROM': BASIC,
      'beeb/roms/b/DFS-1.2.rom': DFS,
    };
    expect(verifyRomArchive(archive(nested), STOCKED()).proven).toBe(true);
  });

  it('accepts other people’s names for the same three things', () => {
    /*
     * THE POINT OF THE LOOSE MATCH. There is no one spelling: a real
     * collection has OS12.ROM and DFS-2.26.rom in it, and those are the
     * same three kinds of thing. Refusing them would only teach people to
     * rename files until the board stopped complaining.
     */
    const theirs = {
      'OS12.ROM': rom('OS', '1.20'),
      'BASIC2.rom': rom('BASIC', '2.00'),
      'DFS-2.26.rom': rom('DFS', '2.26'),
    };
    const result = verifyRomArchive(archive(theirs), STOCKED());
    expect(result.proven).toBe(true);
    expect(result.matched.map(m => m.kind).sort()).toEqual(['BASIC', 'DFS', 'OS']);
  });

  it('accepts an 8K part, because plenty of them were', () => {
    const small = { ...FULL_SET, 'DFS09.rom': rom('DFS', '0.90', 8192) };
    expect(verifyRomArchive(archive(small), STOCKED()).proven).toBe(true);
  });

  it('says which kind is missing', () => {
    const result = verifyRomArchive(
      archive({ 'os.rom': OS, 'BASIC.ROM': BASIC }),
      STOCKED(),
    );
    expect(result.proven).toBe(false);
    expect(result.missing).toEqual(['DFS']);
  });

  it('is not fooled by a text file wearing the name', () => {
    const fake = { ...FULL_SET, 'DFS-1.2.rom': Buffer.from('not a rom', 'latin1') };
    const result = verifyRomArchive(archive({ 'os.rom': OS, 'BASIC.ROM': BASIC, 'DFS-1.2.rom': fake['DFS-1.2.rom'] }), STOCKED());
    expect(result.proven).toBe(false);
    expect(result.missing).toEqual(['DFS']);
  });

  it('cannot be made to write outside the ROM directory', () => {
    /*
     * ZIP-SLIP. Entry names are never used as paths - nothing is extracted
     * under the name the archive chose - so a traversing entry is only ever
     * a string that happens not to be a ROM name.
     */
    const evil = archive({ '../../../../tmp/pwned-os.rom': OS, ...FULL_SET });
    expect(verifyRomArchive(evil, STOCKED()).proven).toBe(true);
    expect(fs.existsSync('/tmp/pwned-os.rom')).toBe(false);
  });

  it('seeds an empty board from the first set proved, and only then', () => {
    const empty = path.join(scratch(), 'roms');
    const first = verifyRomArchive(archive(FULL_SET), empty);
    expect(first.proven).toBe(true);
    expect(first.seeded).toBe(true);
    for (const required of REQUIRED_ROMS) {
      expect(fs.existsSync(path.join(empty, required))).toBe(true);
    }

    // Everyone after that proves against a board that already has them;
    // their upload never overwrites it.
    const second = verifyRomArchive(archive(FULL_SET), empty);
    expect(second.proven).toBe(true);
    expect(second.seeded).toBe(false);
  });

  it('files a differently-named set under the names the emulator asks for', () => {
    // jsbeeb asks for os.rom, BASIC.ROM and b/DFS-1.2.rom whatever the
    // uploader called them, so seeding has to rename.
    const empty = path.join(scratch(), 'roms');
    verifyRomArchive(archive({ 'OS12.ROM': OS, 'BASIC2.rom': BASIC, 'DFS-2.26.rom': DFS }), empty);
    for (const required of REQUIRED_ROMS) {
      expect(fs.existsSync(path.join(empty, required))).toBe(true);
    }
  });

  it('refuses an archive larger than the ceiling', () => {
    const big = path.join(scratch(), 'big.zip');
    fs.writeFileSync(big, Buffer.alloc(MAX_ARCHIVE_BYTES + 1, 0x41));
    const result = verifyRomArchive(big, STOCKED());
    expect(result.proven).toBe(false);
    expect(result.problems.join(' ')).toContain('limit');
  });
});
