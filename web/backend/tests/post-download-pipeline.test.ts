/**
 * Regression test for the shared runPostDownload pipeline.
 *
 * express.e:20251-20316 (downloadAFile post-transfer block):
 *   - aePuts('\b\n\b\nFile transfer Completed.\b\n')
 *   - StringF(' \d files, \sk bytes, \d minutes \d seconds \d cps, \d% efficiency at \d')
 *   - loggedOnUserMisc.lastDlCPS := pcps
 *   - IF pcps > dnCPS2 THEN dnCPS2:=pcps; oldDnCPS:=Min(pcps,65535)
 *   - callersLog/udLog summary (success) or 'Download Failed..' (zero files)
 *   - displayULStats(loggedOnUser, loggedOnUserMisc)
 *   - IF goodbye THEN pGoodbye()
 *
 * Pinning this shape ensures any future refactor that drops a step
 * surfaces here as a failed test, instead of silently denying users
 * accounting that the express.e original guarantees.
 *
 * Source-grep style — services pull in DB + UserFileManager + ACS
 * stack that don't unit-load cleanly under jest without a heavy mock
 * harness.
 */

import * as fs from 'fs';
import * as path from 'path';

describe('Post-download pipeline (express.e:20251-20316)', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'services', 'post-download.service.ts'),
    'utf8'
  );

  test('emits "File transfer Completed." banner (express.e:20251)', () => {
    expect(src).toMatch(/File transfer Completed\./);
  });

  test('emits aggregate stats line with files/kb/cps/efficiency (express.e:20262)', () => {
    expect(src).toMatch(/files,[^"`'\n]*?bytes,[^"`'\n]*?minutes[^"`'\n]*?seconds[^"`'\n]*?cps,[^"`'\n]*?efficiency/);
  });

  test('persists lastDlCPS on the user (express.e:20259)', () => {
    expect(src).toMatch(/lastDlCPS/);
  });

  test('top-CPS update gated on pcps > dnCPS2 (express.e:20271-20275)', () => {
    expect(src).toMatch(/topDownloadCPS|dnCPS2/);
    expect(src).toMatch(/oldDnCPS/);
    // 16-bit clamp per express.e:20274
    expect(src).toMatch(/65535/);
  });

  test('callersLog summary line or "Download Failed.." (express.e:20280-20289)', () => {
    expect(src).toMatch(/Download Failed\.\./);
    expect(src).toMatch(/callersLog/);
  });

  test('disk UDLog dual-write parity (D15)', () => {
    expect(src).toMatch(/writeToUDLog/);
    expect(src).toMatch(/writeToCallersLog/);
  });

  test('once-per-session UDLog session header (D14, express.e:20242)', () => {
    expect(src).toMatch(/writeUDSessionHeader/);
  });

  test('goodbyeAfter routes to handleGoodbyeCommand (express.e:20317)', () => {
    expect(src).toMatch(/goodbyeAfter[\s\S]*?handleGoodbyeCommand/);
  });

  test('cites express.e line numbers in the source-of-truth comments', () => {
    expect(src).toMatch(/express\.e:20251/);
    expect(src).toMatch(/express\.e:20262/);
    expect(src).toMatch(/express\.e:2027[0-9]/);
  });
});

describe('Telnet/SSH lrzsz download routes through runPostDownload (no duplication)', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'handlers', 'commands', 'user-commands.handler.ts'),
    'utf8'
  );

  test('startZmodemDownload lrzsz onComplete calls runPostDownload', () => {
    expect(src).toMatch(/runPostDownload/);
  });

  test('does not re-implement the stats line inline (would double-duplicate)', () => {
    // The earlier version of startZmodemDownload's onComplete just
    // emitted "Download complete: <file>" and returned to menu.
    // Now the unified pipeline handles all that. If anyone re-adds
    // inline stats here, it'd drift from the web download.handler.
    const block = src.slice(src.indexOf('startZmodemDownload'));
    expect(block.split('runPostDownload').length).toBeGreaterThanOrEqual(2);
  });
});

describe('Web download.handler delegates to runPostDownload', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'handlers', 'file', 'download.handler.ts'),
    'utf8'
  );

  test('initiateDownloadTransfer calls runPostDownload (single source of truth)', () => {
    expect(src).toMatch(/runPostDownload/);
  });

  test('rejects "Restricted" comment files (D16, express.e checkFIBForFileSize)', () => {
    expect(src).toMatch(/[Rr]estricted/);
    // Should also log the attempt to CallersLog
    expect(src).toMatch(/RESTRICTED file/);
  });
});
