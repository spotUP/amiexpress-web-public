/**
 * The guard that stands between the test suite and the sysop's mail.
 *
 * Each case here aims a real `fs` call at the real live board and asserts it
 * is refused. If any of them ever goes green by writing instead of throwing,
 * the suite has regained the ability that destroyed Conf1 message 318.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { REPO_ROOT, isProtectedLivePath } from '../live-data-guard';

/**
 * A name nothing on the board uses, inside the directory that was actually
 * damaged. Aimed at the live tree on purpose - a guard proven against a
 * stand-in proves nothing.
 */
const LIVE_TARGET = path.join(REPO_ROOT, 'Conf1', 'MsgBase', '.live-data-guard-probe');

describe('live board write guard', () => {
  let temp: string;

  beforeEach(() => {
    temp = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-test-'));
  });

  afterEach(() => {
    fs.rmSync(temp, { recursive: true, force: true });
    // Never silently tolerate a leak: if the guard failed, say so here too.
    expect(fs.existsSync(LIVE_TARGET)).toBe(false);
  });

  describe('refuses writes aimed at live board data', () => {
    it('refuses writeFileSync into Conf1/MsgBase', () => {
      expect(() => fs.writeFileSync(LIVE_TARGET, 'Test body text\n')).toThrow(
        /live-data-guard.*refused/s,
      );
    });

    it('refuses appendFileSync into Conf1/MsgBase', () => {
      expect(() => fs.appendFileSync(LIVE_TARGET, 'x')).toThrow(/live-data-guard/);
    });

    it('refuses appending to the live HeaderFile', () => {
      const header = path.join(REPO_ROOT, 'Conf1', 'MsgBase', 'HeaderFile');
      expect(() => fs.appendFileSync(header, Buffer.alloc(110))).toThrow(/live-data-guard/);
    });

    it('refuses openSync for writing, and allows it for reading', () => {
      const header = path.join(REPO_ROOT, 'Conf1', 'MsgBase', 'HeaderFile');
      expect(() => fs.openSync(header, 'a')).toThrow(/live-data-guard/);
      const fd = fs.openSync(header, 'r');
      fs.closeSync(fd);
    });

    it('refuses unlinkSync and rmSync on live board data', () => {
      const header = path.join(REPO_ROOT, 'Conf1', 'MsgBase', 'HeaderFile');
      expect(() => fs.unlinkSync(header)).toThrow(/live-data-guard/);
      expect(() => fs.rmSync(path.join(REPO_ROOT, 'Conf1'), { recursive: true })).toThrow(
        /live-data-guard/,
      );
    });

    it('refuses a rename whose DESTINATION is live board data', () => {
      const src = path.join(temp, 'payload');
      fs.writeFileSync(src, 'x');
      expect(() => fs.renameSync(src, LIVE_TARGET)).toThrow(/live-data-guard/);
    });

    it('refuses a copyFileSync whose destination is live board data', () => {
      const src = path.join(temp, 'payload');
      fs.writeFileSync(src, 'x');
      expect(() => fs.copyFileSync(src, LIVE_TARGET)).toThrow(/live-data-guard/);
    });

    it('refuses mkdirSync of a new conference directory', () => {
      expect(() => fs.mkdirSync(path.join(REPO_ROOT, 'Conf1', 'MsgBase', 'sub'))).toThrow(
        /live-data-guard/,
      );
    });

    it('refuses createWriteStream at live board data', () => {
      expect(() => fs.createWriteStream(LIVE_TARGET)).toThrow(/live-data-guard/);
    });

    it('rejects the promise for fs.promises.writeFile', async () => {
      await expect(fs.promises.writeFile(LIVE_TARGET, 'x')).rejects.toThrow(/live-data-guard/);
    });

    it('rejects the promise for the fs/promises module object', async () => {
      // Same object as fs.promises in Node >= 16; asserted so the equivalence
      // this guard depends on is not left to belief.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fsp = require('fs/promises');
      expect(fsp).toBe(fs.promises);
      await expect(fsp.writeFile(LIVE_TARGET, 'x')).rejects.toThrow(/live-data-guard/);
    });

    it('refuses writes to every protected top-level board directory', () => {
      for (const rel of [
        'Conf1/MsgBase/probe',
        'Conf12/MsgBase/probe',
        'Node1/CallersLog',
        'Access/probe',
        'Bulletins/probe.txt',
        'Screens/probe.txt',
        'Doors/probe',
        'AmiXnet/probe',
        'Commands/probe',
        'Storage/probe',
        'user.data',
        'Conf.DB',
      ]) {
        expect(() => fs.writeFileSync(path.join(REPO_ROOT, rel), 'x')).toThrow(
          /live-data-guard/,
        );
      }
    });
  });

  describe('leaves everything else alone', () => {
    it('allows writes under a temp directory', () => {
      const f = path.join(temp, 'Conf1', 'MsgBase', '1');
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, 'a real message');
      expect(fs.readFileSync(f, 'utf8')).toBe('a real message');
    });

    it('allows READS of the live tree - bulletin-reflow-drive needs them', () => {
      const header = path.join(REPO_ROOT, 'Conf1', 'MsgBase', 'HeaderFile');
      expect(fs.readFileSync(header).length).toBeGreaterThan(0);
      expect(fs.readdirSync(path.join(REPO_ROOT, 'Bulletins')).length).toBeGreaterThan(0);
    });

    it('allows writes elsewhere in the checkout, e.g. a scratch fixture', () => {
      const f = path.join(REPO_ROOT, 'web', 'backend', 'tests', '.guard-scratch');
      fs.writeFileSync(f, 'x');
      fs.unlinkSync(f);
    });

    it('allows copying OUT of the board - that is a read, not a write', () => {
      // seed-shares-node-screens copies Node0.info out of the checkout into a
      // temp board. Guarding the SOURCE of a copy would break it for nothing.
      const dest = path.join(temp, 'Node0.info');
      fs.copyFileSync(path.join(REPO_ROOT, 'Node0.info'), dest);
      expect(fs.statSync(dest).size).toBeGreaterThan(0);
    });

    it('treats a Conf1 nested inside a fixture path as a fixture, not the board', () => {
      expect(
        isProtectedLivePath(path.join(REPO_ROOT, 'web/backend/tests/fixtures/Conf1/MsgBase/1')),
      ).toBe(false);
    });
  });

  describe('classification', () => {
    it.each([
      ['Conf1/MsgBase/1', true],
      ['Conf14/MsgBase/HeaderFile', true],
      ['Node24/CallersLog', true],
      ['user.data', true],
      ['Conf.DB', true],
      ['Confidential/notes', false],
      ['Nodes/readme', false],
      ['web/backend/src/config.ts', false],
      ['package.json', false],
    ])('%s -> protected=%s', (rel, expected) => {
      expect(isProtectedLivePath(path.join(REPO_ROOT, rel as string))).toBe(expected);
    });

    it('never claims a path outside this checkout', () => {
      expect(isProtectedLivePath('/tmp/whatever/Conf1/MsgBase/1')).toBe(false);
      expect(isProtectedLivePath(os.tmpdir())).toBe(false);
    });
  });

  describe('environment pinning', () => {
    it('points BBS_ROOT and BBS_DATA_DIR away from the live board', () => {
      for (const key of ['BBS_ROOT', 'BBS_DATA_DIR'] as const) {
        const value = process.env[key];
        expect(value).toBeTruthy();
        expect(isProtectedLivePath(path.join(value as string, 'Conf1'))).toBe(false);
      }
    });

    it('config.get(dataDir) does not resolve to the live checkout root', () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { config } = require('../../src/config');
      expect(path.resolve(config.get('dataDir'))).not.toBe(REPO_ROOT);
    });

    it('messageIndexManager does not resolve its MsgBase to the live board', () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { messageIndexManager } = require('../../src/services/MessageIndexManager');
      const root = (messageIndexManager as { bbsRoot: string }).bbsRoot;
      expect(isProtectedLivePath(path.join(root, 'Conf1'))).toBe(false);
    });
  });
});
