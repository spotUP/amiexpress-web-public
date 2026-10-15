/**
 * P3-2: SYS_DONT_SAVE_STATE (ACP.e:3091-3093 NO_SAVESTATE tooltype;
 * axSetupTool/helpText.e:265 "Do not save the last callers, uploads,
 * downloads information."). Real AmiExpress gates a separate process's
 * (ACP.e) acp.dat cache with this - this port has no such cache, so the
 * toggle instead suppresses the logon line (logLogin), the "last callers"
 * entry the tooltype names. Every other line (detail lines, logoff) must be
 * unaffected, matching express.e's own CallersLog write, which this toggle
 * never gated.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

process.env.SKIP_DB_INIT = '1';

import { CallersLogManager } from '../../src/services/CallersLogManager';
import { config } from '../../src/config';

describe('CallersLogManager honours SYS_DONT_SAVE_STATE', () => {
  let bbsRoot: string;
  let spy: jest.SpyInstance;
  let mgr: CallersLogManager;

  beforeEach(() => {
    bbsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dont-save-state-'));
    const original = config.get.bind(config);
    spy = jest
      .spyOn(config, 'get')
      .mockImplementation((key: string) => (key === 'dataDir' ? bbsRoot : original(key as never)));
    mgr = new CallersLogManager();
  });

  afterEach(() => {
    spy.mockRestore();
    fs.rmSync(bbsRoot, { recursive: true, force: true });
  });

  function readLog(): string {
    const p = path.join(bbsRoot, 'Node0', 'CallersLog');
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  }

  const alice = { slotNumber: 1, name: 'alice', connectString: 'CONNECT 19200', location: 'Somewhere', isNew: false };

  describe('SYS_DONT_SAVE_STATE unset (default: do save)', () => {
    it('logs the caller', () => {
      mgr.logLogin(0, alice);
      expect(readLog()).toMatch(/\[1\] alice \(CONNECT 19200\) Somewhere\n$/);
    });
  });

  describe('SYS_DONT_SAVE_STATE set (NO_SAVESTATE present)', () => {
    beforeEach(() => {
      fs.writeFileSync(path.join(bbsRoot, 'bbsConfig.info.txt'), 'NO_SAVESTATE\n');
    });

    it('suppresses the caller entry but keeps the session divider', () => {
      mgr.logLogin(0, alice);

      const log = readLog();
      expect(log).not.toContain('alice');
      // The divider (ByteKillHandler session boundary) carries no identity
      // and is not part of "callers, uploads, downloads" - it still writes.
      expect(log).toContain('*'.repeat(10));
    });

    it('does not suppress the other lines (detail lines, logoff)', () => {
      mgr.logActivity(0, '\tAccount editing.\n');
      mgr.logLogoff(0, 'alice', 'N');

      const log = readLog();
      expect(log).toContain('\tAccount editing.\n\n');
      expect(log).toContain('alice Off Normally');
    });
  });
});
