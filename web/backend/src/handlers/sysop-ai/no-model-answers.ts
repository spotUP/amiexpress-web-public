/**
 * WHAT THE BOARD CAN ANSWER WITH NO MODEL AT ALL.
 *
 * When every provider refuses - the free pool rate-limited, the keys absent,
 * the paid one on its weekly cap - the co-sysop says so and stops. That is
 * honest and it is useless: "who is online?" does not need a language model,
 * it needs the board, and the board is right here. The sysop asked for this
 * the first time the cascade died mid-evening.
 *
 * DELIBERATELY SMALL, and deliberately not a chatbot. It recognises a handful
 * of questions whose answer is a fact, runs the tool that already knows it,
 * and says plainly that the models are down. Anything it does not recognise
 * falls through to the honest failure line rather than being guessed at - the
 * rule-based responder this board deleted answered questions it had never
 * read, and nothing here may do that again.
 */
import { runTool, type SysopTool, type ToolContext } from './tools';

interface Answerable {
  /** The tool that knows, by name. */
  tool: string;
  /** Fixed arguments; these questions take none of the caller's words. */
  args?: Record<string, unknown>;
  /** What the caller might have asked. */
  asks: RegExp;
}

/**
 * Order matters only where two could match; the first wins. Each pattern is
 * anchored on a verb or a noun the question turns on, not on a keyword that
 * could appear in passing - "how many users" is a question about the board,
 * "the user manual" is not.
 */
const ANSWERABLE: readonly Answerable[] = [
  { tool: 'who_is_online', asks: /\b(who('s| is| are)?\s+(on|online|here)|anyone\s+(on|online|here)|is\s+anyone\s+(on|around))\b/i },
  { tool: 'board_totals', asks: /\bhow many (users|callers|messages|files)\b|\bboard (totals|stats|statistics)\b/i },
  { tool: 'recent_callers', asks: /\bwho (has |have )?(been |called )?(on |here )?(lately|recently)\b|\brecent callers?\b|\blast callers?\b/i },
  { tool: 'caller_stats', asks: /\bmy (stats|account|ratio|uploads|downloads|time left)\b|\bhow much time (do i have|is left)\b/i },
  { tool: 'list_conferences', asks: /\bwhat conferences\b|\blist (the )?conferences\b|\bwhich conferences\b/i },
  { tool: 'list_doors', asks: /\bwhat (doors|games)\b|\blist (the )?doors\b|\bwhich doors\b/i },
];

/** Every tool this table names - so a test can check they all exist. */
export const ANSWERABLE_TOOL_NAMES: readonly string[] = ANSWERABLE.map((a) => a.tool);

/** The tool this question turns on, or nothing. */
export function toolForQuestion(message: string, available: SysopTool[]): Answerable | null {
  const text = (message ?? '').trim();
  if (!text) return null;
  const names = new Set(available.map((t) => t.name));
  for (const entry of ANSWERABLE) {
    if (entry.asks.test(text) && names.has(entry.tool)) return entry;
  }
  return null;
}

/**
 * Answer from the board, or return null and let the caller say the models are
 * down. The preamble is not an apology: it says which half of the board is
 * working, because a caller who asks again in a minute deserves to know that
 * the answer they just got was not a model's.
 */
export async function answerWithoutAModel(
  message: string,
  tools: { list: SysopTool[]; ctx: ToolContext } | undefined,
): Promise<string | null> {
  if (!tools?.list?.length) return null;
  const entry = toolForQuestion(message, tools.list);
  if (!entry) return null;

  try {
    const { outcome, result } = await runTool(tools.ctx, entry.tool, entry.args ?? {});
    if (outcome !== 'ok') return null;
    const content = (result?.content ?? '').trim();
    if (!content) return null;
    return `No model is answering right now, but the board can tell you this much:\n${content}`;
  } catch {
    // The failure line is waiting behind this; it is a better answer than a
    // thrown error, and the caller is told the truth either way.
    return null;
  }
}
