/**
 * Joining a room announces it once.
 *
 * Same screenshot as the doubled login events: every join and leave appeared
 * twice in the chat log -
 *
 *   *** infant joined the room ***
 *   [21:51] infant joined
 *   *** infant joined the room ***
 *   [21:51] infant joined
 *
 * handleRoomJoin emitted room:user-joined twice: once to the room except the
 * joiner, and then again to the WHOLE room "for SDK doors". Everyone but the
 * joiner therefore received it twice. handleRoomLeave had the same pair.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const handler = readFileSync(
  join(__dirname, '..', '..', 'src', 'handlers', 'chat', 'group-chat.handler.ts'),
  'utf8'
);

/** Count real emits of an event, ignoring comments. */
function countEmits(source: string, event: string): number {
  return source
    .split('\n')
    .filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
    .filter(line => line.includes(`emit('${event}'`))
    .length;
}

describe('room membership announcements', () => {
  const joinFn = handler.slice(
    handler.indexOf('export async function handleRoomJoin'),
    handler.indexOf('export async function handleRoomLeave')
  );

  const leaveFn = handler.slice(
    handler.indexOf('export async function handleRoomLeave'),
    handler.indexOf('export async function handleRoomLeave') + 4000
  );

  it('announces a join once, not once per audience', () => {
    expect(countEmits(joinFn, 'room:user-joined')).toBe(1);
  });

  it('announces a leave once', () => {
    expect(countEmits(leaveFn, 'room:user-left')).toBe(1);
  });

  it('still announces to the whole room, so doors and terminals both hear it', () => {
    // The surviving emit must not exclude anybody: the door needs it, and so
    // does a plain terminal.
    expect(joinFn).toMatch(/io\.to\(socketRoom\)\.emit\('room:user-joined'/);
  });
});
