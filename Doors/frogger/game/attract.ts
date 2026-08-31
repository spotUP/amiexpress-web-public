/**
 * Frogger - Attract mode
 *
 * What the cabinet shows when nobody is playing: the title over the point
 * table, then the score ranking, then the invitation to play, then the
 * machine playing itself. Any key drops out of it into the menu.
 *
 * The panels are built here as plain lines of tagged text so they can be
 * asserted without a terminal attached.
 */

import { FroggerData } from './types';
import { SCORES, LIVES_OPTIONS } from './constants';

/** The order the cabinet cycles through, and how long each one holds. */
export type AttractPhase = 'points' | 'ranking' | 'invite' | 'demo';

export const ATTRACT_ORDER: AttractPhase[] = ['points', 'ranking', 'invite', 'demo'];

/** How long each panel stays up, in game ticks (20 per second). */
export const ATTRACT_FRAMES: Record<AttractPhase, number> = {
  points: 140,
  ranking: 140,
  invite: 100,
  demo: 600,
};

/** How fast the invitation blinks, in ticks per state. */
export const ATTRACT_BLINK_FRAMES = 10;

/**
 * The title, drawn as a block font.
 *
 * '#' is the letter, and a yellow edge is laid down one column to the right
 * of every stroke, which is the shading the arcade logo has.
 */
const LETTERS: Record<string, string[]> = {
  F: ['######', '##....', '#####.', '##....', '##....'],
  R: ['#####.', '##..##', '#####.', '##.##.', '##..##'],
  O: ['.####.', '##..##', '##..##', '##..##', '.####.'],
  G: ['.####.', '##....', '##.###', '##..##', '.####.'],
  E: ['######', '##....', '#####.', '##....', '######'],
};

const TITLE = 'FROGGER';
const LETTER_WIDTH = 6;
const LETTER_GAP = 3;   // two clear columns once the shading has taken one

/**
 * How many columns the block title needs.
 *
 * Anything drawing the title has to make room for exactly this much, or the
 * lines wrap and the letters come apart across doubled rows.
 */
export function titleWidth(): number {
  return Math.max(...titleGrid().map(row => row.length));
}

/**
 * The title as a grid of cells: '#' for the face of the letter, '+' for the
 * shaded edge, ' ' for nothing.
 */
export function titleGrid(): string[] {
  const width = TITLE.length * (LETTER_WIDTH + LETTER_GAP);
  const rows = 5;

  const grid: string[][] = [];
  for (let r = 0; r < rows; r++) grid.push(new Array(width + 1).fill(' '));

  TITLE.split('').forEach((ch, i) => {
    const glyph = LETTERS[ch];
    const left = i * (LETTER_WIDTH + LETTER_GAP);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < LETTER_WIDTH; c++) {
        if (glyph[r][c] !== '#') continue;

        // The shaded edge first, so the face always wins where they meet.
        if (grid[r][left + c + 1] === ' ') grid[r][left + c + 1] = '+';
        grid[r][left + c] = '#';
      }
    }
  });

  return grid.map(row => row.join('').replace(/\s+$/, ''));
}

/**
 * The title, painted as blocks of background colour rather than as '#'
 * characters: a green face with the arcade logo's yellow shading beside it.
 *
 * Drawn the way the board is drawn, so the letters read as solid shapes on
 * a terminal instead of as a wall of punctuation.
 */
export function titleLines(width: number): string[] {
  return titleGrid().map(row => {
    let out = '';
    let run = 0;
    let colour = '';

    const flush = () => {
      if (!run) return;
      out += colour
        ? `{${colour}-bg}${' '.repeat(run)}{/${colour}-bg}`
        : ' '.repeat(run);
      run = 0;
    };

    for (const cell of row) {
      const next =
        cell === '#' ? 'green' :
        cell === '+' ? 'yellow' : '';

      if (next !== colour) { flush(); colour = next; }
      run++;
    }
    flush();

    const pad = Math.max(0, Math.floor((width - row.length) / 2));
    return ' '.repeat(pad) + out;
  });
}

/** Centre a plain string in `width` columns, then colour it. */
function centred(text: string, width: number, colour: string): string {
  const pad = Math.max(0, Math.floor((width - text.length) / 2));
  return ' '.repeat(pad) + `{${colour}-fg}${text}{/}`;
}

/**
 * The point table (FAQ 6.3), in the arcade's own wording and colours: the
 * headline of each rule in yellow, its qualifier under it in red.
 */
export function pointTablePanel(width: number): string[] {
  return [
    centred('-POINT TABLE-', width, 'white'),
    '',
    centred(`${SCORES.hop} PTS FOR EACH STEP`, width, 'yellow'),
    '',
    centred(`${SCORES.home} PTS FOR EVERY FROG`, width, 'yellow'),
    centred('ARRIVED HOME SAFELY', width, 'red'),
    '',
    centred(`${SCORES.levelComplete} PTS BY SAVING FROGS`, width, 'yellow'),
    centred('INTO FIVE HOMES', width, 'red'),
    '',
    centred('PLUS BONUS', width, 'yellow'),
    centred(`${SCORES.timeBonus} PTS X REMAINING SECOND`, width, 'red'),
  ];
}

const PLACES = ['1 ST', '2 ND', '3 RD', '4 TH', '5 TH'];

/** The score ranking, top five, highest first. */
export function rankingPanel(data: FroggerData, width: number): string[] {
  const top = [...data.highscores]
    .sort((a, b) => b.score - a.score)
    .slice(0, PLACES.length);

  const rows = PLACES.map((place, i) => {
    const score = top[i]?.score ?? 0;
    const text = `${place}   ${score.toString().padStart(5, '0')} PTS`;
    return centred(text, width, 'white');
  });

  return [centred('SCORE RANKING', width, 'yellow'), '', ...rows];
}

/**
 * The invitation.
 *
 * The cabinet asks for a coin and says how many frogs that buys. A BBS door
 * has no coin slot, so it asks for a key instead, and the count follows the
 * lives setting rather than being fixed.
 */
export function invitePanel(data: FroggerData, width: number, blinkOn: boolean): string[] {
  const frogs = LIVES_OPTIONS.includes(data.startingLives)
    ? data.startingLives
    : LIVES_OPTIONS[0];

  return [
    '',
    '',
    blinkOn ? centred('PRESS ANY KEY', width, 'green') : '',
    '',
    '',
    '',
    centred(`${frogs} FROGS PER PLAYER`, width, 'yellow'),
  ];
}

/** The credit line under every panel. */
export function creditLine(width: number): string {
  // Not "KONAMI (C) 1981" as the cabinet has it: this is a port, and
  // stamping somebody else's copyright notice on it would be a lie. The
  // credit is theirs, the code is not.
  return centred('ORIGINAL BY KONAMI 1981', width, 'white');
}

/**
 * One attract screen, ready to render.
 *
 * `demo` has no panel of its own - the machine plays the game instead, and
 * the caller renders the board.
 */
export function attractScreen(
  phase: AttractPhase,
  data: FroggerData,
  width: number,
  frame: number
): string[] {
  if (phase === 'demo') return [];

  const blinkOn = Math.floor(frame / ATTRACT_BLINK_FRAMES) % 2 === 0;

  const body =
    phase === 'points' ? pointTablePanel(width) :
    phase === 'ranking' ? rankingPanel(data, width) :
    invitePanel(data, width, blinkOn);

  return [...titleLines(width), '', ...body, '', creditLine(width)];
}

/** The phase that follows this one. */
export function nextPhase(phase: AttractPhase): AttractPhase {
  const i = ATTRACT_ORDER.indexOf(phase);
  return ATTRACT_ORDER[(i + 1) % ATTRACT_ORDER.length];
}
