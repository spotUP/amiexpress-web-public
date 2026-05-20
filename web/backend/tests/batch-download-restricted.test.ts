/**
 * Regression: batch download (F+D / flagged-files-batch path) must
 * reject files whose comment starts "Restricted", matching the
 * single-file download path at download.handler.ts:340 and the
 * express.e:checkFIBForFileSize gate.
 *
 * Without this, a sysop marks a file as Restricted in its description
 * but a user can still flag it via F then download it via F+D batch
 * — a documented security gap (D16 in the upload/download parity diff).
 *
 * Grep-style — batch-download.handler.ts can't be loaded under jest
 * (drags in the BBS subsystem).
 */

import * as fs from 'fs';
import * as path from 'path';

describe('batch download enforces Restricted comment prefix (D16)', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'handlers', 'transfer', 'batch-download.handler.ts'),
    'utf8'
  );

  test('the validation loop checks comment.toLowerCase().startsWith("restricted")', () => {
    expect(src).toMatch(
      /comment[\s\S]{0,200}?toLowerCase\(\)\.startsWith\(['"]restricted['"]\)/
    );
  });

  test('matched-restricted file is NOT pushed to downloadList', () => {
    // The Restricted branch must `continue` (skip the downloadList.push
    // / ratioRequests.push pair) before the success-accounting block.
    // Capture from the restricted-startsWith check up to the next `continue`.
    const block = src.match(
      /toLowerCase\(\)\.startsWith\(['"]restricted['"]\)\)\s*\{([\s\S]*?continue;)/
    );
    expect(block).not.toBeNull();
    expect(block![1]).toMatch(/continue/);
    expect(block![1]).not.toMatch(/downloadList\.push/);
  });

  test('attempt is logged to callersLog (sysop visibility per express.e)', () => {
    // Capture from the restricted-startsWith check up to the next `continue`.
    const block = src.match(
      /toLowerCase\(\)\.startsWith\(['"]restricted['"]\)\)\s*\{([\s\S]*?continue;)/
    );
    expect(block).not.toBeNull();
    expect(block![1]).toMatch(/Attempt to download RESTRICTED file/);
    expect(block![1]).toMatch(/callersLog/);
  });

  test('failCount is incremented (user gets visibility, batch totals stay honest)', () => {
    // Capture from the restricted-startsWith check up to the next `continue`.
    const block = src.match(
      /toLowerCase\(\)\.startsWith\(['"]restricted['"]\)\)\s*\{([\s\S]*?continue;)/
    );
    expect(block).not.toBeNull();
    expect(block![1]).toMatch(/failCount\+\+/);
  });
});
