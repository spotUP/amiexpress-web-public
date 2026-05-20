/**
 * Regression: displayUploadInterface must refuse to start the upload
 * flow when the playpen has less than the 2 MB express.e floor
 * (express.e:18989-19001). Without this, an upload to a full disk
 * silently truncates on the first ENOSPC write and rz aborts with a
 * partial file in playpen — same UX as the disk-full incident
 * 2026-05-20 that motivated the audit.
 *
 * Grep-style — file.handler.ts can't be loaded under jest (drags in
 * the BBS subsystem).
 */

import * as fs from 'fs';
import * as path from 'path';

describe('displayUploadInterface enforces a free-space floor before starting upload', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'handlers', 'file', 'file.handler.ts'),
    'utf8'
  );

  function displayUploadInterfaceBody(): string {
    const m = src.match(
      /export function displayUploadInterface\([^)]*\)\s*\{([\s\S]*?)\n\}\n/
    );
    if (!m) throw new Error('displayUploadInterface not found');
    return m[1];
  }

  test('declares the 2 MB minimum-playpen constant (express.e:18989 parity)', () => {
    const body = displayUploadInterfaceBody();
    expect(body).toMatch(/MIN_PLAYPEN_BYTES\s*=\s*2\s*\*\s*1024\s*\*\s*1024/);
  });

  test('reads free bytes via readFreeBytes(ulPath) for the gate', () => {
    const body = displayUploadInterfaceBody();
    expect(body).toMatch(/freeBytes\s*=\s*readFreeBytes\s*\(\s*ulPath\s*\)/);
  });

  test('refuses upload with express.e parity text when below the floor', () => {
    const body = displayUploadInterfaceBody();
    // express.e:18996 — 'Not enough free space for uploading!\b\n'
    expect(body).toMatch(/Not enough free space for uploading/);
  });

  test('returns to DISPLAY_MENU after rejecting (does NOT advance to UPLOAD_FILENAME_INPUT)', () => {
    const body = displayUploadInterfaceBody();
    // The rejection branch must transition to DISPLAY_MENU before the
    // normal UPLOAD_FILENAME_INPUT assignment. We pin that the
    // rejection path appears BEFORE the FILENAME_INPUT setter.
    const rejectIdx = body.indexOf('Not enough free space');
    const inputIdx = body.indexOf('UPLOAD_FILENAME_INPUT');
    expect(rejectIdx).toBeGreaterThan(-1);
    expect(inputIdx).toBeGreaterThan(-1);
    expect(rejectIdx).toBeLessThan(inputIdx);
  });

  test('readFreeBytes helper exists (shared by formatSpaceValue + the floor gate)', () => {
    expect(src).toMatch(/function readFreeBytes\(dirPath: string\): number/);
  });

  test('formatSpaceValue delegates to readFreeBytes (no duplicate statfs probe)', () => {
    // Was duplicated inline in formatSpaceValue before the floor gate;
    // pinning the refactor so they stay one source.
    const m = src.match(/function formatSpaceValue\([^)]*\)[^{]*\{([\s\S]*?)\n\}/);
    expect(m).not.toBeNull();
    expect(m![1]).toMatch(/readFreeBytes\s*\(\s*dirPath\s*\)/);
  });
});
