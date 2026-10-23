import fs from 'fs';
import os from 'os';
import path from 'path';

// DoorLogger is a 68K trace: it writes a file only under DEBUG_68K.
describe('DoorLogger', () => {
  const load = (debug68k: string | undefined, logDir: string) => {
    const savedDebug = process.env.DEBUG_68K;
    const savedDir = process.env.XIM_LOG_DIR;
    if (debug68k === undefined) delete process.env.DEBUG_68K;
    else process.env.DEBUG_68K = debug68k;
    process.env.XIM_LOG_DIR = logDir;
    try {
      let logger: any;
      jest.isolateModules(() => {
        const { DoorLogger } = require('../src/amiga-emulation/DoorLogger');
        logger = new DoorLogger('GATEDOOR', 1);
        logger.xim('TX', 1, 'payload');
      });
      return logger;
    } finally {
      if (savedDebug === undefined) delete process.env.DEBUG_68K;
      else process.env.DEBUG_68K = savedDebug;
      if (savedDir === undefined) delete process.env.XIM_LOG_DIR;
      else process.env.XIM_LOG_DIR = savedDir;
    }
  };

  it('writes no file and creates no directory when DEBUG_68K is off', () => {
    const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'doorlog-')), 'logs');
    const logger = load(undefined, dir);
    expect(fs.existsSync(logger.getLogPath())).toBe(false);
    expect(fs.existsSync(dir)).toBe(false);
  });

  it('writes the session log when DEBUG_68K=1 (the gate is the only difference)', () => {
    const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'doorlog-')), 'logs');
    const logger = load('1', dir);
    expect(fs.readFileSync(logger.getLogPath(), 'utf8')).toContain('TX cmd=1 payload');
  });
});
