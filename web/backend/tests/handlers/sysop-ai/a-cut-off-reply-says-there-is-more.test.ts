/**
 * The co-sysop's reply is capped at max_tokens, and a reply that hit the cap
 * is meant to end with the continuation marker so the caller knows "go on"
 * will work (grumpy-sysop-bot.handler.ts:1191, and the three `result.truncated`
 * reads around it).
 *
 * It never fired. `finish_reason` belongs to the CHOICE in an OpenAI-shaped
 * response, not to the `message` inside it, and the loop read it off the
 * message - so it was undefined on every reply from every model, `truncated`
 * was permanently false, and a reply cut off mid-sentence just stopped.
 */
import { askWithTools } from '../../../src/handlers/sysop-ai/loop';

/** An OpenRouter/OpenAI chat completion, shaped the way the real API shapes it. */
const completion = (content: string, finishReason: string) => ({
  choices: [{ index: 0, finish_reason: finishReason, message: { role: 'assistant', content } }],
});

const ask = (data: any) => askWithTools({
  model: 'test/model',
  messages: [{ role: 'user', content: 'tell me about the board' }],
  tools: [],
  ctx: {} as any,
  deadline: Date.now() + 30000,
  post: async () => data,
});

describe('a reply that ran out of tokens', () => {
  it('is reported as truncated, so the caller is told there is more', async () => {
    const r = await ask(completion('The board has been up since', 'length'));
    expect(r.text).toBe('The board has been up since');
    expect(r.truncated).toBe(true);
  });

  it('a reply that finished on its own is not', async () => {
    const r = await ask(completion('Up since 1994.', 'stop'));
    expect(r.truncated).toBe(false);
  });

  it('and neither is one from a provider that sends no finish_reason at all', async () => {
    const r = await ask({ choices: [{ message: { role: 'assistant', content: 'Hello.' } }] });
    expect(r.text).toBe('Hello.');
    expect(r.truncated).toBe(false);
  });
});
