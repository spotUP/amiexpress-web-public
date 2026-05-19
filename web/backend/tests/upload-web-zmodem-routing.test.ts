/**
 * Regression: U command on web clients must route through ZMODEM via
 * `startZmodemUpload`, not the dead HTTP-picker `show-file-upload`
 * path.
 *
 * Why this regression exists:
 *   Phase 4 ZMODEM unification (c67e50385) removed the BBS-user branch
 *   of `processFileUpload` in file-socket-handlers.ts. After that
 *   cleanup, any code path that still emitted `show-file-upload` →
 *   POST /api/upload → `file-upload-ready` would silently drop the
 *   uploaded file in `processFileUpload` (logged "unexpected
 *   invocation… Ignoring."). The frontend then waited forever for the
 *   next `show-file-upload` event and the UI appeared stuck after
 *   picking the first file in a batch.
 *
 *   `startBatchUploadTransfer` previously had a transport-gated branch
 *   that only ran ZMODEM for telnet/SSH and fell through to the dead
 *   HTTP-picker path for web. Pin that the branch is gone so a future
 *   "tidy up" can't re-introduce it.
 *
 * Same grep-style approach as upload-abort-state.test.ts because
 * command.handler.ts can't be loaded cleanly under jest.
 */

import * as fs from 'fs';
import * as path from 'path';

describe('U-command web routing through ZMODEM (no HTTP picker)', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'handlers', 'command.handler.ts'),
    'utf8'
  );

  function startBatchUploadTransferBody(): string {
    // Capture the function body up to the next top-level "}\n\n" boundary.
    const m = src.match(
      /function startBatchUploadTransfer\([^)]*\)\s*:\s*void\s*\{([\s\S]*?)\n\}\n/
    );
    if (!m) throw new Error('startBatchUploadTransfer not found');
    return m[1];
  }

  test('startBatchUploadTransfer hands off to startZmodemUpload', () => {
    expect(startBatchUploadTransferBody()).toMatch(/startZmodemUpload\s*\(/);
  });

  test('startBatchUploadTransfer does NOT emit show-file-upload (HTTP picker dead path)', () => {
    // Match only an active emit, not the explanatory comment that names the event.
    expect(startBatchUploadTransferBody()).not.toMatch(/emit\s*\(\s*['"]show-file-upload['"]/);
  });

  test('startBatchUploadTransfer does NOT branch on connectionType — all transports share the ZMODEM path', () => {
    // The old code did `if (transport === 'telnet' || transport === 'ssh')`
    // and fell through to HTTP picker for web. The whole transport gate
    // must be gone.
    const body = startBatchUploadTransferBody();
    expect(body).not.toMatch(/connectionType/);
    expect(body).not.toMatch(/===\s*['"]telnet['"]/);
  });

  test('startBatchUploadTransfer still preserves goodbyeAfterTransfer flag (express.e:25657 parity)', () => {
    // The flag must be set on tempData BEFORE handing off to ZMODEM
    // — runPostUpload reads it to honour express.e modemOffHook().
    expect(startBatchUploadTransferBody()).toMatch(/goodbyeAfterTransfer\s*=\s*goodbyeAfter/);
  });
});
