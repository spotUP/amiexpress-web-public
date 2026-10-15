/**
 * Applying a theme must not throw inside BUGS.
 *
 * `door-theme-bugs.ts` assigned to `CURRENT`, a name that module never
 * declares (its own exported theme is `THEME`). Under ESM that is a
 * ReferenceError at the first paint, and the door died on live with:
 *
 *   Error executing door: CURRENT is not defined
 *
 * The door's own bundle is what runs, so this drives the built module the
 * way the door does: apply a theme, then read the exports it feeds the
 * widgets.
 */

import * as path from 'path';

const DOOR = path.resolve(__dirname, '../../../../Doors/bug-tracker');

describe('BUGS survives a theme change', () => {
  it('applies a theme without a ReferenceError, and keeps its own THEME', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const theme = require(path.join(DOOR, 'door-theme-bugs'));
    expect(typeof theme.applyTheme).toBe('function');

    const before = theme.THEME.id;
    expect(() => theme.applyTheme({ getTheme: () => theme.THEME })).not.toThrow();

    // The SDK's own themes, applied by id the way the picker does.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { themeById } = require('@amiexpress/bbs-door-sdk/engines/ui/theme');
    const neon = themeById('uprough-neon');
    expect(() => theme.applyTheme(neon)).not.toThrow();
    expect(theme.THEME.id).toBe(neon.id);
    expect(theme.THEME.id).not.toBe(before);
    expect(theme.T).toEqual(neon.tokens);
  });

  it('no door theme module assigns to a name it does not declare', () => {
    // The whole class, not just this door: an assignment to a bare
    // identifier that the module neither declares nor imports.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs');
    const doorsDir = path.resolve(__dirname, '../../../../Doors');
    const offenders: string[] = [];
    for (const door of fs.readdirSync(doorsDir)) {
      for (const name of ['door-theme.ts', 'door-theme-bugs.ts']) {
        const file = path.join(doorsDir, door, name);
        if (!fs.existsSync(file)) continue;
        const src: string = fs.readFileSync(file, 'utf-8');
        for (const m of src.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*/gm)) {
          const id = m[1];
          const declared = new RegExp(`(let|const|var)\\s+${id}\\b|import[^;]*\\b${id}\\b`).test(src);
          if (!declared) offenders.push(`${door}/${name}: ${id}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
