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

export async function theCardsInFrontOfYouAreThreeFacesAndThreeBacks(): Promise<void> {
  // Through the door: deal, start the play, and turn the panel over with V.
  const app = await openApp();
  try {
    const me = app.currentProfile.userId;
    const table: any = {
      id: 96, gameId: 'skitgubbe', gameName: 'Skitgubbe', stakesLabel: 'Social',
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
    app.currentProfile.currentTableId = 96;
    app.currentProfile.status = 'table';
    await app.persistState();
    await app.dealHand();
    app.vandtia.primaryAction();                 // ready: the play starts
    await new Promise((r) => setTimeout(r, 600));
    app.applyViewMode('table');
    app.updateAllPanels();

    // V, through the key the caller presses.
    (app.screen as any)._handleKey('v', { name: 'v', full: 'v', ch: 'v' });
    assert.strictEqual(app.vandtia.handView, 'table', 'V turns the panel over');

    const buttons = app.cardButtons.focusables();
    assert.strictEqual(buttons.length, 6,
      'three face up and three face down, all drawn as widgets');
    assert.strictEqual(app.uiManager.handContent.hidden, true,
      'the clipped text fallback is not what the caller gets');

    const backs = buttons.slice(3).map((button: any) => button.getContent());
    assert.strictEqual(new Set(backs).size, 1, 'the three face-down cards are backs');

    for (const face of buttons.slice(0, 3)) {
      assert.notStrictEqual((face as any).getContent(), backs[0],
        'and the three face up are faces, not more backs');
    }
  } finally { app.screen?.destroy?.(); }
}
