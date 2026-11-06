/**
 * "voice chat does not work over telnet" (the sysop, 2026-11-06).
 *
 * Voice needs the browser's microphone and WebRTC, so a telnet caller must not
 * be offered it: no VOICE CHANNELS section in the sidebar, no /voice commands,
 * no voice lines in the help, and the voice keys do nothing. A web caller keeps
 * all of it. Driven through the real door (createApp) on a stub bbs whose
 * connectionType is the only difference.
 */

import assert from 'assert';
import { createApp } from '../server';
import { createCommandRegistry } from '../commands';
import { helpPart1 } from '../overlays/help-content-1';
import { voiceAvailable } from '../features/voice-availability';

async function openDoor(connectionType: string): Promise<{
  screen: any; fire: (event: string, ...args: unknown[]) => void; settle: () => Promise<unknown>;
}> {
  const handlers = new Map<string, Array<(...a: any[]) => void>>();
  const bbs: any = {
    write: () => {}, writeLine: () => {}, on: () => {},
    getTerminalSize: () => ({ width: 80, height: 25 }),
    enableWideMode: () => {}, disableWideMode: () => {},
    getModemSpeed: () => 0, disableModemEmulation: () => {}, setModemSpeed: () => {},
    connectionType, unicodeCapable: true,
  };
  const socket: any = {
    on: (event: string, fn: (...a: any[]) => void) => {
      handlers.set(event, [...(handlers.get(event) ?? []), fn]);
    },
    emit: () => {}, off: () => {}, removeAllListeners: () => {},
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


function screenText(screen: any): string {
  screen.render();
  return screen.buffer.map((row: Array<[number, string]>) => row.map(cell => cell[1]).join('')).join('\n');
}

async function sidebarText(connectionType: string): Promise<string> {
  const { screen, fire, settle } = await openDoor(connectionType);
  fire('room:joined', {
    roomId: 'r1', roomName: 'main', memberCount: 1,
    members: [{ user_id: 'u1', username: 'spot', is_online: true }],
  });
  await settle();
  const text = screenText(screen);
  fire('disconnect', 'transport close');
  return text;
}

export async function aTelnetCallerSeesNoVoiceChannels(): Promise<void> {
  const text = await sidebarText('telnet');
  assert.ok(!/VOICE CHANNELS/.test(text) && !/\[V\]/.test(text), 'telnet must not see the voice section');
}

export async function aWebCallerStillSeesVoiceChannels(): Promise<void> {
  const text = await sidebarText('web');
  assert.ok(/VOICE CHANNELS/.test(text), 'web keeps the voice section');
}

export async function voiceCommandsAndHelpFollowTheTransport(): Promise<void> {
  assert.strictEqual(voiceAvailable({ connectionType: 'telnet' }), false);
  assert.strictEqual(voiceAvailable({ connectionType: 'web' }), true);
  assert.strictEqual(createCommandRegistry(voiceAvailable({ connectionType: 'telnet' })).get('voice'), undefined);
  assert.strictEqual(createCommandRegistry(voiceAvailable({ connectionType: 'telnet' })).get('deafen'), undefined);
  assert.ok(createCommandRegistry(voiceAvailable({ connectionType: 'web' })).get('voice'));
  assert.ok(!/voice/i.test(helpPart1(false)), 'telnet help has no voice lines');
  assert.ok(/\/voice join/.test(helpPart1(true)), 'web help keeps them');
}
