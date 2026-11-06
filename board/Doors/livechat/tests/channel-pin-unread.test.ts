/**
 * Plan L9: the channel context menu pins a channel to the top of the ONE
 * channel list (channelsToShow) and the message menu's Mark Unread makes the
 * sidebar show the channel unread again. Driven through createApp: a real
 * right-click on the sidebar row, a real menu pick.
 */

import assert from 'assert';
import { createApp } from '../server';
import { channelsToShow } from '../core/state';
import { saveSettings } from '../overlays/settings-save';
import { prefsSender } from '../core/prefs-sync';

const itemsOf = (e: any): string[] => (e.items ?? []).map((i: any) => strip(String(i.content ?? i)));
const everything = (node: any): any[] => [node, ...((node.children ?? []).flatMap(everything))];
const strip = (s: string): string => s.replace(/\{[^}]*\}/g, '');

async function openDoor() {
  const handlers = new Map<string, Array<(...a: any[]) => void>>();
  const bbs: any = {
    write: () => {}, writeLine: () => {}, on: () => {},
    getTerminalSize: () => ({ width: 80, height: 25 }),
    enableWideMode: () => {}, disableWideMode: () => {},
    getModemSpeed: () => 0, disableModemEmulation: () => {}, setModemSpeed: () => {},
    connectionType: 'web', unicodeCapable: true,
  };
  const emits: Array<{ event: string; payload: any }> = [];
  const socket: any = {
    on: (event: string, fn: (...a: any[]) => void) => { handlers.set(event, [...(handlers.get(event) ?? []), fn]); },
    emit: (event: string, payload?: any) => { emits.push({ event, payload }); }, off: () => {}, removeAllListeners: () => {},
  };
  const session: any = {
    bbs, socket, params: [],
    bbsSession: { userId: 1, username: 'spot', nodeId: 1, secLevel: 255, tempData: {}, socket },
    user: { id: 1, name: 'spot', accessLevel: 255, secLevel: 255 },
  };
  const fire = (event: string, ...args: unknown[]) => (handlers.get(event) ?? []).forEach(fn => fn(...args));
  const app: any = await createApp(session);
  fire('room:list', { rooms: [
    { room_id: 'r1', room_name: 'main', is_public: true, member_count: 2 },
    { room_id: 'r2', room_name: 'lounge', is_public: true, member_count: 1 },
  ] });
  fire('room:joined', {
    roomId: 'r1', roomName: 'main', memberCount: 2,
    members: [{ user_id: 'u1', username: 'spot', is_online: true }],
  });
  await new Promise(resolve => setTimeout(resolve, 100));
  return { app, fire, emits };
}

export async function channelPinAndMarkUnreadReachTheSidebar(): Promise<void> {
  const { app, fire, emits } = await openDoor();
  try {
    const nodes = everything(app.screen);
    const sidebar = nodes.find(e => (e.listeners?.('rightclick')?.length ?? 0) > 0 && itemsOf(e).some(r => r.includes('# lounge')));
    assert.ok(sidebar, 'the sidebar list is on the screen');
    const menus = nodes.filter(e => (e.zIndex ?? e.zi) === 9999 && typeof e.setItems === 'function');
    // The context menu is the 9999-layer list that was just filled with items.
    const menuNow = () => menus.find(e => itemsOf(e).length > 0) ?? menus[0];
    const menu = { emit: (ev: string, ...a: any[]) => menuNow().emit(ev, ...a) };
    assert.ok(menus.length > 0, 'the context menu is on the screen');
    const rows = () => itemsOf(sidebar);
    const rowOf = (name: string) => rows().findIndex(r => r.includes(`# ${name}`));
    const rightClick = (name: string) => {
      const pos = sidebar._getCoords();
      sidebar.emit('rightclick', { x: pos.xi + 1, y: pos.yi + (sidebar.options?.border?.type && sidebar.options.border.type !== 'none' ? 1 : 0) + rowOf(name) - (sidebar.getScroll?.() ?? 0) });
    };
    const menuLabels = () => itemsOf(menuNow());

    assert.ok(rowOf('main') < rowOf('lounge'), 'server order: main above lounge');

    rightClick('lounge');
    assert.ok(menuLabels().includes('Pin Channel'), 'channel menu offers Pin Channel ' + JSON.stringify([menus.length, menus.map(itemsOf), rows()]));
    // Prefs persist: the door asks for them on open, the pin is sent to the
    // server with the FULL prefs, and a stored reply lands in state.prefs.
    assert.ok(emits.some(e => e.event === 'chat:prefs'), 'the door asks for the stored prefs on open');
    menu.emit('select', 'Pin Channel', 0);
    const pinSent = emits.filter(e => e.event === 'chat:prefs-set').pop();
    assert.deepStrictEqual(pinSent?.payload.prefs.pinnedChannels, ['lounge'], 'pin toggle emits chat:prefs-set');
    assert.strictEqual(typeof pinSent?.payload.prefs.compactMode, 'boolean', 'chat:prefs-set carries the full prefs');
    assert.deepStrictEqual(app.state.prefs.pinnedChannels, ['lounge'], 'the pin is kept in the prefs');
    assert.ok(rowOf('lounge') < rowOf('main'), 'pinned channel is the first channel row');
    assert.strictEqual(channelsToShow(app.state.channels, 'main', app.state.prefs.pinnedChannels)[0].name, 'lounge', 'channelsToShow lists the pinned channel first');

    // A settings save (the existing prefs path) must not drop the pin.
    const box = (v: boolean) => ({ isChecked: () => v });
    saveSettings(app.state, { showLogins: box(true), showFileActivity: box(true), showDoorActivity: box(true), showMessages: box(true), showAnnouncements: box(true), muteSounds: box(false), timestamps: box(true) }, () => {});
    assert.deepStrictEqual(app.state.prefs.pinnedChannels, ['lounge'], 'pin survives a settings save');
    const before = emits.length;
    saveSettings(app.state, { showLogins: box(true), showFileActivity: box(true), showDoorActivity: box(true), showMessages: box(true), showAnnouncements: box(true), muteSounds: box(false), timestamps: box(true), compact: box(true) }, () => {}, prefsSender({ emit: (event: string, payload?: unknown) => emits.push({ event, payload }) }));
    assert.strictEqual(emits.length, before + 1, 'saveSettings emits once');
    assert.strictEqual(emits[emits.length - 1].event, 'chat:prefs-set', 'saveSettings emits chat:prefs-set');
    assert.strictEqual(emits[emits.length - 1].payload.prefs.compactMode, true, 'saveSettings sends the new compact mode');
    fire('chat:prefs', { prefs: { pinnedChannels: ['main'], compactMode: false, showLogins: 'junk', bogus: 1 } });
    assert.deepStrictEqual(app.state.prefs.pinnedChannels, ['main'], 'a chat:prefs reply lands in state.prefs');
    assert.strictEqual(app.state.prefs.compactMode, false, 'stored boolean applied');
    assert.strictEqual(app.state.prefs.showLogins, true, 'junk value ignored, default kept');
    assert.ok(!('bogus' in app.state.prefs), 'unknown key ignored');
    assert.ok(rowOf('main') < rowOf('lounge'), 'channel list redrawn with the stored pin');
    fire('chat:prefs', { prefs: { pinnedChannels: ['lounge'] } });

    rightClick('lounge');
    assert.ok(menuLabels().includes('Unpin Channel'), 'a pinned channel offers Unpin Channel');
    menu.emit('select', 'Unpin Channel', 0);
    assert.ok(rowOf('main') < rowOf('lounge'), 'unpinned: server order again');

    // Mark Unread on a message in the current room.
    assert.ok(!/\(\d+\)/.test(rows()[rowOf('main')]), 'main starts read');
    const chatLog = nodes.find(e => e !== sidebar && (e.listeners?.('rightclick')?.length ?? 0) > 0 && typeof e.getScroll === 'function' && !e.items);
    assert.ok(chatLog, 'the chat log is on the screen');
    chatLog.emit('rightclick', { x: 10, y: 10 });
    assert.ok(menuLabels().includes('Mark Unread'), 'the message menu offers Mark Unread');
    menu.emit('select', 'Mark Unread', 0);
    assert.ok(/main \(1\)/.test(rows()[rowOf('main')]), `sidebar shows main unread: ${rows()[rowOf('main')]}`);
  } finally {
    fire('disconnect', 'transport close');
  }
}
