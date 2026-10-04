/**
 * GLCUpdater posts a node's last call to the Global Last Callers server.
 *
 * The sysop asked whether the logoff batch reports to the global server. Its
 * batch line ran, but nothing was ever sent: the earlier port parsed a
 * `name|location|...` CallersLog format no board writes, so every line came
 * back null. src/utils/glc-updater.ts is now a 1:1 port of GLCUpdater.e.
 *
 * Fixtures (tests/fixtures/glc/):
 *  - CallersLog.express - two calls in express.e's own CallersLog format:
 *    the call line of displayUserToCallersLog (express.e:16041), conference
 *    joins (express.e:5081-5090), logUDFile (express.e:9478-9484), the
 *    transfer summaries (express.e:18857, 20266), the upload move
 *    (express.e:16220) and logoffLog (express.e:9468).
 *  - CallersLog.live - the last two calls of the live board's
 *    Node1/CallersLog on 2026-10-04, the IP lines dropped and the sysop's
 *    name replaced; `regress` is the test account.
 *
 * The network is never touched: `net` is mocked so every connect throws,
 * except in the batch test, where it returns a socket that records what was
 * written and answers `200`; that test's server host cannot resolve either.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import type * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { EventEmitter } from 'events';
import { config } from '../src/config';
import { buildGLCRequest, findCallStart, parseCalls, readGLCSettings } from '../src/utils/glc-updater';

/** Every connect the port makes goes here; outside the batch test it refuses. */
let mockConnect: (opts: { host?: string; port?: number }) => unknown = () => {
  throw new Error('glc-updater.test: no network');
};
jest.mock('net', () => ({
  ...jest.requireActual('net'),
  createConnection: (opts: { host?: string; port?: number }) => mockConnect(opts),
}));

const FIXTURES = path.join(__dirname, 'fixtures', 'glc');
const expressLog = fs.readFileSync(path.join(FIXTURES, 'CallersLog.express'));
const liveLog = fs.readFileSync(path.join(FIXTURES, 'CallersLog.live'));
const logoffMode = { ignoreLocal: true, ignoreSysop: true, ignoreSysopUser: false, processAll: false };

/** The exact body GLCUpdater.e:321-328 sends for the regress call. */
const REGRESS_BODY = '{"Id": 0,"Username": "regress","location": "Test Account","Bbsname": "Test BBS"'
  + ',"Dateon": "04-10-26","TimeOn": "17:37","TimeOff": "17:41","Actions": "-UD-------"'
  + ',"Upload": 12,"Download": 53,"topcps": 6035,"stealth": false'
  + ',"uploadfiles": ["DEMO.LHA"],"downloadfiles": ["MUSIC.LHA"]'
  + ',"confnums": [2],"confuploads": [12]}\r\n';

describe('the CallersLog parser (GLCUpdater.e:553-762)', () => {
  test('a logoff run reads only the last call in the log, with its times, transfers and conferences', () => {
    const start = findCallStart(expressLog, false);
    expect(start).not.toBeNull();
    const calls = parseCalls(expressLog, start!, logoffMode);
    expect(calls).toEqual([{
      userName: 'regress', location: 'Test Account', userNum: 7,
      dateOn: '04-10-26', timeOn: '17:37', timeOff: '17:41', actions: '-UD-------',
      uploads: 12, downloads: 53, topcps: 6035,
      confNums: [1, 2], confUploads: [0, 12],
      upFiles: ['DEMO.LHA'], downFiles: ['MUSIC.LHA'],
      skip: false,
    }]);
  });

  test('PROCESSALL reads every call, and IGNORESYSOP skips the SYSOP_LOCAL one', () => {
    const calls = parseCalls(expressLog, findCallStart(expressLog, true)!, { ...logoffMode, processAll: true });
    expect(calls.map(c => [c.userName, c.timeOff, c.skip])).toEqual([
      ['CALLER2', '16:58', true],
      ['regress', '17:41', false],
    ]);
  });

  test("the live board's call lines carry no CONNECT/SYSOP_LOCAL/F2_LOCAL, so no call is found", () => {
    // Until 2026-10-04 CallersLogManager.logLogin wrote `DD-Mon-YY HH:MM [n]
    // name (LOCAL) loc`, not express.e:16041's `MM-DD-YY (HH:MM:SS) [n] name
    // (CONNECT ..) loc`; that history stays on the live board, and is not a
    // call (tests/services/callers-log-is-express-format.test.ts: the board's
    // logon line now is one).
    expect(findCallStart(liveLog, false)).toBeNull();
  });
});

describe('the request (GLCUpdater.e:198-349)', () => {
  test('is the original raw HTTP/1.0 POST: tzname query, `Host:` without a space, CRLF body counted', () => {
    const [call] = parseCalls(expressLog, findCallStart(expressLog, false)!, logoffMode);
    const request = buildGLCRequest(call, 'Test BBS', false, {
      serverHost: 'scenewall.bbs.io', serverPort: 1541, timeout: 10, retries: 5, timeZone: 'GMT Standard Time',
    });
    expect(request).toBe(
      'POST /GlobalLastCallers/api/GlobalLastCallers?tzname=GMT+Standard+Time HTTP/1.0\r\n'
      + 'Host:scenewall.bbs.io\r\nContent-Type: application/json\r\n'
      + `Content-Length: ${REGRESS_BODY.length}\r\n\r\n${REGRESS_BODY}`,
    );
    expect(() => JSON.parse(REGRESS_BODY)).not.toThrow();
  });
});

describe('reachability: a logoff batch line runs GLCUpdater', () => {
  test('runBatchFile -> executeLine -> runGLCUpdater posts the last call, captured, never sent', async () => {
    const board = config.getConfig().dataDir;
    const nodeDir = path.join(board, 'Node1');
    fs.mkdirSync(nodeDir, { recursive: true });
    const logPath = path.join(nodeDir, 'CallersLog');
    const cfgPath = path.join(board, 'GLCViewer.cfg');
    const saved = [logPath, cfgPath].map(p => (fs.existsSync(p) ? fs.readFileSync(p) : null));
    fs.writeFileSync(logPath, expressLog);
    // The current directory's GLCViewer.cfg (GLCUpdater.e:539); `.invalid` never resolves.
    fs.writeFileSync(cfgPath, 'SERVERHOST=glc.test.invalid\nSERVERPORT=1541\nTIMEZONE=GMT Standard Time\n');
    const batchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glc-batch-'));
    const batch = path.join(batchDir, 'batch1');
    fs.writeFileSync(batch, 'doors:glc/glcupdater "Test BBS" BBS:Node1/CallersLog IGNORESYSOP IGNORELOCAL\n');

    const connects: Array<{ host?: string; port?: number }> = [];
    const written: string[] = [];
    mockConnect = (opts) => {
      connects.push(opts);
      const sock = new EventEmitter() as unknown as net.Socket;
      Object.assign(sock, {
        setTimeout: () => sock,
        destroy: () => sock,
        write: (data: Buffer) => {
          written.push(data.toString('latin1'));
          setImmediate(() => { sock.emit('data', Buffer.from('HTTP/1.1 200 OK\r\n\r\n')); sock.emit('close'); });
          return true;
        },
      });
      setImmediate(() => sock.emit('connect'));
      return sock;
    };

    try {
      const { runBatchFile } = await import('../src/services/batch-scheduler');
      await runBatchFile(batch, 1);
    } finally {
      mockConnect = () => { throw new Error('glc-updater.test: no network'); };
      [logPath, cfgPath].forEach((p, i) => (saved[i] ? fs.writeFileSync(p, saved[i]!) : fs.rmSync(p, { force: true })));
      fs.rmSync(batchDir, { recursive: true, force: true });
    }

    expect(connects).toEqual([{ host: 'glc.test.invalid', port: 1541 }]);
    expect(written).toEqual([
      'POST /GlobalLastCallers/api/GlobalLastCallers?tzname=GMT+Standard+Time HTTP/1.0\r\n'
      + 'Host:glc.test.invalid\r\nContent-Type: application/json\r\n'
      + `Content-Length: ${REGRESS_BODY.length}\r\n\r\n${REGRESS_BODY}`,
    ]);
  });
});

describe('GLCViewer.cfg (GLCUpdater.e:395-419, 538-544)', () => {
  test('the current directory file wins over PROGDIR, and an absent key keeps the default', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'glc-cfg-'));
    try {
      fs.writeFileSync(path.join(dir, 'prog.cfg'), ';server\nSERVERHOST=a.example\nTIMEOUT=5\n');
      fs.writeFileSync(path.join(dir, 'cwd.cfg'), ' serverhost = b.example \n');
      expect(readGLCSettings([path.join(dir, 'prog.cfg'), path.join(dir, 'cwd.cfg')])).toEqual({
        serverHost: 'b.example', serverPort: 1541, timeout: 5, retries: 5, timeZone: '',
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
