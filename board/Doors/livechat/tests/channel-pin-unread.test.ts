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
  const socket: any = {
    on: (event: string, fn: (...a: any[]) => void) => { handlers.set(event, [...(handlers.get(event) ?? []), fn]); },
    emit: () => {}, off: () => {}, removeAllListeners: () => {},
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
  return { app, fire };
}

export async function channelPinAndMarkUnreadReachTheSidebar(): Promise<void> {
  const { app, fire } = await openDoor();
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
    menu.emit('select', 'Pin Channel', 0);
    assert.deepStrictEqual(app.state.prefs.pinnedChannels, ['lounge'], 'the pin is kept in the prefs');
    assert.ok(rowOf('lounge') < rowOf('main'), 'pinned channel is the first channel row');
    assert.strictEqual(channelsToShow(app.state.channels, 'main', app.state.prefs.pinnedChannels)[0].name, 'lounge', 'channelsToShow lists the pinned channel first');

    // A settings save (the existing prefs path) must not drop the pin.
    const box = (v: boolean) => ({ isChecked: () => v });
    saveSettings(app.state, { showLogins: box(true), showFileActivity: box(true), showDoorActivity: box(true), showMessages: box(true), showAnnouncements: box(true), muteSounds: box(false), timestamps: box(true) }, () => {});
    assert.deepStrictEqual(app.state.prefs.pinnedChannels, ['lounge'], 'pin survives a settings save');

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
