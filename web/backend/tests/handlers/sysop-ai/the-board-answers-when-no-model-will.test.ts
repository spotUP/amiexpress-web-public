/**
 * When every provider refuses, the co-sysop said so and stopped. That is
 * honest and useless: "who is online?" does not need a language model, it
 * needs the board, and the board is right here.
 *
 * Deliberately small, and deliberately not a chatbot. The rule-based
 * responder this board deleted answered questions it had never read - asked
 * for the best multiplayer game it said "First time caller?" - so anything
 * unrecognised must fall through to the failure line rather than be guessed
 * at. These tests pin that boundary as hard as they pin the answers.
 */
process.env.SKIP_DB_INIT = '1';

import { answerWithoutAModel, toolForQuestion, ANSWERABLE_TOOL_NAMES } from '../../../src/handlers/sysop-ai/no-model-answers';
import { ALL_TOOLS } from '../../../src/handlers/sysop-ai/tools';

const ctx = () => ({
  session: { user: { id: 'u1', username: 'Caller', secLevel: 50 }, nodeId: 1, currentConf: 1 },
  page: { id: 'p1' },
  io: { to: () => ({ emit() {} }), emit() {} },
}) as any;

const tools = { list: ALL_TOOLS as any[], ctx: ctx() };

describe('what the board can answer alone', () => {
  it('names only tools that exist', () => {
    // The first cut named `who_online`; the tool is `who_is_online`, so that
    // question silently answered nothing. A name is a reference, and an
    // unchecked one is a feature that never runs.
    const real = new Set(ALL_TOOLS.map((t: any) => t.name));
    for (const name of ANSWERABLE_TOOL_NAMES) expect([...real]).toContain(name);
  });

  it('recognises the questions whose answer is a fact', () => {
    expect(toolForQuestion('who is online?', tools.list)?.tool).toBe('who_is_online');
    expect(toolForQuestion('anyone on?', tools.list)?.tool).toBe('who_is_online');
    expect(toolForQuestion('how many users are there', tools.list)?.tool).toBe('board_totals');
    expect(toolForQuestion('who called lately?', tools.list)?.tool).toBe('recent_callers');
    expect(toolForQuestion('what are my stats', tools.list)?.tool).toBe('caller_stats');
  });

  it('does NOT recognise a question it would have to invent an answer to', () => {
    // The exact shape that made the old rule-based bot embarrassing.
    expect(toolForQuestion('what is the best multiplayer game on the board?', tools.list)).toBeNull();
    expect(toolForQuestion('tell me about fairlight', tools.list)).toBeNull();
    expect(toolForQuestion('how do i upload', tools.list)).toBeNull();
    expect(toolForQuestion('', tools.list)).toBeNull();
  });

  it('is not fooled by a keyword in passing', () => {
    // "user" appears, but this is not a question about the board's totals.
    expect(toolForQuestion('where is the user manual', tools.list)).toBeNull();
  });

  it('answers from the board, and says the models are down', async () => {
    const answer = await answerWithoutAModel('who is online?', tools);
    expect(answer).toBeTruthy();
    expect(answer).toMatch(/No model is answering/i);
    // The tool's own words are in there, not a paraphrase.
    expect(answer!.split('\n').length).toBeGreaterThan(1);
  });

  it('hands back nothing when it does not know, so the failure line still speaks', async () => {
    expect(await answerWithoutAModel('what is the best game?', tools)).toBeNull();
  });

  it('hands back nothing when the caller has no tools at all', async () => {
    expect(await answerWithoutAModel('who is online?', undefined)).toBeNull();
    expect(await answerWithoutAModel('who is online?', { list: [], ctx: ctx() })).toBeNull();
  });

  it('only offers a tool this caller is actually given', async () => {
    // A caller whose tier does not carry who_online must not get it here.
    const withoutIt = tools.list.filter((t: any) => t.name !== 'who_is_online');
    expect(toolForQuestion('who is online?', withoutIt)).toBeNull();
  });
});
