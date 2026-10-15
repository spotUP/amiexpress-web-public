// @ts-nocheck
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { config } from '../../src/config';
import { clearExecuteOnCache, runExecuteOn } from '../../src/services/batch-scheduler';

describe('clearExecuteOnCache', () => {
  test('runs without error', () => {
    expect(() => clearExecuteOnCache()).not.toThrow();
  });

  test('can be called multiple times without error', () => {
    clearExecuteOnCache();
    clearExecuteOnCache();
    clearExecuteOnCache();
  });
});

describe('runExecuteOn — no bbsConfig.info in test env', () => {
  beforeEach(() => {
    clearExecuteOnCache();
  });

  test('LOGON event completes without error when no config', async () => {
    await expect(runExecuteOn('LOGON', 1)).resolves.not.toThrow();
  });

  test('LOGOFF event completes without error when no config', async () => {
    await expect(runExecuteOn('LOGOFF', 1)).resolves.not.toThrow();
  });

  test('NEW_USER event completes without error when no config', async () => {
    await expect(runExecuteOn('NEW_USER', 1)).resolves.not.toThrow();
  });

  test('UPLOAD event completes without error when no config', async () => {
    await expect(runExecuteOn('UPLOAD', 1)).resolves.not.toThrow();
  });

  test('accepts context object without throwing', async () => {
    await expect(
      runExecuteOn('LOGON', 2, {
        username: 'TestUser',
        location: 'The Internet',
        confName: 'General',
        confNum: 1,
      })
    ).resolves.not.toThrow();
  });

  test('node ID 0 does not throw', async () => {
    await expect(runExecuteOn('STATUS_CHANGE', 0)).resolves.not.toThrow();
  });
});

// tsx resolves tsconfig by walking up from cwd; from a door's own directory
// it finds the repo root's config (no experimentalDecorators) and the runner
// dies on chat.handler.ts on every scheduler tick. The TS-runner branch must
// therefore spawn from web/backend. Dev-only in practice - the container
// ships dist/ and takes the node branch.
//
// DRIVEN: a real batch file with an NTR-LASTCALLERS line goes through
// runBatchFile, child_process.spawn is replaced by a recorder that closes at
// once (no emulator runs), and the test reads the cwd the runner got. The
// compiled runner is hidden so the TS branch is taken whatever is built.
describe('runAmigaDoorViaRunner spawn cwd (regression for the [runner:mtop] crash-loop)', () => {
  test('the tsx runner branch is pinned to web/backend as cwd', async () => {
    const { EventEmitter } = require('events');
    const childProcess = require('child_process');

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-cwd-'));
    const savedRoot = process.env.BBS_ROOT;
    process.env.BBS_ROOT = root;
    const batch = path.join(root, 'batch1');
    fs.writeFileSync(batch, 'doors:ntr-lastcallers/ntr-lastcallers 1\n');

    const spawns: Array<{ command: string; args: string[]; cwd: string }> = [];
    const realFs = require('fs'); // the module object itself, not this file's import wrapper
    const realExists = realFs.existsSync;
    const spies = [
      jest.spyOn(childProcess, 'spawn').mockImplementation((command: string, args: string[], opts: any) => {
        const child: any = new EventEmitter();
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        child.stdin = { end() {} };
        child.pid = 0;
        child.kill = () => true;
        spawns.push({ command, args, cwd: opts.cwd });
        setImmediate(() => child.emit('close', 0));
        return child;
      }),
      jest.spyOn(realFs, 'existsSync').mockImplementation((p: any) =>
        String(p).endsWith(path.join('dist', 'scripts', 'run-amiga-door.js')) ? false : realExists(p)),
      jest.spyOn(console, 'log').mockImplementation(() => {}),
      jest.spyOn(console, 'warn').mockImplementation(() => {}),
    ];
    // batch-scheduler binds fs when it loads, so it is loaded fresh behind
    // the existsSync stub.
    let runBatchFile: (p: string, n: number) => Promise<void>;
    jest.isolateModules(() => {
      ({ runBatchFile } = require('../../src/services/batch-scheduler'));
      // No drop files written into a real node directory.
      const { doorDropFileManager } = require('../../src/services/DoorDropFileManager');
      spies.push(
        jest.spyOn(doorDropFileManager, 'createDoorSys').mockImplementation(() => undefined),
        jest.spyOn(doorDropFileManager, 'createDorInfo').mockImplementation(() => undefined),
      );
    });
    try {
      await runBatchFile(batch, 1);
    } finally {
      for (const s of spies) s.mockRestore();
      if (savedRoot === undefined) delete process.env.BBS_ROOT; else process.env.BBS_ROOT = savedRoot;
      fs.rmSync(root, { recursive: true, force: true });
    }

    const runner = spawns.find((s) => s.args.some((a) => a.endsWith('run-amiga-door.ts')));
    expect(runner).toBeDefined();
    expect(runner!.args[0]).toBe('tsx');
    expect(path.resolve(runner!.cwd)).toBe(path.resolve(__dirname, '../..'));
  });
});
