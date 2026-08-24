// @ts-nocheck
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { config } from '../../src/config';
import { clearExecuteOnCache, runExecuteOn, runLoginBatches } from '../../src/services/batch-scheduler';

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

describe('runLoginBatches — per-node reentrancy guard', () => {
  // Regression test for a real incident: a fast reconnect to the same
  // node fired runLoginBatches() a second time while the first call
  // (fire-and-forget from login-post.service.ts, keyed only by nodeId)
  // was still in flight, spawning duplicate QuickNew emulator processes
  // on the same node - 5 accumulated within 20s live, ~2GB combined
  // RSS, contributing to two OOM kills. This test proves two concurrent
  // calls for the SAME node do not both run to completion independently
  // (one must observe the guard and skip), while two concurrent calls
  // for DIFFERENT nodes are unaffected by each other.
  // runLoginBatches() derives its search paths from process.cwd() AND
  // config.getConfig().dataDir. This dev checkout has REAL batch0-6/
  // batch000 files (both at the repo root and wherever dataDir points)
  // that reference real doors (e.g. mtop) - calling the real function
  // without isolating both would spawn real 68K door-emulator child
  // processes on every test run. An env-var override for BBS_DATA_DIR
  // does NOT work here: ConfigManager reads its config once and
  // config.getConfig() returns that cached object on every call, so a
  // beforeEach env change never takes effect - confirmed by watching a
  // real mtop process spawn under that approach before switching to
  // spying on getConfig() directly, which IS called fresh inside
  // runLoginBatches on every invocation. Point cwd and the mocked
  // dataDir at an empty scratch dir so runBatchFile finds nothing on
  // every candidate path and each call resolves immediately.
  let warnSpy;
  let scratchDir;
  let originalCwd;
  let getConfigSpy;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-guard-test-'));
    originalCwd = process.cwd();
    process.chdir(scratchDir);
    getConfigSpy = jest.spyOn(config, 'getConfig').mockReturnValue({
      ...config.getConfig(),
      dataDir: scratchDir,
    });
  });

  afterEach(() => {
    warnSpy.mockRestore();
    getConfigSpy.mockRestore();
    process.chdir(originalCwd);
    fs.rmSync(scratchDir, { recursive: true, force: true });
  });

  test('two concurrent calls for the same node: second one is skipped, not run twice', async () => {
    await Promise.all([runLoginBatches(42), runLoginBatches(42)]);

    const skippedDuplicate = warnSpy.mock.calls.some((call) =>
      String(call[0] || '').includes('Login batches already running for node 42')
    );
    expect(skippedDuplicate).toBe(true);
  });

  test('two concurrent calls for different nodes: neither is skipped', async () => {
    await Promise.all([runLoginBatches(43), runLoginBatches(44)]);

    const skippedAny = warnSpy.mock.calls.some((call) =>
      String(call[0] || '').includes('Login batches already running for node')
    );
    expect(skippedAny).toBe(false);
  });

  test('the guard releases after completion: a later call for the same node is not skipped', async () => {
    await runLoginBatches(45);
    warnSpy.mockClear();

    await runLoginBatches(45);

    const skipped = warnSpy.mock.calls.some((call) =>
      String(call[0] || '').includes('Login batches already running for node 45')
    );
    expect(skipped).toBe(false);
  });
});
