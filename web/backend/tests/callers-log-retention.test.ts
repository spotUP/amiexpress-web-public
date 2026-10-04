/**
 * CallersLog retention: a caller's address and the password he typed are
 * gone after 90 days; every other byte of the log stays.
 *
 * Driven through the daily log retention job (LogRetentionService.runOnce),
 * the pass initialization.ts schedules, on a board of its own.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LogRetentionService } from '../src/services/LogRetentionService';
import { pruneCallersLog, runCallersLogRetention } from '../src/services/callers-log-retention';

const DIV = '**************************************************************';
const NOW = new Date(2026, 9, 4, 12, 0, 0); // 04-Oct-2026

// Each entry: the line and whether retention removes it.
const FIXTURE: Array<[string, boolean]> = [
  // A legacy block: the port's own per-line stamp dates each line.
  [DIV, false],
  ['10-Jan-26 09:12 [1] sysop (LOCAL) Unknown', false],
  ['10-Jan-26 09:12 \tTelnet login address: localhost (10.0.0.9)', true],
  ['10-Jan-26 09:13 \tPassword Failure (hunter2)', true],
  ['10-Jan-26 09:13 \tPassword Failure (xxxx)', false],
  // A block with no date of its own: dated by the next block (still old).
  [DIV, false],
  ['\tTelnet login address: nodate.example (198.51.100.1)', true],
  // An old express.e block (June): address and typed password go.
  [DIV, false],
  ['06-01-26 (21:04:11) [7] M\xF6ller (CONNECT 19200) K\xF6ln', false],
  ['\tTelnet login address: dsl.example.de (203.0.113.7)', true],
  ['\tPassword Failure (s3cr\xE9t)', true],
  ['\tPassword Failure (xxxx)', false],
  ['\t* Password Failure *', false],
  ['\tFTP Command >: PORT 203,0,113,7,4,1', true],
  ['\tFTP Command >: PASV', false],
  ['\tDownloading DEMO.LHA 54321 bytes \xA9 1993', false],
  ['06-02-26 (00:10:00) M\xF6ller Off Normally', false],
  // A recent block (inside 90 days): everything stays.
  [DIV, false],
  ['09-20-26 (10:00:00) NEW [12] newbie (CONNECT 19200) Oslo', false],
  ['\tTelnet login address: fiber.example (192.0.2.44)', false],
  ['\tPassword Failure (letmein)', false],
  ['09-20-26 (10:20:00) newbie Off Loss Carrier', false],
  // The last block, with no date after it: kept for want of one.
  [DIV, false],
  ['\tTelnet login address: open.example (192.0.2.99)', false],
];

function bytesOf(rows: Array<[string, boolean]>, keepRemoved: boolean, eol: string): Buffer {
  return Buffer.from(rows.filter(([, gone]) => keepRemoved || !gone).map(([l]) => l + eol).join(''), 'latin1');
}

describe('CallersLog retention', () => {
  let root: string;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'clog-ret-')); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  test('the daily job removes address and typed-password lines older than 90 days and leaves every other byte', async () => {
    fs.mkdirSync(path.join(root, 'Node1'));
    fs.mkdirSync(path.join(root, 'Node2'));
    const log = path.join(root, 'Node1', 'CallersLog');
    const backup = path.join(root, 'Node2', 'CLogBackup');
    fs.writeFileSync(log, bytesOf(FIXTURE, true, '\n'));
    fs.writeFileSync(backup, bytesOf(FIXTURE, true, '\r\n'));
    const ino = fs.statSync(log).ino;

    const svc = new LogRetentionService();
    svc.configure({ filePaths: [], callersLog: { dataDir: root, maxAgeDays: 90 } });
    // runOnce dates by today; pin "today" through the pass the job runs.
    jest.useFakeTimers({ now: NOW, doNotFake: ['setImmediate', 'nextTick'] });
    try {
      await svc.runOnce();
    } finally {
      jest.useRealTimers();
    }

    expect(fs.readFileSync(log).equals(bytesOf(FIXTURE, false, '\n'))).toBe(true);
    expect(fs.readFileSync(backup).equals(bytesOf(FIXTURE, false, '\r\n'))).toBe(true);
    expect(fs.statSync(log).ino).toBe(ino);
    const r = svc.lastCallersLogReport.find(x => x.path === log)!;
    expect(r).toMatchObject({ address: 4, password: 2, undatedKept: 1 });
  });

  test('a dry run reports and writes nothing', () => {
    fs.mkdirSync(path.join(root, 'Node0'));
    const log = path.join(root, 'Node0', 'CallersLog');
    const before = bytesOf(FIXTURE, true, '\n');
    fs.writeFileSync(log, before);
    const [r] = runCallersLogRetention(root, { now: NOW, dryRun: true });
    expect(r).toMatchObject({ address: 4, password: 2 });
    expect(fs.readFileSync(log).equals(before)).toBe(true);
  });

  test('a log with nothing old comes back as the same buffer', () => {
    const recent = Buffer.from(`${DIV}\n09-30-26 (10:00:00) [1] a (CONNECT 19200) X\n\tTelnet login address: h (1.2.3.4)\n`, 'latin1');
    const out = pruneCallersLog(recent, NOW, 90);
    expect(out.changed).toBe(false);
    expect(out.bytes).toBe(recent);
  });
});
