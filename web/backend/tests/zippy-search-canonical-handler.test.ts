/**
 * Regression test for C-Z: Z (Zippy text search) uses the canonical handler.
 *
 * express.e:26123-26213 internalCommandZ requires three things:
 *   1. getDirSpan interactive prompt when the dir param is missing
 *      (express.e:26162-26168 — calls getDirSpan(parsedParams.item(1))
 *      or getDirSpan('') and the latter prompts the user).
 *   2. Per-directory "Scanning directory N" header before each DIR scan
 *      (express.e:26185, 26191).
 *   3. Context-buffered output: zippy() function in express.e:27529-27625
 *      buffers each multi-line file-description block and emits the WHOLE
 *      block when ANY line in it matches the search string
 *      (express.e:27574-27586 IF found THEN aePuts(currentEntry)).
 *
 * The canonical impl is content/zippy-search.handler.ts:ZippySearchHandler.
 * The legacy export in commands/utility-commands.handler.ts used to do a
 * flat DB query and skip all three properties. It is now a forwarder.
 *
 * Driven at runtime over a temp board with two DIR files: a caller types Z at
 * the real `processCommand`, answers the search prompt and the dir-span
 * prompt through the real `handleCommand`, and the wire is read. The legacy
 * forwarder is driven far enough to
 * show it lands in the canonical handler: a typo in any require path would
 * throw here instead of silently breaking Z at runtime.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { config } from '../src/config';
import { processCommand, handleCommand } from '../src/handlers/command.handler';
import { handleZippySearchCommand } from '../src/handlers/commands/utility-commands.handler';
import { BBSState, LoggedOnSubState } from '../src/index';
import { flushOutput } from '../src/utils/output.util';

let root: string;
let previousDataDir: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'zippy-'));
  previousDataDir = config.get('dataDir');
  config.set('dataDir', root);
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), '');
  const conf = path.join(root, 'Conf1');
  fs.mkdirSync(conf, { recursive: true });
  // Two entries in DIR1; the SECOND LINE of the first one is the match.
  fs.writeFileSync(path.join(conf, 'DIR1'), [
    'DEMO.LHA     P    12345 01-02-95 A demo by nobody',
    '                            featuring the WOMBAT effect',
    'OTHER.LHA    P      999 01-02-95 Nothing to see',
    '                            still nothing',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(conf, 'DIR2'), 'EMPTY.LHA    P        1 01-02-95 Unrelated\n');
  // The conference icon declares both directories (express.e 5006/15264).
  fs.writeFileSync(path.join(root, 'Conf1.info'), 'NDIRS=2\n');
});

afterEach(() => {
  config.set('dataDir', previousDataDir);
  fs.rmSync(root, { recursive: true, force: true });
});

let n = 0;
function aCaller() {
  const bytes: string[] = [];
  const socket = {
    id: `zippy-${++n}`,
    emit: (event: string, data: unknown) => {
      if (event === 'ansi-output' && typeof data === 'string') bytes.push(data);
      return true;
    },
    on: () => {}, off: () => {}, removeListener: () => {},
  } as any;
  const session: any = {
    state: BBSState.LOGGEDON,
    subState: LoggedOnSubState.PROCESS_COMMAND,
    connectionType: 'web',
    nodeId: 1,
    currentConf: 1,
    relConfNum: 1,
    inputBuffer: '',
    commandHistory: [],
    user: { id: 1, username: 'spot', name: 'spot', secLevel: 100, securityFlags: 'T'.repeat(64), expert: 'X' },
    tempData: {},
  };
  const wire = () => { flushOutput(socket); return bytes.join(''); };
  return { socket, session, wire };
}

async function type(socket: any, session: any, keys: string) {
  for (const key of keys) await handleCommand(socket, session, key);
}

describe('Z command uses canonical ZippySearchHandler (C-Z, express.e:26123-26213)', () => {
  test('Z asks for a string, then for a dir span, then scans each DIR and prints whole matching entries', async () => {
    const { socket, session, wire } = aCaller();

    await processCommand(socket, session, 'Z', '');
    expect(wire()).toContain('Enter string to search for: ');
    expect(session.subState).toBe(LoggedOnSubState.ZIPPY_SEARCH_INPUT);

    await type(socket, session, 'wombat\r');
    // getDirSpan's prompt (express.e:26165), and the input lands in handleDirSpanInput
    expect(session.subState).toBe(LoggedOnSubState.ZIPPY_DIR_SPAN_INPUT);

    await type(socket, session, 'A\r');
    const out = wire();

    // express.e:26185 / 26191 - one header per DIR
    expect(out).toContain('Scanning directory 1');
    expect(out).toContain('Scanning directory 2');
    // express.e:27574-27586 - the WHOLE entry, though only its second line matched
    expect(out).toContain('DEMO.LHA');
    expect(out).toContain('featuring the WOMBAT effect');
    expect(out).not.toContain('OTHER.LHA');
    expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
  });

  test('a search string on the command line still prompts for the dir span when none is given', async () => {
    const { socket, session } = aCaller();

    await processCommand(socket, session, 'Z', 'wombat');

    expect(session.subState).toBe(LoggedOnSubState.ZIPPY_DIR_SPAN_INPUT);
    expect(session.tempData.zippySearchString).toBe('WOMBAT');
  });

  test('the legacy utility-commands export forwards to the canonical handler', async () => {
    const { socket, session } = aCaller();

    await handleZippySearchCommand(socket, session, 'wombat');

    expect(session.subState).toBe(LoggedOnSubState.ZIPPY_DIR_SPAN_INPUT);
    expect(session.tempData.zippySearchString).toBe('WOMBAT');
  });
});
