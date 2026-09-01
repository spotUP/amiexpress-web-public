/**
 * A registration with nothing behind it must not occupy the command name.
 *
 * On 30 August a Doors/ wipe left 277 registrations across the Commands tree
 * pointing at files that no longer exist. Every one of them answered - with
 * an error - instead of falling through, and one of them was `G`: 5D-LogOff
 * is registered under the internal goodbye command's name, so with the door
 * gone, logging off was impossible. `BR`, `BV`, `BADD` and `BROADCAST` are
 * the same shape.
 *
 * The dead registration has to be dropped where the command CACHE is built,
 * not where the doors MENU is built. Dispatch reads commandCache
 * (command-execution.handler.ts:390), and so does the internal-command router
 * (command-handler/internal-commands.ts:127, which hands any name present in
 * commandCache.bbscmd straight to the door) - filtering only the `doors`
 * registry would clean up the menu and leave the shadowing in place.
 *
 * This is a deliberate divergence from express.e, which resolves the .info
 * (configFileExists, express.e:4632) and then tries to LoadSeg whatever
 * LOCATION names. A real board's registrations do not go stale behind the
 * sysop's back; this one's did.
 *
 * The rule is deliberately conservative: a MISSING FILE inside an existing
 * door directory stays registered, because that is what a TypeScript door
 * replacing an Amiga binary looks like (Doors/bbslink/bbslink does not exist
 * on disk and 24 commands point at it). Only a registration whose directory
 * is gone too is treated as dead.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('dead registrations do not enter the command cache', () => {
  let baseDir: string;
  let bbsCmdDir: string;
  let sysCmdDir: string;
  let warn: jest.SpyInstance;

  function writeInfo(dir: string, name: string, lines: string[]): void {
    fs.writeFileSync(path.join(dir, `${name}.info`), lines.join('\n') + '\n', 'latin1');
  }

  function doorFile(relative: string): void {
    const full = path.join(baseDir, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, 'binary');
  }

  function load() {
    // require, not import: loadCommands and commandCache must be the same
    // module instance, which is how the server itself reaches them.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('../../src/handlers/command-execution.handler');
    mod.commandCache.bbscmd.clear();
    mod.commandCache.syscmd.clear();
    mod.loadCommands(baseDir, undefined, 0);
    return mod.commandCache;
  }

  beforeEach(() => {
    jest.resetModules();
    baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dead-reg-'));
    bbsCmdDir = path.join(baseDir, 'Commands', 'BBSCmd');
    sysCmdDir = path.join(baseDir, 'Commands', 'SysCmd');
    fs.mkdirSync(bbsCmdDir, { recursive: true });
    fs.mkdirSync(sysCmdDir, { recursive: true });
    fs.mkdirSync(path.join(baseDir, 'Doors'), { recursive: true });
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
    fs.rmSync(baseDir, { recursive: true, force: true });
    jest.resetModules();
  });

  it('drops G when the 5D-LogOff directory is gone, so the internal goodbye is reachable again', () => {
    writeInfo(bbsCmdDir, 'G', ['TYPE=XIM', 'LOCATION=Doors:5D-LogOff/5d!logoff', 'ACCESS=0']);

    const cache = load();

    expect(cache.bbscmd.has('G')).toBe(false);
  });

  it('says which registration it dropped and where it pointed', () => {
    writeInfo(bbsCmdDir, 'BR', ['TYPE=XIM', 'LOCATION=Doors:BroadCast/BroadCast', 'ACCESS=0']);

    load();

    const messages = warn.mock.calls.map(args => args.join(' '));
    const line = messages.find(m => m.includes('BR'));
    expect(line).toBeDefined();
    expect(line).toContain('Doors/BroadCast/BroadCast');
  });

  it('keeps a door whose Amiga binary is missing but whose directory is there (a TypeScript door replacing it)', () => {
    // 24 live commands on this board point at Doors/bbslink/bbslink, which
    // has never existed: the TypeScript door in that directory is what runs.
    // Requiring the exact file would unregister all of them.
    fs.mkdirSync(path.join(baseDir, 'Doors', 'bbslink'), { recursive: true });
    fs.writeFileSync(path.join(baseDir, 'Doors', 'bbslink', 'index.ts'), 'export {}');
    writeInfo(bbsCmdDir, 'BBSC', ['TYPE=XIM', 'LOCATION=Doors:bbslink/bbslink', 'ACCESS=0']);

    const cache = load();

    expect(cache.bbscmd.has('BBSC')).toBe(true);
  });

  it('keeps a door whose LOCATION is on disk', () => {
    doorFile('Doors/AquaScan/AquaScan.020');
    writeInfo(bbsCmdDir, 'AQ', ['TYPE=XIM', 'LOCATION=Doors:AquaScan/AquaScan.020', 'ACCESS=0']);

    const cache = load();

    expect(cache.bbscmd.has('AQ')).toBe(true);
  });

  it('keeps an INTERNAL alias, which never reaches disk (express.e:4732)', () => {
    // express.e handles INTERNAL before it reads LOCATION at all, so the
    // location of an internal alias means nothing.
    writeInfo(bbsCmdDir, 'BYE', [
      'TYPE=XIM',
      'LOCATION=Doors:NoSuchDoor/nothing',
      'INTERNAL=G',
      'ACCESS=0',
    ]);

    const cache = load();

    expect(cache.bbscmd.has('BYE')).toBe(true);
  });

  it('keeps an MCI command, which is its MCI_TEXT and not a file (express.e:4295)', () => {
    writeInfo(bbsCmdDir, 'HI', [
      'TYPE=MCI',
      'LOCATION=Doors:NoSuchDoor/nothing',
      'MCI_TEXT=Hello',
      'ACCESS=0',
    ]);

    const cache = load();

    expect(cache.bbscmd.has('HI')).toBe(true);
  });

  it('drops a dead SysCmd hook too - PWFAIL fires on every failed password', () => {
    writeInfo(sysCmdDir, 'PWFAIL', ['TYPE=XIM', 'LOCATION=Doors:AquaPWFail/AquaPWFail', 'ACCESS=0']);

    const cache = load();

    expect(cache.syscmd.has('PWFAIL')).toBe(false);
  });

  it('answers FAILURE for the dead command, so dispatch falls through to the internal one', async () => {
    // The user-visible end of it: runBbsCommand is what the command prompt
    // calls, and only a FAILURE there lets processCommand reach the internal
    // goodbye. A live door in the same board proves the failure is the dead
    // LOCATION and not a broken fixture - it must reach executeDoor.
    doorFile('Doors/AquaScan/AquaScan.020');
    writeInfo(bbsCmdDir, 'AQ', ['TYPE=XIM', 'LOCATION=Doors:AquaScan/AquaScan.020', 'ACCESS=0']);
    writeInfo(bbsCmdDir, 'G', ['TYPE=XIM', 'LOCATION=Doors:5D-LogOff/5d!logoff', 'ACCESS=0']);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('../../src/handlers/command-execution.handler');
    const executeDoor = jest.fn().mockResolvedValue(undefined);
    mod.setCommandExecutionDependencies(executeDoor, jest.fn());
    mod.commandCache.bbscmd.clear();
    mod.loadCommands(baseDir, undefined, 0);

    const socket = { emit: jest.fn() };
    const session = { user: { secLevel: 255 }, tempData: {} };

    expect(await mod.runBbsCommand(socket, session, 'AQ', '')).toBe(0);   // RESULT_SUCCESS
    expect(executeDoor).toHaveBeenCalledTimes(1);

    expect(await mod.runBbsCommand(socket, session, 'G', '')).toBe(-1);   // RESULT_FAILURE
    expect(executeDoor).toHaveBeenCalledTimes(1);                          // G never ran
  });

  it('lets a live global registration through when a dead conference one shadows it', () => {
    // Precedence is first-one-wins across the search paths (conference, then
    // node, then global). A dead conference-level .info used to win and then
    // fail; the global door behind it must now be found instead.
    const confCmdDir = path.join(baseDir, 'Conf1', 'Commands', 'BBSCmd');
    fs.mkdirSync(confCmdDir, { recursive: true });
    writeInfo(confCmdDir, 'FS', ['TYPE=XIM', 'LOCATION=Doors:GoneDoor/gone', 'ACCESS=0']);
    doorFile('Doors/FileScan/FileScan');
    writeInfo(bbsCmdDir, 'FS', ['TYPE=XIM', 'LOCATION=Doors:FileScan/FileScan', 'ACCESS=0']);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('../../src/handlers/command-execution.handler');
    mod.commandCache.bbscmd.clear();
    mod.loadCommands(baseDir, 1, 0);

    const found = mod.commandCache.bbscmd.get('FS');
    expect(found).toBeTruthy();
    expect(found.location).toBe('Doors/FileScan/FileScan');
  });
});
