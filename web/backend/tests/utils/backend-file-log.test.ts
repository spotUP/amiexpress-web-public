/**
 * Two logging failures found on the live board 2026-09-08:
 *
 *  1. logs/filehandle-debug.log had reached 8.1 GB - 10% of the disk - because
 *     FileHandle wrote a debug line on every memory read with no flag and no
 *     ceiling. It must be off unless switched on.
 *
 *  2. logs/backend.log had not been written since 22 April. The container runs
 *     `exec npx tsx src/index.ts`, so console output goes to docker's stdout
 *     and dies with the container - and the admin's log viewer reads that file.
 *     A caller's failing upload was investigated twice with no evidence left.
 */

process.env.SKIP_DB_INIT = 'true';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  installBackendFileLog,
  __resetBackendFileLogForTests,
} from '../../src/utils/backend-file-log.util';

describe('backend file log - console output survives a container restart', () => {
  let dir: string;
  let originalLog: typeof console.log;
  let originalError: typeof console.error;
  let originalWarn: typeof console.warn;
  let originalInfo: typeof console.info;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backendlog-'));
    originalLog = console.log;
    originalError = console.error;
    originalWarn = console.warn;
    originalInfo = console.info;
    __resetBackendFileLogForTests();
  });

  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
    console.info = originalInfo;
    __resetBackendFileLogForTests();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  });

  const logFile = () => path.join(dir, 'logs', 'backend.log');

  it('writes console output to logs/backend.log', () => {
    installBackendFileLog(dir);
    console.log('hello from the board');

    expect(fs.readFileSync(logFile(), 'utf8')).toContain('hello from the board');
  });

  it('still prints to stdout - docker logs must not lose a line', () => {
    const seen: unknown[][] = [];
    console.log = (...a: unknown[]) => { seen.push(a); };
    installBackendFileLog(dir);
    console.log('tee me');

    expect(seen.some(a => a.join(' ').includes('tee me'))).toBe(true);
  });

  it('captures warn and error too, with their level', () => {
    installBackendFileLog(dir);
    console.warn('a warning');
    console.error('a failure');

    const body = fs.readFileSync(logFile(), 'utf8');
    expect(body).toMatch(/\[WARN\].*a warning/);
    expect(body).toMatch(/\[ERROR\].*a failure/);
  });

  it('rotates instead of growing without limit (the 8.1 GB lesson)', () => {
    installBackendFileLog(dir);
    // Push past the 32 MB cap. The size check is sampled every ~1 MB written,
    // so this must exceed both.
    const chunk = 'x'.repeat(64 * 1024);
    for (let i = 0; i < 600; i++) console.log(chunk);

    expect(fs.existsSync(`${logFile()}.1`)).toBe(true);
    expect(fs.statSync(logFile()).size).toBeLessThan(64 * 1024 * 1024);
  });

  it('never throws when the log directory cannot be written', () => {
    // A path that cannot be created: install must give up quietly and leave
    // console working, not take the board down at boot.
    expect(() => installBackendFileLog('/proc/nonexistent-cannot-mkdir')).not.toThrow();
    expect(() => console.log('still fine')).not.toThrow();
  });

  it('is idempotent - installing twice does not double-write', () => {
    installBackendFileLog(dir);
    installBackendFileLog(dir);
    console.log('once only');

    const hits = fs.readFileSync(logFile(), 'utf8').split('once only').length - 1;
    expect(hits).toBe(1);
  });
});

describe('FileHandle debug log is off unless switched on', () => {
  const flag = 'FILEHANDLE_DEBUG';
  const original = process.env[flag];

  afterEach(() => {
    if (original === undefined) delete process.env[flag];
    else process.env[flag] = original;
  });

  it('does not write a debug log when the flag is unset', () => {
    delete process.env[flag];
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fhoff-'));
    process.env.BBS_DATA_DIR = dataDir;

    jest.isolateModules(() => {
      require('../../src/amiga-emulation/api/FileHandle');
    });

    // Merely loading the module must not create the file, and nothing should
    // append to it while the flag is off.
    expect(fs.existsSync(path.join(dataDir, 'logs', 'filehandle-debug.log'))).toBe(false);
  });

  it('the source has no ungated appendFileSync to the debug path left', () => {
    // The defect was 13 direct writes with no flag between them and the disk.
    const src = fs.readFileSync(
      path.join(__dirname, '..', '..', 'src', 'amiga-emulation', 'api', 'FileHandle.ts'),
      'utf8',
    );
    expect(src).toContain("FILEHANDLE_DEBUG === '1'");
    expect(src).not.toMatch(/fs\.appendFileSync\(DEBUG_LOG_PATH/);
  });
});
