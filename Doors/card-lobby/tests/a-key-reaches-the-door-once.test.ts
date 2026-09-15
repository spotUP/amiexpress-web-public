/**
 * A KEY PRESSED IN THE BROWSER REACHES THIS DOOR ONCE.
 *
 * "pressing v flicks back directly", then "v just switches view for a frame
 * and then back", then "v does nothing now" (sysop, 2026-09-15). Same bug,
 * three speeds of redraw: V turns the lower panel over, and every keystroke
 * was arriving TWICE.
 *
 * The board delivers a browser key-down to the door's server half directly
 * (`key-down` -> socket-handlers -> session.doorInputHandler, the handler the
 * blessed door installs when it enables its DoorInputManager). The client
 * half is ALSO shown the key, for its sounds - and it used to send it back as
 * `rpc('input', { raw })`, where a `forwardInput` handler fed it to the very
 * same doorInputHandler a round trip later. The echo had been dead code for a
 * year because the client bundle threw on load; dfb730eaa (2026-09-14) made
 * the bundle run, and from that day every key came twice.
 *
 * The contract pinned here is the SERVER's, on purpose: the server half must
 * not offer an `input` RPC at all. The bridge answers an unknown method with
 * an error and no side effect, so even a stale client bundle still sending
 * the echo cannot deliver a key twice - the fix holds whether or not the
 * caller has reloaded.
 */

import assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';
import { isolatedDataDir } from './isolated-data-dir';

isolatedDataDir('once');

export async function theServerHalfOffersNoInputRpc(): Promise<void> {
  const { rpcHandlers } = await import('../server');
  assert.ok(!('input' in rpcHandlers),
    'an `input` RPC is a second delivery of every keystroke - the board already delivers each key once');
  // The RPCs the client half legitimately needs are still there.
  assert.strictEqual(typeof (rpcHandlers as any).pollTableEvents, 'function');
  assert.strictEqual(typeof (rpcHandlers as any).broadcastUnoEvent, 'function');
}

export async function theClientHalfDoesNotEchoKeys(): Promise<void> {
  /*
   * The client bundle runs in a browser (tone, window) and cannot be imported
   * here, so the one thing asked of its source is that the echo is gone. This
   * is belt to the server's braces above: the server refusal is what makes
   * the fix hold for a stale bundle; this keeps the fresh bundle from filling
   * the console with RPC errors for a method that is never coming back.
   */
  const client = readFileSync(join(__dirname, '..', 'client.ts'), 'utf8');
  assert.ok(!/rpc\(\s*['"]input['"]/.test(client),
    'client.ts must not send keys back to the server as rpc(\'input\')');
}
