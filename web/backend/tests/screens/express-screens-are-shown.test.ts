/**
 * The screens express.e shows, shown.
 *
 * Audited 2026-09-07 against AmiExpress-Sources/express.e: it calls
 * `displayScreen` for 32 screens; this port displayed 14 of them. The rest are
 * routed - the loader knows where each lives - and nothing ever asks for them,
 * so the files sit on the board and no caller ever sees one. The sysop hit it
 * on `U`: the upload screen he had just drawn never appeared.
 *
 * These tests drive the REAL command handlers over a temp board and read what
 * reached the socket, because "the resolver can find it" is not the same claim
 * as "a caller sees it" - that gap is the whole bug.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { config } from '../../src/config';

let root: string;
let previousDataDir: string;

function socket(emits: Array<{ event: string; data: any }>) {
  return {
    id: `screens-test-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    emit: (event: string, data: any) => emits.push({ event, data }),
    on: () => {},
  } as any;
}

const painted = (emits: Array<{ event: string; data: any }>) =>
  emits.filter(e => e.event === 'ansi-output').map(e => String(e.data)).join('');

function write(rel: string, body: string): void {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body, 'latin1');
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'express-screens-'));
  previousDataDir = config.get('dataDir');
  config.set('dataDir', root);
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), '');
  fs.mkdirSync(path.join(root, 'Conf1'), { recursive: true });
});

afterEach(() => {
  config.set('dataDir', previousDataDir);
  fs.rmSync(root, { recursive: true, force: true });
});

/**
 * A caller the board lets upload.
 *
 * `securityFlags` is express.e's own per-user override string (acs.util.ts:178,
 * express.e:8462-8465): 'T' at the flag's index grants it outright. The temp
 * board has no Access/ACS tables, so without this every command refuses on
 * permission and the screen under test is never reached - which is a different
 * failure wearing the same trousers.
 */
function grantAll(): string {
  return 'T'.repeat(64);
}

const session = (over: Record<string, unknown> = {}) => ({
  nodeId: 1,
  relConfNum: 1,
  currentConf: 1,
  user: { id: 1, username: 'lamer', secLevel: 100, name: 'lamer', securityFlags: grantAll() },
  ...over,
}) as any;

describe('the upload screens (express.e:18981-18987)', () => {
  it('shows UploadMsg when a caller starts an upload', async () => {
    write('Conf1/UploadMsg.txt', 'THE UPLOAD SCREEN\r\n');
    const { displayScreen } = require('../../src/handlers/screen.handler');

    const emits: Array<{ event: string; data: any }> = [];
    // The name the command handler must ask for. express.e's CASE
    // SCREEN_UPLOAD looks for `confScreenDir + 'UploadMsg'`.
    const shown = await displayScreen(socket(emits), session(), 'UPLOADMSG', true, true);

    expect(shown).toBe(true);
    expect(painted(emits)).toContain('THE UPLOAD SCREEN');
  });

  it('finds NoUploads, which is the screen that REFUSES an upload', async () => {
    // express.e:18981 - IF displayScreen(SCREEN_NOUPLOADS) THEN RETURN: the
    // screen existing is itself the refusal, so a conference closes uploads by
    // having the file at all.
    write('Conf1/NoUploads.txt', 'NO UPLOADS IN THIS CONFERENCE\r\n');
    const { displayScreen } = require('../../src/handlers/screen.handler');

    const emits: Array<{ event: string; data: any }> = [];
    const shown = await displayScreen(socket(emits), session(), 'NOUPLOADS', true, true);

    expect(shown).toBe(true);
    expect(painted(emits)).toContain('NO UPLOADS');
  });

  it('says nothing when the conference has no such screen', async () => {
    const { displayScreen } = require('../../src/handlers/screen.handler');
    const emits: Array<{ event: string; data: any }> = [];

    expect(await displayScreen(socket(emits), session(), 'UPLOADMSG', true, true)).toBe(false);
    expect(painted(emits)).toBe('');
  });
});

describe('the download screen (express.e:19966-19971)', () => {
  it('is asked for by the name the loader routes', async () => {
    // The handler asked for 'DOWNLOAD'; the routing table only knows
    // 'DOWNLOADMSG', so getScreenDirType answered null, the search list came
    // back empty and the screen could never be found however well it was drawn.
    write('Conf1/DownloadMsg.txt', 'THE DOWNLOAD SCREEN\r\n');
    const { displayScreen } = require('../../src/handlers/screen.handler');

    const emits: Array<{ event: string; data: any }> = [];
    const shown = await displayScreen(socket(emits), session(), 'DOWNLOADMSG', true, true);

    expect(shown).toBe(true);
    expect(painted(emits)).toContain('THE DOWNLOAD SCREEN');
  });

  it('is shown by the D command itself', async () => {
    // The reachability half: the real `D` handler has to ASK for the routed
    // name. It pauses after the screen (express.e doPause blocks for a key),
    // so the command is left waiting at that pause and the screen is read
    // off the wire before it.
    write('Conf1/DownloadMsg.txt', 'THE DOWNLOAD SCREEN\r\n');
    // D refuses a conference with no file areas before the screen
    // (express.e:19961 maxDirs=0); the icon declares one (NDIRS, 5006/15264).
    fs.writeFileSync(path.join(root, 'Conf1.info'), 'NDIRS=1\n');
    const { DownloadHandler } = require('../../src/handlers/file/download.handler');
    const emits: Array<{ event: string; data: any }> = [];

    void DownloadHandler.handleDownloadCommand(socket(emits), session(), '');
    for (let i = 0; i < 40 && !painted(emits).includes('THE DOWNLOAD SCREEN'); i++) {
      await new Promise(r => setTimeout(r, 10));
    }

    expect(painted(emits)).toContain('THE DOWNLOAD SCREEN');
  });
});

/**
 * The reachability half. Everything above proves the loader CAN find these
 * screens; this proves the `U` command actually asks for them - which is the
 * thing that was missing, and the thing a resolver test cannot see.
 */
describe('the U command itself (express.e:25646-25658 -> 18981-18987)', () => {
  function wire(): { emits: Array<{ event: string; data: any }>; interfaceShown: () => boolean } {
    const emits: Array<{ event: string; data: any }> = [];
    let shown = false;
    const { setUserCommandsDependencies } = require('../../src/handlers/commands/user-commands.handler');
    const { displayScreen } = require('../../src/handlers/screen.handler');
    setUserCommandsDependencies({
      conferences: [], messageBases: [], db: {} as never,
      joinConference: async () => undefined,
      checkConfAccess: () => true,
      displayScreen,
      displayUploadInterface: () => { shown = true; },
      displayDownloadInterface: () => undefined,
    });
    return { emits, interfaceShown: () => shown };
  }

  it('shows the conference UploadMsg before the upload interface', async () => {
    write('Conf1/UploadMsg.txt', 'SMASH SOME NEW WARES UP\r\n');
    const { handleUploadCommand } = require('../../src/handlers/commands/user-commands.handler');
    const w = wire();

    await handleUploadCommand(socket(w.emits), session());

    expect(painted(w.emits)).toContain('SMASH SOME NEW WARES UP');
    expect(w.interfaceShown()).toBe(true);
  });

  it('REFUSES the upload when the conference has a NoUploads screen', async () => {
    // The screen existing is the refusal (express.e:18981 RETURNs on it), so a
    // conference closes uploads by having the file - and the caller is told
    // why instead of being dropped at the menu with no explanation.
    write('Conf1/NoUploads.txt', 'NO UPLOADS HERE\r\n');
    write('Conf1/UploadMsg.txt', 'you should not see this\r\n');
    const { handleUploadCommand } = require('../../src/handlers/commands/user-commands.handler');
    const w = wire();

    await handleUploadCommand(socket(w.emits), session());

    expect(painted(w.emits)).toContain('NO UPLOADS HERE');
    expect(painted(w.emits)).not.toContain('you should not see this');
    expect(w.interfaceShown()).toBe(false);
  });

  it('goes straight to the interface on a board with neither screen', async () => {
    const { handleUploadCommand } = require('../../src/handlers/commands/user-commands.handler');
    const w = wire();

    await handleUploadCommand(socket(w.emits), session());

    expect(w.interfaceShown()).toBe(true);
  });
});

describe('the file-listing help screen (express.e:27646)', () => {
  it('is shown for a bare F, and not when the caller named a directory', async () => {
    write('Conf1/FileHelp.txt', 'HOW THE FILE LISTS WORK\r\n');
    write('Conf1/DIR1', 'DEMO.LHA      1024  01-01-26  a file\r\n');
    // The icon declares the one file area (express.e 5006/15264 read NDIRS).
    fs.writeFileSync(path.join(root, 'Conf1.info'), 'NDIRS=1\n');

    const { FileListingHandler } = require('../../src/handlers/file/file-listing.handler');

    const bare: Array<{ event: string; data: any }> = [];
    await FileListingHandler.handleFileList(socket(bare), session(), '');
    expect(painted(bare)).toContain('HOW THE FILE LISTS WORK');

    // express.e shows it only on the branch with NO parameters: a caller who
    // named a directory has already said what they want.
    const named: Array<{ event: string; data: any }> = [];
    await FileListingHandler.handleFileList(socket(named), session(), '1');
    expect(painted(named)).not.toContain('HOW THE FILE LISTS WORK');
  });
});

describe('the name-requirement screens (express.e:28169, 28199)', () => {
  // The gate reads the conference's tooltypes; a real conference icon is the
  // honest way to say "this one wants a real name", and it exercises the same
  // reader the board uses.
  it("shows the board's REALNAMES screen instead of the built-in sentence", async () => {
    write('Screens/RealNames.txt', 'THIS BOARD WANTS YOUR REAL NAME\r\n');
    const { applyTooltypes } = require('../../src/utils/info-file.util');
    applyTooltypes(path.join(root, 'Conf1.info'), [['REALNAME', '1']]);

    const { captureRealAndInternetNames } = require('../../src/handlers/message/message-entry.handler');
    const emits: Array<{ event: string; data: any }> = [];
    const s = session({ user: { id: 1, username: 'lamer', secLevel: 100, realName: '' } });

    const ready = captureRealAndInternetNames(socket(emits), s, () => undefined);
    expect(ready).toBe(false); // capture in progress, which is what express.e does
    await new Promise(r => setTimeout(r, 60));

    const out = painted(emits);
    expect(out).toContain('THIS BOARD WANTS YOUR REAL NAME');
    // express.e prints its own sentence ONLY when the screen is absent.
    expect(out).not.toContain('Real Names are required for messages');
    expect(out).toContain('Real Name (Alpha Numeric):');
  });
});
