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
  createScreen,
  createBox,
  createList,
} from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { themeStyles, themeById, attachMasthead } from '@amiexpress/bbs-door-sdk/engines/ui/theme';
import { DoorInputManager } from '@amiexpress/bbs-door-sdk/utils/door-input-manager';

interface DoorSession {
  bbs: any;
  user?: { username?: string };
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
  const stopMasthead = attachMasthead(mastheadRow as any, theme, {
    title: 'DOOR THEME',
    // One column short: writing a row's last cell leaves the terminal in a
    // pending-wrap state and clips the final character.
    width: Math.max(1, ((screen as any).width || 80) - 1),
    rail: s.accent,
    ink: s.ink,
    render: () => screen.render(),
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
    items: themes.map(t => {
      // The one in use is marked rather than merely highlighted: the
      // highlight follows the cursor and says nothing about what is saved.
      const mark = t.id === active ? s.accent('[*]') : s.dim('[ ]');
      return `${mark} ${s.ink(t.name.padEnd(16))} ${s.dim(t.blurb)}`;
    }),
  });

  const listRows = Math.max(1, Math.min(themes.length, ((screen as any).height || 24) - 6));

  createBox({
    parent: screen,
    top: listRows + 3,
    left: 0,
    width: '100%',
    height: 3,
    border: undefined,
    focusable: false,
    content: [
      '',
      `  ${s.dim('A theme applies the next time a door draws.')}`,
      `  ${s.key('Up/Down:')} choose   ${s.key('Enter:')} use it   ${s.key('Q:')} leave`,
    ].join('\n'),
    style: s.plain.style,
  });

  list.focus();
  screen.render();

  await new Promise<void>((resolve) => {
    const done = () => {
      // Stop the masthead before the screen goes - a timer writing to a
      // destroyed screen is how a door takes the session with it.
      try { stopMasthead(); } catch { /* leaving anyway */ }
      try { input.disable(); } catch { /* leaving anyway */ }
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
