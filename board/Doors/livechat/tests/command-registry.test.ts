/**
 * Plan L7: every /word the help promises is a real command, and /ignore,
 * /unignore and /rooms work through the door's single dispatch path.
 *
 * The registry is read from the running door (createApp returns it), so the
 * count includes the commands server.ts registers once its helpers exist
 * (/emoji, /events ...), not just createCommandRegistry().
 */

import assert from 'assert';
import { createApp } from '../server';
import { helpPart1 } from '../overlays/help-content-1';
import { HELP_PART_2 } from '../overlays/help-content-2';
import { HELP_PART_3 } from '../overlays/help-content-3';
import { HELP_PART_4 } from '../overlays/help-content-4';

/**
 * Help entries for commands that later plan items build (livechat-stubs plan,
 * 2026-11-06). They are named here on purpose: a command moves out of this set
 * when its plan item registers it, and the test then demands it resolves.
 * An entry here that DOES resolve fails the test, so the set cannot go stale.
 */
const PENDING_COMMANDS: Record<string, string> = {};

type Emit = { event: string; payload: any };

async function openDoor() {
  const handlers = new Map<string, Array<(...a: any[]) => void>>();
  const emits: Emit[] = [];
  const bbs: any = {
    write: () => {}, writeLine: () => {}, on: () => {},
    getTerminalSize: () => ({ width: 80, height: 25 }),
    enableWideMode: () => {}, disableWideMode: () => {},
    getModemSpeed: () => 0, disableModemEmulation: () => {}, setModemSpeed: () => {},
    connectionType: 'web', unicodeCapable: true,
  };
  const socket: any = {
    on: (event: string, fn: (...a: any[]) => void) => { handlers.set(event, [...(handlers.get(event) ?? []), fn]); },
    emit: (event: string, payload: unknown) => { emits.push({ event, payload }); },
    off: () => {}, removeAllListeners: () => {},
  };
  const session: any = {
    bbs, socket, params: [],
    bbsSession: { userId: 1, username: 'spot', nodeId: 1, secLevel: 255, tempData: {}, socket },
    user: { id: 1, name: 'spot', accessLevel: 255, secLevel: 255 },
  };
  const fire = (event: string, ...args: unknown[]) => (handlers.get(event) ?? []).forEach(fn => fn(...args));
  const settle = () => new Promise(resolve => setTimeout(resolve, 100));
  const app: any = await createApp(session);
  fire('room:list', { rooms: [
    { room_id: 'r1', room_name: 'main', is_public: true, member_count: 2 },
    { room_id: 'r2', room_name: 'lounge', is_public: true, member_count: 1 },
  ] });
  fire('room:joined', {
    roomId: 'r1', roomName: 'main', memberCount: 2,
    members: [{ user_id: 'u1', username: 'spot', is_online: true }, { user_id: 'u2', username: 'bob', is_online: true }],
  });
  await settle();
  return { app, emits, fire, settle };
}

const everything = (node: any): any[] => [node, ...((node.children ?? []).flatMap(everything))];
const strip = (s: string): string => s.replace(/\{[^}]*\}/g, '');
const screenText = (app: any): string =>
  everything(app.screen).map(e => strip(String(e.getContent?.() ?? e.content ?? ''))).join('\n');
const chatMsg = (id: string, content: string) =>
  ({ id, channelId: 'r1', userId: 'u2', username: 'bob', content, createdAt: new Date() });

export async function everyHelpCommandIsRegistered(): Promise<void> {
  const { app, fire } = await openDoor();
  try {
    const help = [helpPart1(true), HELP_PART_2, HELP_PART_3, HELP_PART_4].join('\n');
    // A command word starts a token: line start, whitespace, or an opening
    // bracket - never the "/bold" of a closing {/bold} tag or a path.
    const words = new Set<string>();
    for (const m of strip(help).matchAll(/(?:^|[\s(,'"])\/([a-z][a-z0-9]*)\b/gm)) words.add(m[1]);

    const registered = app.registry.getAll().length;
    assert.ok(registered > 40, `registry was read from the live door (${registered} commands)`);
    assert.ok(words.size > 15, `the help names commands (${words.size})`);

    const missing = [...words].filter(w => !app.registry.get(w) && !(w in PENDING_COMMANDS));
    assert.deepStrictEqual(missing, [], `help lists /words with no registered command: ${missing.join(', ')}`);
    const stale = Object.keys(PENDING_COMMANDS).filter(w => app.registry.get(w));
    assert.deepStrictEqual(stale, [], `remove from PENDING_COMMANDS, now registered: ${stale.join(', ')}`);

    // draw/files/settings are registry commands now (palette, autocomplete, /help).
    for (const w of ['draw', 'files', 'settings', 'rooms', 'ignore', 'unignore']) {
      assert.ok(app.registry.getAll().some((c: { name: string }) => c.name === w), `/${w} is registered`);
    }
  } finally {
    fire('disconnect', 'transport close');
  }
}

export async function ignoreHidesAUserAndRoomsListsTheChannels(): Promise<void> {
  const { app, fire, settle } = await openDoor();
  try {
    const input = everything(app.screen).find(e => e.type === 'textarea' && e.listeners('submit').length > 0);
    const submit = async (line: string) => { input.emit('submit', line); await settle(); };

    await submit('/rooms');
    const rooms = screenText(app);
    assert.ok(rooms.includes('#main') && rooms.includes('#lounge'), `/rooms prints the channel names:\n${rooms.slice(-400)}`);

    // Sentinel: before /ignore, bob's message is shown.
    fire('chat:message', chatMsg('m1', 'visible before ignore'));
    await settle();
    assert.ok(screenText(app).includes('visible before ignore'), 'a message from bob is shown before /ignore');

    await submit('/ignore bob');
    assert.strictEqual(app.state.muteList.get('bob'), 'ignore', '/ignore ran and recorded bob');
    fire('chat:message', chatMsg('m2', 'hidden while ignored'));
    await settle();
    assert.ok(!screenText(app).includes('hidden while ignored'), 'an ignored user message is not shown');

    await submit('/ignore');
    assert.ok(screenText(app).includes('Ignoring: bob'), 'bare /ignore lists who is ignored');

    await submit('/unignore bob');
    fire('chat:message', chatMsg('m3', 'shown after unignore'));
    await settle();
    assert.ok(screenText(app).includes('shown after unignore'), '/unignore brings bob back');
  } finally {
    fire('disconnect', 'transport close');
  }
}

/** /ignore tells the server, and the server's list is loaded into the mute list on open. */
export async function ignoreIsSentToTheServerAndLoadedOnOpen(): Promise<void> {
  const { app, emits, fire, settle } = await openDoor();
  try {
    assert.ok(emits.some(e => e.event === 'chat:ignore-list'), 'the door asks for the server ignore list on open');
    fire('chat:ignore-list', { users: ['carol'] });
    assert.strictEqual(app.state.muteList.get('carol'), 'ignore', 'the server list is loaded into the mute list');
    const input = everything(app.screen).find((e: any) => e.type === 'textarea' && e.listeners('submit').length > 0);
    assert.ok(input, 'found the input box');
    const submit = async (line: string) => { input.emit('submit', line); await settle(); };
    await submit('/ignore dave');
    assert.ok(emits.some(e => e.event === 'chat:ignore' && e.payload.user === 'dave'), '/ignore emits chat:ignore');
    await submit('/unignore dave');
    assert.ok(emits.some(e => e.event === 'chat:unignore' && e.payload.user === 'dave'), '/unignore emits chat:unignore');
  } finally {
    fire('disconnect', 'transport close');
  }
}

/** /rooms and the sidebar read one list: before the server answers, both show the defaults. */
export async function roomsAndSidebarShareOneChannelList(): Promise<void> {
  const { channelsToShow } = await import('../core/state');
  const defaults = channelsToShow([], 'main').map(c => c.name);
  assert.deepStrictEqual(defaults, ['main', 'random', 'help'], 'no server list yet: default channel, random, help');
  const known: any = [{ id: 'r1', name: 'lounge' }];
  assert.strictEqual(channelsToShow(known, 'main'), known, 'once the server answers, its list is used as is');
}

/** The user menu's Ignore reaches the server, and leaving that level lifts it there too. */
export async function contextMenuIgnoreReachesTheServer(): Promise<void> {
  const { createContextMenus } = await import('../features/context-menus');
  const { app, fire } = await openDoor();
  try {
    const sent: Array<{ event: string; payload: any }> = [];
    const sock = { emit: (event: string, payload: any) => { sent.push({ event, payload }); } };
    const muteList = new Map();
    const { contextMenu, showContextMenu } = createContextMenus(app.screen, { focus: () => {} }, () => {}, () => {}, () => {}, sock, { muteList });
    const pick = (label: string) => {
      showContextMenu(0, 0, 'user', 'dave');
      contextMenu.emit('select', label, 0);
    };
    pick('Ignore');
    assert.strictEqual(muteList.get('dave'), 'ignore');
    assert.deepStrictEqual(sent.pop(), { event: 'chat:ignore', payload: { user: 'dave' } }, 'Ignore emits chat:ignore');
    pick('Mute User');
    assert.deepStrictEqual(sent.pop(), { event: 'chat:unignore', payload: { user: 'dave' } }, 'moving from ignore to mute lifts the server ignore');
    pick('Mute User');
    assert.strictEqual(sent.length, 0, 'mute alone never touches the server');
    pick('Block');
    assert.strictEqual(muteList.get('dave'), 'block');
    assert.deepStrictEqual(sent.pop(), { event: 'chat:ignore', payload: { user: 'dave' } }, 'Block is enforced at the server like ignore');
    pick('Unblock');
    assert.deepStrictEqual(sent.pop(), { event: 'chat:unignore', payload: { user: 'dave' } }, 'Unblock lifts the server ignore');
  } finally {
    fire('disconnect', 'transport close');
  }
}
