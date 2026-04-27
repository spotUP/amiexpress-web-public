// @ts-nocheck
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
