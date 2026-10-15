/**
 * What the Activity feed is told a user is doing.
 *
 * The feed knew six things - logged on, logged off, upload, download, a door
 * opened, a door's own event - and nothing about the rest of a session. Every
 * command a logged-on user runs passes through `processCommand`, which
 * reported none of them, so the admin could see that someone was on and not
 * what they were doing.
 *
 * The vocabulary is written down TWICE: `BBSEventType` in the backend's
 * emitter and again in the admin's `types/realtime.ts`, because the union has
 * to exist on both sides of a socket. Nothing kept them in step - a type added
 * to one would simply never be rendered by the other, silently. That is the
 * two-store shape this codebase keeps getting caught by, so it is pinned here.
 *
 * The emit site is driven through the real `processCommand`, with only the
 * BBSCMD tier's answer controlled - so "a door handled it" can be said without
 * launching one - and the feed heard through the emitter's own listener.
 */

process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as path from 'path';

/** null = the real BBSCMD tier; a number = what it answers (0 = a door ran). */
let bbsCmdAnswer: number | null = null;
jest.mock('../../src/handlers/command-execution.handler', () => {
  const actual = jest.requireActual('../../src/handlers/command-execution.handler');
  return {
    ...actual,
    runBbsCommand: (...args: any[]) =>
      (bbsCmdAnswer === null ? actual.runBbsCommand(...args) : Promise.resolve(bbsCmdAnswer)),
  };
});

import { bbsEventEmitter, emitCommand } from '../../src/services/bbs-event-emitter';
import { processCommand } from '../../src/handlers/command.handler';
import { BBSState, LoggedOnSubState } from '../../src/index';

const ROOT = path.join(__dirname, '..', '..', '..', '..');

function eventTypesIn(source: string): string[] {
  const union = source.slice(
    source.indexOf('BBSEventType ='),
    source.indexOf(';', source.indexOf('BBSEventType =')),
  );
  return [...union.matchAll(/'([a-z_]+)'/g)].map(m => m[1]).sort();
}

describe('the event vocabulary', () => {
  it('is the same on both sides of the socket', () => {
    // REASONABLE source pin: the admin's copy is a TypeScript union in another
    // package, erased at runtime, so there is no value on either side to compare.
    const backend = eventTypesIn(
      fs.readFileSync(
        path.join(ROOT, 'web/backend/src/services/bbs-event-emitter.ts'),
        'utf8',
      ),
    );
    const admin = eventTypesIn(
      fs.readFileSync(
        path.join(ROOT, 'web/config-app/src/types/realtime.ts'),
        'utf8',
      ),
    );

    expect(backend.length).toBeGreaterThan(6);
    expect(admin).toEqual(backend);
  });
});

describe('a command event', () => {
  it('reaches listeners with the command and the conference', () => {
    const heard: unknown[] = [];
    bbsEventEmitter.on('bbs:event', (payload: unknown) => heard.push(payload));

    emitCommand({
      username: 'Phantasm',
      nodeId: 4,
      command: 'R',
      conferenceId: 2,
      timestamp: 1_700_000_000_000,
    });

    expect(heard).toContainEqual(
      expect.objectContaining({
        type: 'command',
        username: 'Phantasm',
        nodeId: 4,
        data: { command: 'R', conferenceId: 2 },
      }),
    );
  });
});

describe('the command emit site', () => {
  let heard: any[] = [];
  const listen = (payload: any) => { if (payload?.type === 'command') heard.push(payload); };

  beforeAll(() => bbsEventEmitter.on('bbs:event', listen));
  afterAll(() => bbsEventEmitter.off('bbs:event', listen));
  beforeEach(() => { heard = []; bbsCmdAnswer = null; });

  let n = 0;
  function aLoggedOnCaller() {
    const socket = { id: `activity-${++n}`, emit: () => true, on: () => {}, off: () => {}, removeListener: () => {} } as any;
    const session: any = {
      state: BBSState.LOGGEDON,
      subState: LoggedOnSubState.PROCESS_COMMAND,
      connectionType: 'web',
      nodeId: 3,
      currentConf: 1,
      currentConference: 1,
      inputBuffer: '',
      commandHistory: [],
      user: { id: 1, username: 'Phantasm', secLevel: 255, expert: 'X' },
      tempData: {},
    };
    return { socket, session };
  }

  // processCommand is the one funnel every logged-on command passes through.
  // A feed fed from anywhere else would miss whatever routes around it.
  it('reports a command the board runs itself', async () => {
    const { socket, session } = aLoggedOnCaller();

    await processCommand(socket, session, 'T', '');

    expect(heard).toHaveLength(1);
    expect(heard[0]).toEqual(expect.objectContaining({
      type: 'command', username: 'Phantasm', nodeId: 3, data: { command: 'T', conferenceId: 1 },
    }));
  });

  // A command that names a DOOR is reported by the door's own entered/exited
  // event. Emitting here as well put every door in the feed twice - "Ran
  // FROGGER in Amiga Warez!" beside "Started a game of FROGGER" - which the
  // sysop saw on the live board and called wrong.
  it('reports nothing when a door handled the command', async () => {
    bbsCmdAnswer = 0;
    const { socket, session } = aLoggedOnCaller();

    await processCommand(socket, session, 'FROGGER', '');

    expect(heard).toEqual([]);
  });

  // A command line can carry a password - the login prompt, AUTOVAL_PASSWORD,
  // a sysop changing one - and this is broadcast to every admin socket.
  it('never puts the parameters on the wire', async () => {
    const { socket, session } = aLoggedOnCaller();

    await processCommand(socket, session, 'T', 'hunter2');

    expect(heard).toHaveLength(1);
    expect(JSON.stringify(heard)).not.toContain('hunter2');
  });

  // The feed is a nicety; the command is the user's session.
  it('cannot stop a command running', async () => {
    const spy = jest.spyOn(bbsEventEmitter, 'emitCommand').mockImplementation(() => {
      throw new Error('the feed is down');
    });
    const { socket, session } = aLoggedOnCaller();
    try {
      await expect(processCommand(socket, session, 'T', '')).resolves.toBe('SUCCESS');
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });
});
