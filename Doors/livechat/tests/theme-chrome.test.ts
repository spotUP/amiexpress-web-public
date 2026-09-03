/**
 * LiveChat wears the board's theme.
 *
 * "livechat doesnt look themed at all" (sysop, 2026-09-03), measured on a
 * live render: with uprough-neon active, the border colours actually on
 * screen were gray, cyan, blue, green, yellow, red and black. The door's
 * theme binding was fine - `T` held the right tokens - but ui/theme.ts
 * handed every one of sixty-seven call sites the literal 'gray'.
 *
 * Driven, not read: the door is opened under a theme and asked what colour
 * its panels ended up.
 */

import assert from 'assert';
import { createApp } from '../server';
import { themeById } from '@amiexpress/bbs-door-sdk/engines/ui/theme';
import { PANEL_BORDER, PANEL_BORDER_FOCUS, refreshPanelChrome } from '../ui/theme';
import { applyTheme } from '../door-theme';

async function open(themeId: string): Promise<any> {
  const theme = themeById(themeId);
  const bbs: any = {
    write: () => {}, writeLine: () => {}, on: () => {},
    getTerminalSize: () => ({ width: 100, height: 30 }),
    getTheme: () => theme,
    enableWideMode: () => {}, disableWideMode: () => {},
    getModemSpeed: () => 0, disableModemEmulation: () => {}, setModemSpeed: () => {},
    connectionType: 'web', unicodeCapable: true,
  };
  const socket: any = { on: () => {}, emit: () => {}, off: () => {}, removeAllListeners: () => {} };
  const app: any = await createApp({
    bbs, socket, params: [],
    bbsSession: { userId: 1, username: 'sysop', nodeId: 1, secLevel: 255, tempData: {}, socket },
    user: { id: 1, name: 'sysop', accessLevel: 255 },
  } as any);
  return { app, theme };
}

/** The titled panels and their border colour - the frames a caller sees. */
function titledPanels(screen: any): Array<{ label: string; fg: string }> {
  const found: Array<{ label: string; fg: string }> = [];
  const walk = (el: any, depth = 0): void => {
    if (!el || depth > 6) return;
    const label = String(el?.options?.label ?? '').trim();
    const fg = el?.style?.border?.fg;
    if (label && fg) found.push({ label, fg: String(fg) });
    (el.children ?? []).forEach((child: any) => walk(child, depth + 1));
  };
  walk(screen);
  return found;
}

/** Every border colour on screen, deduplicated. */
function borderColours(screen: any): string[] {
  const found = new Set<string>();
  const walk = (el: any, depth = 0): void => {
    if (!el || depth > 6) return;
    const fg = el?.style?.border?.fg;
    if (fg) found.add(String(fg));
    (el.children ?? []).forEach((child: any) => walk(child, depth + 1));
  };
  walk(screen);
  return [...found];
}

export async function thePanelsTakeTheThemesPrimaryColour(): Promise<void> {
  const { app, theme } = await open('uprough-neon');
  try {
    assert.strictEqual(PANEL_BORDER, theme.tokens.accent,
      'the idle border is the theme\'s primary colour, not a hardcoded gray');
    assert.strictEqual(PANEL_BORDER_FOCUS, theme.tokens.ink,
      'and the focused one is the brightest thing the theme has');

    // Every PANEL - the things with a title on their frame, which is what a
    // caller sees as "the borders in the app" - takes the theme's colour.
    // Buttons keep semantic colours (a Cancel that matched every border
    // would stop reading as the way out) and are token-sourced, not
    // literals.
    const panels = titledPanels(app.screen);
    assert.ok(panels.length >= 4, `found the panels: ${panels.length}`);
    const wrong = panels.filter((panel) => panel.fg !== theme.tokens.accent);
    assert.deepStrictEqual(wrong, [],
      `every titled panel is the theme's primary colour, got: ${
        wrong.map((p) => `${p.label}=${p.fg}`).join(', ')}`);
  } finally { app.screen?.destroy?.(); }
}

export async function aDifferentThemeGivesDifferentBorders(): Promise<void> {
  // The point of the whole exercise: the same door, two boards, two looks.
  applyTheme(themeById('quiet-phosphor'));
  refreshPanelChrome();
  const phosphor = PANEL_BORDER;

  applyTheme(themeById('uprough-neon'));
  refreshPanelChrome();
  const neon = PANEL_BORDER;

  assert.notStrictEqual(phosphor, neon, 'two themes, two border colours');
  assert.strictEqual(phosphor, themeById('quiet-phosphor').tokens.accent);
  assert.strictEqual(neon, themeById('uprough-neon').tokens.accent);
}

export async function theFocusStyleIsReadWhenAWidgetIsBuilt(): Promise<void> {
  // PANEL_FOCUS_STYLE is spread into a widget's style at build time, which
  // is after the theme is known - so it has to be a getter, not a value
  // frozen at import.
  const { PANEL_FOCUS_STYLE } = await import('../ui/theme');
  applyTheme(themeById('classic'));
  refreshPanelChrome();
  const classic = { ...PANEL_FOCUS_STYLE }.focus.border.fg;

  applyTheme(themeById('uprough-neon'));
  refreshPanelChrome();
  const neon = { ...PANEL_FOCUS_STYLE }.focus.border.fg;

  assert.notStrictEqual(classic, neon, 'the spread reads the theme in force');
}
