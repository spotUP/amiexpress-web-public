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

  /** A ComputerList.info with the tooltypes AmiExpress writes. */
  function writeComputerList(names: string[]): void {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { writeInfoFile, parseInfoFile } = require('../../src/utils/info-file.util');
    const source = path.join(__dirname, '../../../../ComputerList.info');
    const target = path.join(bbsRoot, 'ComputerList.info');
    fs.copyFileSync(source, target);

    const parsed = parseInfoFile(target);
    parsed.tooltypes = [
      ...names.map((name, i) => ({
        key: `COMPUTER.${i + 1}`, value: name, commented: false, prefix: '',
        originalLine: `COMPUTER.${i + 1}=${name}`,
      })),
      {
        key: 'COMPUTER.NUM', value: String(names.length), commented: false, prefix: '',
        originalLine: `COMPUTER.NUM=${names.length}`,
      },
    ];
    writeInfoFile(parsed);
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

  it('the signup prompt asks the service, not the repository', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../src/handlers/user/new-user.handler.ts'), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

    expect(code).toContain('new ComputerConfigService(db).getAllComputerTypes()');
    expect(code).not.toMatch(/repo\.getAllComputerTypes\(\)/);
  });

  it('the W command asks the services too, for both lists', () => {
    // Same defect, same file: "Which to change" offered
    // "1> Commodore PETSCII  2> Web" on a board whose ScreenTypes.info and
    // admin page both list four.
    const source = fs.readFileSync(
      path.join(__dirname, '../../src/handlers/commands/info-commands.handler.ts'), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

    expect(code).toContain('new ComputerConfigService(db).getAllComputerTypes()');
    expect(code).toContain('new ScreenConfigService(db).getAllScreenTypes()');
    expect(code).not.toMatch(/repo\.getAllComputerTypes\(\)/);
    expect(code).not.toMatch(/repo\.getAllScreenTypes\(\)/);
  });
});
