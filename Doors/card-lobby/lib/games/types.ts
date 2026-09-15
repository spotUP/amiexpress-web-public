/**
 * ONE SEAM FOR EVERY GAME IN THE LOBBY.
 *
 * Hold'em came first and UNO was threaded in beside it: fourteen
 * `isUnoTable(table)` branches across index.ts, GameViews and the gamepad
 * bindings, plus a set of uno-named methods on the app. It worked, but it
 * priced every future game at the same fourteen edits, and the sysop asked
 * for Skitgubbe "without duplicating code" (2026-09-15).
 *
 * So the questions the door actually asks about a table are written down
 * here, once, and each game answers them:
 *
 *   - may the poker engine restore this table's hand?   `usesPokerEngine`
 *   - which hints belong in the activity panel?          `hintKind`
 *   - how does a game start here?                        `start`
 *   - what goes in the four panels?                      `render`
 *   - what do the number keys and the pad buttons do?     `selectCard`,
 *                                                         `primaryAction`,
 *                                                         `secondaryAction`,
 *                                                         `tertiaryAction`
 *
 * A game that answers them is playable; nothing else in the door needs to
 * learn its name. Hold'em and UNO answer by delegating to the code that
 * already runs them - this is a seam, not a rewrite - and Skitgubbe answers
 * for itself.
 */

import type { LobbyTable } from '../types';

/** What the activity panel should say while this game is up. */
export type GameHintKind = 'poker' | 'uno' | 'skitgubbe' | 'vandtia' | 'patience';

/**
 * The painter. GameViews owns the four panels; a module only says which of
 * its methods draws this game, so the drawing stays in one file.
 */
export interface TableGamePainter {
  renderPokerGameView(table: LobbyTable): void;
  renderUnoGameView(table: LobbyTable): void;
  renderSkitgubbeGameView(table: LobbyTable): void;
  renderVandtiaGameView(table: LobbyTable): void;
  renderPatienceGameView(table: LobbyTable): void;
}

export interface TableGameModule {
  /** The catalogue ids this module serves (a game may have variants). */
  readonly ids: readonly string[];

  /**
   * Whether `table.hand.snapshot` is a PokerEngine snapshot.
   *
   * `loadTableHand` hands the snapshot to `PokerEngine.restore()`, and a
   * game that keeps a different shape there must say so or the table screen
   * throws on every repaint - which is exactly what UNO did on 2026-09-02.
   */
  readonly usesPokerEngine: boolean;

  readonly hintKind: GameHintKind;

  /** Deal / start a game at this table. */
  start(table: LobbyTable): Promise<void>;

  /** Paint the table panels for this game. */
  render(painter: TableGamePainter, table: LobbyTable): void;

  /** A number key: pick the nth card of the hand (0-based). */
  selectCard(index: number): void;

  /**
   * Move the picked card left or right by `delta`, wrapping at the ends.
   *
   * The number keys reach the first TEN cards and no more (index.ts binds
   * 1-9 and 0), which is fine for a hand of seven and useless for a
   * Skitgubbe hand in the shedding phase - fifteen cards is ordinary there,
   * and every card past the tenth was unplayable. csol steers a cursor with
   * the arrow keys for exactly this reason; the number keys stay as the
   * shortcut they always were.
   */
  moveSelection(delta: number): void;

  /**
   * WHICH CARD IS PICKED, if this game picks one.
   *
   * The keyboard asks so that a card key can mean both things: press it once
   * and the card is picked, press the SAME key again and it is played. "x
   * for throwing cards is not so nice, pressing the hotkey once to select
   * and once more to throw makes more sense" (sysop, 2026-09-15). ENTER
   * plays the picked card too, which is the only way to play the eleventh
   * card of a hand - there is no eleventh number key.
   *
   * A game whose keys mean something else says so by leaving this out:
   * patience picks a PILE and the second key names where the card goes, and
   * a Skitgubbe swap is 1-3 then 4-6, so neither may treat a repeat as a
   * play. It is asked per table because the same game answers differently in
   * different phases.
   */
  selectedCard?(table: LobbyTable): number | null;

  /** Pad A, and the key that means "do the main thing" at this table. */
  primaryAction(): void;

  /** Pad B - fold at poker, draw at UNO, take the card at Skitgubbe. */
  secondaryAction(): void;

  /** Pad Y - raise at poker, call UNO, and nothing at Skitgubbe. */
  tertiaryAction(): void;

  /**
   * Q at a table. UNO steals it for CHALLENGE while a challenge window is
   * open; every other game lets it mean quit. Return true to say the key was
   * consumed.
   */
  quitAction?(): boolean;

  /** Label the four action buttons for this game. */
  updateActionButtons?(table: LobbyTable): void;

  /**
   * `V`: show the other thing.
   *
   * A game can have more on the table than one panel holds - in Skitgubbe
   * your own three face-up cards and the pile both matter, at different
   * moments - and guessing which the caller wants is a guess. So the door
   * shows whichever suits the phase and this key changes its mind.
   */
  toggleView?(): void;

  /**
   * What the table's panels are called while this game is up.
   *
   * They were named for poker and never renamed, so a Skitgubbe swap
   * happened under "FLOP - Board not dealt yet." and a solitaire's piles
   * under "YOUR HAND" (the sysop's own screenshots, 2026-09-15). A panel
   * whose title describes a different game is worse than an unlabelled one:
   * it tells the reader they are looking at something they are not.
   *
   * Anything a game leaves out keeps the name it has.
   */
  panelTitles?(table: LobbyTable): { board?: string; players?: string; hand?: string };

  /**
   * What the caller should be told to press right now, for the activity
   * panel.
   *
   * ONE writer owns that panel: `updateActivityPanel` paints hints and then
   * the event log, and it runs after `render()` and again on every
   * `pushEvent`. A game that writes its own legend straight into the widget
   * has it wiped within the same frame - which is exactly what happened to
   * Skitgubbe's "1-3 hand 4-6 table X ready" on the sysop's first two games
   * (2026-09-15). So the game hands its lines to the painter instead.
   */
  activityLines?(table: LobbyTable): string[];
}
