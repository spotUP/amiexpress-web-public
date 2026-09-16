/**
 * A ROW OF CARDS WIDER THAN ITS PANEL IS FANNED, NOT ABANDONED.
 *
 * "i tested V in cardlobby and it just flickers broken cards and flips back"
 * (sysop, 2026-09-15). Nothing flickered: `V` turned the lower panel over to
 * the six cards in front of the player, and the widget renderer REFUSED
 * them. A card is eleven columns wide at every size the engine draws - `mini`
 * is shorter, not thinner - so six of them with a column of air between want
 * 72 and the panel's inside is 57. The old chooser knew one shape, that
 * grid, and when it did not fit it cleared the widgets and left the panel to
 * the text fallback: a condensed hand drawn to no particular height, clipped
 * where the panel ended, with the three face-down cards drawn face up as
 * whatever card object they had been faked from. Three Aces of Spades and a
 * cut-off bottom row is what "broken cards" was.
 *
 * Two things are pinned here. A row that will not fit side by side OVERLAPS -
 * a hand held in the fingers, which is what the SDK's own condensed layout
 * has always drawn in text - and a row of mixed faces and backs is one
 * height, because the engine draws a back shorter than a face.
 */

import assert from 'assert';
import { isolatedDataDir } from './isolated-data-dir';

isolatedDataDir('fan');

async function openApp(width = 106, height = 30): Promise<any> {
  const { CardLobbyApp } = await import('../index');
  const bbs: any = {
    write: () => {}, writeLine: () => {}, on: () => {},
    getTerminalSize: () => ({ width, height }),
    enableWideMode: () => {}, disableWideMode: () => {},
    getModemSpeed: () => 0, disableModemEmulation: () => {}, setModemSpeed: () => {},
    connectionType: 'web', unicodeCapable: true,
  };
  const socket: any = { on: () => {}, emit: () => {}, off: () => {}, removeAllListeners: () => {} };
  const app: any = new CardLobbyApp({
    bbs, socket, params: [],
    bbsSession: { userId: 1, username: 'sysop', nodeId: 1, secLevel: 255, screenHeight: height, socket },
    user: { id: 1, username: 'sysop', name: 'sysop', accessLevel: 255 },
  } as any);
  void app.run();
  await new Promise((r) => setTimeout(r, 1500));
  return app;
}

/** The hand panel at the size the table screen gives it on an 106x30 caller. */
function sizeHandPanel(app: any, width = 59, height = 12): void {
  app.uiManager.handPanel.width = width;
  app.uiManager.handPanel.height = height;
}

const SIX = [
  { rank: '9', suit: 'S' }, { rank: 'K', suit: 'H' }, { rank: '2', suit: 'D' },
  { rank: '7', suit: 'C' }, { rank: 'J', suit: 'H' }, { rank: '4', suit: 'S' },
];

/** Seated at a Skitgubbe table with bots, dealt, and past the swap. */
async function seatedAndPlaying(app: any, id: number): Promise<void> {
  const me = app.currentProfile.userId;
  const table: any = {
    id, gameId: 'skitgubbe', gameName: 'Skitgubbe', stakesLabel: 'Social',
    smallBlind: 0, bigBlind: 0, buyIn: 0, entryFee: 0,
    minPlayers: 2, maxPlayers: 3, status: 'open',
    createdAt: Date.now(), updatedAt: Date.now(), hostUserId: me,
    autoStart: false, isPrivate: false, observers: [],
    players: [{
      userId: me, username: 'sysop', seat: 0, stack: 0, buyIn: 0,
      role: 'player', joinedAt: Date.now(), isBot: false,
    }],
  };
  app.syncBotsForTable(table);
  app.lobby.tables.unshift(table);
  app.currentProfile.currentTableId = id;
  app.currentProfile.status = 'table';
  await app.persistState();
  await app.dealHand();
  app.vandtia.primaryAction();                 // ready: the play starts
  await new Promise((r) => setTimeout(r, 600));
}

const lines = (button: any): string[] => String(button.getContent()).split('\n');

export async function sixCardsAreDrawnRatherThanDeclined(): Promise<void> {
  const app = await openApp();
  try {
    sizeHandPanel(app);
    const drawn = app.cardButtons.renderStandard(SIX, {
      selected: null, playable: [0, 1, 2, 3, 4, 5], onPick: () => {},
    });

    assert.strictEqual(drawn, true,
      'six cards are more than the panel holds side by side, and are still drawn');
    assert.strictEqual(app.cardButtons.focusables().length, 6, 'one widget per card');
    assert.strictEqual(app.uiManager.handContent.hidden, true,
      'and the text fallback is out of the way');
  } finally { app.screen?.destroy?.(); }
}

export async function theCardsOverlapAndStayInsideThePanel(): Promise<void> {
  const app = await openApp();
  try {
    sizeHandPanel(app);
    app.cardButtons.renderStandard(SIX, {
      selected: null, playable: [], onPick: () => {},
    });

    const buttons = app.cardButtons.focusables();
    const width = Number(buttons[0].width);
    const stride = Number(buttons[1].left) - Number(buttons[0].left);

    assert.ok(stride < width, `the cards overlap: stride ${stride} against a card ${width} wide`);
    assert.ok(stride >= 3, `and never by so much that the rank goes under: stride ${stride}`);

    const inside = Number(app.uiManager.handPanel.width) - 2;
    const rightEdge = Number(buttons[5].left) + width;
    assert.ok(rightEdge <= inside,
      `the last card ends inside the panel: ${rightEdge} against ${inside}`);

    for (let index = 1; index < buttons.length; index += 1) {
      assert.strictEqual(Number(buttons[index].left) - Number(buttons[index - 1].left), stride,
        'the fan is even');
      assert.strictEqual(Number(buttons[index].top), Number(buttons[0].top),
        'and it is one row, not a wrapped grid');
    }
  } finally { app.screen?.destroy?.(); }
}

export async function aRowOfFacesAndBacksIsOneHeight(): Promise<void> {
  // The engine draws a back shorter than a face, so the three face-down
  // cards used to stop a row above their neighbours.
  const app = await openApp();
  try {
    sizeHandPanel(app);
    const entries = [
      ...SIX.slice(0, 3).map((card) => ({ kind: 'standard' as const, card })),
      ...SIX.slice(3).map((card) => ({ kind: 'standard' as const, card, face: 'back' as const })),
    ];
    const drawn = app.cardButtons.render(entries, {
      selected: null, playable: [], labels: false, onPick: () => {},
    });
    assert.strictEqual(drawn, true, 'a mixed row draws');

    const buttons = app.cardButtons.focusables();
    const heights = buttons.map((button: any) => lines(button).length);
    assert.strictEqual(new Set(heights).size, 1,
      `every card in the row is the same height: ${heights.join(', ')}`);

    const backs = buttons.slice(3).map((button: any) => button.getContent());
    assert.strictEqual(new Set(backs).size, 1, 'a back looks like a back, whatever card it hides');
    assert.notStrictEqual(backs[0], buttons[0].getContent(),
      'and it does not look like the face of the card it stands for');
  } finally { app.screen?.destroy?.(); }
}

export async function theCardsInFrontOfYouAreThreePilesNotSixCards(): Promise<void> {
  /*
   * "there is 3 cards in front of me, backside up, they are blind and on top
   * of those there are 3 cards that are open, you put 6 open cards next to
   * each other" (sysop, 2026-09-15). Three PILES: a blind card with an open
   * one lying on it, and the blind ones are played last of all.
   */
  const app = await openApp();
  try {
    await seatedAndPlaying(app, 96);
    app.applyViewMode('table');
    app.updateAllPanels();

    // V, through the key the caller presses.
    (app.screen as any)._handleKey('v', { name: 'v', full: 'v', ch: 'v' });
    assert.strictEqual(app.vandtia.handView, 'table', 'V turns the panel over');

    const open = app.cardButtons.focusables();
    const blind = app.cardButtons.underlays();
    assert.strictEqual(open.length, 3, 'three open cards, not six cards in a row');
    assert.strictEqual(blind.length, 3, 'and a blind card under each of them');
    assert.strictEqual(app.uiManager.handContent.hidden, true,
      'the clipped text fallback is not what the caller gets');

    for (let pile = 0; pile < 3; pile += 1) {
      assert.ok(Number(blind[pile].left) < Number(open[pile].left),
        'the blind card shows at the left of the one lying on it');
      assert.ok(Number(blind[pile].top) < Number(open[pile].top),
        'and above it, so the caller can see there is something under there');
    }

    const backs = blind.map((card: any) => card.getContent());
    assert.strictEqual(new Set(backs).size, 1, 'a blind card is a back, whatever it is');
    for (const card of open) {
      assert.notStrictEqual((card as any).getContent(), backs[0],
        'and the cards on top are faces');
    }
  } finally { app.screen?.destroy?.(); }
}

export async function aPileWhoseOpenCardIsGoneIsStillABlindCard(): Promise<void> {
  // The open card is played before the blind one under it, so a pile spends
  // the rest of the game as a back on its own.
  const app = await openApp();
  try {
    await seatedAndPlaying(app, 97);
    const table = app.findTableById(97);
    const loaded = app.vandtia.load(table);
    const me = loaded.engine.state.players.find((p: any) => p.id === app.currentProfile.userId);
    me.faceUp = [];                                   // the three open ones are gone
    table.hand.snapshot = loaded.engine.serialize();
    await app.persistState();

    app.vandtia.handView = 'table';
    app.applyViewMode('table');
    app.updateAllPanels();

    const open = app.cardButtons.focusables();
    assert.strictEqual(open.length, 3, 'the three piles are still there');
    assert.strictEqual(app.cardButtons.underlays().length, 0,
      'with nothing left lying on them');
    const faces = open.map((card: any) => card.getContent());
    assert.strictEqual(new Set(faces).size, 1, 'and all three are backs');
  } finally { app.screen?.destroy?.(); }
}

export async function theDiscardPileIsAPileNotARowOfCards(): Promise<void> {
  /*
   * "the pile have 3 cards side by side now, make them look like the pile in
   * front of me but with all cards open" (sysop, 2026-09-15). The top three
   * of the pile are three cards LYING ON EACH OTHER, the last one on top and
   * every face showing - the same shape as the piles in front of a player,
   * without the backs.
   */
  const app = await openApp();
  try {
    app.uiManager.flopPanel.width = 59;
    app.uiManager.flopPanel.height = 12;

    const drawn = app.tableCardButtons.renderStandard(SIX.slice(0, 3), {
      selected: null, playable: [], labels: false, pile: true, onPick: () => {},
    });
    assert.strictEqual(drawn, true, 'the pile draws');

    const cards = app.tableCardButtons.focusables();
    assert.strictEqual(cards.length, 3, 'three cards');

    for (let index = 1; index < cards.length; index += 1) {
      const right = Number(cards[index].left) - Number(cards[index - 1].left);
      const down = Number(cards[index].top) - Number(cards[index - 1].top);
      assert.ok(right > 0 && right < Number(cards[0].width),
        `each card lies on the last, a step to the right: ${right}`);
      assert.ok(down > 0, `and a step down: ${down}`);
    }

    // Every card in the pile is a face - none of them is turned over.
    const contents = cards.map((card: any) => card.getContent());
    assert.strictEqual(new Set(contents).size, 3, 'three different cards, all open');
  } finally { app.screen?.destroy?.(); }
}

export async function theBlindCardRunsTheWholeHeightOfItsPile(): Promise<void> {
  /*
   * "the bottom cards in the skitgubbe piles are missing the two bottom
   * rows", then "the blind cards are missing their bottom row" (sysop,
   * 2026-09-16). Two faults, one pile: the engine draws a BACK shorter than a
   * face (four rows against five at `mini`) and each blind card was squared
   * only against ITSELF; and even squared to the open card it still ended a
   * row early, because it sits a row HIGHER - the step the card on top is
   * offset by.
   *
   * So the blind card is drawn to the pile's full height. Its left edge runs
   * the whole way down, the two cards finish level, and the only part of it
   * that shows is the corner it peeks out of - which is what a card lying on
   * another card looks like.
   */
  const app = await openApp();
  try {
    sizeHandPanel(app);
    const entries = SIX.slice(0, 3).map((card) => ({
      kind: 'standard' as const,
      card,
      under: { kind: 'standard' as const, card: SIX[3], face: 'back' as const },
    }));
    const drawn = app.cardButtons.render(entries, {
      selected: null, playable: [], labels: false, onPick: () => {},
    });
    assert.strictEqual(drawn, true, 'the piles draw');

    const open = app.cardButtons.focusables();
    const blind = app.cardButtons.underlays();
    assert.strictEqual(open.length, 3);
    assert.strictEqual(blind.length, 3);

    for (let pile = 0; pile < 3; pile += 1) {
      const blindTop = Number(blind[pile].top);
      const openTop = Number(open[pile].top);
      assert.ok(blindTop < openTop, 'the blind card peeks out above the card on it');
      assert.strictEqual(
        blindTop + Number(blind[pile].height),
        openTop + Number(open[pile].height),
        'and the two finish level - no row of the pile is missing',
      );
      assert.strictEqual(lines(blind[pile]).length, Number(blind[pile].height),
        'the blind card fills its own widget, every row of it');
    }

    // Every row of the blind card carries its hatching: a short card grows by
    // repeating its own last row, never by blank ones.
    for (const card of blind) {
      const rows = lines(card);
      assert.strictEqual(rows.filter((row: string) => row.trim().length > 0).length, rows.length,
        'no blank row is left at the bottom of a blind card');
    }
  } finally { app.screen?.destroy?.(); }
}
