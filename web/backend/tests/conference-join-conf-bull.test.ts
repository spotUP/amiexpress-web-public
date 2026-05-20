/**
 * Regression tests for:
 *   - NODE_BULL sysop alert suppression (#20)
 *   - CONF_BULL display on every conference join (#21)
 *
 * Both are grep-style structural guards: the underlying paths pull in
 * the whole screen-handler + conference subsystem (amiga-emulation etc.)
 * which the jest harness can't load cleanly. Pinning the call-site shape
 * catches regressions where someone 'tidies up' the silent flag or
 * accidentally drops the CONF_BULL call again.
 */

import * as fs from 'fs';
import * as path from 'path';

describe('Node/conference screen display wiring (2026-04-24)', () => {
  test('DISPLAY_NODE_BULL call uses silent=true', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'handlers', 'command.handler.ts'),
      'utf8'
    );
    // Look for the NODE_BULL display inside the DISPLAY_NODE_BULL branch.
    const nodeBullBlock = src.match(
      /subState === LoggedOnSubState\.DISPLAY_NODE_BULL[\s\S]{0,800}?displayScreen\(socket, session, 'NODE_BULL'[^)]*\)/
    );
    expect(nodeBullBlock).not.toBeNull();
    const call = nodeBullBlock![0];
    // Fourth/fifth arg must pass a silent truthy value so missing file
    // doesn't notifySysop the user with a red 'Screen not found' toast.
    expect(call).toMatch(/NODE_BULL'\s*,\s*true\s*,\s*\/\*\s*silent\s*\*\/\s*true/);
  });

  test('command.handler advanceDisplayFlow invokes joinConference (which owns the CONF_BULL display)', () => {
    // CONF_BULL display now lives inside joinConference (express.e:5058
    // parity — the bulletin is shown as part of "Joining Conference",
    // not separately by the caller). command.handler's advanceDisplayFlow
    // calls joinConference for the AUTO_REJOIN transition; that's the
    // architectural pin we want to keep stable.
    //
    // History: an earlier version of this test expected a direct
    // displayScreen('CONF_BULL') call from command.handler.ts. That
    // shape predated commits that moved CONF_BULL rendering into
    // joinConference; the assertion was retargeted 2026-05-20.
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'handlers', 'command.handler.ts'),
      'utf8'
    );
    // Must import doPause from screen.handler (the post-CONF_BULL pause
    // hook is still imported for cases other than the AUTO_REJOIN path).
    expect(src).toMatch(/import\s*\{[^}]*\bdoPause\b[^}]*\}\s*from\s*['"]\.\/screen\.handler['"]/);
    // Must call joinConference (the function that owns CONF_BULL render).
    expect(src).toMatch(/joinConference\s*\(/);
  });
});
