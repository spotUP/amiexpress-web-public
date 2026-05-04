// @ts-nocheck
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getNextMsgId } from '../../src/utils/message-file.util';

describe('getNextMsgId — express.e:10576-10624 MSGID generator', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aex-msgid-'));
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  test('returns 8-char uppercase hex string', async () => {
    const id = await getNextMsgId(tmpDir);
    expect(id).not.toBeNull();
    expect(id!.length).toBe(8);
    expect(id).toMatch(/^[0-9A-F]{8}$/);
  });

  test('successive calls produce monotonically-increasing IDs', async () => {
    const a = await getNextMsgId(tmpDir);
    const b = await getNextMsgId(tmpDir);
    const c = await getNextMsgId(tmpDir);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(c).not.toBeNull();
    const aN = parseInt(a!, 16);
    const bN = parseInt(b!, 16);
    const cN = parseInt(c!, 16);
    // express.e:10613 v++; 10614 time-floor — strictly increasing.
    expect(bN).toBeGreaterThan(aN);
    expect(cN).toBeGreaterThan(bN);
  });

  test('counter file persists between calls (8-hex + LF)', async () => {
    await getNextMsgId(tmpDir);
    const counterPath = path.join(tmpDir, 'msgidnr.nxt');
    expect(fs.existsSync(counterPath)).toBe(true);
    const raw = fs.readFileSync(counterPath, 'utf-8');
    // express.e:10618 StringF format `\\z\\h[8]\\n`
    expect(raw).toMatch(/^[0-9A-F]{8}\n$/);
  });

  test('lockfile is cleaned up after successful call', async () => {
    await getNextMsgId(tmpDir);
    const lockPath = path.join(tmpDir, 'msgidnr.lck');
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  test('seeds from current time when counter file is missing', async () => {
    // First call with empty dir — no counter file. Should seed from
    // getSystemTime per express.e:10611.
    const before = Math.floor(Date.now() / 1000);
    const id = await getNextMsgId(tmpDir);
    const after = Math.floor(Date.now() / 1000);
    const idN = parseInt(id!, 16);
    expect(idN).toBeGreaterThanOrEqual(before);
    expect(idN).toBeLessThanOrEqual(after);
  });
});
