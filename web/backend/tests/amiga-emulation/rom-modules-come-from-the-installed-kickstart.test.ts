/**
 * The Kickstart modules on disk come from the ROM the sysop installed.
 *
 * Kickstart code is copyrighted and never ships with the board, so ROM/ and
 * System/ROM/ are not in the repository. The door launch splits whatever
 * Kickstart is installed into its resident modules. It used to shell out to
 * amitools' `romtool split`, which only knows ROMs from its own checksum
 * database: every ROM this board runs answered "not found in split
 * database", so a fresh board got nothing and the repo carried a developer's
 * A500 modules instead.
 *
 * Driven through LibraryManager.initialize() with a synthetic 512K
 * Kickstart (no real ROM is ever copied into a test). It must produce the
 * modules found by their RomTags, including one whose RomTag sits at the END
 * of its code, and a different ROM must replace them.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Modules imported by the launch path read the board root at load time, before
// any test runs; until a test sets it they get the system temp directory.
jest.mock('../../src/utils/board-root.util', () => {
  const tmp = (jest.requireActual('os') as typeof import('os')).tmpdir();
  const root = () => process.env.ROM_MODULES_TEST_BOARD || tmp;
  return { boardRoot: root, codeRoot: root };
});

import { LibraryManager } from '../../src/amiga-emulation/LibraryManager';
import { clearRomCache } from '../../src/amiga-emulation/rom/amiga-rom';

const BASE = 0xf80000;
const SIZE = 512 * 1024;

interface SyntheticTag {
  tagOffset: number;
  endOffset: number;
  name: string;
  version: number;
  idString: string;
}

/** A 512K image with a Kickstart header and the given RomTags. */
function syntheticKickstart(tags: SyntheticTag[], fill: number): Buffer {
  const rom = Buffer.alloc(SIZE, fill);
  rom.writeUInt16BE(0x1111, 0);
  rom.writeUInt16BE(0x4ef9, 2);
  rom.writeUInt32BE(BASE + 0xd2, 4);
  let strings = 0x70000;
  const putString = (s: string): number => {
    const at = strings;
    rom.write(`${s}\0`, at, 'latin1');
    strings += s.length + 2;
    return BASE + at;
  };
  for (const t of tags) {
    const at = t.tagOffset;
    rom.writeUInt16BE(0x4afc, at);
    rom.writeUInt32BE(BASE + at, at + 2);
    rom.writeUInt32BE(BASE + t.endOffset, at + 6);
    rom.writeUInt8(0x80, at + 10);
    rom.writeUInt8(t.version, at + 11);
    rom.writeUInt8(9, at + 12);
    rom.writeUInt8(0, at + 13);
    rom.writeUInt32BE(putString(t.name), at + 14);
    rom.writeUInt32BE(putString(t.idString), at + 18);
    rom.writeUInt32BE(0, at + 22);
  }
  return rom;
}

const TAGS: SyntheticTag[] = [
  { tagOffset: 0x0400, endOffset: 0x1000, name: 'exec.library', version: 40, idString: 'exec 40.10 (15.7.93)' },
  // Tag at the end of its module, as Commodore's expansion.library has it.
  { tagOffset: 0x1f00, endOffset: 0x2000, name: 'trail.library', version: 40, idString: 'trail 40.2 (1.1.93)' },
  { tagOffset: 0x2000, endOffset: 0x3000, name: 'widget.device', version: 37, idString: 'widget 37.5 (1.1.91)' },
];

/** The memory-backed emulator dreamdoor-wiring.test.ts drives the launch with. */
function memoryEmulator(): unknown {
  const mem = new Map<number, number>();
  const r8 = (a: number) => mem.get(a >>> 0) ?? 0;
  const w8 = (a: number, v: number) => {
    mem.set(a >>> 0, v & 0xff);
  };
  const r16 = (a: number) => (r8(a) << 8) | r8(a + 1);
  const w16 = (a: number, v: number) => {
    w8(a, v >>> 8);
    w8(a + 1, v);
  };
  const r32 = (a: number) => ((r16(a) << 16) | r16(a + 2)) >>> 0;
  const w32 = (a: number, v: number) => {
    w16(a, v >>> 16);
    w16(a + 2, v);
  };
  const known: Record<string, unknown> = {
    readMemory: r8, readMemory8: r8, writeMemory: w8, writeMemory8: w8,
    readMemory16: r16, writeMemory16: w16, readMemory32: r32, writeMemory32: w32,
    writeString: (a: number, s: string) => {
      for (let i = 0; i < s.length; i++) w8(a + i, s.charCodeAt(i));
      w8(a + s.length, 0);
    },
    readString: (a: number) => {
      let s = '';
      for (let i = a; r8(i) !== 0; i++) s += String.fromCharCode(r8(i));
      return s;
    },
    getMemory: () => new Uint8Array(0),
    getRegister: () => 0,
    getPC: () => 0x1000,
    getSP: () => 0x80000,
  };
  return new Proxy(known, {
    get: (target, prop: string) => (prop in target ? target[prop] : () => undefined),
  });
}

async function launch(bbsRoot: string): Promise<void> {
  const manager = new LibraryManager(
    memoryEmulator() as never,
    { id: 'test', on: () => {}, emit: () => {} } as never,
    {
      doorType: 'XIM',
      executablePath: path.join(bbsRoot, 'Doors', 'RomTest', 'RomTest'),
      bbsSession: { nodeId: 1, username: 'sysop', bbsRoot },
    } as never,
    undefined,
    null,
  );
  await manager.initialize();
}

function cacheDir(bbsRoot: string, rom: Buffer): string {
  const key = crypto.createHash('sha1').update(rom).digest('hex').slice(0, 16);
  return path.join(bbsRoot, 'tmp', 'rom-modules', key);
}

describe('Kickstart modules come from the installed ROM', () => {
  const saved = { ROM_MODULES_TEST_BOARD: process.env.ROM_MODULES_TEST_BOARD, ROM_DIR: process.env.ROM_DIR, AEDOOR_ROM: process.env.AEDOOR_ROM, AEDOOR_ROM_FILE: process.env.AEDOOR_ROM_FILE };
  let bbsRoot = '';
  let romDir = '';

  beforeEach(() => {
    bbsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rom-modules-board-'));
    romDir = path.join(bbsRoot, 'data', 'amiga-roms');
    fs.mkdirSync(romDir, { recursive: true });
    process.env.ROM_MODULES_TEST_BOARD = bbsRoot;
    process.env.ROM_DIR = romDir;
    delete process.env.AEDOOR_ROM;
    delete process.env.AEDOOR_ROM_FILE;
    clearRomCache();
  });

  afterEach(() => {
    fs.rmSync(bbsRoot, { recursive: true, force: true });
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    clearRomCache();
  });

  it('splits the installed Kickstart by its RomTags, a tag at the end of its module included', async () => {
    const rom = syntheticKickstart(TAGS, 0x4e);
    fs.writeFileSync(path.join(romDir, 'any-name-at-all.rom'), rom);

    await launch(bbsRoot);

    const dir = cacheDir(bbsRoot, rom);
    expect(fs.readFileSync(path.join(dir, 'index.txt'), 'latin1').split('\n').filter(Boolean)).toEqual([
      'exec.library_40.10',
      'trail.library_40.2',
      'widget.device_37.5',
    ]);
    // exec takes the ROM header in front of its tag; trail starts where exec
    // ended, not at its own tag.
    const expected: Record<string, [number, number]> = {
      'exec.library_40.10': [0, 0x1000],
      'trail.library_40.2': [0x1000, 0x2000],
      'widget.device_37.5': [0x2000, 0x3000],
    };
    for (const [file, [from, to]] of Object.entries(expected)) {
      const bytes = rom.subarray(from, to);
      expect({ file, cache: fs.readFileSync(path.join(dir, file)).equals(bytes) }).toEqual({ file, cache: true });
      for (const target of ['ROM', path.join('System', 'ROM')]) {
        const onDisk = fs.readFileSync(path.join(bbsRoot, target, file));
        expect({ file, target, same: onDisk.equals(bytes) }).toEqual({ file, target, same: true });
      }
    }
    // Raw resident modules are not Hunk files: none may land in Libs/.
    expect(fs.existsSync(path.join(bbsRoot, 'Libs', 'exec.library_40.10'))).toBe(false);
  });

  it('a different Kickstart replaces the modules of the previous one', async () => {
    const first = syntheticKickstart(TAGS, 0x4e);
    fs.writeFileSync(path.join(romDir, 'kickstart.rom'), first);
    await launch(bbsRoot);

    const second = syntheticKickstart(TAGS, 0x71);
    fs.writeFileSync(path.join(romDir, 'kickstart.rom'), second);
    clearRomCache();
    await launch(bbsRoot);

    expect(fs.existsSync(path.join(cacheDir(bbsRoot, second), '.complete'))).toBe(true);
    const onDisk = fs.readFileSync(path.join(bbsRoot, 'ROM', 'widget.device_37.5'));
    expect(onDisk.equals(second.subarray(0x2000, 0x3000))).toBe(true);
  });
});
