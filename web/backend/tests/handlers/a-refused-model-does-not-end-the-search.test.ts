/**
 * "i havent managed to reach an ai it has failed 4 times now" - the sysop, on
 * his own board, 2026-09-13. The log said why, and it was not the models:
 *
 *   Discovered 20 free models (19 with tools)
 *   Trying OpenRouter (inclusionai/ling-3.0-flash-vl:free) ... 429 (470ms)
 *   Trying next OpenRouter model...
 *   Trying OpenRouter (nex-agi/nex-n2.5-mini:free) ... 400
 *   No provider answered - saying so
 *
 * Two of nineteen, then it gave up. The attempt cap was a COUNT standing in
 * for a time budget - and a refusal is cheap, those 429s came back in under
 * half a second with seconds of budget left. Nothing recorded the failures
 * either, so the same two models were first choice again on the next message.
 */
process.env.SKIP_DB_INIT = '1';
jest.mock('axios');

import axios from 'axios';
import {
  getGrumpySysopResponse, modelCostMs, resetModelCosts,
} from '../../src/handlers/grumpy-sysop-bot.handler';

const mocked = axios as jest.Mocked<typeof axios>;

const context = {
  userHandle: 'Caller', userId: 'u1', nodeId: 1, conferenceName: 'General',
  timeOnline: 60, messageHistory: [] as { role: 'user' | 'assistant'; content: string }[],
};

beforeEach(() => {
  mocked.get.mockReset();
  mocked.post.mockReset();
  resetModelCosts();
});

// The handler probes an unmeasured model in the background after a message
// (probeAnUnmeasuredModel, fire and forget). With the environment torn down
// the moment the test returns, that lands as "import after the Jest
// environment has been torn down" - and jest charges it to whichever suite is
// unlucky, not to this one. Let it settle inside the test.
afterEach(async () => { resetModelCosts(); await new Promise((r) => setTimeout(r, 60)); });


it('walks past two of them, and remembers every refusal', async () => {
  const ids = Array.from({ length: 10 }, (_, i) => `vendor/model-${i}:free`);
  mocked.get.mockResolvedValue({ data: { data: ids.map((id) => ({
    id, name: id, pricing: { prompt: '0', completion: '0' },
    supported_parameters: ['tools'], context_length: 8000,
  })) } } as any);

  // Every model refuses the way the live pool did: an instant 429.
  const attempted: string[] = [];
  mocked.post.mockImplementation(async (_url: string, body: any) => {
    attempted.push(body?.model);
    throw Object.assign(new Error('Request failed with status code 429'), {
      response: { status: 429, data: { error: { message: 'rate-limited upstream' } } },
    });
  });

  await getGrumpySysopResponse('who is online?', context as any, {
    provider: 'openrouter', modelName: '', temperature: 0.9, systemPrompt: '',
    openRouterApiKey: 'sk-or-v1-test',
  } as any);

  // Two was the cap that had the sysop watching four failures in a row.
  expect(attempted.length).toBeGreaterThan(2);
  expect(new Set(attempted).size).toBeGreaterThan(2);

  // And every refusal is worn, so the next message starts somewhere else.
  for (const id of new Set(attempted)) {
    expect(modelCostMs(id)).toBeGreaterThan(30000);
  }
});
