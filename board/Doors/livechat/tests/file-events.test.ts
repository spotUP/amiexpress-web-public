/** File upload/download events render a real line. */

import assert from 'assert';
import { createApp } from '../server';

/** The door opened headless at 80x25 on a stub, with a way to fire socket events. */
async function openDoor(): Promise<{
  screen: any; fire: (event: string, ...args: unknown[]) => void; settle: () => Promise<unknown>;
}> {
  const handlers = new Map<string, Array<(...a: any[]) => void>>();
  const bbs: any = {
    write: () => {}, writeLine: () => {}, on: () => {},
    getTerminalSize: () => ({ width: 80, height: 25 }),
    enableWideMode: () => {}, disableWideMode: () => {},
    getModemSpeed: () => 0, disableModemEmulation: () => {}, setModemSpeed: () => {},
    connectionType: 'web', unicodeCapable: true,
  };
  const socket: any = {
    on: (event: string, fn: (...a: any[]) => void) => {
      handlers.set(event, [...(handlers.get(event) ?? []), fn]);
    },
    emit: () => {}, send: () => {}, off: () => {}, removeAllListeners: () => {},
  };
  const session: any = {
    bbs, socket, params: [],
    bbsSession: { userId: 1, username: 'spot', nodeId: 1, secLevel: 255, tempData: {}, socket },
    user: { id: 1, name: 'spot', accessLevel: 255 },
  };
  const fire = (event: string, ...args: unknown[]) => (handlers.get(event) ?? []).forEach(fn => fn(...args));
  // The sidebar fits itself to its content on a short timer after a render.
  const settle = () => new Promise(resolve => setTimeout(resolve, 100));

  const app: any = await createApp(session);
  return { screen: app.screen, fire, settle };
}

/**
 * "[EVENT] undefined" for file upload and download events (ledger note,
 * thoughts/spot/livechat68-alpha-ledger.md). The board broadcasts them as
 * type 'upload' / 'download' with the fields in data (bbs-event-emitter.ts);
 * getEventMessage only knew *_complete with details, fell to its default and
 * JSON.stringify(undefined) printed "undefined".
 */
export async function fileEventsPrintNoEventUndefined(): Promise<void> {
  const { screen, fire, settle } = await openDoor();
  fire('room:joined', {
    roomId: 'r1', roomName: 'main', memberCount: 1,
    members: [{ user_id: 'u1', username: 'spot', is_online: true }],
  });
  await settle();
  fire('bbs:event', { type: 'upload', username: 'zed', nodeId: 2, timestamp: Date.now(),
    data: { fileName: 'demo.lha', fileSize: 2048, conferenceName: 'Files' } });
  fire('bbs:event', { type: 'download', username: 'amy', nodeId: 3, timestamp: Date.now(),
    data: { fileName: 'tune.mod', fileSize: 1024, conferenceName: 'Music' } });
  await settle();
  screen.render();
  const text: string = screen.buffer.map((row: Array<[number, string]>) => row.map(c => c[1]).join('')).join('\n');
  assert.ok(!text.includes('[EVENT] undefined'), 'no "[EVENT] undefined" line');
  assert.ok(text.includes('zed uploaded "demo.lha" to Files'), 'the upload line is drawn');
  assert.ok(text.includes('amy downloaded "tune.mod" from Music'), 'the download line is drawn');
  fire('disconnect', 'transport close');
}
