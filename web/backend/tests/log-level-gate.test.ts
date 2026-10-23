import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  resolveLogLevel,
  installLogLevelGate,
  __resetLogLevelGateForTests,
} from '../src/utils/log-level.util';
import {
  installBackendFileLog,
  __resetBackendFileLogForTests,
} from '../src/utils/backend-file-log.util';

describe('resolveLogLevel', () => {
  it('defaults to debug in development and info otherwise', () => {
    expect(resolveLogLevel({ NODE_ENV: 'development' })).toBe('debug');
    expect(resolveLogLevel({ NODE_ENV: 'production' })).toBe('info');
    expect(resolveLogLevel({})).toBe('info');
  });

  it('LOG_LEVEL wins over NODE_ENV, case-insensitively, and accepts "warning"', () => {
    expect(resolveLogLevel({ NODE_ENV: 'development', LOG_LEVEL: 'INFO' })).toBe('info');
    expect(resolveLogLevel({ NODE_ENV: 'production', LOG_LEVEL: 'debug' })).toBe('debug');
    expect(resolveLogLevel({ LOG_LEVEL: 'warning' })).toBe('warn');
    expect(resolveLogLevel({ LOG_LEVEL: 'error' })).toBe('error');
    expect(resolveLogLevel({ NODE_ENV: 'development', LOG_LEVEL: 'bogus' })).toBe('debug');
  });
});

// Reachability: the same two calls, in the same order, as index.ts makes
// (the gate via the install-log-gate import, then installBackendFileLog).
// The content of backend.log is the sentinel that the gate ran.
describe('LOG_LEVEL gate + backend.log tee', () => {
  const saved = { ...console };
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'log-gate-'));
    __resetLogLevelGateForTests();
    __resetBackendFileLogForTests();
    // Fresh stand-ins: tests/quiet-console.ts already replaced the real ones.
    console.log = () => {};
    console.info = () => {};
    console.debug = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  afterEach(() => {
    Object.assign(console, saved);
    __resetLogLevelGateForTests();
    __resetBackendFileLogForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const run = (level: string): string => {
    installLogLevelGate({ LOG_LEVEL: level });
    installBackendFileLog(dir);
    console.log('chatty-x');
    console.info('operational-y');
    console.warn('warning-z');
    return fs.readFileSync(path.join(dir, 'logs', 'backend.log'), 'utf8');
  };

  it('info: console.log never reaches backend.log, info and warn do', () => {
    const text = run('info');
    expect(text).not.toContain('chatty-x');
    expect(text).toContain('operational-y');
    expect(text).toContain('warning-z');
  });

  it('debug: everything reaches backend.log', () => {
    const text = run('debug');
    expect(text).toContain('chatty-x');
    expect(text).toContain('operational-y');
  });
});
