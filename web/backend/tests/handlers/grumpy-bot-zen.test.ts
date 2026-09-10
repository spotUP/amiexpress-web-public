/**
 * OpenCode Zen as a cascade leg: discovery, ranking, failover, honesty.
 *
 * axios is mocked: what is pinned is which URLs are hit in which order,
 * that a dead best model rotates to the back (next message tries the
 * next), that a Zen 429 yields to OpenRouter instead of hopping Zen
 * models, and that an all-429 night ends in the honest jammed line -
 * never a persona fallback blaming "the outside".
 */
process.env.SKIP_DB_INIT = '1';
jest.mock('axios');

import axios from 'axios';
import {
  getGrumpySysopResponse,
  rankZenModels,
  primeZenCatalogue,
  resetZenCatalogue,
  ZEN_RATE_LIMITED_LINE,
  ZEN_BASE,
} from '../../src/handlers/grumpy-sysop-bot.handler';
import type { AIProviderConfig } from '../../src/handlers/grumpy-sysop-bot.handler';

const mocked = axios as jest.Mocked<typeof axios>;

const context = {
  userHandle: 'Caller', userId: 'u1', nodeId: 1, conferenceName: 'General',
  timeOnline: 60, messageHistory: [] as { role: 'user' | 'assistant'; content: string }[],
};

const zenCfg = (over: Partial<AIProviderConfig> = {}): AIProviderConfig => ({
  provider: 'zen', modelName: '', temperature: 0.9, systemPrompt: '',
  zenApiKey: 'zen-test-key', ...over,
});

const chatOk = (content: string) => ({ data: { choices: [{ message: { content } }] } });
const err429 = () => Object.assign(new Error('Request failed with status code 429'),
  { response: { status: 429, data: { error: { message: 'rate limited' } } } });

beforeEach(() => {
  mocked.get.mockReset();
  mocked.post.mockReset();
  resetZenCatalogue();
  delete process.env.ZEN_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.GROQ_API_KEY;
  delete process.env.GEMINI_API_KEY;
});
afterEach(() => { resetZenCatalogue(); });

describe('zen discovery', () => {
  it('ranks free models muse-spark-first, drops paid ones', () => {
    expect(rankZenModels(['mimo-v2.5-free', 'gpt-5.6-sol', 'muse-spark-1.2-contributor-free']))
      .toEqual(['muse-spark-1.2-contributor-free', 'mimo-v2.5-free']);
  });
  it('discovers keyless and answers from the best free model', async () => {
    mocked.get.mockResolvedValue({ data: { data: [{ id: 'mimo-v2.5-free' }, { id: 'gpt-5.6-sol' }] } } as any);
    mocked.post.mockResolvedValue(chatOk('Hi from Zen.'));
    const reply = await getGrumpySysopResponse('hello', context as any, zenCfg());
    expect(reply).toContain('Hi from Zen.');
    expect(mocked.get).toHaveBeenCalledWith(`${ZEN_BASE}/models`, expect.anything());
    expect(mocked.post).toHaveBeenCalledWith(
      `${ZEN_BASE}/chat/completions`,
      expect.objectContaining({ model: 'mimo-v2.5-free' }),
      expect.anything(),
    );
  });
});

describe('zen failover', () => {
  it('failures rotate the pool: the next message meets the next best', async () => {
    primeZenCatalogue(['muse-spark-1.2-contributor-free', 'mimo-v2.5-free']);
    mocked.post.mockRejectedValue(Object.assign(new Error('socket hang up'), { response: undefined }));
    const first = await getGrumpySysopResponse('hello', context as any, zenCfg());
    // Every leg keyless except zen, zen's three attempts all die -> persona fallback.
    expect(first).toMatch(/ask me again in a minute/);
    mocked.post.mockResolvedValue(chatOk('Second brain here.'));
    const second = await getGrumpySysopResponse('hello again', context as any, zenCfg());
    expect(second).toContain('Second brain here.');
    const models = mocked.post.mock.calls.map((c) => (c[1] as any).model);
    // Message one: A, B, A (three attempts, rotating). Message two: B first.
    expect(models.slice(0, 3)).toEqual(
      ['muse-spark-1.2-contributor-free', 'mimo-v2.5-free', 'muse-spark-1.2-contributor-free']);
    expect(models[3]).toBe('mimo-v2.5-free');
  });
  it('a dead best model fails over silently inside one reply', async () => {
    primeZenCatalogue(['muse-spark-1.2-contributor-free', 'mimo-v2.5-free']);
    mocked.post.mockRejectedValueOnce(err429());
    mocked.post.mockResolvedValue(chatOk('Second brain here.'));
    const reply = await getGrumpySysopResponse('hello', context as any, zenCfg());
    expect(reply).toContain('Second brain here.');
    const zenModels = mocked.post.mock.calls
      .filter((c) => String(c[0]).includes('opencode.ai'))
      .map((c) => (c[1] as any).model);
    expect(zenModels).toEqual(['muse-spark-1.2-contributor-free', 'mimo-v2.5-free']);
  });
  it('exhausted zen models fall through to openrouter in the same reply', async () => {
    primeZenCatalogue(['mimo-v2.5-free']);
    mocked.get.mockResolvedValue({ data: { data: [] } } as any);
    mocked.post.mockImplementation((url: string) => {
      if (String(url).includes('opencode.ai')) return Promise.reject(err429());
      return Promise.resolve(chatOk('OpenRouter saved the chat.'));
    });
    const reply = await getGrumpySysopResponse('hello', context as any,
      zenCfg({ provider: 'zen', openRouterApiKey: 'sk-or-v1-test' }));
    expect(reply).toContain('OpenRouter saved the chat.');
  });
  it('an all-429 night ends in the honest jammed line', async () => {
    primeZenCatalogue(['mimo-v2.5-free']);
    mocked.get.mockResolvedValue({ data: { data: [] } } as any);
    mocked.post.mockRejectedValue(err429());
    const reply = await getGrumpySysopResponse('hello', context as any,
      zenCfg({ openRouterApiKey: 'sk-or-v1-test' }));
    expect(reply).toBe(ZEN_RATE_LIMITED_LINE);
    expect(reply).not.toMatch(/outside/);
  });
  it('a zen model that refuses tools answers plainly instead', async () => {
    primeZenCatalogue(['mimo-v2.5-free']);
    const toolErr = Object.assign(new Error('Bad request'),
      { response: { status: 400, data: { error: { message: 'tools not supported for this model' } } } });
    mocked.post.mockRejectedValueOnce(toolErr);
    mocked.post.mockResolvedValueOnce(chatOk('Plain answer.'));
    const withTools = { ...context, tools: { list: [{ name: 'who_is_online' }], ctx: {} } };
    const reply = await getGrumpySysopResponse('hello', withTools as any, zenCfg());
    expect(reply).toContain('Plain answer.');
  });
  it('any 400 on a tool attempt retries plain, even without the word tools', async () => {
    primeZenCatalogue(['mimo-v2.5-free']);
    const vague400 = Object.assign(new Error('Bad request'),
      { response: { status: 400, data: { error: { message: 'something about the request' } } } });
    mocked.post.mockRejectedValueOnce(vague400);
    mocked.post.mockResolvedValueOnce(chatOk('Plain anyway.'));
    const withTools = { ...context, tools: { list: [{ name: 'who_is_online' }], ctx: {} } };
    const reply = await getGrumpySysopResponse('hello', withTools as any, zenCfg());
    expect(reply).toContain('Plain anyway.');
  });
  it('a refused key (401) fails fast without burning attempts', async () => {
    primeZenCatalogue(['muse-spark-1.2-contributor-free', 'mimo-v2.5-free']);
    mocked.post.mockRejectedValue(Object.assign(new Error('Unauthorized'),
      { response: { status: 401, data: { error: { message: 'invalid key' } } } }));
    const reply = await getGrumpySysopResponse('hello', context as any, zenCfg());
    expect(reply).toMatch(/ask me again in a minute/);
    const zenCalls = mocked.post.mock.calls.filter((c) => String(c[0]).includes('opencode.ai'));
    expect(zenCalls.length).toBe(1);
  });
});
