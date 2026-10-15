/**
 * A door does not get GAME MODE unless it asks for it.
 *
 * `CoreDoor.execute()` called `bbs.enableGameMode()` for every door built on
 * it, with the comment "Enable game mode for smooth keyboard input". Game mode
 * is not a smoothing option: it tells the browser to stop sending characters
 * and send raw key-down / key-up EDGES instead, which a physical keyboard
 * produces and AN ON-SCREEN ONE DOES NOT.
 *
 * So every blessed door on this board - the tip of the day, the doors menu,
 * the dashboard, the card lobby, the ANSI editor, livechat - was unreachable
 * from a phone. The sysop, 2026-09-14: "the osd keyboard doesnt seem to reach
 * it q does nothing". From a desktop it was invisible, because a real keydown
 * still arrives.
 *
 * It also overrode what the doors asked for: fourteen of them build their
 * DoorInputManager with `enableGameMode: false` and a comment saying why, and
 * this ran before any of them.
 *
 * `services/game-mode.service.ts` has always said the rule out loud - "Should
 * ONLY be called for doors that need raw keydown/keyup events" - and this is
 * what holds the SDK to it.
 */
import { Door as CoreDoor } from '../../core/Door';

/** The BBS host object, with the one method this is about. */
function aHost() {
  const calls: string[] = [];
  return {
    calls,
    bbs: {
      enableGameMode: (doorType = 'TS') => { calls.push(doorType); },
      // The rest of the host a door touches on the way through.
      write: () => {},
      writeLine: () => {},
    },
  };
}

function aSession(bbs: any) {
  return {
    socket: { emit: () => {}, on: () => {}, off: () => {} },
    bbsSession: {},
    /* Storage keys itself by caller id and refuses without one
       (core/Storage.ts:43), so a door cannot be run without a user. */
    user: { id: 'a-caller', username: 'Spot' },
    params: [],
    bbs,
  } as any;
}

describe('a door built on CoreDoor', () => {
  it('does not switch the caller into game mode by itself', async () => {
    const host = aHost();
    const door = new CoreDoor({ name: 'A menu door', version: '1.0.0', author: 'test' });
    let ran = false;
    door.onStart(async () => { ran = true; });

    await door.execute(aSession(host.bbs));

    // The door RAN - so this is not passing because nothing happened.
    expect(ran).toBe(true);
    expect(host.calls).toEqual([]);
  });

  it('still lets a door that needs key edges ask for them', async () => {
    // ncurses-pong and GrandMaster do exactly this. Removing the blanket
    // enable must not remove the ability.
    const host = aHost();
    const door = new CoreDoor({ name: 'A game', version: '1.0.0', author: 'test' });
    door.onStart(async (ctx: any) => { ctx.bbs.enableGameMode('TS'); });

    await door.execute(aSession(host.bbs));

    expect(host.calls).toEqual(['TS']);
  });

  it('runs at all on a host that has no game mode to enable', async () => {
    // A telnet or SSH caller's host answers no key edges. The old code guarded
    // for this; the absence of the call must not become a crash.
    const door = new CoreDoor({ name: 'A menu door', version: '1.0.0', author: 'test' });
    let ran = false;
    door.onStart(async () => { ran = true; });

    await door.execute(aSession({ write: () => {}, writeLine: () => {} }));

    expect(ran).toBe(true);
  });
});
