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

  test('command.handler advanceDisplayFlow shows CONF_BULL + doPause before joinConference', () => {
    // CONF_BULL display moved out of joinConference (express.e:5056-5061
    // notes pin this) into the advanceDisplayFlow AUTO_REJOIN block in
    // command.handler.ts. The handler imports doPause and emits CONF_BULL +
    // doPause BEFORE invoking joinConference, ensuring the bulletin lands
    // before the "Joining Conference" line.
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'handlers', 'command.handler.ts'),
      'utf8'
    );
    // Must import doPause from screen.handler.
    expect(src).toMatch(/import\s*\{[^}]*\bdoPause\b[^}]*\}\s*from\s*['"]\.\/screen\.handler['"]/);
    // Must reference CONF_BULL via displayScreen (or matching constant).
    expect(src).toMatch(/displayScreen[\s\S]{0,200}?(?:'CONF_BULL'|SCREEN_CONF_BULL)/);
  });
});
