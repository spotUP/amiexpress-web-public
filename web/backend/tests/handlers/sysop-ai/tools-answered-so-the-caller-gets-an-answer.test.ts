/**
 * Reported live, from the sysop's own test. Asked to "tell me about Fairlight's
 * C64 era in detail", the co-sysop replied with a Demozoo group record and the
 * line "Demozoo has no production called Fairlight C64" - and not one word
 * about the C64 era.
 *
 * The board's own log said why: every provider above OpenRouter was refusing
 * (Go 429 weekly cap, three Zen models 500/400), so the cascade had landed on
 * liquid/lfm-2.5-2.6b:free. A 2.6b model can spend its whole turn on a tool
 * call and write nothing after it. The loop returned no text, and the handler
 * printed the raw tool output.
 *
 * The answer was already on the table - nobody had put it into a sentence. So
 * the loop asks once more with no tools offered.
 */
import { askWithTools } from '../../../src/handlers/sysop-ai/loop';

const ctx = () => ({
  session: { user: { id: 'u1', username: 'Caller', secLevel: 50 }, nodeId: 1 },
  page: { id: 'p1' },
  io: { to: () => ({ emit() {} }), emit() {} },
}) as any;

const toolCall = () => ({
  choices: [{ finish_reason: 'tool_calls', message: {
    role: 'assistant', content: '',
    tool_calls: [{ id: 'c1', type: 'function', function: { name: 'caller_stats', arguments: '{}' } }],
  } }],
});
const wrote = (content: string) => ({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content } }] });
const saidNothing = () => wrote('');

describe('a model that runs a tool and then says nothing', () => {
  it('is asked once more, without tools, and that answer reaches the caller', async () => {
    const bodies: any[] = [];
    let round = 0;
    const r = await askWithTools({
      model: 'free/too-small-to-summarise',
      messages: [{ role: 'user', content: "tell me about Fairlight's C64 era" }],
      tools: [],
      ctx: ctx(),
      deadline: Date.now() + 30000,
      post: async (body) => {
        bodies.push(body);
        round += 1;
        if (round === 1) return toolCall();
        if (round === 2) return saidNothing();
        return wrote('Fairlight started on the C64 in 1987.');
      },
    });

    expect(r.text).toBe('Fairlight started on the C64 in 1987.');
    // The last round is the one with no tools on the table.
    expect(bodies[bodies.length - 1].tools).toBeUndefined();
    expect(String(bodies[bodies.length - 1].messages.at(-1).content)).toMatch(/your own words/i);
    // And the tool's own answer is still carried, for the raw fallback behind this.
    expect(r.toolResults.join('')).not.toBe('');
  });

  it('leaves the raw fallback its turn when the model still writes nothing', async () => {
    let round = 0;
    const r = await askWithTools({
      model: 'free/too-small-to-summarise',
      messages: [{ role: 'user', content: 'how many calls do I have?' }],
      tools: [],
      ctx: ctx(),
      deadline: Date.now() + 30000,
      post: async () => (++round === 1 ? toolCall() : saidNothing()),
    });
    expect(r.text).toBeNull();
    expect(r.toolResults.join('')).not.toBe('');
  });

  it('does not spend a round when the model answered properly', async () => {
    let posts = 0;
    const r = await askWithTools({
      model: 'free/one-that-writes',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
      ctx: ctx(),
      deadline: Date.now() + 30000,
      post: async () => { posts += 1; return wrote('Up since 1994.'); },
    });
    expect(r.text).toBe('Up since 1994.');
    expect(posts).toBe(1);
  });

  it('does not start a round it has no time for', async () => {
    let round = 0;
    const r = await askWithTools({
      model: 'free/too-small-to-summarise',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
      ctx: ctx(),
      deadline: Date.now() + 1200,
      post: async () => (++round === 1 ? toolCall() : saidNothing()),
    });
    expect(r.text).toBeNull();
    expect(round).toBe(2);
  });
});
