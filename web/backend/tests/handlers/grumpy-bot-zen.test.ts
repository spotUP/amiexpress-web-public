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
  primeGoCatalogue,
  resetGoCatalogue,
  primeKeyedCatalogue,
  resetKeyedCatalogues,
  keyedModelFor,
  ZEN_RATE_LIMITED_LINE,
  ZEN_FAILED_LINE,
  ZEN_UNCONFIGURED_LINE,
  ZEN_BASE,
  GO_BASE,
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
  resetGoCatalogue();
  delete process.env.ZEN_API_KEY;
  delete process.env.GO_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.GROQ_API_KEY;
  delete process.env.GEMINI_API_KEY;
});
afterEach(() => { resetZenCatalogue(); resetGoCatalogue(); });

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
    expect(first).toMatch(/ask me again in a minute/i);
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
  it('a 500 on a tool attempt retries plain without remembering', async () => {
    primeZenCatalogue(['mimo-v2.5-free']);
    const err500 = Object.assign(new Error('Internal server error'),
      { response: { status: 500, data: { error: { message: 'Internal server error' } } } });
    mocked.post.mockRejectedValueOnce(err500);
    mocked.post.mockResolvedValueOnce(chatOk('Plain after 500.'));
    const withTools = { ...context, tools: { list: [{ name: 'who_is_online' }], ctx: {} } };
    const reply = await getGrumpySysopResponse('hello', withTools as any, zenCfg());
    expect(reply).toContain('Plain after 500.');
  });
  it('a refused key (401) fails fast without burning attempts', async () => {
    primeZenCatalogue(['muse-spark-1.2-contributor-free', 'mimo-v2.5-free']);
    mocked.post.mockRejectedValue(Object.assign(new Error('Unauthorized'),
      { response: { status: 401, data: { error: { message: 'invalid key' } } } }));
    const reply = await getGrumpySysopResponse('hello', context as any, zenCfg());
    expect(reply).toMatch(/ask me again in a minute/i);
    const zenCalls = mocked.post.mock.calls.filter((c) => String(c[0]).includes('opencode.ai'));
    expect(zenCalls.length).toBe(1);
  });
});

describe('rule-based and honest fallbacks', () => {
  it('rule-based sends no round trip anywhere', async () => {
    const reply = await getGrumpySysopResponse('hello', context as any,
      { provider: 'rule-based', temperature: 0.9, systemPrompt: '' });
    expect(reply).toMatch(/ask me again in a minute/i);
    expect(mocked.get).not.toHaveBeenCalled();
    expect(mocked.post).not.toHaveBeenCalled();
  });
  it('no keys anywhere ends in the unconfigured line', async () => {
    const reply = await getGrumpySysopResponse('hello', context as any,
      { provider: 'openrouter', temperature: 0.9, systemPrompt: '' });
    expect(reply).toBe(ZEN_UNCONFIGURED_LINE);
    expect(mocked.post).not.toHaveBeenCalled();
  });
  it('tried-and-died ends in the failed line, never blaming the outside', async () => {
    primeZenCatalogue(['mimo-v2.5-free']);
    mocked.post.mockRejectedValue(Object.assign(new Error('boom'), { response: { status: 500, data: {} } }));
    const reply = await getGrumpySysopResponse('hello', context as any, zenCfg());
    expect(reply).toBe(ZEN_FAILED_LINE);
    expect(reply).not.toMatch(/outside/);
  });
  it('an admin-pinned model outside the list is refused for the picked one', async () => {
    primeZenCatalogue(['mimo-v2.5-free']);
    mocked.post.mockResolvedValue(chatOk('Picked brain here.'));
    const reply = await getGrumpySysopResponse('hello', context as any,
      zenCfg({ modelName: 'gpt-5.6-sol' }));
    expect(reply).toContain('Picked brain here.');
    expect((mocked.post.mock.calls[0][1] as any).model).toBe('mimo-v2.5-free');
  });
});

describe('opencode go', () => {
  const goCfg = (over: Partial<AIProviderConfig> = {}): AIProviderConfig => ({
    provider: 'go', modelName: '', temperature: 0.9, systemPrompt: '',
    goApiKey: 'go-test-key', ...over,
  });
  it('ranks subscription models muse-spark-first without a free filter', () => {
    expect(rankZenModels(['glm-5.2', 'muse-spark-1.2-contributor', 'kimi-k3'], 'go'))
      .toEqual(['muse-spark-1.2-contributor', 'kimi-k3', 'glm-5.2']);
  });
  it('discovers keyless and answers from the best go model', async () => {
    mocked.get.mockResolvedValue({ data: { data: [{ id: 'glm-5.2' }, { id: 'kimi-k3' }] } } as any);
    mocked.post.mockResolvedValue(chatOk('Hi from Go.'));
    const reply = await getGrumpySysopResponse('hello', context as any, goCfg());
    expect(reply).toContain('Hi from Go.');
    expect(mocked.get).toHaveBeenCalledWith(`${GO_BASE}/models`, expect.anything());
    expect(mocked.post).toHaveBeenCalledWith(
      `${GO_BASE}/chat/completions`,
      expect.objectContaining({ model: 'kimi-k3' }),
      expect.anything(),
    );
  });
  it('a dead go best fails over silently inside one reply', async () => {
    primeGoCatalogue(['kimi-k3', 'glm-5.2']);
    mocked.post.mockRejectedValueOnce(err429());
    mocked.post.mockResolvedValue(chatOk('Second Go brain here.'));
    const reply = await getGrumpySysopResponse('hello', context as any, goCfg());
    expect(reply).toContain('Second Go brain here.');
    const models = mocked.post.mock.calls.map((c) => (c[1] as any).model);
    expect(models).toEqual(['kimi-k3', 'glm-5.2']);
  });
  it('go preferred still falls back to openrouter', async () => {
    primeGoCatalogue(['kimi-k3']);
    mocked.get.mockResolvedValue({ data: { data: [] } } as any);
    mocked.post.mockImplementation((url: string) => {
      if (String(url).includes('opencode.ai')) return Promise.reject(err429());
      return Promise.resolve(chatOk('OpenRouter after Go.'));
    });
    const reply = await getGrumpySysopResponse('hello', context as any,
      goCfg({ openRouterApiKey: 'sk-or-v1-test' }));
    expect(reply).toContain('OpenRouter after Go.');
  });
});

describe('cerebras', () => {  const cbCfg = (over: Partial<AIProviderConfig> = {}): AIProviderConfig => ({
    provider: 'cerebras', modelName: '', temperature: 0.9, systemPrompt: '',
    cerebrasApiKey: 'csk-test', ...over,
  });
  it('skips silently without a key', async () => {
    const reply = await getGrumpySysopResponse('hello', context as any,
      { provider: 'cerebras', temperature: 0.9, systemPrompt: '' });
    expect(reply).toBe(ZEN_UNCONFIGURED_LINE);
    expect(mocked.post).not.toHaveBeenCalled();
  });
  it('answers plainly with a key', async () => {
    mocked.post.mockResolvedValue(chatOk('Fast answer.'));
    const reply = await getGrumpySysopResponse('hello', context as any, cbCfg());
    expect(reply).toContain('Fast answer.');
    expect(mocked.post).toHaveBeenCalledWith(
      'https://api.cerebras.ai/v1/chat/completions',
      expect.objectContaining({ model: 'llama3.1-8b' }),
      expect.anything(),
    );
  });
  it('a cerebras 429 notes the jam, and the line says jammed', async () => {
    mocked.post.mockRejectedValue(err429());
    const reply = await getGrumpySysopResponse('hello', context as any, cbCfg());
    expect(reply).toBe(ZEN_RATE_LIMITED_LINE);
  });
});

describe('keyed provider catalogues', () => {
  beforeEach(() => { resetKeyedCatalogues(); });
  afterEach(() => { resetKeyedCatalogues(); });
  const cfg = (over = {}) => ({
    provider: 'groq', modelName: '', temperature: 0.9, systemPrompt: '',
    groqApiKey: 'gsk-test', ...over,
  });
  it('ranks preferred-known ids first, then alphabetically', async () => {
    expect(await keyedModelFor('groq', cfg() as any)).toBe('llama-3.3-70b-versatile');
  });
  it('discovers with the key and answers with the best id', async () => {
    mocked.get.mockResolvedValue({ data: { data: [{ id: 'mixtral-8x7b-32768' }, { id: 'llama-3.3-70b-versatile' }] } } as any);
    mocked.post.mockResolvedValue(chatOk('Groq here.'));
    const reply = await getGrumpySysopResponse('hello', context as any, cfg());
    expect(reply).toContain('Groq here.');
    expect(mocked.get).toHaveBeenCalledWith(
      'https://api.groq.com/openai/v1/models', expect.anything());
    expect(mocked.post).toHaveBeenCalledWith(
      'https://api.groq.com/openai/v1/chat/completions',
      expect.objectContaining({ model: 'llama-3.3-70b-versatile' }),
      expect.anything(),
    );
  });
  it('maps gemini model names and falls back when discovery fails', async () => {
    primeKeyedCatalogue('gemini', []);
    mocked.get.mockRejectedValue(new Error('down'));
    expect(await keyedModelFor('gemini', { temperature: 0.9, systemPrompt: '', geminiApiKey: 'k' } as any))
      .toBe('gemini-2.0-flash');
    mocked.get.mockResolvedValue({ data: { models: [{ name: 'models/gemini-1.5-flash' }] } } as any);
    resetKeyedCatalogues();
    expect(await keyedModelFor('gemini', { temperature: 0.9, systemPrompt: '', geminiApiKey: 'k' } as any))
      .toBe('gemini-1.5-flash');
  });
  it('an admin override wins over the catalogue', async () => {
    primeKeyedCatalogue('cerebras', ['llama3.1-8b']);
    mocked.post.mockResolvedValue(chatOk('Custom here.'));
    const reply = await getGrumpySysopResponse('hello', context as any, {
      provider: 'cerebras', modelName: 'custom-model', temperature: 0.9, systemPrompt: '', cerebrasApiKey: 'csk-test',
    });
    expect(reply).toContain('Custom here.');
    expect(mocked.post).toHaveBeenCalledWith(
      'https://api.cerebras.ai/v1/chat/completions',
      expect.objectContaining({ model: 'custom-model' }),
      expect.anything(),
    );
  });
});

describe('tool loops on the plain legs', () => {
  const toolsCtx = { ...context, tools: { list: [{ name: 'who_is_online', description: 'x', parameters: {}, tier: 'caller', run: async () => ({ content: 'Nobody else is online.' }) }], ctx: {} } };
  it('groq uses tools when the caller has them', async () => {
    primeKeyedCatalogue('groq', ['llama-3.3-70b-versatile']);
    mocked.post.mockImplementation(async (url: string, body: any) => {
      const calls = body?.messages?.length ?? 0;
      if (body?.tools && !body.messages.some((m: any) => m.role === 'tool')) {
        return { data: { choices: [{ message: { content: null, tool_calls: [{ id: 'c1', function: { name: 'who_is_online', arguments: '{}' } }] } }] } };
      }
      void calls;
      return { data: { choices: [{ message: { content: 'Only you, kid.' } }] } };
    });
    const reply = await getGrumpySysopResponse('who is online', toolsCtx as any, {
      provider: 'groq', modelName: '', temperature: 0.9, systemPrompt: '', groqApiKey: 'gsk-test',
    });
    expect(reply).toContain('Only you, kid.');
  });
  it('a groq tool-loop 400 falls back to plain instead of dying', async () => {
    primeKeyedCatalogue('groq', ['llama-3.3-70b-versatile']);
    const err400 = Object.assign(new Error('Bad request'),
      { response: { status: 400, data: { error: { message: 'tools rejected' } } } });
    mocked.post.mockRejectedValueOnce(err400);
    mocked.post.mockResolvedValue({ data: { choices: [{ message: { content: 'Plain Groq here.' } }] } });
    const reply = await getGrumpySysopResponse('hello', toolsCtx as any, {
      provider: 'groq', modelName: '', temperature: 0.9, systemPrompt: '', groqApiKey: 'gsk-test',
    });
    expect(reply).toContain('Plain Groq here.');
  });
});

describe('faked tool calls in replies', () => {
  it('strips the block and keeps the rest', async () => {
    const { stripFakeToolCalls } = await import('../../src/handlers/grumpy-sysop-bot.handler');
    expect(stripFakeToolCalls('Here: <tool_call>search_x</tool_call> done.')).toBe('Here:  done.');
  });
  it('an all-fake reply fails the cascade instead of showing stage directions', async () => {
    primeZenCatalogue(['mimo-v2.5-free']);
    mocked.post.mockResolvedValue({ data: { choices: [{ message: { content: '<tool_call>ask_scene</tool_call>' } }] } });
    const reply = await getGrumpySysopResponse('show me a logo', context as any, zenCfg());
    expect(reply).not.toContain('tool_call');
    expect(reply).toMatch(/ask me again in a minute/i);
  });
});

describe('faked tool calls rotate the pools', () => {
  it('an all-fake reply moves the junk model to the back', async () => {
    primeZenCatalogue(['aa-junk-free', 'zz-good-free']);
    mocked.post.mockImplementation(async (url: string, body: any) => {
      if ((body?.model ?? '').includes('junk')) {
        return { data: { choices: [{ message: { content: '<tool_call>x</tool_call>' } }] } };
      }
      return { data: { choices: [{ message: { content: 'Real answer here.' } }] } };
    });
    const first = await getGrumpySysopResponse('hi', context as any, zenCfg());
    expect(first).toMatch(/ask me again in a minute/i);
    const second = await getGrumpySysopResponse('hi again', context as any, zenCfg());
    expect(second).toContain('Real answer here.');
  });
});
