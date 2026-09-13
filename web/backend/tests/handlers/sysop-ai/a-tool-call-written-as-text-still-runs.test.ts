/**
 * Reported live on 2026-09-13. A caller asked the co-sysop for the group
 * history of Fairlight and read back, on the terminal, verbatim:
 *
 *   <|tool_call_start|>[search_doors(kind='detail', query='fairlight')]<|tool_call_end|>
 *
 * Two failures in one line. The model had asked for a tool, but wrote the
 * call into `content` in its own control-token dialect instead of into
 * `tool_calls` - so the loop found no calls, treated the markup as the final
 * answer, and the tool never ran. And nothing between the model and the
 * terminal strips control tokens: they are pure ASCII, so stripEmojis and
 * toAmigaLatin1 both pass them straight through.
 */
import { askWithTools, toolCallsWrittenAsText, withoutControlTokens } from '../../../src/handlers/sysop-ai/loop';
import type { SysopTool } from '../../../src/handlers/sysop-ai/tools';

const LIVE = "<|tool_call_start|>[search_doors(kind='detail', query='fairlight')]<|tool_call_end|>";

/** Enough context for the fence: a caller-tier session. */
const callerCtx = () => ({
  session: { user: { id: 'u1', username: 'Caller', secLevel: 50 }, nodeId: 1 },
  page: { id: 'page-1' },
  io: { to: () => ({ emit() {} }), emit() {} },
}) as any;

const said = (content: string, finish = 'stop') => ({
  choices: [{ finish_reason: finish, message: { role: 'assistant', content } }],
});

describe('a tool call the model wrote as text', () => {
  it('is read back out of the content', () => {
    const calls = toolCallsWrittenAsText(LIVE);
    expect(calls).toHaveLength(1);
    expect(calls[0].function.name).toBe('search_doors');
    expect(calls[0].function.arguments).toEqual({ kind: 'detail', query: 'fairlight' });
  });

  it('reads double quotes and a JSON argument object too', () => {
    expect(toolCallsWrittenAsText('<|tool_call_start|>[search_demozoo(kind="group", query="up rough")]<|tool_call_end|>')[0]
      .function.arguments).toEqual({ kind: 'group', query: 'up rough' });
    expect(toolCallsWrittenAsText('<|tool_call_begin|>search_demozoo({"kind":"group","query":"fairlight"})<|tool_call_end|>')[0]
      .function.arguments).toEqual({ kind: 'group', query: 'fairlight' });
  });

  it('finds nothing in an ordinary reply', () => {
    expect(toolCallsWrittenAsText('Fairlight started on the C64 in 1987.')).toEqual([]);
    expect(toolCallsWrittenAsText(undefined)).toEqual([]);
  });

  it('never lets a control token reach the caller', () => {
    expect(withoutControlTokens(LIVE)).toBe('');
    expect(withoutControlTokens('<|channel|>Fairlight, then.')).toBe('Fairlight, then.');
  });

  it('RUNS the tool, and answers with its result instead of the markup', async () => {
    // A REAL tool: runTool resolves against the module's own registry, not
    // against what the request carries, so an injected fake can never run.
    // caller_stats needs no arguments and only reads the session.
    let round = 0;
    const r = await askWithTools({
      model: 'free/one-that-writes-its-calls',
      messages: [{ role: 'user', content: 'how many calls do I have?' }],
      tools: [],
      ctx: callerCtx(),
      deadline: Date.now() + 30000,
      post: async () => (round++ === 0
        ? said('<|tool_call_start|>[caller_stats()]<|tool_call_end|>')
        : said('You are on 12 calls.')),
    });

    expect(r.calls.map((c) => [c.name, c.outcome])).toEqual([['caller_stats', 'ok']]);
    expect(r.toolResults.join('')).not.toBe('');
    expect(r.text).toBe('You are on 12 calls.');
    expect(r.text).not.toContain('tool_call');
  });

  it('hands the model back its own turn without the markup in it', async () => {
    // Echoing the raw dialect into the history teaches the next round to
    // answer in it again.
    const sent: any[] = [];
    let round = 0;
    await askWithTools({
      model: 'free/one-that-writes-its-calls',
      messages: [{ role: 'user', content: 'how many calls do I have?' }],
      tools: [],
      ctx: callerCtx(),
      deadline: Date.now() + 30000,
      post: async (body) => { sent.push(body); return round++ === 0
        ? said('Let me look.<|tool_call_start|>[caller_stats()]<|tool_call_end|>')
        : said('You are on 12 calls.'); },
    });

    const assistantTurn = (sent[1].messages as any[]).find((m) => m.role === 'assistant');
    expect(assistantTurn.content).toBe('Let me look.');
    expect(JSON.stringify(sent[1].messages)).not.toContain('tool_call_start');
  });

  it('and when the dialect is one nobody parses, the caller still reads no markup', async () => {
    const r = await askWithTools({
      model: 'free/some-other-dialect',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
      ctx: {} as any,
      deadline: Date.now() + 30000,
      post: async () => said('<|unknown_thing|>Up since 1994.'),
    });
    expect(r.text).toBe('Up since 1994.');
  });
});
