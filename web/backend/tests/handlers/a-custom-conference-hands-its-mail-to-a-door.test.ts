/**
 * A conference whose message base is a DOOR.
 *
 * express.e:12426-12437 - a conference carrying the tooltype `CUSTOM` does not
 * use the board's MailStats/HeaderFile pipeline at all. Every message command
 * it owns goes to one door, `MSGBASE.DEF`, resolved in the conference's own
 * directory (`tooltypes.e:62-64`), told WHICH function it is standing in for
 * (`param1`) and WHICH conference (`param2`).
 *
 * This port read the tooltype and then did nothing with it. Three branches in
 * `conference.handler.ts` said so out loud - *"We don't have customMsgbaseCmd
 * (no in-tree CUSTOM message base implementation), so the CUSTOM branch is a
 * no-op"* - which meant a conference that declared CUSTOM was a conference
 * with no mail: no scan, no stats, and `R` reading a HeaderFile that a custom
 * base has no reason to keep.
 *
 * The failure mode to guard hardest is not "the door does not run". It is a
 * conference that CLAIMS custom and cannot produce a door, because the
 * tempting answer there is silence, and silence is a conference whose mail
 * has quietly ceased to exist.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** Every door launch this test saw, with what the session held at the time. */
interface Launch {
  path: string;
  command: string;
  param1: unknown;
  param2: unknown;
  cmd: unknown;
}
const launches: Launch[] = [];

/*
 * The whole module, not a spread over requireActual: door.handler is at the
 * centre of a require cycle (doortypes -> door.handler -> ...), and pulling
 * the real one in from a mock factory dies with "Cannot access '_doortypes'
 * before initialization". Nothing here needs the rest of it - launching the
 * door IS what this test is about, and running one is not.
 */
jest.mock('../../src/handlers/door.handler', () => ({
  executeDoor: jest.fn(async (_socket: any, session: any, door: any) => {
    // The values are read INSIDE the launch, because that is the only moment
    // they are meant to exist - a door asks for them as its first act.
    launches.push({
      path: door.path,
      command: door.command,
      param1: session.customMsgParam1,
      param2: session.customMsgParam2,
      cmd: session.customMsgCmd,
    });
  }),
}));

/** The tooltype the whole mechanism hangs off, per conference. */
const custom = new Map<number, boolean>();
jest.mock('../../src/utils/conference-tooltypes.util', () => ({
  ...jest.requireActual('../../src/utils/conference-tooltypes.util'),
  getConferenceToolFlags: (conf: number) => ({ custom: custom.get(conf) === true }),
}));

import {
  customMsgbaseDoor,
  runCustomMsgbaseCommand,
  MailFunction,
} from '../../src/services/custom-msgbase';
import { config } from '../../src/config';

let root: string;
let previousDataDir: string;

const DOOR = path.join('Doors', 'SUBS', 'subs');

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'custom-msgbase-'));
  fs.writeFileSync(
    path.join(root, 'ConfConfig.info'),
    [
      'NCONFS=3',
      'NAME.1=Amiga Chat', 'LOCATION.1=BBS:Conf1/',
      'NAME.2=Staff Only', 'LOCATION.2=BBS:Conf2/',
      'NAME.3=Elsewhere',  'LOCATION.3=BBS:Somewhere/',
      '',
    ].join('\n'),
    'utf8',
  );
  for (const dir of ['Conf1', 'Conf2', 'Somewhere', path.join('Doors', 'SUBS')]) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
  }
  fs.writeFileSync(path.join(root, DOOR), '#!/bin/false\n', 'utf8');

  // Conference 1: a message base that is a door.
  fs.writeFileSync(
    path.join(root, 'Conf1', 'MSGBASE.DEF.info'),
    `LOCATION=BBS:${DOOR}\nTYPE=XIM\nACCESS=10\n`,
    'utf8',
  );
  // Conference 3 lives somewhere that is not `Conf3`, which is the whole
  // reason the directory comes from LOCATION.n and never from the number.
  fs.writeFileSync(
    path.join(root, 'Somewhere', 'MSGBASE.DEF.info'),
    `LOCATION=BBS:${DOOR}\nTYPE=XIM\n`,
    'utf8',
  );
});

afterAll(() => {
  config.set('dataDir', previousDataDir);
  fs.rmSync(root, { recursive: true, force: true });
});

beforeEach(() => {
  previousDataDir = previousDataDir ?? config.get('dataDir');
  config.set('dataDir', root);
  launches.length = 0;
  custom.clear();
});

const aSession = (conf = 1): any => ({
  currentConf: conf,
  nodeId: 0,
  user: { username: 'Spot', secLevel: 255 },
});

describe('finding the conference message-base door', () => {
  it('finds it when the conference declares CUSTOM', () => {
    custom.set(1, true);
    const door = customMsgbaseDoor(root, 1);
    expect(door).not.toBeNull();
    expect(door!.path).toBe(path.join(root, DOOR));
    expect(door!.name).toBe('MSGBASE.DEF');
  });

  it('finds nothing for an ORDINARY conference, even with the file there', () => {
    // The tooltype is the switch. A conference that has not asked for a custom
    // base keeps the board's own, whatever is lying in its directory.
    const door = customMsgbaseDoor(root, 1);
    expect(door).toBeNull();
  });

  it('reads the conference directory from LOCATION.n, not from the number', () => {
    // Conference 3 lives in `Somewhere/`. Building `Conf3/` is the mistake
    // this board has made before.
    custom.set(3, true);
    expect(customMsgbaseDoor(root, 3)).not.toBeNull();
  });

  it('falls back to the board when CUSTOM is claimed and no door is there', () => {
    // Conference 2 says custom and ships no MSGBASE.DEF. The answer is null,
    // so the caller runs the board's own message base - a conference with
    // silently no mail is the worse failure.
    custom.set(2, true);
    expect(customMsgbaseDoor(root, 2)).toBeNull();
  });

  it('falls back when the icon names a door that is not on the disk', () => {
    custom.set(2, true);
    fs.writeFileSync(
      path.join(root, 'Conf2', 'MSGBASE.DEF.info'),
      'LOCATION=BBS:Doors/GONE/gone\n',
      'utf8',
    );
    expect(customMsgbaseDoor(root, 2)).toBeNull();
    fs.unlinkSync(path.join(root, 'Conf2', 'MSGBASE.DEF.info'));
  });
});

describe('running it for one message function', () => {
  it('launches the door with the function and the conference on the session', async () => {
    custom.set(1, true);
    const session = aSession();

    const ran = await runCustomMsgbaseCommand({} as any, session, MailFunction.SCAN, 1, '');

    expect(ran).toBe(true);
    expect(launches).toHaveLength(1);
    // express.e:12433-12434 - param1 is the function, param2 the conference.
    expect(launches[0].param1).toBe(MailFunction.SCAN);
    expect(launches[0].param2).toBe(1);
    expect(launches[0].path).toBe(path.join(root, DOOR));
  });

  it('passes the typed command line through, and nothing for a scan', async () => {
    // express.e:12427-12430 - `passCmdLine` is 1 for R/E/C and 0 for the scan
    // and the stats, which nobody types. `R 42` must reach the door as `R 42`
    // or it opens on the wrong message.
    custom.set(1, true);

    await runCustomMsgbaseCommand({} as any, aSession(), MailFunction.READ, 1, 'R 42');
    await runCustomMsgbaseCommand({} as any, aSession(), MailFunction.SCAN, 1, '');

    expect(launches[0].cmd).toBe('R 42');
    expect(launches[1].cmd).toBe('');
  });

  it('clears the three values once the door is gone', async () => {
    /*
     * A LATER door must never read 600 and be told it is a message base. The
     * same class as a stale `doorCommand`, and this one would have a door
     * writing mail nobody asked for.
     */
    custom.set(1, true);
    const session = aSession();

    await runCustomMsgbaseCommand({} as any, session, MailFunction.CREATE, 1, 'E');

    expect(session.customMsgParam1).toBeUndefined();
    expect(session.customMsgParam2).toBeUndefined();
    expect(session.customMsgCmd).toBeUndefined();
  });

  it('clears them even when the door throws', async () => {
    custom.set(1, true);
    const session = aSession();
    const { executeDoor } = require('../../src/handlers/door.handler');
    executeDoor.mockImplementationOnce(async () => { throw new Error('no such door'); });

    await expect(
      runCustomMsgbaseCommand({} as any, session, MailFunction.READ, 1, 'R'),
    ).rejects.toThrow('no such door');
    expect(session.customMsgParam1).toBeUndefined();
  });

  it('launches nothing, and says so, for an ordinary conference', async () => {
    const ran = await runCustomMsgbaseCommand({} as any, aSession(), MailFunction.READ, 1, 'R');
    expect(ran).toBe(false);
    expect(launches).toHaveLength(0);
  });
});

describe('the function numbers', () => {
  it('are express.e\'s own, gap included', () => {
    // axenums.e:27. There is no 5; inventing one would put this port half a
    // step out from every door written for a real AmiExpress.
    expect([
      MailFunction.READ, MailFunction.CREATE, MailFunction.SCAN,
      MailFunction.STATS, MailFunction.SYSOP_COMMENT, MailFunction.ZOOM,
    ]).toEqual([1, 2, 3, 4, 6, 7]);
  });
});
