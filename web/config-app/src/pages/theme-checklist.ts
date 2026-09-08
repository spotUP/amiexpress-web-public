/**
 * What a complete theme is, and how far along this one is.
 *
 * An artist opening the studio could see the screens that already have art and
 * nothing else - so the ones with the most to gain, the eighteen the board has
 * no art for at all, were invisible. There was no way to start one either:
 * every route into the editor began with an existing file. The sysop, after
 * asking for a list to send an artist: "elevate all needed theme screens so
 * they are editable in the studio also include a checklist that updates so
 * artists can see their progress".
 *
 * The board's own catalogue is the definition of complete. This turns it into
 * a list of slots - drawn or not - each knowing the path its file belongs at
 * inside the theme, so a blank one can be started with a click.
 */
import { SCREEN_DIR_MAP, ScreenDirType, getScreenFileName, isBoardWritten } from '@bbs/screens/screen-tables';
import { describeScreen } from './screen-descriptions';
import type { ScreenIndexShape } from './screen-index-view';

export interface ThemeSlot {
  /** The catalogue name: BBSTITLE, CONF_BULL. For a logo, its file name. */
  screen: string;
  /**
   * Where the board looks for it.
   *
   * `files` is the fourth scope: art no catalogue name claims, which a screen
   * pulls in BY PATH - the group logos in `Screens/`, the ones spliced into
   * LOGON and LOGOFF. A caller sees them on the way in, so a theme without
   * them is a theme wearing somebody else's logo.
   */
  scope: 'node' | 'conf' | 'board' | 'files';
  /** The conference it belongs to, for conference screens. */
  conference?: number;
  /** What a caller is doing when they meet it. */
  description: string;
  /** Board-relative path inside the theme: Themes/<slug>/Node/BBSTITLE.txt */
  path: string;
  /** The file, once the theme has it. */
  drawn: boolean;
}

const SCOPE_DIR: Record<'node' | 'conf' | 'board', string> = {
  node: 'Node',
  conf: 'Conf',
  board: 'Board',
};

const scopeOf = (dirType: ScreenDirType): 'node' | 'conf' | 'board' =>
  dirType === ScreenDirType.NODE ? 'node' : dirType === ScreenDirType.CONF ? 'conf' : 'board';

/**
 * The extension a new screen is drawn as.
 *
 * `.TXT` for everything: the loader tries the caller's screen type first and
 * falls back to it, so a theme with only text files still serves every caller.
 * PETSCII and RIP are a separate job and a separate file.
 */
const DRAWN_AS = '.TXT';

/**
 * Every slot a complete theme has, in the order an artist meets them.
 *
 * A conference screen becomes one slot per conference the board has, because
 * that is how many files the artist has to draw - Conf/1/BULL.TXT is not
 * Conf/2/BULL.TXT.
 */
export function themeChecklist(
  index: ScreenIndexShape | undefined,
  themeSlug: string,
): ThemeSlot[] {
  const conferences = (index?.conferences ?? []).map(c => c.id);
  const files = index?.files ?? {};
  const root = `Themes/${themeSlug}`;

  /** A theme file counts as drawn whatever case or extension it carries. */
  const drawnAt = new Set(
    Object.keys(files)
      .filter(rel => rel.toLowerCase().startsWith(`${root.toLowerCase()}/`))
      .map(rel => rel.toLowerCase().replace(/\.(txt|gr|ans|asc|ibm)$/i, '')),
  );

  const slots: ThemeSlot[] = [];
  const push = (screen: string, scope: 'node' | 'conf' | 'board', conference?: number) => {
    const file = getScreenFileName(screen);
    const dir = scope === 'conf'
      ? `${root}/${SCOPE_DIR.conf}/${conference}`
      : `${root}/${SCOPE_DIR[scope]}`;
    const path = `${dir}/${file}${DRAWN_AS}`;
    slots.push({
      screen,
      scope,
      conference,
      description: describeScreen(screen),
      path,
      drawn: drawnAt.has(path.toLowerCase().replace(/\.(txt|gr|ans|asc|ibm)$/i, '')),
    });
  };

  for (const [screen, dirType] of Object.entries(SCREEN_DIR_MAP)) {
    // A screen the BOARD writes is not a slot. `ACHIEVETOP` is the
    // leaderboard, rewritten every fifteen minutes by the achievements
    // bulletin: an artist who drew it would watch their work disappear, and a
    // theme copy of it froze live's leaderboards once already. The sysop's own
    // art slots for that screen are `AchieveTop.Header` / `.Tailer`, which the
    // board splices in and never overwrites.
    if (isBoardWritten(`${getScreenFileName(screen)}.txt`)) continue;
    const scope = scopeOf(dirType);
    if (scope !== 'conf') {
      push(screen, scope);
      continue;
    }
    // No conferences known yet (the index is still loading) - one slot, so the
    // artist sees the screen exists rather than a list that grows under them.
    if (conferences.length === 0) push(screen, 'conf', 1);
    else for (const id of conferences) push(screen, 'conf', id);
  }

  /*
   * The logos.
   *
   * A screen the catalogue names is one slot; the art a screen PULLS IN is
   * not in the catalogue at all, and on this board that is where the group
   * logos live - LOGON splices in two of them, LOGOFF picks from three. They
   * are reached by PATH, so their home in a theme is the `Files/` mirror,
   * verbatim, which is the tree that arm of the loader reads.
   *
   * Only files whose readers are ALL includes: a file some screen also
   * resolves to already has its slot above, in the scope the loader reads it
   * at, and two slots for one file would ask an artist to draw it twice.
   */
  for (const file of Object.values(files)) {
    if (file.theme) continue;                       // already a theme's own copy
    if (file.generated) continue;                   // leftovers, and what the board writes
    const readers = file.readBy ?? [];
    if (readers.length === 0) continue;             // nothing reads it; the sysop's problem
    if (!readers.every(reader => reader.via === 'include')) continue;

    const path = `${root}/Files/${file.relPath}`;
    slots.push({
      screen: file.relPath.split('/').pop() ?? file.relPath,
      scope: 'files',
      description: `Pulled into ${readers[0].screen}`,
      path,
      drawn: drawnAt.has(path.toLowerCase().replace(/\.(txt|gr|ans|asc|ibm)$/i, '')),
    });
  }

  return slots;
}

export interface ThemeProgress {
  drawn: number;
  total: number;
  /** By scope, for a breakdown that tells an artist where the work is. */
  byScope: Record<'node' | 'conf' | 'board' | 'files', { drawn: number; total: number }>;
}

export function themeProgress(slots: ThemeSlot[]): ThemeProgress {
  const byScope = {
    node: { drawn: 0, total: 0 },
    conf: { drawn: 0, total: 0 },
    board: { drawn: 0, total: 0 },
    files: { drawn: 0, total: 0 },
  };
  for (const slot of slots) {
    byScope[slot.scope].total += 1;
    if (slot.drawn) byScope[slot.scope].drawn += 1;
  }
  return {
    drawn: slots.filter(s => s.drawn).length,
    total: slots.length,
    byScope,
  };
}
