/**
 * THE WAIT A DOOR GETS MUST NOT DEPEND ON WHO STARTED THE BOARD.
 *
 * `docker-compose.yml` passes `DOOR_ASYNC_WAIT=${DOOR_ASYNC_WAIT:-1}`, so the
 * live board has always run the async wait. The code's own default was OFF,
 * so every other runtime - the dev stack, `run-amiga-door.ts`, the corpus
 * runner - took the legacy loop: ten thousand iterations, then give up,
 * whatever the door was waiting for. At a `JH_HK` prompt that hands the door
 * a character 0 nobody typed.
 *
 * The sysop hit it on localhost, 2026-09-16: "the bbs halts at the next door
 * after it during log in". GWall, the `~CC_gwall` on the line after
 * `~CC_gl` in `Screens/logon20.txt`, with this in the log:
 *
 *     [AEDoorLibrary] No reply for command 6 after 10000 iterations
 *       (sync wait) - wait ended: budget
 *     [AEDoorLibrary] HotKey() -> char: 0 (' ')
 *
 * Reproduced with the real binary through `run-amiga-door.ts` with no
 * environment set, and gone after this change.
 */
import { asyncWaitEnabled } from '../../src/amiga-emulation/api/wait-budget';

describe('whether a waiting door pumps the event loop', () => {
  it('does it by default, so a dev stack behaves like the board', () => {
    expect(asyncWaitEnabled({} as NodeJS.ProcessEnv)).toBe(true);
  });

  it('does it when the board says so, which is what compose passes', () => {
    expect(asyncWaitEnabled({ DOOR_ASYNC_WAIT: '1' } as NodeJS.ProcessEnv)).toBe(true);
  });

  it('can still be turned off by name, for comparing against the old loop', () => {
    for (const off of ['0', 'false', 'off', 'no', 'OFF']) {
      expect(asyncWaitEnabled({ DOOR_ASYNC_WAIT: off } as NodeJS.ProcessEnv)).toBe(false);
    }
  });

  it('treats an empty value as unset rather than as off', () => {
    // `DOOR_ASYNC_WAIT=` in a stray .env must not silently restore the loop
    // that invents keystrokes.
    expect(asyncWaitEnabled({ DOOR_ASYNC_WAIT: '  ' } as NodeJS.ProcessEnv)).toBe(true);
  });
});
