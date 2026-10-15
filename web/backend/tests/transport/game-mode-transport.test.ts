/**
 * Task TP-7 of `thoughts/shared/plans/2026-09-03-ssh-telnet-parity.md`:
 * GAME MODE IS A TRANSPORT CAPABILITY, AND THE ARCADE DOORS' CHARACTER PATH.
 *
 * Symptom a sysop reported: an arcade door on telnet draws its board and the
 * player never moves. Controller decision 5 settles what the answer must be -
 * `isKeyStateActive()` is false unless the transport can deliver key-down /
 * key-up EDGES, and the eight arcade doors then take the character path they
 * already have.
 *
 * Two things are proved here, and the second is the one that makes the first
 * worth anything:
 *
 * 1. THE CAPABILITY, through the real objects. `createBBSApi` over a telnet
 *    session answers `deliversKeyEvents === false`, and a real
 *    `DoorInputManager` built on that host reports `isKeyStateActive()` false.
 *    The same walk on a WEB session answers true and tracks a held key - the
 *    known-live / known-dead pair that validates the instrument before any of
 *    its counts are quoted (~/.claude/REACHABILITY_PROTOCOL.md section 3).
 *    The getter is counted through a prototype spy, so "it ran" is a number
 *    and not an inference.
 *
 * 2. THE DOORS, through their own top-level entry point. Each of the eight
 *    arcade doors is started with `door.execute()` - the same call the BBS
 *    makes (`handlers/door.handler.ts:2352,2415,2446`, which passes
 *    `bbs: createBBSApi(socket, session)` exactly as this suite does) - over a
 *    TELNET session. The door builds its OWN `DoorInputManager` from that
 *    host, so the guard under test is the one the door will really ask. One
 *    keystroke then goes in through `session.doorInputHandler`, the sink the
 *    door's input loop installs (`sdk/core/Door.ts:193-215`), and the door's
 *    game object must be told to move.
 *
 * NOTE ON WHICH BUILD TEST 2 EXERCISES. The doors import the SDK through the
 * package name, so they get `sdk/dist` - the build that actually ships - while
 * the capability tests above import `sdk/utils/door-input-manager.ts` directly.
 * That is deliberate and is the reason these cases catch a stale `sdk/dist`:
 * against the pre-TP-7 build all eight fail with `move.mock.calls.length` 0,
 * which is precisely the frozen player a telnet caller saw. Run
 * `cd sdk && npm run build` after any change under `sdk/`
 * (.claude/skills/door-sdk-freshness/SKILL.md).
 *
 * Test 2 is a PIN, not a fix: all eight doors already have the character path
 * (the plan verified it at HEAD and no door is edited by TP-7). It fails the
 * day a door drops that path, which is exactly the day that door must become
 * CLIENT_ONLY per TP-6 - otherwise a telnet caller gets a board that never
 * moves and no notice.
 *
 * `src/index.ts` is mocked away: it runs a top-level IIFE that starts the
 * HTTP/telnet/SSH servers on module load. `tone` is mocked because the SDK
 * barrel pulls in the audio engine, which is ESM-only and outside jest's
 * transform.
 */
process.env.SKIP_DB_INIT = '1';

import 'reflect-metadata';
import { EventEmitter } from 'events';
import { readFileSync } from 'fs';
import { join } from 'path';

jest.mock('tone', () => ({}), { virtual: true });
jest.mock('../../src/index', () => {
  const states = require('../../src/constants/bbs-states');
  return {
    BBSState: states.BBSState,
    LoggedOnSubState: states.LoggedOnSubState,
    LOCALHOST_IPS: [],
  };
});
jest.mock('../../src/amiga-emulation/loader/LibraryLoader', () => ({ LibraryLoader: jest.fn() }));
jest.mock('../../src/amiga-emulation/AmigaDoorSession', () => ({ AmigaDoorSession: jest.fn() }));
jest.mock('../../src/services/DoorDropFileManager');
jest.mock('../../src/services/CallersLogManager');

import { BBSApi, createBBSApi } from '../../src/doors/BBSApi';
import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';
import { DoorInputManager } from '../../../../sdk/utils/door-input-manager';
import type { Socket } from 'socket.io';
import type { BBSSession } from '../../src/index';

/**
 * A socket.io-shaped sink. The capability under test is derived from the
 * SESSION, never from the socket, so the two transports differ by one field
 * and nothing else - which is the point.
 *
 * `emit` records and does NOT dispatch locally, because that is what a
 * server-side socket.io `Socket` does: `emit` sends OUTBOUND to the remote
 * client, while `on`/`once` receive INBOUND frames and lifecycle events. A
 * stub that looped `emit` back into its own listeners would fire
 * `Door.runInputLoop`'s `socket.once('door:close')` (sdk/core/Door.ts:234-247)
 * on the door's own first frame and tear the input loop down before a single
 * keystroke arrived - a stub bug that would read exactly like the defect this
 * suite is about.
 */
class StubSocket extends EventEmitter {
  public emitted: Array<{ event: string; args: unknown[] }> = [];

  emit(event: string, ...args: unknown[]): boolean {
    this.emitted.push({ event, args });
    return true;
  }

  /** An INBOUND frame, the direction `on`/`once` listen in. */
  receive(event: string, ...args: unknown[]): boolean {
    return super.emit(event, ...args);
  }
}

function sessionFor(connectionType: 'web' | 'telnet', nodeId: number): BBSSession {
  return {
    state: BBSState.LOGGEDON,
    subState: LoggedOnSubState.DISPLAY_MENU,
    user: { id: nodeId, username: `CALLER${nodeId}`, secLevel: 100 },
    nodeId,
    currentConf: 1,
    conferenceId: 1,
    timeRemaining: 3600,
    lastActivity: Date.now(),
    commandBuffer: '',
    inputBuffer: '',
    connectionType,
    terminalType: 'ansi',
    petsciiMode: false,
    screenWidth: 80,
    screenHeight: 24,
    tempData: {},
  } as unknown as BBSSession;
}

/** The host object a TypeScript door is handed as `ctx.bbs`. */
function hostFor(connectionType: 'web' | 'telnet', nodeId: number) {
  const socket = new StubSocket();
  const session = sessionFor(connectionType, nodeId);
  const bbs = createBBSApi(socket as unknown as Socket, session);
  return { socket, session, bbs };
}

function managerOver(bbs: BBSApi): DoorInputManager {
  const manager = new DoorInputManager({ bbs }, undefined as never, {
    trackHeldKeys: true,
    enableMouse: false,
    enableAutoSuspend: false,
  });
  manager.enable();
  return manager;
}

describe('game mode is a transport capability', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('a telnet door reports no key edges, and its held-key tracking stays off', () => {
    const getter = jest.spyOn(BBSApi.prototype, 'deliversKeyEvents', 'get');
    const { bbs } = hostFor('telnet', 81);

    expect(bbs.deliversKeyEvents).toBe(false);

    const manager = managerOver(bbs);
    try {
      // The guard ASKED the transport - the whole defect was that it asked the
      // host object's shape instead, and `onKeyDown`/`onKeyUp` are defined
      // unconditionally for every caller.
      expect(getter.mock.calls.length).toBeGreaterThanOrEqual(1);
      expect(typeof bbs.onKeyDown).toBe('function');
      expect(typeof bbs.onKeyUp).toBe('function');

      expect(manager.isKeyStateActive()).toBe(false);
      expect(manager.isHeld('left')).toBe(false);
      expect(manager.consumeRepeat('left')).toBe(false);
    } finally {
      manager.disable();
    }
  });

  it('a web door still tracks held keys', () => {
    const getter = jest.spyOn(BBSApi.prototype, 'deliversKeyEvents', 'get');
    const { bbs, session } = hostFor('web', 82);

    expect(bbs.deliversKeyEvents).toBe(true);

    const manager = managerOver(bbs);
    try {
      expect(getter.mock.calls.length).toBeGreaterThanOrEqual(1);
      expect(manager.isKeyStateActive()).toBe(true);

      // The edge sink `BBSApi.onKeyDown`/`onKeyUp` install, and the one
      // `server/socket-handlers.ts:527,551-570` writes a browser's key-down /
      // key-up into.
      const sink = (session as unknown as {
        doorKeyStateHandler?: (d: { key: string; pressed: boolean; keyState: Record<string, boolean> }) => void;
      }).doorKeyStateHandler;
      expect(typeof sink).toBe('function');

      sink!({ key: 'ArrowLeft', pressed: true, keyState: { ArrowLeft: true } });
      expect(manager.isHeld('left')).toBe(true);

      sink!({ key: 'ArrowLeft', pressed: false, keyState: {} });
      expect(manager.isHeld('left')).toBe(false);
    } finally {
      manager.disable();
    }
  });
});

/**
 * The eight arcade doors, each driven through `door.execute()` on a TELNET
 * caller.
 *
 * `start` is the key sequence that reaches the playing state from the door's
 * own opening screen, `move` the character the door's `normalizeKey` maps to
 * "left", and `method` the game-object call its character path must make.
 * Frogger opens on an attract loop, where the first key is the coin slot and
 * only the second reaches the menu's Start Game.
 */
interface ArcadeDoorCase {
  door: string;
  gameModule: string;
  gameClass: string;
  method: string;
  start: string[];
  move: string;
  expected: unknown[];
}

const ARCADE_DOORS: ArcadeDoorCase[] = [
  { door: 'joust', gameModule: 'game/joust-game', gameClass: 'JoustGame', method: 'handleDirection', start: ['\r'], move: 'a', expected: ['left'] },
  { door: 'zoo-keeper', gameModule: 'game/zoo-stage', gameClass: 'ZooKeeperGame', method: 'handleDirection', start: ['\r'], move: 'a', expected: ['left'] },
  { door: 'pengo', gameModule: 'game/pengo-game', gameClass: 'PengoGame', method: 'handleDirection', start: ['\r'], move: 'a', expected: ['left'] },
  { door: 'frogger', gameModule: 'game/frogger-game', gameClass: 'FroggerGame', method: 'handleDirection', start: ['\r', '\r'], move: 'a', expected: ['left'] },
  { door: 'super-qix', gameModule: 'game/qix-engine', gameClass: 'QixEngine', method: 'handleDirection', start: ['\r'], move: 'a', expected: ['left'] },
  { door: 'pipe-dream', gameModule: 'game/pipe-dream-game', gameClass: 'PipeDreamGame', method: 'handleMove', start: ['\r'], move: 'a', expected: ['left'] },
  { door: 'galaga', gameModule: 'game/galaga-game', gameClass: 'GalagaGame', method: 'handleKeyDown', start: ['\r'], move: 'a', expected: ['left'] },
  { door: 'donkey-kong', gameModule: 'game/donkey-kong-game', gameClass: 'DonkeyKongGame', method: 'handleMove', start: ['\r'], move: 'a', expected: ['left'] },
];

const settle = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('each arcade door moves on a character when the transport has no key edges', () => {
  it('the sdk/dist build the doors import carries the transport guard', () => {
    // sdk/dist is gitignored and built by `npm install`'s prepare script, so a
    // tree whose SDK has not been rebuilt since an edit under sdk/ would fail
    // all eight cases below with no hint why. Say why, once, here.
    const built = readFileSync(
      join(__dirname, '..', '..', '..', '..', 'sdk', 'dist', 'utils', 'door-input-manager.js'),
      'utf8',
    );
    expect(built).toContain('deliversKeyEvents');
  });

  for (const arcade of ARCADE_DOORS) {
    it(`${arcade.door} moves the player on its left character`, async () => {
      const gameModule = await import(`../../../../Doors/${arcade.door}/${arcade.gameModule}`);
      const gameClass = (gameModule as Record<string, { prototype: object }>)[arcade.gameClass];
      expect(gameClass).toBeDefined();

      const move = jest.spyOn(gameClass.prototype as never, arcade.method as never);
      const doorModule = await import(`../../../../Doors/${arcade.door}/index`);
      const door = (doorModule as { default: { execute: (raw: unknown) => Promise<void> } }).default;

      const { socket, session, bbs } = hostFor('telnet', 90);
      // The door reads its capability off this host, so the guard it asks is
      // the production one and not a stub.
      expect(bbs.deliversKeyEvents).toBe(false);

      const raw = {
        socket: socket as unknown as Socket,
        bbsSession: session,
        user: { id: `tp7-${arcade.door}`, name: 'CALLER90' },
        params: [],
        bbs,
      };
      const finished = door.execute(raw);
      await settle(250);

      const keystroke = (session as unknown as {
        doorInputHandler?: (data: string) => void;
      }).doorInputHandler;
      expect(typeof keystroke).toBe('function');

      try {
        for (const key of arcade.start) {
          keystroke!(key);
          await settle(120);
        }
        // Only the movement keystroke is counted: the start sequence itself
        // may legitimately touch the game object.
        move.mockClear();

        keystroke!(arcade.move);
        await settle(60);

        expect(move.mock.calls.length).toBeGreaterThanOrEqual(1);
        expect(move.mock.calls[0]).toEqual(arcade.expected);
      } finally {
        // Leave the game, then the menu, so the door's own cleanup runs and no
        // game-loop interval survives the test.
        keystroke!('q');
        await settle(30);
        keystroke!('q');
        await settle(30);
        keystroke!('q');
        await Promise.race([finished, settle(300)]);
        move.mockRestore();
      }
    }, 30000);
  }
});
