process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { identifyKickstart, resolveAmigaRom, clearRomCache } from '../../src/amiga-emulation/rom/amiga-rom';
import { syntheticKickstart } from './synthetic-rom';

describe('identifyKickstart', () => {
  it('accepts a Kickstart 3.1 image and labels it from the exec id string', () => {
    const r = identifyKickstart(syntheticKickstart({ execVersion: 40 }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.label).toBe('Kickstart 3.1 (exec 40.10)');
      expect(r.execVersion).toBe(40);
    }
  });

  it('un-swaps a byte-swapped image and returns the corrected bytes', () => {
    const plain = syntheticKickstart({ execVersion: 40 });
    const r = identifyKickstart(syntheticKickstart({ execVersion: 40, swapped: true }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.equals(plain)).toBe(true);
  });

  it('rejects a 256K ROM', () => {
    const r = identifyKickstart(syntheticKickstart({ execVersion: 37, size: 256 * 1024 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/256K/);
  });

  it('rejects an encrypted Cloanto ROM', () => {
    const buf = syntheticKickstart({ execVersion: 40 });
    buf.write('AMIROMTYPE1', 0, 'latin1');
    const r = identifyKickstart(buf);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Cloanto/);
  });

  it('rejects exec 37 at 512K', () => {
    const r = identifyKickstart(syntheticKickstart({ execVersion: 37 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/exec 37/);
  });

  it('rejects a ROM relocated away from 0xF80000', () => {
    const r = identifyKickstart(syntheticKickstart({ execVersion: 40, entry: 0x2000d2 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/relocated to run at 0x2000D2/);
  });

  it('rejects random data', () => {
    expect(identifyKickstart(Buffer.alloc(512 * 1024, 7)).ok).toBe(false);
  });
});

describe('resolveAmigaRom', () => {
  let dir: string;
  const saved = { ...process.env };
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amiga-rom-'));
    process.env.ROM_DIR = dir;
    delete process.env.AEDOOR_ROM;
    delete process.env.AEDOOR_ROM_FILE;
    clearRomCache();
  });
  afterEach(() => {
    process.env = { ...saved };
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('picks a Kickstart under any filename', () => {
    fs.writeFileSync(path.join(dir, 'my a1200 dump.bin'), syntheticKickstart({ execVersion: 40 }));
    const r = resolveAmigaRom();
    expect(r.kind).toBe('kickstart');
    if (r.kind === 'kickstart') expect(r.path).toBe(path.join(dir, 'my a1200 dump.bin'));
  });

  it('prefers the highest exec version, and lists the rejects', () => {
    fs.writeFileSync(path.join(dir, 'a.rom'), syntheticKickstart({ execVersion: 39 }));
    fs.writeFileSync(path.join(dir, 'b.rom'), syntheticKickstart({ execVersion: 47 }));
    fs.writeFileSync(path.join(dir, 'junk.txt'), 'hello');
    const r = resolveAmigaRom();
    expect(r.kind === 'kickstart' && r.execVersion).toBe(47);
    expect(r.rejected.map((x) => path.basename(x.file))).toEqual(['junk.txt']);
  });

  it('falls back to AROS when no valid Kickstart exists', () => {
    fs.writeFileSync(path.join(dir, 'aros-rom.bin'), 'x');
    fs.writeFileSync(path.join(dir, 'aros-ext.bin'), 'x');
    fs.writeFileSync(path.join(dir, 'bad.rom'), syntheticKickstart({ execVersion: 37 }));
    const r = resolveAmigaRom();
    expect(r.kind).toBe('aros');
    expect(r.rejected).toHaveLength(1);
  });
});
