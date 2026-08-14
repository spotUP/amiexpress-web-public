/**
 * Regression: batch download (F+D / flagged-files-batch path) must
 * reject files whose DIR description starts "Restricted", matching the
 * single-file download path and express.e:checkFIBForFileSize.
 *
 * Without this, a sysop marks a file Restricted but a user can flag it
 * via F then download it via F+D batch — D16 in the parity diff.
 *
 * The restricted check now lives in the shared file-restriction.util
 * (single source of truth; its behavior is tested in
 * tests/utils/file-restriction.util.test.ts). This grep-style test guards
 * the WIRING in the batch handler: it resolves the description, gates via
 * isRestrictedComment, and `continue`s (skips the download push) while
 * logging the attempt. (The handler drags in the BBS subsystem and can't
 * be loaded under jest, hence source assertions.)
 */

import * as fs from 'fs';
import * as path from 'path';

describe('batch download enforces Restricted gate (D16)', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'handlers', 'transfer', 'batch-download.handler.ts'),
    'utf8'
  );

  test('resolves the DIR description and gates via the shared util', () => {
    expect(src).toMatch(/resolveFileDescription\s*\(/);
    expect(src).toMatch(/isRestrictedComment\s*\(/);
  });

  test('restricted branch continues without pushing to downloadList and logs the attempt', () => {
    // From the isRestrictedComment gate up to the next `continue`.
    const block = src.match(/isRestrictedComment\([\s\S]*?\)\)\s*\{([\s\S]*?continue;)/);
    expect(block).not.toBeNull();
    expect(block![1]).toMatch(/continue/);
    expect(block![1]).not.toMatch(/downloadList\.push/);
    expect(block![1]).toMatch(/Attempt to download RESTRICTED file/);
    expect(block![1]).toMatch(/callersLog/);
    expect(block![1]).toMatch(/failCount\+\+/);
  });
});
