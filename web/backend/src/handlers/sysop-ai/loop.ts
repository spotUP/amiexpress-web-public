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
  temperature?: number;
  /** POST the chat/completions body; returns the parsed response data. */
  post: (body: Record<string, unknown>, timeoutMs: number) => Promise<any>;
}

export interface ToolLoopResult {
  text: string | null;
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

function parseArgs(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  try { const v = JSON.parse(String(raw ?? '{}')); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
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
console.log('[Grumpy Bot] tool loop: out of time before the reply');
      return { text: null, afters, calls, toolResults };
    }
    const body: Record<string, unknown> = {
      model: req.model,
      messages,
      max_tokens: 1000,
      temperature: req.temperature,
      ...(round < MAX_ROUNDS && definitions.length ? { tools: definitions, tool_choice: 'auto' } : {}),
    };
    const data = await req.post(body, left);
    const message = data?.choices?.[0]?.message;
    if (!message) return { text: null, afters, calls, toolResults };

    const toolCalls: any[] = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    if (toolCalls.length === 0 || round === MAX_ROUNDS) {
      const text = typeof message.content === 'string' && message.content.trim() ? message.content : null;
      return { text, afters, calls, toolResults };
    }

    // The assistant's turn, tool calls and all, then one tool message per call.
    messages.push({ role: 'assistant', content: message.content ?? null, tool_calls: toolCalls });
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
  return { text: null, afters, calls, toolResults };
}
