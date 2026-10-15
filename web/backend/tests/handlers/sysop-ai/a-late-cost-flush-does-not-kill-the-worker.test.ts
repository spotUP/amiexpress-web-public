/**
 * A cost flush that arrives after teardown must not take the process down.
 *
 * `rememberCosts()` debounces the write behind an unref'd two-second timer.
 * Under jest that timer can fire after the module registry has been torn
 * down: `costFilePath()` does a lazy `require('../../config')`, `config` comes
 * back undefined, and `config.get('dataDir')` throws - from a TIMER CALLBACK,
 * which no test is awaiting. That kills the worker, and jest reports "Test
 * suite failed to run" against whatever unrelated suite happened to be running
 * at the time.
 *
 * That is what made the backend run fail seven suites one time and none the
 * next, on files with nothing to do with the bot:
 *
 *     ● Test suite failed to run
 *       TypeError: Cannot read properties of undefined (reading 'get')
 *         at costFilePath (src/handlers/sysop-ai/model-cost-store.ts:91)
 *         at saveModelCosts (src/handlers/sysop-ai/model-cost-store.ts:115)
 *         at Timeout._onTimeout (src/handlers/grumpy-sysop-bot.handler.ts:283)
 *
 * It was read as machine load for most of a day. It is not: it is one line
 * sitting outside the try that was written to tolerate exactly this.
 *
 * `saveModelCosts` already documents the contract - "a board that cannot write
 * its cache still answers callers; it just relearns the timings after the next
 * restart". The guard simply did not cover the line that threw.
 */
process.env.SKIP_DB_INIT = '1';

import { saveModelCosts } from '../../../src/handlers/sysop-ai/model-cost-store';

describe('saving the model cost cache', () => {
  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  it('does not throw when the config module has gone away', () => {
    // What teardown leaves behind: `require('../../config')` resolves to a
    // module with no `config` on it.
    jest.doMock('../../../src/config', () => ({}), { virtual: false });
    jest.resetModules();
    const { saveModelCosts: save } = require('../../../src/handlers/sysop-ai/model-cost-store');

    expect(() => save(new Map([['m', { ewmaMs: 12 }]]))).not.toThrow();
  });

  it('does not throw when the config throws on access', () => {
    // The other shape of a torn-down registry: the getter itself blows up.
    jest.doMock('../../../src/config', () => ({
      config: { get: () => { throw new Error('registry torn down'); } },
    }));
    jest.resetModules();
    const { saveModelCosts: save } = require('../../../src/handlers/sysop-ai/model-cost-store');

    expect(() => save(new Map([['m', { ewmaMs: 12 }]]))).not.toThrow();
  });

  it('still writes the cache when the board is healthy', () => {
    // The guard must not have turned the feature off.
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cost-store-'));
    jest.doMock('../../../src/config', () => ({ config: { get: () => dir } }));
    jest.resetModules();
    const { saveModelCosts: save, loadModelCosts: load } =
      require('../../../src/handlers/sysop-ai/model-cost-store');

    save(new Map([['some-model', { ewmaMs: 1234 }]]));

    expect(fs.existsSync(path.join(dir, 'db', 'ai-model-costs.json'))).toBe(true);
    expect(load().get('some-model')?.ewmaMs).toBe(1234);
  });

  it('is importable without a config at all', () => {
    // Proves the module itself does not reach for config at import time -
    // the reason costFilePath requires it lazily in the first place.
    expect(typeof saveModelCosts).toBe('function');
  });
});
