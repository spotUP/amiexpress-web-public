/**
 * Talking in the lobby.
 *
 * "tested cardloby and texas hold em i see no chat while playing in
 * fullscreen responsive? maybe cardlobby never had a chat in the lobby?"
 * (sysop, 2026-09-02). It never had one.
 *
 * The transport is the shared LobbyState the refresh timer already re-reads,
 * so the test that matters is the cross-node one: a message written into the
 * state by somebody else has to reach this door's panel on the next paint.
 */

import assert from 'assert';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { say, messagesSince, formatChatLine, MAX_CHAT_MESSAGES, MAX_CHAT_LENGTH } from '../lib/chat';
import { ChatManager } from '../managers/ChatManager';
import { initLobbyState } from '../lib/utils';
import { UI_THEME } from '../lib/constants';

process.env.BBS_DATA_DIR = mkdtempSync(join(tmpdir(), 'card-lobby-chat-'));

const author = { userId: '1', username: 'sysop' };

export async function aLineIsKeptWithItsAuthorAndTime(): Promise<void> {
  const lobby = initLobbyState();
  const message = say(lobby, author, '  nice hand  ');

  assert.ok(message, 'a line with words in it is a message');
  assert.strictEqual(message!.text, 'nice hand', 'trimmed');
  assert.strictEqual(message!.username, 'sysop');
  assert.ok(message!.at > 0);
  assert.deepStrictEqual(lobby.chat, [message]);
}

export async function nothingIsSaidByPressingEnterOnAnEmptyLine(): Promise<void> {
  const lobby = initLobbyState();
  assert.strictEqual(say(lobby, author, '   '), null);
  assert.strictEqual(say(lobby, author, ''), null);
  assert.deepStrictEqual(lobby.chat, [], 'and nothing is written to the shared state');
}

export async function theHistoryIsCappedBecauseItIsWrittenWhole(): Promise<void> {
  const lobby = initLobbyState();
  for (let i = 0; i < MAX_CHAT_MESSAGES + 10; i += 1) say(lobby, author, `line ${i}`);

  assert.strictEqual(lobby.chat!.length, MAX_CHAT_MESSAGES);
  assert.strictEqual(lobby.chat![lobby.chat!.length - 1].text, `line ${MAX_CHAT_MESSAGES + 9}`,
    'the newest survive');

  const long = say(lobby, author, 'x'.repeat(MAX_CHAT_LENGTH + 50));
  assert.strictEqual(long!.text.length, MAX_CHAT_LENGTH, 'and one line cannot be a paragraph');
}

export async function aNodeOnlyPaintsWhatItHasNotSeen(): Promise<void> {
  const lobby = initLobbyState();
  const first = say(lobby, author, 'one')!;
  say(lobby, author, 'two');

  assert.strictEqual(messagesSince(lobby, null).length, 2, 'a fresh node paints the backlog');
  assert.deepStrictEqual(messagesSince(lobby, first.id).map((m) => m.text), ['two']);

  // An id that aged out of the window means everything held is new, which is
  // better than showing nothing at all.
  assert.strictEqual(messagesSince(lobby, 'gone-long-ago').length, 2);
}

export async function anotherPlayersLineReachesThisDoorsPanel(): Promise<void> {
  const lobby = initLobbyState();
  const painted: string[][] = [];
  const feed: string[] = [];

  const host: any = {
    lobby,
    currentProfile: { userId: '1', username: 'sysop' },
    currentTableId: null,
    persistState: async () => {},
    pushEvent: (message: string) => feed.push(message),
    chatHasItsOwnPanel: () => true,
    setChatLines: (lines: string[]) => painted.push(lines),
    promptForLine: async () => null,
    render: () => {},
  };
  const chat = new ChatManager(host);

  // What a refresh does: the state now holds a line this node did not write.
  say(lobby, { userId: '7', username: 'zaphod' }, 'anyone for uno?');
  chat.paint();

  assert.strictEqual(painted.length, 1, 'the panel was repainted');
  assert.ok(painted[0].some((line) => line.includes('zaphod') && line.includes('anyone for uno?')),
    `the other player's line is in the panel: ${painted[0].join(' | ')}`);
  assert.deepStrictEqual(feed, [], 'and it did not also go to the activity feed');
}

export async function aNarrowBoardHearsTheChatInItsActivityFeed(): Promise<void> {
  const lobby = initLobbyState();
  const feed: string[] = [];
  const host: any = {
    lobby,
    currentProfile: { userId: '1', username: 'sysop' },
    currentTableId: null,
    persistState: async () => {},
    pushEvent: (message: string) => feed.push(message),
    chatHasItsOwnPanel: () => false,       // 80x25: no room for a second panel
    setChatLines: () => { throw new Error('there is no chat panel to paint'); },
    promptForLine: async () => null,
    render: () => {},
  };
  const chat = new ChatManager(host);

  say(lobby, { userId: '7', username: 'zaphod' }, 'deal me in');
  chat.paint();

  assert.strictEqual(feed.length, 1, 'the line went somewhere the player can see it');
  assert.ok(feed[0].includes('zaphod') && feed[0].includes('deal me in'));
}

export async function sayingSomethingWritesItAndPaintsItAtOnce(): Promise<void> {
  const lobby = initLobbyState();
  const painted: string[][] = [];
  let persisted = 0;

  const host: any = {
    lobby,
    currentProfile: { userId: '1', username: 'sysop' },
    currentTableId: 4,
    persistState: async () => { persisted += 1; },
    pushEvent: () => {},
    chatHasItsOwnPanel: () => true,
    setChatLines: (lines: string[]) => painted.push(lines),
    promptForLine: async () => 'all in',
    render: () => {},
  };
  const chat = new ChatManager(host);

  const message = await chat.saySomething();
  assert.ok(message, 'the line was said');
  assert.strictEqual(message!.tableId, 4, 'tagged with the table it was said at');
  assert.strictEqual(persisted, 1, 'and written to the shared state for the other nodes');
  assert.ok(painted.length >= 1 && painted[0].some((line) => line.includes('all in')),
    'the player sees their own line without waiting for a round trip');

  // A cancelled prompt says nothing and writes nothing.
  host.promptForLine = async () => null;
  const nothing = await chat.saySomething();
  assert.strictEqual(nothing, null);
  assert.strictEqual(persisted, 1);
}

export async function aPlayersOwnLineIsMarkedApart(): Promise<void> {
  const lobby = initLobbyState();
  const mine = say(lobby, author, 'mine')!;
  const theirs = say(lobby, { userId: '9', username: 'other' }, 'theirs')!;

  const a = formatChatLine(mine, UI_THEME, '1');
  const b = formatChatLine(theirs, UI_THEME, '1');
  assert.ok(a.includes(UI_THEME.accent), 'my own name takes the accent');
  assert.ok(b.includes(UI_THEME.accentAlt), 'and everyone else the second one');
  assert.ok(!a.includes('undefined'), 'no token is missing from the line');
}

/**
 * Driven, not read: the door is opened at two sizes and asked where the
 * chat ended up. "in responsive mode we have room for all views on screen i
 * think, lobby chat etc that would be nice" (sysop) - and at 80 columns
 * there is no such room, which is the case the feed covers.
 */
async function openApp(width: number, height: number): Promise<any> {
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

/** A table with this player at it: table view reverts to the lobby without one. */
function seatThePlayer(app: any): void {
  app.lobby.tables = [{
    id: 1, gameId: 'uno', gameName: 'UNO', stakesLabel: '10',
    smallBlind: 10, bigBlind: 20, buyIn: 200, entryFee: 0,
    minPlayers: 2, maxPlayers: 4, status: 'open',
    createdAt: Date.now(), updatedAt: Date.now(), hostUserId: 'sysop',
    autoStart: false, isPrivate: false, players: [], observers: [],
  }];
  app.currentProfile.currentTableId = 1;
}

export async function aWideBoardGetsAChatPanelBesideTheFeed(): Promise<void> {
  const app = await openApp(120, 30);
  try {
    seatThePlayer(app);
    app.applyViewMode('table');
    app.uiManager.layoutTablePanels();

    const chat = app.uiManager.chatPanel;
    const feed = app.uiManager.activityPanel;
    assert.ok(Number(chat.width) >= 30,
      `the chat panel keeps the column's whole width, got ${chat.width}`);
    assert.strictEqual(Number(chat.left), Number(feed.left),
      'stacked under the activity feed, in the same column');
    assert.ok(Number(chat.top) >= Number(feed.top) + Number(feed.height),
      'below it, not over it');
    assert.ok(Number(chat.height) >= 4, `and tall enough to hold a line, got ${chat.height}`);
    assert.ok(Number(chat.top) + Number(chat.height) <= 30, 'inside the screen');
  } finally { app.screen?.destroy?.(); }
}

export async function aBoardsEightyColumnsKeepTheFeedWhole(): Promise<void> {
  const app = await openApp(80, 25);
  try {
    seatThePlayer(app);
    app.applyViewMode('table');
    app.uiManager.layoutTablePanels();

    assert.ok(!app.uiManager.chatHasItsOwnPanel(),
      'there is no room for two panels at 80 columns');
    assert.ok(app.uiManager.chatPanel.hidden, 'so the chat panel stays out of the way');
  } finally { app.screen?.destroy?.(); }
}

export async function theViewsMenuOffersTalking(): Promise<void> {
  const app = await openApp(100, 30);
  try {
    const views = app.uiManager.menus[0];
    const entry = views.items.find((item: any) => item.label === 'Say Something (T)');
    assert.ok(entry, `no way to talk in: ${views.items.map((i: any) => i.label).join(', ')}`);
  } finally { app.screen?.destroy?.(); }
}
