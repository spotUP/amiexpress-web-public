/**
 * Amiga Latin-1 in, Amiga Latin-1 out, both directions of operator chat.
 *
 * Commodore adopted ECMA-94 (ISO-8859-1) in 1985: åäöüßé are board citizens,
 * everything above U+00FF is garbage on every terminal served. A co-sysop's
 * curly quotes sailed straight through stripEmojis (emoji blocks only) live
 * 2026-09-11, and Swedish åäö died silently at the keystroke gate the other
 * way ("i can't type swedish åäö in the operator chat").
 */
process.env.SKIP_DB_INIT = '1';
jest.mock('axios');

import axios from 'axios';
import {
  getGrumpySysopResponse,
  toAmigaLatin1,
  type AIProviderConfig,
} from '../../src/handlers/grumpy-sysop-bot.handler';
import { chatAcceptsKeystroke } from '../../src/handlers/operator-chat/chat-stream';

const mocked = axios as jest.Mocked<typeof axios>;

const contextFor = () => ({
  userHandle: 'Caller',
  userId: 'u1',
  nodeId: 1,
  conferenceName: 'General',
  timeOnline: 60,
  messageHistory: [],
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

describe('toAmigaLatin1', () => {
  it('keeps ASCII and Latin-1, including Swedish', () => {
    expect(toAmigaLatin1('hej åäö ÅÄÖ üßé')).toBe('hej åäö ÅÄÖ üßé');
  });

  it('maps smart punctuation to ASCII twins', () => {
    expect(toAmigaLatin1('\u2018single\u2019 and \u201cdouble\u201d')).toBe("'single' and \"double\"");
    expect(toAmigaLatin1('a\u2013b\u2014c')).toBe('a-b-c');
    expect(toAmigaLatin1('wait\u2026')).toBe('wait...');
    expect(toAmigaLatin1('a\u2022b')).toBe('a*b');
  });

  it('drops emoji, controls and beyond-Latin-1 without placeholders', () => {
    expect(toAmigaLatin1('hi 🙂 bye')).toBe('hi  bye');
    expect(toAmigaLatin1('a\x07b\x1b')).toBe('ab');
    expect(toAmigaLatin1('a\u0080b')).toBe('ab');
    expect(toAmigaLatin1('a\u4e2db')).toBe('ab');
  });

  it('keeps line breaks the chat is built on', () => {
    expect(toAmigaLatin1('one\ntwo\r\nthree')).toBe('one\ntwo\r\nthree');
  });
});

describe('bot replies carry nothing outside Latin-1', () => {
  it('a curly-quoted Groq reply goes out straight', async () => {
    mocked.post.mockResolvedValue({
      data: { choices: [{ message: { content: '\u201cHej\u201d — fint!' }, finish_reason: 'stop' }] },
    } as any);
    const reply = await getGrumpySysopResponse('hej', contextFor() as any, { ...base, groqApiKey: 'gsk-test' });
    expect(reply).toContain('"Hej" - fint!');
    expect(reply).not.toMatch(/[^\x20-\x7e\xa0-\xff\n\r]/);
  });
});

describe('chatAcceptsKeystroke', () => {
  it.each(['å', 'ä', 'ö', 'Å', 'Ä', 'Ö', 'ü', 'ß', 'é', ' ', 'a', 'Z', '0'])(
    'lets through: %s',
    (ch) => expect(chatAcceptsKeystroke(ch)).toBe(true)
  );

  it.each(['', 'ab', '\x7f', '\x80', '\x9f', '🙂', '\n'])(
    'refuses: %s',
    (ch) => expect(chatAcceptsKeystroke(ch as string)).toBe(false)
  );
});
