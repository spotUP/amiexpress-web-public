/**
 * Regression: AquaScan reported "Scanning dir 1 for 00:00:00" because the
 * per-user DateStamp slot in Doors/AquaScan/AquaScan.UserData was zero on
 * first login via the websocket auth path. The BBS-prompt login path was
 * already seeding it; the websocket path wasn't. Both paths now share
 * seedAquaScanSlot() from utils/aquascan-slot.util.ts.
 *
 * Slot layout (16 bytes/user):
 *   offset 0:  ds_Days     (UINT32 BE)
 *   offset 4:  ds_Minute   (UINT32 BE)
 *   offset 8:  ds_Tick     (UINT32 BE)
 *   offset 12: padding
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Mock config BEFORE the import — seedAquaScanSlot resolves the path via
// config.get('dataDir') so it must be in place before module load.
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aquascan-slot-test-'));

jest.mock('../../src/config', () => ({
  config: {
    get: (key: string) => (key === 'dataDir' ? tmpRoot : undefined),
    getConfig: () => ({ dataDir: tmpRoot }),
  },
}));

import { resolveUserSlot, seedAquaScanSlot } from '../../src/utils/aquascan-slot.util';

const aquaDir = path.join(tmpRoot, 'Doors', 'AquaScan');
const userDataPath = path.join(aquaDir, 'AquaScan.UserData');

beforeEach(() => {
  // Fresh AquaScan.UserData with 5 zero slots (5 * 16 = 80 bytes).
  fs.mkdirSync(aquaDir, { recursive: true });
  fs.writeFileSync(userDataPath, Buffer.alloc(80));
});

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('resolveUserSlot precedence', () => {
  it('prefers sessionSlot when valid', () => {
    expect(resolveUserSlot({ slotNumber: 5 }, 7)).toBe(7);
  });

  it('falls back to user.slotnumber (DB lowercase column)', () => {
    expect(resolveUserSlot({ slotnumber: 3, slotNumber: 99 })).toBe(3);
  });

  it('uses user.slotNumber camelCase if lowercase missing', () => {
    expect(resolveUserSlot({ slotNumber: 4 })).toBe(4);
  });

  it('returns 0 when nothing usable is available', () => {
    expect(resolveUserSlot({})).toBe(0);
    expect(resolveUserSlot(null)).toBe(0);
    expect(resolveUserSlot(undefined as any)).toBe(0);
  });

  it('treats sessionSlot=0 / negative as not-set, falls through to user', () => {
    expect(resolveUserSlot({ slotnumber: 2 }, 0)).toBe(2);
    expect(resolveUserSlot({ slotnumber: 2 }, -1)).toBe(2);
  });
});

describe('seedAquaScanSlot', () => {
  it('writes a fresh DateStamp into a zero slot', () => {
    const ds = seedAquaScanSlot({
      slotNumber: 2,
      lastLogin: new Date('2026-05-04T22:52:48Z'),
    });
    expect(ds).not.toBeNull();
    expect(ds!.days).toBeGreaterThan(17000); // ~year 2026 from 1978
    expect(ds!.minutes).toBeGreaterThanOrEqual(0);
    expect(ds!.minutes).toBeLessThan(1440);

    // Verify the file got written at the right slot offset.
    const buf = fs.readFileSync(userDataPath);
    const slotOffset = (2 - 1) * 16;
    expect(buf.readUInt32BE(slotOffset)).toBe(ds!.days);
    expect(buf.readUInt32BE(slotOffset + 4)).toBe(ds!.minutes);
    expect(buf.readUInt32BE(slotOffset + 8)).toBe(ds!.ticks);
  });

  it('is idempotent — does not re-seed a non-zero slot', () => {
    // Pre-fill slot 1 with a known DateStamp.
    const buf = Buffer.alloc(80);
    buf.writeUInt32BE(17654, 0); // days
    buf.writeUInt32BE(1392, 4);  // minute (23:12)
    buf.writeUInt32BE(1350, 8);  // tick (27s)
    fs.writeFileSync(userDataPath, buf);

    const ds = seedAquaScanSlot({ slotNumber: 1, lastLogin: new Date() });
    expect(ds).toBeNull(); // no seed needed

    // Slot 1 unchanged.
    const after = fs.readFileSync(userDataPath);
    expect(after.readUInt32BE(0)).toBe(17654);
    expect(after.readUInt32BE(4)).toBe(1392);
    expect(after.readUInt32BE(8)).toBe(1350);
  });

  it('returns null if slot number is missing or zero', () => {
    expect(seedAquaScanSlot({ slotNumber: 0 })).toBeNull();
    expect(seedAquaScanSlot({})).toBeNull();
    expect(seedAquaScanSlot(null)).toBeNull();
  });

  it('returns null if AquaScan.UserData does not exist', () => {
    fs.unlinkSync(userDataPath);
    expect(seedAquaScanSlot({ slotNumber: 1, lastLogin: new Date() })).toBeNull();
  });

  it('uses newSinceDate when present, falling back to lastLogin', () => {
    const newSince = new Date('2026-05-01T08:00:00Z');
    const lastLogin = new Date('2026-05-04T22:52:48Z');

    const ds = seedAquaScanSlot({
      slotNumber: 3,
      newSinceDate: newSince,
      lastLogin,
    });
    expect(ds).not.toBeNull();

    // The seed should match newSinceDate (May 1), not lastLogin (May 4).
    const expectedAmigaEpoch = new Date('1978-01-01T00:00:00Z');
    const expectedDays = Math.floor(
      (newSince.getTime() - expectedAmigaEpoch.getTime()) / (1000 * 60 * 60 * 24)
    );
    expect(ds!.days).toBe(expectedDays);
  });

  it('respects DB lowercase slotnumber column', () => {
    const ds = seedAquaScanSlot({
      slotnumber: 4, // lowercase only — what comes back from the DB row
      lastLogin: new Date('2026-05-04T22:52:48Z'),
    });
    expect(ds).not.toBeNull();

    // Verify slot 4 (offset 48) got seeded, not slot 0.
    const buf = fs.readFileSync(userDataPath);
    expect(buf.readUInt32BE((4 - 1) * 16)).toBe(ds!.days);
    // And other slots are still zero.
    expect(buf.readUInt32BE(0)).toBe(0);
  });
});
