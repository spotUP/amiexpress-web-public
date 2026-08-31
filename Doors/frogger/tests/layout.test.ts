/**
 * Screen layout.
 *
 * Reported live 2026-08-31 with a screenshot: every second row of the board
 * was black, and the bottom edge of a panel border showed across the top of
 * the screen.
 *
 * One cause behind both. `blessed.box()` in this SDK returns a Panel, and
 * Panel injects `{type:'line', fg:'blue'}` whenever `border` is absent from
 * the options - unlike real blessed, where a box has no border. So:
 *
 *   - the game area lost two columns to a border nobody asked for, leaving
 *     78 for an 80-column board. Every row then wrapped, inserting a blank
 *     line after each real one: the "every second line is black";
 *   - the HUD is one row tall, so its injected border WAS the whole box, and
 *     what showed at the top of the screen was that border's bottom edge.
 *
 * Super Qix hit this exact fault first; this is the same fix and the same
 * check, for the same reason.
 */

import assert from 'assert';
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import {
  SCREEN_WIDTH, SCREEN_HEIGHT, GAME_AREA_HEIGHT,
  GRID_WIDTH, GRID_HEIGHT, CELL_WIDTH,
} from '../game/constants';
import { titleWidth, titleLines, LOGO_HEIGHT } from '../game/attract';

function makeScreen(): any {
  return blessed.screen({
    smartCSR: true,
    dockBorders: true,
    fullUnicode: false,
    output: () => { /* nothing to write to in a test */ },
    input: null as any,
  } as any);
}

/**
 * The defect itself, pinned: a box built the way the door used to build one
 * comes out with a border and too little room for the board. If this stops
 * being true, Panel's default has changed and the workaround can go.
 */
export async function aDefaultBoxStillComesWithAnUnwantedBorder(): Promise<void> {
  const screen = makeScreen();
  const box: any = blessed.box({
    parent: screen, top: 1, left: 0, width: '100%', height: GAME_AREA_HEIGHT,
  });

  assert.strictEqual(
    box.hasBorder(), true,
    'Panel no longer injects a default border - the door can stop working around it'
  );
  assert.ok(
    box.iwidth < GRID_WIDTH * CELL_WIDTH,
    `a default box offers ${box.iwidth} columns, which is why the board wrapped`
  );
}

/** The game area as the door builds it holds a board row exactly. */
export async function theGameAreaFitsTheBoardExactly(): Promise<void> {
  const screen = makeScreen();
  const gameArea: any = blessed.box({
    fixed: true,
    parent: screen,
    top: 1,
    left: 0,
    width: '100%',
    height: GAME_AREA_HEIGHT,
    tags: true,
    wrap: false,
    border: undefined,
    style: { bg: 'black' },
  });

  assert.strictEqual(gameArea.hasBorder(), false, 'the game area must have no border');
  assert.strictEqual(
    gameArea.iwidth, GRID_WIDTH * CELL_WIDTH,
    `a board row is ${GRID_WIDTH * CELL_WIDTH} columns; the game area offers ${gameArea.iwidth}`
  );
  assert.ok(
    gameArea.iheight >= GRID_HEIGHT,
    `the board is ${GRID_HEIGHT} rows; the game area offers ${gameArea.iheight}`
  );
}

/** The board fills the screen width, so nothing is left to wrap. */
export async function theBoardFillsTheScreenWidth(): Promise<void> {
  assert.strictEqual(
    GRID_WIDTH * CELL_WIDTH, SCREEN_WIDTH,
    'the board should be exactly as wide as the screen'
  );
}

/** A one-row HUD keeps its row. */
export async function theHudKeepsItsSingleRow(): Promise<void> {
  const screen = makeScreen();
  const hud: any = blessed.box({
    parent: screen, top: 0, left: 0, width: '100%', height: 1,
    tags: true, border: undefined, content: 'HUD',
  });

  assert.strictEqual(hud.hasBorder(), false);
  assert.strictEqual(hud.iheight, 1, 'the HUD lost its only row to a border');
  assert.strictEqual(hud.iwidth, SCREEN_WIDTH);
}

/** The panes tile the screen: HUD, board, footer, with nothing overlapping. */
export async function theThreePanesTileTheScreen(): Promise<void> {
  const hudRows = 1;
  const footerRows = 3;

  assert.ok(
    hudRows + GAME_AREA_HEIGHT + footerRows <= SCREEN_HEIGHT,
    `the panes need ${hudRows + GAME_AREA_HEIGHT + footerRows} rows of ${SCREEN_HEIGHT}`
  );
}

/**
 * The menu box has to be wide enough for the block title.
 *
 * Reported live 2026-08-31 with a screenshot: "menu broken every second line
 * black". The title is 61 columns; the box was sized to 54 by eye, so every
 * title row wrapped and each letter came apart across two rows with a black
 * line through it. Same fault as the board's, in a second place.
 */
export async function theMenuBoxFitsTheTitle(): Promise<void> {
  const screen = makeScreen();
  const width = Math.max(54, titleWidth());

  const menuBox: any = blessed.box({
    fixed: true,
    parent: screen,
    top: 'center',
    left: 'center',
    width: width + 2,
    height: 20,
    tags: true,
    wrap: false,
    border: { type: 'line' },
  });

  assert.ok(
    menuBox.iwidth >= titleWidth(),
    `the title needs ${titleWidth()} columns; the menu offers ${menuBox.iwidth}`
  );
  assert.ok(
    (menuBox.width as number) <= SCREEN_WIDTH,
    `the menu is ${menuBox.width} wide on an ${SCREEN_WIDTH}-column screen`
  );
}

/** Every line of the title fits the width it is centred into. */
export async function theTitleFitsTheWidthItIsGiven(): Promise<void> {
  const width = Math.max(54, titleWidth());

  for (const line of titleLines(width)) {
    const visible = line.replace(/\{[^}]*\}/g, '');
    assert.ok(
      visible.length <= width,
      `a title line is ${visible.length} columns in a ${width}-column space`
    );
  }
}

/**
 * The screen is logo, status line, board - and nothing else.
 *
 * Reported live 2026-08-31: the clock had a row of its own under the board,
 * there were blank rows after it, and a footer spelled out what the arrow
 * keys do. The clock is a number in the status line now, the board ends
 * where the board ends, and the title fills the space at the top.
 */
export async function theScreenIsLogoStatusAndBoard(): Promise<void> {
  const used = LOGO_HEIGHT + 1 + GAME_AREA_HEIGHT;

  assert.strictEqual(
    GAME_AREA_HEIGHT, GRID_HEIGHT,
    'the game area should be exactly the board, with no spare rows'
  );
  assert.ok(
    used <= SCREEN_HEIGHT,
    `logo + status + board is ${used} rows of ${SCREEN_HEIGHT}`
  );
}

/** The logo fits the screen it is drawn across. */
export async function theLogoFitsTheScreen(): Promise<void> {
  const lines = titleLines(SCREEN_WIDTH);

  assert.strictEqual(lines.length, LOGO_HEIGHT, 'the logo box is the right height');
  for (const line of lines) {
    const visible = line.replace(/\{[^}]*\}/g, '');
    assert.ok(
      visible.length <= SCREEN_WIDTH,
      `a logo line is ${visible.length} columns on an ${SCREEN_WIDTH}-column screen`
    );
  }
}
