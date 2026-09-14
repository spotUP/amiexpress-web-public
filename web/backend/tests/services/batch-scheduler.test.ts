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

// Source-level pin, in the style of menu.test.ts's call-site guard: a spawn
// test would need the real emulator. tsx resolves tsconfig by walking up
// from cwd; from a door's own directory it finds the repo root's config
// (no experimentalDecorators) and the runner dies on chat.handler.ts on
// every scheduler tick. The TS-runner branch must therefore spawn from
// web/backend. Dev-only in practice - the container ships dist/ and takes
// the node branch - which is exactly why only this pin ever notices.
describe('runAmigaDoorViaRunner spawn cwd (regression for the [runner:mtop] crash-loop)', () => {
  test('the tsx runner branch is pinned to web/backend as cwd', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../src/services/batch-scheduler.ts'),
      'utf8'
    );
    expect(src).toContain(
      "cwd: useTsRunner ? path.join(appRootPath, 'web', 'backend') : (cwd || path.dirname(doorPath))"
    );
  });
});
