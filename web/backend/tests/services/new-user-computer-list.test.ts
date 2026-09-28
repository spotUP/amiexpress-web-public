/**
 * A caller signing up is offered the machines the sysop configured.
 *
 * The new-user prompt read computer_types from the database. The admin's page,
 * and express.e, read ComputerList.info. A board whose file held ten machines
 * had two rows in the table - the two the sysop had added through the admin,
 * which inserts a row as well as writing the file - so the signup prompt
 * offered exactly those two:
 *
 *   1> Commodore 64    2> Commodore 128
 *
 * while the same board's admin page listed all ten. Reported 2026-09-01.
 *
 * The service the admin uses reads the file and falls back to the table; the
 * prompt uses that same service now, so there is one answer to the question.
 *
 * The service is tested directly, and both of its callers - the signup
 * prompt (new-user.handler) and W options 8 and 9 (info-commands.handler) -
 * are driven for real against a board whose files list more than its table.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('the computer types a new user is offered', () => {
  let bbsRoot: string;
  let previousDataDir: string | undefined;

  beforeEach(() => {
    previousDataDir = process.env.BBS_DATA_DIR;
    bbsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-computers-'));
    process.env.BBS_DATA_DIR = bbsRoot;
    jest.resetModules();
  });

  afterEach(() => {
    if (previousDataDir === undefined) delete process.env.BBS_DATA_DIR;
    else process.env.BBS_DATA_DIR = previousDataDir;
    fs.rmSync(bbsRoot, { recursive: true, force: true });
  });

  /** One of the board's .info files, holding exactly these tooltypes. */
  function writeInfo(name: string, pairs: Array<[string, string]>): void {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { writeInfoFile, parseInfoFile } = require('../../src/utils/info-file.util');
    const target = path.join(bbsRoot, name);
    fs.copyFileSync(path.join(__dirname, '../../../..', name), target);
    const parsed = parseInfoFile(target);
    parsed.tooltypes = pairs.map(([key, value]) => ({
      key, value, commented: false, prefix: '', originalLine: `${key}=${value}`,
    }));
    writeInfoFile(parsed);
  }

  /** A ComputerList.info with the tooltypes AmiExpress writes. */
  function writeComputerList(names: string[]): void {
    writeInfo('ComputerList.info', [
      ...names.map((n, i): [string, string] => [`COMPUTER.${i + 1}`, n]),
      ['COMPUTER.NUM', String(names.length)],
    ]);
  }

  it('offers every machine in ComputerList.info, not only the ones with a database row', async () => {
    const all = ['AMiGA 500', 'AMiGA 1200', 'PC', 'Commodore 64', 'Commodore 128'];
    writeComputerList(all);

    // A repository holding only the two most recently added, which is the
    // state that produced the report.
    const database: any = {
      getConfigRepository: () => ({
        getAllComputerTypes: () => [
          { id: 1, computer_number: 4, computer_name: 'Commodore 64', enabled: true },
          { id: 2, computer_number: 5, computer_name: 'Commodore 128', enabled: true },
        ],
      }),
    };

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ComputerConfigService } = require('../../src/services/config-services/computer-config.service');
    const records = await new ComputerConfigService(database).getAllComputerTypes();

    expect(records.map((c: { computer_name: string }) => c.computer_name)).toEqual(all);
  });

  it('falls back to the database when the board has no ComputerList.info', async () => {
    const database: any = {
      getConfigRepository: () => ({
        getAllComputerTypes: () => [
          { id: 1, computer_number: 1, computer_name: 'Commodore 64', enabled: true },
        ],
      }),
    };

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ComputerConfigService } = require('../../src/services/config-services/computer-config.service');
    const records = await new ComputerConfigService(database).getAllComputerTypes();

    expect(records.map((c: { computer_name: string }) => c.computer_name)).toEqual(['Commodore 64']);
  });

  /*
   * The two callers, driven. Each is loaded fresh (the resetModules above) so
   * the new-user choice cache starts empty, and each is handed a database
   * whose table holds only the two recently added machines: a caller that
   * asked the repository instead of the service would offer those two.
   */
  const ALL = ['AMiGA 500', 'AMiGA 1200', 'PC', 'Commodore 64', 'Commodore 128'];
  const twoRowDatabase = (): any => ({
    getConfigRepository: () => ({
      getAllComputerTypes: () => [
        { id: 1, computer_number: 4, computer_name: 'Commodore 64', enabled: true },
        { id: 2, computer_number: 5, computer_name: 'Commodore 128', enabled: true },
      ],
      getAllScreenTypes: () => [
        { id: 1, screen_number: 1, screen_type: 'PETSCII', screen_title: 'Commodore PETSCII', enabled: true },
        { id: 2, screen_number: 2, screen_type: 'WEB', screen_title: 'Web', enabled: true },
      ],
    }),
    updateUser: async () => undefined,
  });
  const socket = (): any => ({ id: 'nu', emit: () => true, on() { return this; } });

  it('the signup prompt asks the service, not the repository', async () => {
    writeComputerList(ALL);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const newUser = require('../../src/handlers/user/new-user.handler');
    newUser.setNewUserDependencies({ db: twoRowDatabase(), sessions: new Map() });
    const session: any = { nodeId: 1, tempData: {}, newUserData: {}, screenWidth: 80, screenHeight: 24 };

    // Lines answered: the computer prompt is next.
    await newUser.handleLinesInput(socket(), session, '24');

    expect(session.newUserData.computerChoices).toEqual(ALL);
  });

  it('the W command asks the services too, for both lists', async () => {
    // Same defect, same file: "Which to change" offered
    // "1> Commodore PETSCII  2> Web" on a board whose ScreenTypes.info and
    // admin page both list four.
    writeComputerList(ALL);
    const screens = [['ANSI', 'Amiga ANSI'], ['ASCII', 'Plain text'], ['PETSCII', 'Commodore PETSCII'], ['WEB', 'Web']];
    writeInfo('ScreenTypes.info', screens.flatMap(([type, title], i) => [[`TYPE.${i + 1}`, type], [`TITLE.${i + 1}`, title]]));

    const database = twoRowDatabase();
    jest.doMock('../../src/index', () => {
      const states = jest.requireActual('../../src/constants/bbs-states');
      return { BBSState: states.BBSState, LoggedOnSubState: states.LoggedOnSubState, BBSSession: {} };
    });
    jest.doMock('../../src/database', () => ({ db: database }));
    jest.doMock('../../src/handlers/command-handler/dependency-injection', () => ({ getDoors: () => [] }));
    jest.doMock('../../src/utils/acs.util', () => ({
      ...jest.requireActual('../../src/utils/acs.util'),
      checkSecurity: () => true,
    }));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { handleWOptionSelectInput } = require('../../src/handlers/commands/info-commands.handler');
    const session: any = { nodeId: 1, currentConf: 1, tempData: {}, user: { id: 'u8', username: 'SPOT', secLevel: 255 } };

    await handleWOptionSelectInput(socket(), session, '8');
    expect(session.tempData.computerChoices).toEqual(ALL);

    await handleWOptionSelectInput(socket(), session, '9');
    expect(session.tempData.screenTypeChoices).toEqual(screens.map(([, title]) => title));
  });
});
