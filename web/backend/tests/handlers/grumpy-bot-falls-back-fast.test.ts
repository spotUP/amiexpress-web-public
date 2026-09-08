/**
 * When the AI cannot answer, the co-sysop says so NOW.
 *
 * Sysop, live, 2026-09-07: "if the ai openrouter bot fails grumpy sysop
 * should take over directly there is a long delay now". Two causes, both
 * measured in the handler: with no key the bot still spent up to five
 * seconds asking openrouter.ai for a model list it could never use, and
 * with a key that fails it walked EVERY discovered free model at ten
 * seconds each. Now the key is checked first, the whole cascade shares one
 * deadline, and a message tries at most two models.
 */
process.env.SKIP_DB_INIT = '1';
jest.mock('axios');

import axios from 'axios';
import { getGrumpySysopResponse, DEFAULT_AI_BUDGET_MS } from '../../src/handlers/grumpy-sysop-bot.handler';
import type { AIProviderConfig } from '../../src/handlers/grumpy-sysop-bot.handler';

const mocked = axios as jest.Mocked<typeof axios>;

const context = {
  userHandle: 'Caller', userId: 'u1', nodeId: 1, conferenceName: 'General',
  timeOnline: 60, messageHistory: [] as { role: 'user' | 'assistant'; content: string }[],
};

const base: AIProviderConfig = {
  provider: 'openrouter', modelName: '', temperature: 0.9, systemPrompt: '',
};

beforeEach(() => {
  mocked.get.mockReset();
  mocked.post.mockReset();
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.GROQ_API_KEY;
  delete process.env.GEMINI_API_KEY;
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** With the rule-based bot gone (2026-09-08), no provider means one honest line. */
const NO_PROVIDER = /ask me again in a minute/;

it('with no API key anywhere, no request leaves the box and the answer is immediate', async () => {
  const t0 = Date.now();
  const reply = await getGrumpySysopResponse('hello', context as any, { ...base });

  expect(reply).toMatch(NO_PROVIDER);
  expect(mocked.get).not.toHaveBeenCalled();
  expect(mocked.post).not.toHaveBeenCalled();
  expect(Date.now() - t0).toBeLessThan(200);
});

it('a key that every model refuses is given two tries, not the whole model list', async () => {
  mocked.get.mockResolvedValue({
    data: { data: Array.from({ length: 12 }, (_, i) => ({ id: `free-${i}`, pricing: { prompt: '0', completion: '0' } })) },
  } as any);
  mocked.post.mockRejectedValue(Object.assign(new Error('Request failed with status code 402'), { response: { status: 402, data: {} } }));

  const reply = await getGrumpySysopResponse('hello', context as any, { ...base, openRouterApiKey: 'sk-or-v1-test' });

  expect(reply).toMatch(NO_PROVIDER);
  expect(mocked.post.mock.calls.length).toBeLessThanOrEqual(2);
});

it('a provider that hangs is cut off at the cascade budget, and the caller is told at once', async () => {
  mocked.get.mockResolvedValue({ data: { data: [{ id: 'free-0', pricing: { prompt: '0', completion: '0' } }] } } as any);
  // A call that only ends when axios's own timeout fires: honour the
  // timeout the handler asked for, as the real client would.
  mocked.post.mockImplementation((_url: string, _body: unknown, cfg?: { timeout?: number }) =>
    sleep(cfg?.timeout ?? 60000).then(() => { throw new Error(`timeout of ${cfg?.timeout}ms exceeded`); })
  );

  const t0 = Date.now();
  const reply = await getGrumpySysopResponse('hello', context as any, {
    ...base, openRouterApiKey: 'sk-or-v1-test', groqApiKey: 'gsk-test', budgetMs: 600,
  });

  expect(reply).toMatch(NO_PROVIDER);
  expect(Date.now() - t0).toBeLessThan(1500);
  expect(DEFAULT_AI_BUDGET_MS).toBe(8000);
});
