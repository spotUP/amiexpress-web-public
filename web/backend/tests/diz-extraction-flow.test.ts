/**
 * Behavior test for FILE_ID.DIZ extraction during the upload flow.
 *
 * express.e:19258-19370 — every uploaded archive is scanned for
 * `FILE_ID.DIZ`. If found, the contents become the file's default
 * description (user can still override). If absent, the BBS prompts
 * the user for a description.
 *
 * This test exercises the real extractor stack (adm-zip → extractor →
 * read DIZ) end-to-end against an on-disk temp ZIP, so a regression in
 * any of those layers surfaces here rather than as a silent
 * "description prompt fired despite valid DIZ".
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import AdmZip = require('adm-zip');
import { extractAndReadDiz } from '../src/utils/file-diz.util';

const tmpRoot = path.join(os.tmpdir(), 'amiexpress-diz-tests');

beforeAll(() => {
  fs.mkdirSync(tmpRoot, { recursive: true });
});

afterAll(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

function makeWorkDir(name: string): string {
  const dir = path.join(tmpRoot, `wd-${name}-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

describe('FILE_ID.DIZ extraction during upload', () => {
  test('returns description lines from a ZIP containing FILE_ID.DIZ', async () => {
    const archive = path.join(tmpRoot, 'with-diz.zip');
    const zip = new AdmZip();
    zip.addFile(
      'FILE_ID.DIZ',
      Buffer.from('Sample release\nLine two of description\nLine three')
    );
    zip.addFile('data.bin', Buffer.from('payload'));
    zip.writeZip(archive);

    const workDir = makeWorkDir('with-diz');
    const lines = await extractAndReadDiz(archive, workDir, [], 10);

    expect(lines).not.toBeNull();
    expect(lines!.length).toBeGreaterThanOrEqual(2);
    expect(lines![0]).toContain('Sample release');
    expect(lines!.some((l) => l.includes('Line two'))).toBe(true);
  });

  test('returns null when ZIP has no FILE_ID.DIZ', async () => {
    const archive = path.join(tmpRoot, 'no-diz.zip');
    const zip = new AdmZip();
    zip.addFile('readme.txt', Buffer.from('this archive has no DIZ'));
    zip.addFile('data.bin', Buffer.from('payload'));
    zip.writeZip(archive);

    const workDir = makeWorkDir('no-diz');
    const lines = await extractAndReadDiz(archive, workDir, [], 10);

    // Caller branch: null → prompt user for description.
    expect(lines).toBeNull();
  });

  test('treats FILE_ID.DIZ case-insensitively (file_id.diz, file_ID.diZ)', async () => {
    const archive = path.join(tmpRoot, 'lowercase-diz.zip');
    const zip = new AdmZip();
    zip.addFile('file_id.diz', Buffer.from('Lowercase variant works'));
    zip.writeZip(archive);

    const workDir = makeWorkDir('lowercase-diz');
    const lines = await extractAndReadDiz(archive, workDir, [], 10);

    expect(lines).not.toBeNull();
    expect(lines![0]).toContain('Lowercase variant works');
  });

  test('caps DIZ at requested max lines', async () => {
    const archive = path.join(tmpRoot, 'long-diz.zip');
    const zip = new AdmZip();
    const fifteen = Array.from({ length: 15 }, (_, i) => `Line ${i + 1}`).join('\n');
    zip.addFile('FILE_ID.DIZ', Buffer.from(fifteen));
    zip.writeZip(archive);

    const workDir = makeWorkDir('long-diz');
    const lines = await extractAndReadDiz(archive, workDir, [], 5);

    expect(lines).not.toBeNull();
    expect(lines!.length).toBeLessThanOrEqual(5);
  });

  test('strips trailing whitespace + empty trailing lines', async () => {
    const archive = path.join(tmpRoot, 'trailing-whitespace.zip');
    const zip = new AdmZip();
    zip.addFile(
      'FILE_ID.DIZ',
      Buffer.from('First line   \nSecond line\t\n\n\n')
    );
    zip.writeZip(archive);

    const workDir = makeWorkDir('trailing-ws');
    const lines = await extractAndReadDiz(archive, workDir, [], 10);

    expect(lines).not.toBeNull();
    // No empty lines retained at the end of the description.
    expect(lines![lines!.length - 1].trim()).not.toBe('');
    // Per-line trailing whitespace trimmed.
    expect(lines![0]).not.toMatch(/ +$/);
  });
});
