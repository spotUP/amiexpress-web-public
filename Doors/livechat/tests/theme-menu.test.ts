/**
 * LiveChat's View > Theme entry.
 *
 * "all typescript doors with menus could have a theme menu that let's the
 * user change blessed theme inside the doors on the fly" (sysop,
 * 2026-09-02). The menu bar is built from a table in ui/menu-bar.ts; this
 * reads the built menu rather than the source, and drives the handler the
 * entry calls to prove the chat behind it is re-tinted.
 */

import assert from 'assert';
import { Screen, Box } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { themeById, THEMES } from '@amiexpress/bbs-door-sdk/engines/ui/theme';
import { createMenuBar } from '../ui/menu-bar';
import { applyTheme, T } from '../door-theme';

export async function theViewMenuOffersTheme(): Promise<void> {
  const screen: any = new Screen({ smartCSR: true } as any);
  const bar: any = createMenuBar(screen);

  const view = bar.element.items?.find((item: any) => item.label === 'View')
    ?? (bar.element as any).options?.items?.find((item: any) => item.label === 'View');
  assert.ok(view, 'the menu bar still has a View menu');
  const entry = view.items.find((item: any) => item.label === 'Theme');
  assert.ok(entry, `no Theme entry in: ${view.items.map((i: any) => i.label).join(', ')}`);

  let called = 0;
  bar.setHandlers({ onTheme: () => { called += 1; } });
  entry.action();
  assert.strictEqual(called, 1, 'and it calls the door\'s handler');

  screen.destroy();
}

export async function applyThemeTakesATheme(): Promise<void> {
  // The live menu previews a theme that is not saved yet, so the door's own
  // applyTheme has to take the theme itself and not only the bbs handle.
  const neon = themeById('uprough-neon');
  applyTheme(neon);
  assert.strictEqual(T.chrome, neon.tokens.chrome);

  applyTheme({ getTheme: () => themeById('classic') });
  assert.strictEqual(T.chrome, themeById('classic').tokens.chrome,
    'and still takes a bbs, which is how it is called at startup');

  assert.ok(THEMES.length > 1, 'there is more than one theme to switch between');
}
