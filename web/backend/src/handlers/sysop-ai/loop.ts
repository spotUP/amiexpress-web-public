/**
 * THE TOOL LOOP - the model asks, the board answers, the model replies.
 *
 * OpenAI-style function calling through OpenRouter: the request carries the
 * caller's tools; a response whose message has `tool_calls` is a question to
 * the board, answered by running each tool (fenced, audited) and sending the
 * results back as `tool` messages; a response with `content` is the reply.
 * At most `MAX_ROUNDS` questions, all inside `deadline`. Actions a tool
 * scheduled (`after`) are collected and returned; the chat runs them once
 * the reply has been typed.
 */
import { asData, runTool, toolDefinitions, type SysopTool, type ToolContext } from './tools';
import { auditToolCall } from './audit';

export const MAX_ROUNDS = 3;

export interface ToolLoopRequest {
  model: string;
  messages: Array<Record<string, unknown>>;
  tools: SysopTool[];
  ctx: ToolContext;
  /** Absolute ms timestamp the whole reply must be in by. */
  deadline: number;
  /** The longest ONE round trip may take, whatever is left of the deadline. */
  perRoundMs?: number;
  /** How long the reply may be; the wait is mostly generation on a big model. */
  maxTokens?: number;
  temperature?: number;
  /** POST the chat/completions body; returns the parsed response data. */
  post: (body: Record<string, unknown>, timeoutMs: number) => Promise<any>;
}

export interface ToolLoopResult {
  text: string | null;
  /** True when the model stopped for length, not for finishing. */
  truncated: boolean;
  afters: Array<() => Promise<void>>;
  /** For the log and the tests: what was asked. */
  calls: Array<{ name: string; args: Record<string, unknown>; outcome: string }>;
  /**
   * What the board answered, in order. When the model runs out of time
   * before it writes its reply, this is still a true answer to the caller's
   * question - better than the rule-based bot's guess at a question it never
   * read (grumpy-sysop-bot.handler.ts, the tool-loop fallback).
   */
  toolResults: string[];
}

/** The cap when a caller names none - the same number the bot handler uses. */
const DEFAULT_PER_ROUND_MS = 12000;

function parseArgs(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  try { const v = JSON.parse(String(raw ?? '{}')); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}

/**
 * A TOOL CALL THE MODEL WROTE OUT AS TEXT.
 *
 * Not every model that advertises tools answers in `tool_calls`. Several of
 * the free OpenRouter models emit the call into `content` instead, wrapped in
 * their own control tokens:
 *
 *   <|tool_call_start|>[search_demozoo(kind='group', query='fairlight')]<|tool_call_end|>
 *
 * The loop read `tool_calls`, found nothing, and handed that string to the
 * caller as the reply - so the board answered a question about Fairlight with
 * its own control tokens, and the tool it had just asked for never ran
 * (reported live 2026-09-13).
 *
 * The model DID ask; we failed to hear it. This reads the dialect back into
 * the same shape a native `tool_calls` entry has, so one code path runs the
 * tool either way. Both argument forms are accepted: python keywords, and a
 * single JSON object.
 */
const TEXT_TOOL_CALL = /<\|tool_call(?:_start|_begin)\|>\s*\[?\s*([A-Za-z_][\w-]*)\s*\(([\s\S]*?)\)\s*\]?\s*<\|tool_call(?:_end|_close)\|>/g;

/** `kind='group', query="up rough"` -> an arguments object. */
function parseKeywordArgs(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    try { const v = JSON.parse(trimmed); if (v && typeof v === 'object') return v; } catch { /* fall through */ }
  }
  const args: Record<string, unknown> = {};
  const pair = /([A-Za-z_][\w-]*)\s*=\s*(?:'([^']*)'|"([^"]*)"|([^,]+))/g;
  for (let m = pair.exec(trimmed); m; m = pair.exec(trimmed)) {
    args[m[1]!] = (m[2] ?? m[3] ?? String(m[4] ?? '').trim()).trim();
  }
  return args;
}

export function toolCallsWrittenAsText(content: unknown): any[] {
  if (typeof content !== 'string' || !content.includes('tool_call')) return [];
  const out: any[] = [];
  TEXT_TOOL_CALL.lastIndex = 0;
  for (let m = TEXT_TOOL_CALL.exec(content); m; m = TEXT_TOOL_CALL.exec(content)) {
    out.push({ id: `text-${out.length}`, type: 'function', function: { name: m[1]!, arguments: parseKeywordArgs(m[2] ?? '') } });
  }
  return out;
}

/**
 * A caller reads a terminal, and no model's control tokens belong on it. This
 * is the last line of defence, not the fix: a dialect we DO parse never gets
 * here, and one we do not is at least not printed raw.
 */
export function withoutControlTokens(text: string): string {
  return text
    // A call's whole SPAN goes, body and all - what sits between the tokens is
    // the call the model made, not something it said to the caller.
    .replace(/<\|tool_call(?:_start|_begin)\|>[\s\S]*?<\|tool_call(?:_end|_close)\|>/g, '')
    // Then any lone token of a dialect nobody here parses, keeping the prose
    // around it - those wrap what the model is saying, not a call.
    .replace(/<\|[^|>]*\|>/g, '')
    .replace(/[^\S\r\n]{2,}/g, ' ')
    .trim();
}

export async function askWithTools(req: ToolLoopRequest): Promise<ToolLoopResult> {
  const messages = [...req.messages];
  const afters: Array<() => Promise<void>> = [];
  const calls: ToolLoopResult['calls'] = [];
  const toolResults: string[] = [];
  const definitions = toolDefinitions(req.tools);

  for (let round = 0; round <= MAX_ROUNDS; round++) {
    const left = req.deadline - Date.now();
    if (left < 500) {
console.log('[Tool loop] tool loop: out of time before the reply');
      return { text: null, truncated: false, afters, calls, toolResults };
    }
    const body: Record<string, unknown> = {
      model: req.model,
      messages,
      // The caller waits for every token a slow model generates, and a
      // co-sysop answers in a line or three.
      max_tokens: req.maxTokens ?? 400,
      temperature: req.temperature,
      ...(round < MAX_ROUNDS && definitions.length ? { tools: definitions, tool_choice: 'auto' } : {}),
    };
    // ONE ROUND MAY NOT SPEND THE WHOLE BUDGET. A model measured at 21.4 s
    // used to take all 35 s of a tool reply on its first answer and leave
    // nothing for the round that reads the tool's result - so the caller
    // waited half a minute and got the fallback line. Abandoned at the cap,
    // its cost is recorded and a faster model answers inside the same budget.
    const data = await req.post(body, Math.min(left, req.perRoundMs ?? DEFAULT_PER_ROUND_MS));
    // finish_reason belongs to the CHOICE, not to the message inside it. Read
    // off the message it is always undefined, so `truncated` was permanently
    // false and the continuation marker never fired: a reply cut off at
    // max_tokens simply stopped mid-sentence and the caller was never told
    // there was more to ask for.
    const choice = data?.choices?.[0];
    const message = choice?.message;
    if (!message) return { text: null, truncated: false, afters, calls, toolResults };

    const native: any[] = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    // A model that writes its call into `content` has still asked for a tool.
    const toolCalls: any[] = native.length ? native : toolCallsWrittenAsText(message.content);
    if (toolCalls.length === 0 || round === MAX_ROUNDS) {
      const cleaned = typeof message.content === 'string' ? withoutControlTokens(message.content) : '';
      const text = cleaned ? cleaned : null;
      return { text, truncated: choice.finish_reason === 'length', afters, calls, toolResults };
    }

    // The assistant's turn, tool calls and all, then one tool message per call.
    // The assistant's own turn goes back without its control tokens too: a
    // text-dialect call is already represented in `tool_calls` beside it, and
    // echoing the raw markup teaches the next round to answer in it again.
    const said = typeof message.content === 'string' ? withoutControlTokens(message.content) : '';
    messages.push({ role: 'assistant', content: said || null, tool_calls: toolCalls });
    for (const call of toolCalls) {
      const name = String(call?.function?.name ?? '');
      const args = parseArgs(call?.function?.arguments);
      const { outcome, result } = await runTool(req.ctx, name, args);
      calls.push({ name, args, outcome });
      if (result.after) afters.push(result.after);
      if (outcome === 'ok') toolResults.push(result.content);
      await auditToolCall(req.ctx.io, {
        pageId: req.ctx.page.id,
        userId: String(req.ctx.session.user?.id ?? ''),
        username: req.ctx.session.user?.username ?? '?',
        nodeId: req.ctx.session.nodeId ?? 0,
        tool: name,
        args,
        outcome,
        summary: result.content,
      });
      messages.push({ role: 'tool', tool_call_id: call?.id ?? name, content: asData(result.content) });
    }
  }
  return { text: null, truncated: false, afters, calls, toolResults };
}
