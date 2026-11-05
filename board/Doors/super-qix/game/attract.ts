/**
 * The attract mode.
 *
 * A cabinet left alone does not sit on a menu - it cycles: what the game is
 * worth, who has done best at it, and an invitation to play. Asked for as
 * "the arcade's, with a blinking 'press button' in place of 'insert coin'":
 * a BBS door has no coin slot, so entering the door IS the coin and the
 * invitation asks for a key instead.
 *
 * Frogger's attract is the model this follows, down to the tick-counted
 * phases and the blink measured in frames rather than wall-clock, so the two
 * doors behave the same way when the board is idle.
 */

import { HighScore, SuperQixData } from './types';
import {
  DRAW_BASE_POINTS,
  POINTS_PER_BONUS_PERCENT,
  CAPTURE_POINTS,
  LETTER_END_OF_LEVEL_POINTS,
  LETTER_WORD_COMPLETE_POINTS,
  SPARE_LETTER_POINTS,
  EXTRA_LIFE_PERCENT,
  MAX_HIGHSCORES,
} from './constants';

export type AttractPhase = 'points' | 'ranking' | 'invite';

export const ATTRACT_ORDER: AttractPhase[] = ['points', 'ranking', 'invite'];

/** How long each panel stays up, in game ticks (~30 per second). */
export const ATTRACT_FRAMES: Record<AttractPhase, number> = {
  points: 180,
  ranking: 180,
  invite: 120,
};

/** How fast the invitation blinks, in ticks per state. */
export const ATTRACT_BLINK_FRAMES = 12;

/** How long the menu sits untouched before the cabinet takes over, in ticks. */
export const ATTRACT_IDLE_FRAMES = 300;   // ~10 seconds

/** Centre a line of plain text and colour it. */
function centred(text: string, width: number, colour: string): string {
  const pad = Math.max(0, Math.floor((width - text.length) / 2));
  return `{${colour}-fg}${' '.repeat(pad)}${text}{/}`;
}

/** A label and a figure, laid out as the cabinet's score table is. */
function scoreRow(label: string, value: string, width: number, colour: string): string {
  const row = `${label.padEnd(24)}${value.padStart(8)}`;
  return centred(row, width, colour);
}

/** What the game pays for, straight from the scoring constants. */
export function pointTablePanel(width: number): string[] {
  return [
    centred('SCORING', width, 'lightcyan'),
    '',
    scoreRow('AREA CLAIMED', `${DRAW_BASE_POINTS} / %`, width, 'lightblue'),
    scoreRow('OVER THE TARGET', `${POINTS_PER_BONUS_PERCENT} / %`, width, 'lightblue'),
    scoreRow('GREMLIN SEALED IN', `${CAPTURE_POINTS}`, width, 'lightblue'),
    scoreRow('LETTER, WORD UNDONE', `${LETTER_END_OF_LEVEL_POINTS}`, width, 'lightblue'),
    scoreRow('LETTER, WORD DONE', `${LETTER_WORD_COMPLETE_POINTS}`, width, 'lightblue'),
    scoreRow('SPARE LETTER', `${SPARE_LETTER_POINTS}`, width, 'lightblue'),
    '',
    centred(`TAKE ${EXTRA_LIFE_PERCENT}% FOR AN EXTRA MARKER`, width, 'lightyellow'),
  ];
}

/** The board's best, as the cabinet shows it between rounds. */
export function rankingPanel(scores: HighScore[], width: number): string[] {
  const rows = scores.slice(0, Math.min(5, MAX_HIGHSCORES)).map((entry, i) => {
    const rank = `${i + 1}`.padStart(2);
    const name = (entry.name || '---').substring(0, 10).padEnd(10);
    const score = `${entry.score}`.padStart(8);
    return centred(`${rank}  ${name}${score}`, width, i === 0 ? 'lightyellow' : 'lightblue');
  });

  return [
    centred('BEST ON THIS BOARD', width, 'lightcyan'),
    '',
    ...(rows.length > 0 ? rows : [centred('NOBODY HAS PLAYED YET', width, 'gray')]),
  ];
}

/**
 * The invitation.
 *
 * The cabinet blinks INSERT COIN here. Nobody is putting a coin in a BBS, so
 * it asks for a key - and it blinks, because a still line in an attract loop
 * reads as a crashed door rather than an invitation.
 */
export function invitePanel(data: SuperQixData, width: number, blinkOn: boolean): string[] {
  return [
    '',
    '',
    blinkOn ? centred('PRESS ANY KEY', width, 'lightgreen') : '',
    '',
    '',
    centred(`${data.targetPercent}% OF THE FIELD TO CLEAR A ROUND`, width, 'lightyellow'),
  ];
}

/** The credit line under every panel. */
export function creditLine(width: number): string {
  // Not "TAITO (C) 1987": this is a port. The credit is theirs, the code is
  // not, and stamping their notice on it would be a lie.
  return centred('ORIGINAL BY TAITO 1987', width, 'white');
}

/** One attract screen, ready to render. */
export function attractScreen(
  phase: AttractPhase,
  data: SuperQixData,
  width: number,
  frame: number
): string[] {
  const blinkOn = Math.floor(frame / ATTRACT_BLINK_FRAMES) % 2 === 0;

  const body =
    phase === 'points' ? pointTablePanel(width) :
    phase === 'ranking' ? rankingPanel(data.highscores, width) :
    invitePanel(data, width, blinkOn);

  return [...body, '', creditLine(width)];
}

/** The phase that follows this one. */
export function nextPhase(phase: AttractPhase): AttractPhase {
  const i = ATTRACT_ORDER.indexOf(phase);
  return ATTRACT_ORDER[(i + 1) % ATTRACT_ORDER.length];
}
