/**
 * What the ACTIVITY panel says about the moment, above the event log.
 *
 * Kept away from the door so the wording can be tested without a terminal,
 * and because the door had grown to the repo's 2000-line ceiling on the way
 * to writing it.
 *
 * The keys belong to the GAME being played: an UNO table was being shown
 * poker's "F Fold  X Check  C Call  R Raise" in a panel too narrow to hold
 * the line (reported 2026-09-02, with a screenshot).
 */

import { UI_THEME } from './constants';

export interface ActivityHintInput {
  /** Only a table view has anything to hint about. */
  viewMode: 'lobby' | 'table';
  /** The table being played, if any. */
  table: { players: Array<{ role: string; stack: number }>; minPlayers: number } | null;
  /** True for an UNO table (isUnoTable), false for a poker one. */
  isUno: boolean;
  /** The player's own id, to tell "your turn" from "waiting for". */
  userId: string | null;
  /** The live hand, when one is dealt. */
  engine: { state: { actionTo?: number | null; players: Array<{ id?: string; name?: string }> } } | null;
}

export function buildActivityHints(input: ActivityHintInput): string[] {
  const { viewMode, table, isUno, userId, engine } = input;
  if (viewMode !== 'table' || !table || !userId) return [];

  const lines: string[] = [];

  if (!engine) {
    const seated = table.players.filter((player) => player.role === 'player' && player.stack > 0);
    lines.push(seated.length < table.minPlayers
      ? `{${UI_THEME.warning}-fg}Waiting for players to join...{/}`
      : `{${UI_THEME.warning}-fg}Ready to deal. Press D or use Deal to start.{/}`);
  } else {
    const seat = engine.state.actionTo;
    if (seat === null || seat === undefined) {
      lines.push(`{${UI_THEME.warning}-fg}Dealing in progress...{/}`);
    } else {
      const actor = engine.state.players[seat];
      if (actor?.id === userId) {
        lines.push(`{${UI_THEME.warning}-fg}Your turn. Choose an action below.{/}`);
      } else if (actor?.name) {
        lines.push(`{${UI_THEME.warning}-fg}Waiting for ${actor.name} to act...{/}`);
      }
    }
  }

  lines.push(isUno
    ? `{${UI_THEME.dim}-fg}Keys: D Draw  L Leave{/}`
    : `{${UI_THEME.dim}-fg}Keys: F Fold  X Check  C Call  R Raise  L Leave  D Deal{/}`);

  return lines;
}
