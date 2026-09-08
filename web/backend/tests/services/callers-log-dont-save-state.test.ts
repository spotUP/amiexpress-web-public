/**
 * P3-2: SYS_DONT_SAVE_STATE (ACP.e:3091-3093 NO_SAVESTATE tooltype;
 * axSetupTool/helpText.e:265 "Do not save the last callers, uploads,
 * downloads information."). Real AmiExpress gates a separate process's
 * (ACP.e) acp.dat cache with this - this port has no such cache, so the
 * toggle instead suppresses the three categories the tooltype names when
 * CallersLogManager would otherwise write them: callers (logLogin), uploads
 * (logFileUpload) and downloads (logFileDownload). Everything else it logs
 * (commands, doors, logoff) must be unaffected, matching express.e's own
 * CallersLog write, which this toggle never gated.
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
  const prevBbsRoot = process.env.BBS_ROOT;

  beforeEach(() => {
    bbsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dont-save-state-'));
    process.env.BBS_ROOT = bbsRoot;
    mgr = new CallersLogManager();

    const original = config.get.bind(config);
    spy = jest
      .spyOn(config, 'get')
      .mockImplementation((key: string) => (key === 'dataDir' ? bbsRoot : original(key as never)));
  });

  afterEach(() => {
    spy.mockRestore();
    process.env.BBS_ROOT = prevBbsRoot;
    fs.rmSync(bbsRoot, { recursive: true, force: true });
  });

  function readLog(): string {
    const p = path.join(bbsRoot, 'Node0', 'CallersLog');
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  }

  describe('SYS_DONT_SAVE_STATE unset (default: do save)', () => {
    it('logs the caller, an upload and a download', () => {
      mgr.logLogin(0, 'alice', 1, 'Somewhere');
      mgr.logFileUpload(0, 'FILE.ZIP', 'Utils');
      mgr.logFileDownload(0, 'OTHER.LHA');

      const log = readLog();
      expect(log).toContain('alice');
      expect(log).toContain('Upload: FILE.ZIP to Utils');
      expect(log).toContain('Download: OTHER.LHA');
    });
  });

  describe('SYS_DONT_SAVE_STATE set (NO_SAVESTATE present)', () => {
    beforeEach(() => {
      fs.writeFileSync(path.join(bbsRoot, 'bbsConfig.info.txt'), 'NO_SAVESTATE\n');
    });

    it('suppresses the caller entry but keeps the session divider', () => {
      mgr.logLogin(0, 'alice', 1, 'Somewhere');

      const log = readLog();
      expect(log).not.toContain('alice');
      // The divider (ByteKillHandler session boundary) carries no identity
      // and is not part of "callers, uploads, downloads" - it still writes.
      expect(log).toContain('*'.repeat(10));
    });

    it('suppresses upload history', () => {
      mgr.logFileUpload(0, 'FILE.ZIP', 'Utils');
      expect(readLog()).not.toContain('FILE.ZIP');
    });

    it('suppresses download history', () => {
      mgr.logFileDownload(0, 'OTHER.LHA');
      expect(readLog()).not.toContain('OTHER.LHA');
    });

    it('does not suppress unrelated log categories (commands, doors, logoff)', () => {
      mgr.logCommand(0, 'WHO');
      mgr.logDoor(0, 'LORD');
      mgr.logLogoff(0, 'alice', 'N');

      const log = readLog();
      expect(log).toContain('Command: WHO');
      expect(log).toContain('Door: LORD');
      expect(log).toContain('alice Off Normally');
    });
  });
});
