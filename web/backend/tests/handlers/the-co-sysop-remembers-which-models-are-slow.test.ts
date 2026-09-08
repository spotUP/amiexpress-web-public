/**
 * "there is a long delay when the cosysop ai replies when i write in the
 * operator chat" - reported twice, and fixed twice, because the fix could not
 * survive a deploy.
 *
 * The picker learns which free model answers fastest by measuring it. That
 * memory was a Map and nothing else, and this board deployed twenty-eight
 * times on the day it was written: every deploy threw the measurements away,
 * and the picker went back to treating every untried model as fast. Measured
 * against the models OpenRouter offers this board for free (2026-09-08):
 * 0.99 s, 1.34 s - and 21.42 s for nemotron-3.5-lightning.
 *
 * The second half of the same delay: one round of the tool loop was handed
 * whatever was left of the 35-second budget, so a slow model could spend all
 * of it on its first answer and leave nothing for the round that reads the
 * tool's result.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { config } from '../../src/config';
import { loadModelCosts, saveModelCosts, costFilePath } from '../../src/handlers/sysop-ai/model-cost-store';
import { askWithTools } from '../../src/handlers/sysop-ai/loop';

let root: string;
let previousDataDir: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'model-cost-'));
  previousDataDir = config.get('dataDir');
  config.set('dataDir', root);
});

afterEach(() => {
  config.set('dataDir', previousDataDir);
  fs.rmSync(root, { recursive: true, force: true });
});

describe('what each model costs, across a restart', () => {
  it('is read back after the container is recreated', () => {
    saveModelCosts(new Map([
      ['nvidia/nemotron-3.5-lightning:free', { ewmaMs: 21422 }],
      ['inclusionai/ling-3.0-flash-sante:free', { ewmaMs: 989 }],
    ]));

    // A new process: nothing in memory, only what is on the volume.
    const costs = loadModelCosts();

    expect(costs.get('nvidia/nemotron-3.5-lightning:free')?.ewmaMs).toBe(21422);
    expect(costs.get('inclusionai/ling-3.0-flash-sante:free')?.ewmaMs).toBe(989);
  });

  it('keeps a failure timestamp, so a broken model stays at the back', () => {
    const failedAt = Date.now();
    saveModelCosts(new Map([['x/y:free', { ewmaMs: 4000, failedAt }]]));

    expect(loadModelCosts().get('x/y:free')?.failedAt).toBe(failedAt);
  });

  it('treats an unreadable cache as no cache, never as an error', () => {
    fs.mkdirSync(path.dirname(costFilePath()), { recursive: true });
    fs.writeFileSync(costFilePath(), 'not json {{{');

    expect(loadModelCosts().size).toBe(0);
  });

  it('ignores entries that are not measurements', () => {
    fs.mkdirSync(path.dirname(costFilePath()), { recursive: true });
    fs.writeFileSync(costFilePath(), JSON.stringify({ 'a/b:free': { ewmaMs: 'soon' }, 'c/d:free': { ewmaMs: 12 } }));

    const costs = loadModelCosts();
    expect(costs.has('a/b:free')).toBe(false);
    expect(costs.get('c/d:free')?.ewmaMs).toBe(12);
  });

  it('leaves the last measurements in place when the write fails', () => {
    saveModelCosts(new Map([['a/b:free', { ewmaMs: 1000 }]]));
    // The directory becomes a file: every write from here on fails.
    config.set('dataDir', path.join(root, 'db', 'ai-model-costs.json'));

    expect(() => saveModelCosts(new Map([['a/b:free', { ewmaMs: 2 }]]))).not.toThrow();

    config.set('dataDir', root);
    expect(loadModelCosts().get('a/b:free')?.ewmaMs).toBe(1000);
  });
});

describe('one round of the tool loop', () => {
  it('is capped, so a slow model cannot spend the whole budget', async () => {
    const timeouts: number[] = [];

    await askWithTools({
      model: 'slow/model:free',
      messages: [{ role: 'user', content: 'hello' }],
      tools: [],
      ctx: {} as never,
      // Half a minute left, as a tool reply really has.
      deadline: Date.now() + 35000,
      perRoundMs: 12000,
      post: async (_body, timeoutMs) => {
        timeouts.push(timeoutMs);
        return { choices: [{ message: { content: 'done' } }] };
      },
    });

    expect(timeouts).toHaveLength(1);
    // Red before the fix: the round was handed the whole 35 seconds.
    expect(timeouts[0]).toBeLessThanOrEqual(12000);
  });

  it('never asks for longer than the deadline actually allows', async () => {
    const timeouts: number[] = [];

    await askWithTools({
      model: 'slow/model:free',
      messages: [{ role: 'user', content: 'hello' }],
      tools: [],
      ctx: {} as never,
      deadline: Date.now() + 3000,
      perRoundMs: 12000,
      post: async (_body, timeoutMs) => {
        timeouts.push(timeoutMs);
        return { choices: [{ message: { content: 'done' } }] };
      },
    });

    expect(timeouts[0]).toBeLessThanOrEqual(3000);
  });
});
