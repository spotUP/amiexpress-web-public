/**
 * THEME - pick how the doors look.
 *
 * The themes were per-user from the start, but the only way to change one
 * was a SQL update, which is fine for the sysop and useless for everybody
 * else. This is the picker.
 *
 * Drawn with the CALLER'S current theme, so the screen you choose from is
 * itself an example of what you are leaving. The new one takes effect the
 * next time a door draws - a door already on screen built its widgets from
 * the old theme, and repainting somebody's UI out from under them is worse
 * than asking them to re-enter it. The door says so rather than leaving
 * anyone wondering why nothing changed.
 */
import {
  createTerminalModeSwitch,
} from '@amiexpress/bbs-door-sdk/utils/terminal-mode';
import {
  createScreen,
  createBox,
  createList,
} from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { themeStyles, themeById, attachDoorChrome, footerStyle } from '@amiexpress/bbs-door-sdk/engines/ui/theme';
import { DoorInputManager } from '@amiexpress/bbs-door-sdk/utils/door-input-manager';
import { getCompactProfile } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { CompactProfile } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

interface DoorSession {
  bbs: any;
  user?: { username?: string };
}

/** A theme row, styled. Wide keeps the blurb column; XXS has no room for it. */
export function buildThemeItems(
  themes: Array<{ id: string; name: string; blurb: string }>,
  active: string,
  s: any,
  compact: CompactProfile,
  width = 80
): string[] {
  // `[*] ` costs four of the row's columns, and the last one is left empty
  // (writing a row's final cell leaves the terminal in a pending-wrap state).
  const nameRoom = Math.max(4, width - 5);
  return themes.map(t => {
    // The one in use is marked rather than merely highlighted: the
    // highlight follows the cursor and says nothing about what is saved.
    const mark = t.id === active ? s.accent('[*]') : s.dim('[ ]');
    // 40 columns: name only. `[*] ` costs 4 of them and a folded row eats
    // the theme underneath it, which is how the C64 lost a third of this list.
    return compact.singleColumn
      ? `${mark} ${s.ink(t.name.substring(0, nameRoom))}`
      : `${mark} ${s.ink(t.name.padEnd(16))} ${s.dim(t.blurb)}`;
  });
}

/** The line under the list, said in as many words as the screen has room for. */
export function buildNote(s: any, compact: CompactProfile): string {
  return compact.collapseChrome
    ? `  ${s.dim('Applies on next door draw.')}`
    : `  ${s.dim('A theme applies the next time a door draws.')}`;
}

/** Footer key hints; the XXS set is the same three keys, abbreviated to fit. */
export function buildFooterHints(compact: CompactProfile): Array<{ key: string; does: string }> {
  return compact.collapseChrome
    ? [
        { key: 'Up/Dn', does: 'Pick' },
        { key: 'Ent', does: 'Use' },
        { key: 'Q', does: 'Bye' },
      ]
    : [
        { key: 'Up/Down', does: 'Choose' },
        { key: 'Enter', does: 'Use it' },
        { key: 'Q', does: 'Leave' },
      ];
}

export async function createApp(session: DoorSession): Promise<void> {
  const { bbs } = session;

  const theme = bbs?.getTheme ? bbs.getTheme() : themeById('classic');
  const s = themeStyles(theme);
  const themes: Array<{ id: string; name: string; blurb: string }> =
    bbs?.listThemes ? bbs.listThemes() : [];

  if (themes.length === 0) {
    bbs.write('\r\nNo themes are available on this board.\r\n');
    return;
  }

  const screen = createScreen(bbs, { title: 'Theme' });

  // Every width decision below comes from the LIVE screen through the SDK's
  // one compact profile - no door-local 40 or 80 anywhere.
  const screenWidth = ((screen as any).width as number) || 80;
  const compact = getCompactProfile(screenWidth);

  // 80x25 like the board, or the caller's whole terminal on Alt+Enter.
  // The layout is written in percentages, so following a resize is a
  // repaint; asking the terminal to grow at all is the part no door gets
  // for free (sdk/utils/terminal-mode.ts).
  const terminalMode = createTerminalModeSwitch({
    bbs,
    screen,
    start: 'fixed',
    onRelayout: () => { screen.render(); },
  });

  const input = new DoorInputManager(session as any, screen, {
    enableGameMode: false,
    enableGrabKeys: false,
    enableMouse: true,
  });
  input.enable();

  // The masthead was a STATIC rail here - one `////` printed once - while
  // DOORS had the animated one. Since this is the screen people judge the
  // themes from, it should show what a theme actually looks like in motion.
  const mastheadRow = createBox({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: 1,
    border: undefined,
    focusable: false,
    content: '',
    style: s.bar.style,
  });

  const active = theme.id;

  const list = createList({
    parent: screen,
    top: 2,
    left: 0,
    width: '100%',
    // One row per theme, and no more. This was themes.length + 2, which
    // was fine for four and pushed the hints off a short screen at six -
    // the list must never be taller than what it holds.
    height: Math.max(1, Math.min(themes.length, ((screen as any).height || 24) - 6)),
    keys: true,
    vi: true,
    mouse: true,
    tags: true,
    border: undefined,
    style: {
      selected: s.list.style.selected,
      item: { fg: theme.tokens.dim },
    },
    items: buildThemeItems(themes, active, s, compact, screenWidth),
  });

  const listRows = Math.max(1, Math.min(themes.length, ((screen as any).height || 24) - 6));

  // The note sits under the list; the HINTS go to the bottom of the screen
  // as a real footer. They used to float together mid-screen just below the
  // list, which read as stray text rather than as the screen's footer -
  // reported as "theme looks cool but it has no footer".
  createBox({
    parent: screen,
    top: listRows + 3,
    left: 0,
    width: '100%',
    height: 1,
    border: undefined,
    focusable: false,
    content: buildNote(s, compact),
    style: s.plain.style,
  });

  const footer = createBox({
    parent: screen,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 1,
    border: undefined,
    focusable: false,
    clickable: false,
    mouse: false,
    style: footerStyle(theme),
    content: '',
  });

  /**
   * The whole chrome, from the ONE SDK call: the moving rail, the theme's
   * glitches and the hint line, all gated on the width tier together.
   *
   * This is the screen people judge a theme FROM, and it was showing two
   * of the three things a theme does - it had the rail and the footer and
   * no glitches at all, so `uprough-neon` and `slate-slash` looked like
   * palettes rather than like themes.
   */
  const chrome = attachDoorChrome(theme, {
    width: screenWidth,
    title: 'DOOR THEME',
    masthead: mastheadRow as any,
    footer: footer as any,
    // The door already picks its hint set from the LIVE profile; the SDK
    // drops the branding tail on its own at the 40-column tier.
    hints: buildFooterHints(compact),
    footerPad: ' ',
    // The LIST is the only thing here with rows to spare - damaging the
    // masthead or the hints would read as the door being broken.
    glitch: list as any,
    glitchOptions: { tickMs: 400 },
    styles: s,
    render: () => screen.render(),
  });

  list.focus();
  screen.render();

  await new Promise<void>((resolve) => {
    const done = () => {
      // Stop the chrome before the screen goes - a timer writing to a
      // destroyed screen is how a door takes the session with it. stop()
      // also puts back any row a glitch was in the middle of damaging.
      try { chrome.stop(); } catch { /* leaving anyway */ }
      try { input.disable(); } catch { /* leaving anyway */ }
      // Gives the board its 80 columns back and unhooks resize and Alt+Enter.
      terminalMode.dispose();
      try { screen.destroy(); } catch { /* leaving anyway */ }
      resolve();
    };

    (list as any).on('select', async (_item: any, index: number) => {
      const chosen = themes[index];
      if (!chosen) return done();

      let saved = chosen.id;
      if (bbs?.setTheme) {
        try {
          saved = await bbs.setTheme(chosen.id);
        } catch {
          // A theme that will not save is not worth trapping anyone over.
          saved = active;
        }
      }

      const picked = themes.find(t => t.id === saved) ?? chosen;
      done();
      bbs.write(`\r\n${picked.name} it is. Open a door to see it.\r\n\r\n`);
    });

    screen.key(['q', 'Q', 'escape'], () => done());
  });
}

export async function runDoor(bbs: any, session?: DoorSession): Promise<void> {
  await createApp({ ...(session || {}), bbs } as DoorSession);
}

export default runDoor;
