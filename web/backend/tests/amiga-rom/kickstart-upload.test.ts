/**
 * Reachability: a ROM uploaded through the admin route is what the emulator's
 * resolver (the one LibraryManager and KickstartRom both call) then returns.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import express from 'express';
import request from 'supertest';
import { createKickstartRouter } from '../../src/api/kickstart-routes';
import { resolveAmigaRom, clearRomCache } from '../../src/amiga-emulation/rom/amiga-rom';
import { syntheticKickstart } from './synthetic-rom';

const sysop = async () => ({ userId: '1', username: 'sysop', secLevel: 255 });
const user = async () => ({ userId: '2', username: 'x', secLevel: 30 });
const app = (verify: () => Promise<any>) => {
  const a = express();
  a.use(createKickstartRouter({ verifyAccessToken: verify } as any));
  return a;
};

describe('Kickstart upload route', () => {
  let dir: string;
  const saved = { ...process.env };
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ks-upload-'));
    process.env.ROM_DIR = dir;
    delete process.env.AEDOOR_ROM;
    delete process.env.AEDOOR_ROM_FILE;
    clearRomCache();
  });
  afterEach(() => {
    process.env = { ...saved };
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('installs the upload and the resolver then returns it', async () => {
    const before = await request(app(sysop)).get('/api/config/kickstart').set('Authorization', 'Bearer t');
    expect(before.body.found).toBe(false);

    const res = await request(app(sysop))
      .post('/api/upload/kickstart')
      .set('Authorization', 'Bearer t')
      .attach('rom', syntheticKickstart({ execVersion: 40, swapped: true }), 'whatever name.bin');

    expect(res.status).toBe(200);
    expect(res.body.installed).toBe('Kickstart 3.1 (exec 40.10)');
    const rom = resolveAmigaRom();
    expect(rom.kind).toBe('kickstart');
    if (rom.kind === 'kickstart') {
      expect(rom.path).toBe(path.join(dir, 'kickstart.rom'));
      expect(rom.label).toBe('Kickstart 3.1 (exec 40.10)');
    }
  });

  it('refuses a non-Kickstart and writes nothing', async () => {
    const res = await request(app(sysop))
      .post('/api/upload/kickstart')
      .set('Authorization', 'Bearer t')
      .attach('rom', syntheticKickstart({ execVersion: 37 }), 'old.rom');
    expect(res.status).toBe(400);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('refuses a caller who is not a sysop', async () => {
    const res = await request(app(user))
      .post('/api/upload/kickstart')
      .set('Authorization', 'Bearer t')
      // A tiny body: the guard answers before reading it, and a 512K body
      // still being written when the 403 lands fails the test with EPIPE.
      .attach('rom', Buffer.from('x'), 'k.rom');
    expect(res.status).toBe(403);
  });
});
