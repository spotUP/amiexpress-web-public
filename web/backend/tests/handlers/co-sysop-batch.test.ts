/**
 * Co-sysop batch, from a son's chat with the bots (2026-09-10).
 *
 * - "......." burned a full model cascade for nothing; a 146-door dump
 *   followed. Low-content input gets a nudge without waking any model, and
 *   list_doors caps like search_files (10 + more).
 * - "My brain misfired" twice running: identical outages read the identical
 *   line. A repeat falls back to the persona line instead.
 * - A reply cut short ("Actually, Crystal...") went out unmarked on four
 *   of six plain legs. finish_reason length is now marked everywhere.
 * - Prompt rules pin the rest (no tool narration, short nudges, the
 *   caller's language with ASCII spelling offered).
 */
process.env.SKIP_DB_INIT = '1';
jest.mock('axios');

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import axios from 'axios';
import {
  getGrumpySysopResponse,
  ZEN_FAILED_LINE,
  LOW_CONTENT_NUDGE,
  isLowContentMessage,
  type AIProviderConfig,
} from '../../src/handlers/grumpy-sysop-bot.handler';
import { VOICE_RULES, GROUNDING_RULES } from '../../src/handlers/sysop-ai/personas';
import { runTool, type ToolContext } from '../../src/handlers/sysop-ai/tools';

const mocked = axios as jest.Mocked<typeof axios>;

const contextFor = (history: Array<{ role: 'user' | 'bot'; content: string }> = []) => ({
  userHandle: 'Caller',
  userId: 'u1',
  nodeId: 1,
  conferenceName: 'General',
  timeOnline: 60,
  messageHistory: history,
});

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

describe('low-content input', () => {
  it.each(['.......', '...', '???', '---', 'i dont know', "i don't know", 'idk', 'dunno', 'hmm'])(
    'needs no model: %s',
    (text) => expect(isLowContentMessage(text)).toBe(true)
  );

  it.each(['hello', 'tetris?', 'i want to talk random stuff', 'do you speak swedish'])(
    'still goes to the model: %s',
    (text) => expect(isLowContentMessage(text)).toBe(false)
  );

  it('the nudge is short and tool-free', () => {
    expect(LOW_CONTENT_NUDGE.length).toBeLessThan(60);
    expect(LOW_CONTENT_NUDGE).not.toMatch(/tool|door|menu|list/i);
  });
});

describe('list_doors', () => {
  const boardWith = (n: number): string => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'doors-cap-'));
    const dir = path.join(root, 'Commands', 'BBSCmd');
    fs.mkdirSync(dir, { recursive: true });
    for (let i = 0; i < n; i++) {
      fs.writeFileSync(path.join(dir, `DOOR${i}.info`), 'TYPE=XIM\nACCESS=0\n');
    }
    return root;
  };
  const ctxFor = (bbsRoot: string): ToolContext =>
    ({
      io: { to: () => ({ emit() {} }) },
      session: { user: { id: 'u1', username: 'Knut', secLevel: 30 }, nodeId: 1, currentConf: 1, tempData: {} },
      page: {}, chatSession: {}, bbsRoot, execute: async () => {}, db: {}, caps: {}, sysopName: 'Spot',
    } as unknown as ToolContext);

  it('caps a big board at ten names plus a count', async () => {
    const root = boardWith(146);
    try {
      const { result } = await runTool(ctxFor(root), 'list_doors', {});
      expect(result.content).toMatch(/^146 doors\/programs: /);
      expect(result.content).toContain('(+136 more)');
      expect(result.content.split(',').length).toBeLessThan(20);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('a small board reads whole, with no count suffix', async () => {
    const root = boardWith(3);
    try {
      const { result } = await runTool(ctxFor(root), 'list_doors', {});
      expect(result.content).toBe('3 doors/programs: DOOR0, DOOR1, DOOR2');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('fallback dedup', () => {
  const refused = () =>
    mocked.post.mockRejectedValue(Object.assign(new Error('Request failed with status code 500'), { response: { status: 500, data: {} } }));

  it('never reads the same failure line twice running', async () => {
    mocked.get.mockResolvedValue({ data: { data: [{ id: 'free-0', pricing: { prompt: '0', completion: '0' } }] } } as any);
    refused();
    const cfg = { ...base, openRouterApiKey: 'sk-or-v1-test' };
    const first = await getGrumpySysopResponse('hej', contextFor() as any, cfg);
    expect(first).toBe(ZEN_FAILED_LINE);
    const second = await getGrumpySysopResponse('hej igen', contextFor([{ role: 'user', content: 'hej' }, { role: 'bot', content: ZEN_FAILED_LINE }]) as any, cfg);
    expect(second).not.toBe(ZEN_FAILED_LINE);
  });

  it('a single failure still says exactly the honest line', async () => {
    mocked.get.mockResolvedValue({ data: { data: [{ id: 'free-0', pricing: { prompt: '0', completion: '0' } }] } } as any);
    refused();
    const reply = await getGrumpySysopResponse('hello', contextFor() as any, { ...base, openRouterApiKey: 'sk-or-v1-test' });
    expect(reply).toBe(ZEN_FAILED_LINE);
  });
});

describe('length-cut marking on every plain leg', () => {
  it('a Groq reply cut at max_tokens carries the go-on marker', async () => {
    mocked.post.mockResolvedValue({
      data: { choices: [{ message: { content: 'Tetris by Breeze is' }, finish_reason: 'length' }] },
    } as any);
    const reply = await getGrumpySysopResponse('tetris?', contextFor() as any, { ...base, groqApiKey: 'gsk-test' });
    expect(reply).toContain('go on');
    expect(reply).toContain('Tetris by Breeze is');
  });

  it('a whole Groq reply carries no marker', async () => {
    mocked.post.mockResolvedValue({
      data: { choices: [{ message: { content: 'Tetris by Breeze is great.' }, finish_reason: 'stop' }] },
    } as any);
    const reply = await getGrumpySysopResponse('tetris?', contextFor() as any, { ...base, groqApiKey: 'gsk-test' });
    expect(reply).not.toContain('go on');
  });
});

describe('prompt rules the batch adds', () => {
  it('voice: short nudges for content-free messages', () => {
    expect(VOICE_RULES).toMatch(/no content[\s\S]{0,120}SHORT nudge/);
  });

  it('voice: the caller language with ASCII spelling offered', () => {
    expect(VOICE_RULES).toMatch(/caller's language/);
    expect(VOICE_RULES).toMatch(/ASCII spelling/);
  });

  it('grounding: findings, never plumbing', () => {
    expect(GROUNDING_RULES).toMatch(/Never narrate the tools/);
  });
});
