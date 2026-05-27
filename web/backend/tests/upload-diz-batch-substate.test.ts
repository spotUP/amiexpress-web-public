/**
 * Regression: processBatchFile must not overwrite session.subState with
 * UPLOAD_DESC_INPUT after handleDizExtractionAndDescription has already
 * completed the batch (last-file-with-DIZ path).
 *
 * Root cause: when the last file in a ZMODEM batch has FILE_ID.DIZ,
 * handleDizExtractionAndDescription → processBatchFile →
 * handleUploadBatchComplete → runPostUpload → clearUploadContext clears
 * tempData and sets subState=DISPLAY_MENU before returning to the outer
 * processBatchFile.  The unconditional
 *   session.subState = UPLOAD_DESC_INPUT
 * on line 789 then put the session back into UPLOAD_DESC_INPUT with
 * tempData=undefined, causing:
 *   TypeError: Cannot read properties of undefined (reading 'currentLineBuffer')
 * on every subsequent keypress — an infinite "[ERROR] Command processing
 * failed" loop after a successful upload.
 *
 * Fix: guard the UPLOAD_DESC_INPUT assignment with `if (session.tempData)`.
 */

import * as fs from 'fs';
import * as path from 'path';

describe('processBatchFile: UPLOAD_DESC_INPUT only set when tempData still exists', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'server', 'file-socket-handlers.ts'),
    'utf8'
  );

  function pendingZmodemContinuationBlock(): string {
    // Isolate the ZMODEM batch-continuation branch inside processBatchFile.
    // It begins with 'ZMODEM batch continuation' and ends at the closing
    // brace+return of that if-block.
    const m = src.match(
      /ZMODEM batch continuation[\s\S]*?session\.subState\s*=\s*LoggedOnSubState\.UPLOAD_DESC_INPUT[\s\S]*?return;/
    );
    if (!m) throw new Error('ZMODEM batch continuation block not found in file-socket-handlers.ts');
    return m[0];
  }

  test('UPLOAD_DESC_INPUT assignment is guarded by session.tempData check', () => {
    const block = pendingZmodemContinuationBlock();
    // The guard must appear BEFORE the UPLOAD_DESC_INPUT assignment.
    // Accept both `if (session.tempData)` and `if (session.tempData != null)` etc.
    const guardIdx = block.indexOf('session.tempData');
    const assignIdx = block.lastIndexOf('UPLOAD_DESC_INPUT');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(assignIdx).toBeGreaterThan(-1);
    // The guard referencing tempData must appear before the assignment
    expect(guardIdx).toBeLessThan(assignIdx);
  });

  test('UPLOAD_DESC_INPUT assignment is inside an if-block (not unconditional)', () => {
    const block = pendingZmodemContinuationBlock();
    // Pattern: some form of `if (...tempData...)` immediately before the assignment
    expect(block).toMatch(/if\s*\(\s*session\.tempData\s*\)/);
  });

  test('handleUploadBatchComplete still called for empty pendingZmodemFiles (last-file path)', () => {
    // When pendingZmodemFiles is empty the code must reach handleUploadBatchComplete
    // to trigger runPostUpload → clearUploadContext → subState=DISPLAY_MENU.
    expect(src).toMatch(/isWebUploadMode[\s\S]*?handleUploadBatchComplete/);
  });
});

describe('initial handleDizExtractionAndDescription callers also guard UPLOAD_DESC_INPUT', () => {
  function readSrc(file: string) {
    return fs.readFileSync(path.join(__dirname, '..', 'src', 'handlers', 'commands', file), 'utf8');
  }

  for (const file of ['user-commands.handler.ts', 'transfer-misc-commands.handler.ts']) {
    test(`${file}: UPLOAD_DESC_INPUT assignment after handleDizExtractionAndDescription is guarded by session.tempData`, () => {
      const src = readSrc(file);
      // Match from the await call up to the actual subState assignment (not the comment).
      const m = src.match(
        /await handleDizExtractionAndDescription\([\s\S]*?session\.subState\s*=\s*LoggedOnSubState\.UPLOAD_DESC_INPUT/
      );
      expect(m).not.toBeNull();
      const block = m![0];
      // The if(session.tempData) guard must appear before the assignment
      expect(block).toMatch(/if\s*\(\s*session\.tempData\s*\)/);
      const guardIdx = block.indexOf('if (session.tempData)');
      const assignIdx = block.lastIndexOf('UPLOAD_DESC_INPUT');
      expect(guardIdx).toBeGreaterThan(-1);
      expect(guardIdx).toBeLessThan(assignIdx);
    });
  }
});
