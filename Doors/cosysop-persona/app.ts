/**
 * COSYSOP - choose WHO answers when you page.
 *
 * A caller told the sysop that Kevin - the co-sysop - is arrogant and not
 * nice. He is, on purpose, and until this he was the only voice the board
 * had. This picker is the caller's way out of him: fourteen personas, plus
 * the board's own default and Random.
 *
 * Same shape as SCREENTHEME, deliberately - it is the same kind of setting
 * (something the BOARD does for this caller, that outlives the door), it sits
 * beside it under `W`, and it appears in the new-caller script beside it too.
 * What a caller may choose is not decided here: `bbs.listCoSysopPersonas()`
 * and `bbs.setCoSysopPersona()` both go through the board's own resolver, so
 * this picker can never offer a persona the chat would refuse.
 *
 * Like the screen theme, it cannot show you the result: the voice arrives the
 * next time you page. The note under the list says so.
 */
import {
  createTerminalModeSwitch,
} from '@amiexpress/bbs-door-sdk/utils/terminal-mode';
import {
  createScreen,
  createBox,
  createList,
} from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import {
  themeStyles, themeById, attachDoorChrome, footerStyle, type Theme,
} from '@amiexpress/bbs-door-sdk/engines/ui/theme';
import { DoorInputManager } from '@amiexpress/bbs-door-sdk/utils/door-input-manager';
import { getCompactProfile } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { CompactProfile } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

interface DoorSession {
  bbs: any;
  user?: { username?: string };
}

/** One row of the picker. */
export interface PersonaChoice {
  slug: string;
  handle: string;
  name: string;
  blurb: string;
}

/**
 * The two rows that are CHOICES, not characters.
 *
 * `''` is not a persona - it is "whatever the sysop set", which is what every
 * caller has today - and `random` is a stored choice like any other slug that
 * the board rolls when the page is taken. Neither is in the roster the board
 * answers with, so neither can come back from `listCoSysopPersonas()`, and a
 * caller with no row for them could never get back to either.
 */
export const BOARD_DEFAULT: PersonaChoice = {
  slug: '',
  handle: "The board's own choice",
  name: '',
  blurb: 'Whoever the sysop put on the desk.',
};

export const RANDOM_CHOICE: PersonaChoice = {
  slug: 'random',
  handle: 'Random',
  name: '',
  blurb: 'A different one every time you page.',
};

/** The board's default first, the cast in the middle, Random last. */
export function rosterFor(personas: PersonaChoice[]): PersonaChoice[] {
  const cast = personas.filter((p) => p.slug !== '' && p.slug !== RANDOM_CHOICE.slug);
  return [BOARD_DEFAULT, ...cast, RANDOM_CHOICE];
}

/**
 * A persona row, styled. Wide keeps the blurb; 40 columns has no room for it.
 *
 * The same numbers as the screen theme picker's rows and for the same
 * reasons: `[*] ` costs four columns, blessed's selected-item caret costs two
 * more, and the last cell is left empty because writing it puts the terminal
 * in a pending-wrap state. A row that folds eats the persona underneath it.
 */
export function buildPersonaItems(
  personas: PersonaChoice[],
  active: string,
  s: any,
  compact: CompactProfile,
  width = 80,
): string[] {
  const nameRoom = Math.max(4, width - 4 - 2 - 1);
  return personas.map(persona => {
    // The one in force is MARKED, not merely highlighted: the highlight
    // follows the cursor and says nothing about who will pick up.
    const mark = persona.slug === active ? s.accent('[*]') : s.dim('[ ]');

    if (compact.singleColumn) {
      return `${mark} ${s.ink(persona.handle.substring(0, nameRoom))}`;
    }

    const line = `${persona.handle.padEnd(12)} ${persona.blurb}`.substring(0, nameRoom);
    const cut = Math.max(12, persona.handle.length);
    return `${mark} ${s.ink(line.slice(0, cut))} ${s.dim(line.slice(cut + 1))}`;
  });
}

/** The line under the list, said in as many words as the screen has room for. */
export function buildNote(s: any, compact: CompactProfile): string {
  return compact.collapseChrome
    ? `  ${s.dim('Applies the next time you page.')}`
    : `  ${s.dim('This is who answers the next time you page the sysop.')}`;
}

/**
 * The line under the list AFTER a save, said in as many words as the screen
 * has room for.
 *
 * Width-gated like buildNote above, and for the same reason - it was not
 * (2026-09-13): `  <handle> saved. That is who answers your next page.` is
 * two columns of indent plus the handle plus 44, so it folded on a
 * 40-column row for EVERY handle in the roster, and a folded row eats the
 * footer under it.
 */
export function buildSavedNote(s: any, compact: CompactProfile, handle: string): string {
  const saved = `${handle} saved.`;
  if (compact.collapseChrome) {
    // Two for the indent, one left empty so the row never writes its last
    // cell (a written fortieth cell latches pending-wrap on a C64).
    return `  ${s.ok(saved.substring(0, 37))}`;
  }
  return `  ${s.ok(saved)} ${s.dim('That is who answers your next page.')}`;
}

/** Footer key hints; the 40-column set is the same three keys, abbreviated. */
export function buildFooterHints(compact: CompactProfile): Array<{ key: string; does: string }> {
  return compact.collapseChrome
    ? [
        { key: 'Up/Dn', does: 'Pick' },
        { key: 'Ent', does: 'Keep' },
        { key: 'Q', does: 'Bye' },
      ]
    : [
        { key: 'Up/Down', does: 'Choose' },
        { key: 'Enter', does: 'Keep them' },
        { key: 'Q', does: 'Leave' },
      ];
}

export async function createApp(session: DoorSession): Promise<void> {
  const { bbs } = session;

  const theme: Theme = bbs?.getTheme ? bbs.getTheme() : themeById('classic');
  const s = themeStyles(theme);

  const screen = createScreen(bbs, { title: 'Co-Sysop' });
  const screenWidth = ((screen as any).width as number) || 80;
  const compact = getCompactProfile(screenWidth);

  const available: PersonaChoice[] = bbs?.listCoSysopPersonas ? bbs.listCoSysopPersonas() : [];
  const personas = rosterFor(available);

  let active: string = bbs?.getCoSysopPersona ? bbs.getCoSysopPersona() : BOARD_DEFAULT.slug;

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

  const mastheadRow = createBox({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: 1,
    border: undefined,
    focusable: false,
    content: '',
    style: { fg: theme.tokens.dim, bg: theme.tokens.ground },
  });

  const listRows = Math.max(1, Math.min(personas.length, ((screen as any).height || 24) - 6));

  const list = createList({
    parent: screen,
    top: 2,
    left: 0,
    width: '100%',
    height: listRows,
    keys: true,
    vi: true,
    mouse: true,
    tags: true,
    border: undefined,
    style: {
      selected: s.list.style.selected,
      item: { fg: theme.tokens.dim },
    },
    items: buildPersonaItems(personas, active, s, compact, screenWidth),
  });

  const noteRow = createBox({
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

  const chrome = attachDoorChrome(theme, {
    width: screenWidth,
    title: 'CO-SYSOP',
    masthead: mastheadRow as any,
    footer: footer as any,
    hints: buildFooterHints(compact),
    footerPad: ' ',
    glitch: list,
    glitchOptions: { tickMs: 400 },
    styles: s,
    render: () => screen.render(),
  } as never);

  // Open ON the choice in force, not on row zero.
  (list as any).select(Math.max(0, personas.findIndex(p => p.slug === active)));
  list.focus();
  screen.render();

  await new Promise<void>((resolve) => {
    const done = () => {
      try { chrome.stop(); } catch { /* leaving anyway */ }
      try { input.disable(); } catch { /* leaving anyway */ }
      terminalMode.dispose();
      try { screen.destroy(); } catch { /* leaving anyway */ }
      // SGR 0 and a clear UNDER it: blessed leaves whatever attributes it last
      // wrote in force, and a C64 commits its one screen background at the
      // last clear - a reset alone hands the board the door's colours.
      try { bbs.write('\x1b[0m\x1b[2J\x1b[H\x1b[?25h'); } catch { /* leaving anyway */ }
      resolve();
    };

    (list as any).on('select', async (_item: any, index: number) => {
      const chosen = personas[index];
      if (!chosen) return done();

      let saved = active;
      if (bbs?.setCoSysopPersona) {
        try {
          // Answers the slug ACTUALLY in force: the board refuses rather than
          // stores a preference the chat would not honour, so this is what
          // the mark must follow.
          saved = await bbs.setCoSysopPersona(chosen.slug);
        } catch {
          saved = active;
        }
      }

      active = saved;
      // Repaint the rows, not the screen: the mark moved and nothing else did.
      (list as any).setItems(buildPersonaItems(personas, active, s, compact, screenWidth));
      const picked = personas.find(p => p.slug === saved) ?? chosen;
      noteRow.setContent(buildSavedNote(s, compact, picked.handle));
      screen.render();
    });

    screen.key(['q', 'Q', 'escape'], () => done());
  });
}
