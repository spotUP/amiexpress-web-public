/**
 * What a screen slot IS, and what that lets you do.
 *
 * Step 1 of `thoughts/shared/plans/2026-09-14-screens-one-page-one-dialog-design.md`.
 *
 * The studio used to decide whether an artist may draw from four hidden
 * variables - whose theme the file is in, whether the file exists, which
 * format the slot is, and an `isNew` flag - read in six places and shown in
 * none. Four variables is sixteen states; the UI rendered a different set of
 * buttons for each and never said which state it was in, so an artist who
 * could not draw had no way to find out why. Three dead ends came out of that
 * in one evening, and the sysop's verdict was that he could not use the tool
 * he had commissioned.
 *
 * So the answer is computed ONCE, here, as a value with a name - and the
 * chrome renders the name instead of re-deriving it. The two properties that
 * matter are enforced by the tests beside this file:
 *
 *   - no state is a dead end: every one offers at least one way forward;
 *   - no state is silent: every one says what it is, in a sentence.
 *
 * Pure. No React, no fetching, no DOM.
 */
import type { ArtistTheme } from './use-my-theme';
import type { ScreenIndexShape } from './screen-index-view';

/** The formats a slot's bytes can be in, as the file route reports them. */
export type SlotFormat = 'ansi' | 'text' | 'petscii' | 'rip' | 'binary';

/** What the file route returns for an open slot. Narrowed to what state needs. */
export interface SlotFile {
  format: SlotFormat;
  bytes: number;
  content: string;
}

export interface ScreenSlotInput {
  /** Board-relative path of the open slot, or null when nothing is open. */
  path: string | null;
  /** The file at that path, or undefined when nothing is drawn there. */
  file: SlotFile | undefined;
  isLoading: boolean;
  /** The theme the artist is WEARING, which is not always the file's own. */
  theme: ArtistTheme;
  index: ScreenIndexShape | undefined;
}

export type ScreenSlotState =
  | { kind: 'loading' }
  /** The artist's own theme owns this file, and it is drawn. */
  | { kind: 'yours-drawn'; path: string; format: SlotFormat }
  /** The artist's own theme owns this slot, and nothing is drawn in it. */
  | { kind: 'yours-undrawn'; path: string; boardCopy?: string }
  /** Another artist's theme owns it. */
  | { kind: 'theirs-drawn'; path: string; format: SlotFormat; owner: string }
  /** The board's own screen, seen from inside a theme. */
  | { kind: 'boards-drawn'; path: string; format: SlotFormat }
  /** Bytes no editor on this board can open. */
  | { kind: 'undrawable'; path: string; reason: string };

/** Everything a slot's chrome may offer. */
export type SlotAction =
  | 'draw'
  | 'upload'
  | 'copy-board'
  | 'redraw-into-mine'
  | 'download'
  | 'delete';

/**
 * The board's own screens have no theme of their own.
 *
 * `default` is not a directory - it IS the board - so a file with no theme is
 * the file `default` owns. Comparing it to the slug instead called every board
 * screen "somebody else's" and offered to copy the board's art into the board.
 */
const BOARD_SLUG = 'default';

/** The file's own theme, or undefined for a board screen. */
function themeOf(index: ScreenIndexShape | undefined, path: string): string | undefined {
  return index?.files?.[path]?.theme;
}

/**
 * The board's copy of the same screen, when there is one.
 *
 * An artist staring at an undrawn slot usually wants to start from what the
 * board already shows rather than from an empty screen, so the state carries
 * where that is - the chrome should not have to go looking.
 */
function boardCopyOf(index: ScreenIndexShape | undefined, path: string): string | undefined {
  const name = path.split('/').pop()?.toLowerCase();
  if (!name || !index?.files) return undefined;
  for (const [candidate, facts] of Object.entries(index.files)) {
    if (facts.theme) continue;                                   // a theme's copy is not the board's
    if (candidate.split('/').pop()?.toLowerCase() === name) return candidate;
  }
  return undefined;
}

export function screenSlotState(input: ScreenSlotInput): ScreenSlotState {
  const { path, file, isLoading, theme, index } = input;
  if (isLoading || !path) return { kind: 'loading' };

  const fileTheme = themeOf(index, path);
  const yours = theme.slug === BOARD_SLUG ? !fileTheme : fileTheme === theme.slug;

  if (!file) {
    // Nothing drawn here. Whose slot it is decides whether that is an
    // invitation or somebody else's business.
    if (yours) return { kind: 'yours-undrawn', path, boardCopy: boardCopyOf(index, path) };
    return fileTheme
      ? { kind: 'theirs-drawn', path, format: 'text', owner: fileTheme }
      : { kind: 'boards-drawn', path, format: 'text' };
  }

  if (file.format === 'binary') {
    return { kind: 'undrawable', path, reason: 'These bytes are not art this board can draw.' };
  }

  if (yours) return { kind: 'yours-drawn', path, format: file.format };
  if (fileTheme) return { kind: 'theirs-drawn', path, format: file.format, owner: fileTheme };
  return { kind: 'boards-drawn', path, format: file.format };
}

export interface SlotAffordances {
  /** One sentence naming the state, shown above the art and never omitted. */
  sentence: string;
  /** Every way forward this state permits. NEVER empty - see the file header. */
  actions: readonly SlotAction[];
}

export function slotAffordances(state: ScreenSlotState): SlotAffordances {
  switch (state.kind) {
    case 'loading':
      return { sentence: 'Looking for this screen.', actions: ['download'] };

    case 'yours-drawn':
      return {
        sentence: 'Yours, and drawn.',
        actions: ['draw', 'upload', 'download', 'delete'],
      };

    case 'yours-undrawn':
      return {
        sentence: state.boardCopy
          ? 'Yours, and nothing is drawn here yet. You can draw one, bring a file in, or start from the board’s.'
          : 'Yours, and nothing is drawn here yet.',
        actions: state.boardCopy ? ['draw', 'upload', 'copy-board'] : ['draw', 'upload'],
      };

    case 'theirs-drawn':
      return {
        sentence: `${state.owner}’s screen, not yours - redraw it to get a copy you can change.`,
        actions: ['redraw-into-mine', 'download'],
      };

    case 'boards-drawn':
      return {
        sentence: 'The board’s own screen - redraw it to get a copy in your theme.',
        actions: ['redraw-into-mine', 'download'],
      };

    case 'undrawable':
      return { sentence: state.reason, actions: ['download'] };
  }
}

/**
 * One of every state, for the two properties to be checked against.
 *
 * Exported rather than built in the test so that a state added to the union
 * without a case here fails to compile, and one added here without a case in
 * `slotAffordances` fails the same way.
 */
export const ALL_SLOT_STATES: readonly ScreenSlotState[] = [
  { kind: 'loading' },
  { kind: 'yours-drawn', path: 'Themes/a/Node/BBSTITLE.SEQ', format: 'petscii' },
  { kind: 'yours-undrawn', path: 'Themes/a/Node/BBSTITLE.SEQ' },
  { kind: 'yours-undrawn', path: 'Themes/a/Node/BBSTITLE.SEQ', boardCopy: 'Node1/BBSTITLE.SEQ' },
  { kind: 'theirs-drawn', path: 'Themes/b/Node/BBSTITLE.SEQ', format: 'ansi', owner: 'b' },
  { kind: 'boards-drawn', path: 'Node1/BBSTITLE.SEQ', format: 'rip' },
  { kind: 'undrawable', path: 'Node1/BBSTITLE.SEQ', reason: 'These bytes are not art this board can draw.' },
];
