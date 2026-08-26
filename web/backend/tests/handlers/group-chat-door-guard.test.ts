/**
 * Raw room ANSI never lands on a door's screen.
 *
 * Reported live with two users in LiveChat: the same message on screen
 * TWICE, in two colours, merged into one row - "messages are still not
 * ending up on their own lines".
 *
 * The door drew each message from the structured chat:message event, and the
 * backend ALSO broadcast the same message as raw ANSI, which the terminal
 * wrote at wherever the cursor happened to be - straight over the door's
 * blessed UI. Only OTHER people's messages doubled, because the sender is
 * excluded from that broadcast, which is exactly the asymmetry that was
 * reported.
 *
 * There has always been a guard against this. It looked the member's session
 * up with `sessions.get(socketId)` - and that map is keyed by NODE ID, so
 * the lookup always missed and the guard never fired once.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const handler = readFileSync(
  join(__dirname, '..', '..', 'src', 'handlers', 'chat', 'group-chat.handler.ts'),
  'utf8'
);

describe('the door guard', () => {
  /** The function's CODE, with comments stripped - the fix is described in
   *  a comment that names the old call, and a comment is not behaviour. */
  const broadcast = handler
    .slice(
      handler.indexOf('function broadcastAnsiToRoom'),
      handler.indexOf('function broadcastRoomSystem')
    )
    .split('\n')
    .filter(line => !line.trim().startsWith('//'))
    .join('\n');

  it('looks the session up by socket, not in the node-keyed map', () => {
    expect(broadcast).toMatch(/getSessionBySocketId\(socketId\)/);
    expect(broadcast).not.toMatch(/sessions\.get\(socketId\)/);
  });

  it('skips members whose door owns the terminal', () => {
    expect(broadcast).toMatch(/doorOwnsTerminal\(memberSession\)\) continue/);
  });

  it('still excludes the sender', () => {
    expect(broadcast).toMatch(/excludeSocketId && socketId === excludeSocketId\) continue/);
  });
});

describe('what counts as a door owning the terminal', () => {
  it('recognises every way a door can be running', () => {
    const fn = handler.slice(
      handler.indexOf('function doorOwnsTerminal'),
      handler.indexOf('/** Terminal output for this session')
    );

    expect(fn).toMatch(/clientDoorActive/);
    expect(fn).toMatch(/currentDoorName/);
    expect(fn).toMatch(/doorInputHandler/);
  });
});

describe('emitToTerminal', () => {
  const fn = handler.slice(
    handler.indexOf('function emitToTerminal'),
    handler.indexOf('// Dependencies (injected via setter)')
  );

  it('emits instead of calling itself', () => {
    // It called emitToTerminal(socket, session, data) - itself - so any
    // session without a door recursed until the stack gave out. Door
    // sessions returned on the line above, which is the only reason this was
    // survivable.
    expect(fn).toMatch(/socket\.emit\('ansi-output', data\)/);
    expect(fn).not.toMatch(/\n\s*emitToTerminal\(socket, session, data\);/);
  });

  it('still says nothing while a door owns the screen', () => {
    expect(fn).toMatch(/if \(doorOwnsTerminal\(session\)\) return;/);
  });
});
