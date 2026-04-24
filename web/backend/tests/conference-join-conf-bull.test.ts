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

  test('joinConference calls displayScreen("CONF_BULL") with silent=true', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'handlers', 'operations', 'conference.handler.ts'),
      'utf8'
    );
    // Must import doPause alongside displayScreen so the doPause() after
    // CONF_BULL compiles.
    expect(src).toMatch(/import\s*\{[^}]*\bdoPause\b[^}]*\}\s*from\s*['"]\.\.\/screen\.handler['"]/);
    // Must invoke displayScreen with 'CONF_BULL' and silent=true.
    expect(src).toMatch(/displayScreen\(socket,\s*session,\s*'CONF_BULL'[^)]*true[^)]*\)/);
    // Must be inside the non-silent join branch (i.e. not inside an
    // `if (silent)` guard) — do that by requiring the call to appear
    // BEFORE the 'auto-rejoin' branch marker.
    const callIdx = src.search(/displayScreen\(socket,\s*session,\s*'CONF_BULL'/);
    const autoBranchIdx = src.search(/express\.e:5066-5088 - auto-rejoin/);
    expect(callIdx).toBeGreaterThan(0);
    expect(autoBranchIdx).toBeGreaterThan(callIdx); // CONF_BULL fires first
  });
});
