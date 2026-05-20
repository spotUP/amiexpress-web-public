/**
 * Regression: startZmodemUpload must install a real socket-emit sender
 * for web transport — `getTransferTransport` returns a no-op placeholder
 * function when `session.transferRawSend` is missing (always true for web,
 * since transferRawSend is only set by setupTelnetSSHHandler).
 *
 * Pre-fix bug shape:
 *   const transport = getTransferTransport(session);  // .send is no-op fn
 *   if (!transport.send) {  // function is truthy — branch NEVER fires
 *     transport.send = (buf) => socket.emit('transfer-raw:data', buf);
 *   }
 *
 * Result: lrzsz writes bytes to transport.send() → no-op → browser never
 * receives ZRINIT → zmodem.js Sentry never detects the session → 30s
 * client-side timeout fires → transfer-raw:cancel → rz killed by SIGTERM.
 * User-visible symptom: U-command multi-file upload picks files, "arming
 * Sentry" logs, then nothing for 30s, then "Upload cancelled."
 *
 * The RZ command (transfer-misc-commands.handler.ts) doesn't have this
 * bug because it builds its sender inline:
 *   const sender = session.transferRawSend || ((b) => socket.emit(...));
 *
 * Same grep-style approach as upload-abort-state.test.ts because
 * user-commands.handler.ts can't be loaded cleanly under jest (drags in
 * the whole BBS subsystem).
 */

import * as fs from 'fs';
import * as path from 'path';

describe('startZmodemUpload installs a real socket-emit sender for web', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'handlers', 'commands', 'user-commands.handler.ts'),
    'utf8'
  );

  function startZmodemUploadBody(): string {
    // Capture function body up to the matching closing brace at column 0.
    const m = src.match(
      /export function startZmodemUpload\([^)]*\)\s*:\s*void\s*\{([\s\S]*?)\n\}\n/
    );
    if (!m) throw new Error('startZmodemUpload not found');
    return m[1];
  }

  test('startZmodemUpload installs a real socket-emit sender on the web branch', () => {
    const body = startZmodemUploadBody();
    // Must have an unconditional (or web-conditional) assignment to
    // transport.send that actually calls socket.emit('transfer-raw:data', ...).
    // The pre-fix `if (!transport.send)` guard is broken because
    // getTransferTransport always returns a truthy placeholder, so the
    // assignment never fires for web. Look for a web-specific replacement.
    expect(body).toMatch(
      /transport\.type\s*===\s*['"]web['"][\s\S]*?transport\.send\s*=[\s\S]*?socket\.emit\(\s*['"]transfer-raw:data['"]/
    );
  });

  test('startZmodemUpload does NOT rely solely on the (falsy-check) `if (!transport.send)` guard', () => {
    // The standalone broken guard read like:
    //   if (!transport.send) { transport.send = (buf) => socket.emit(...); }
    // …with no surrounding web check. The fixed shape introduces an
    // explicit `transport.type === 'web'` branch first. A regression
    // would remove the web branch and revert to the bare falsy check.
    const body = startZmodemUploadBody();

    // It's OK to KEEP the `if (!transport.send)` as a fallback for
    // telnet/SSH after the web branch — what we don't want is a code
    // shape where the ONLY assignment is gated on the truthy
    // placeholder, i.e. no web branch in sight.
    const hasWebBranch =
      /transport\.type\s*===\s*['"]web['"]/.test(body);
    expect(hasWebBranch).toBe(true);
  });

  test('getTransferTransport still returns a placeholder send (pinning the trap that motivates the fix)', () => {
    // If someone fixes getTransferTransport to return null/undefined
    // when transferRawSend is missing, the explicit web branch in
    // startZmodemUpload would become a no-op overwrite — still
    // correct, but the *original* bug shape (truthy placeholder
    // defeats the falsy guard) is gone. This test pins the current
    // helper shape so a future "tidy up" that re-removes the web
    // branch under the assumption that the falsy guard is enough
    // surfaces immediately.
    expect(src).toMatch(
      /function getTransferTransport[\s\S]*?send\s*=[\s\S]*?transferRawSend\s*\|\|[\s\S]*?\(\s*\(buf[^)]*\)\s*=>\s*\{/
    );
  });
});
