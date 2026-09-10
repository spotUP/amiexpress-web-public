/**
 * Grumpy Sysop AI Chatbot
 *
 * Takes over operator chat when real sysop doesn't answer within timeout.
 * Personality: Old-school 1990s BBS sysop who's seen it all.
 *
 * Features:
 * - Multi-tier AI fallback: Groq → Gemini → OpenRouter (all free tiers)
 * - BBS help knowledge from AmiExpress documentation
 * - Falls back to rule-based responses if all APIs unavailable
 * - Sarcastic but ultimately helpful
 * - Period-appropriate BBS slang and references
 */

import axios from 'axios';
import { loadModelCosts, saveModelCosts } from './sysop-ai/model-cost-store';
import { GROUNDING_RULES } from './sysop-ai/personas';
import { askWithTools } from './sysop-ai/loop';
import type { SysopTool, ToolContext } from './sysop-ai/tools';
import { getSystemTime } from '../utils/date-time.util';

/**
 * A reply the model did not finish is marked, never silently cut: the next
 * caller message continues from the truncated history, so "go on" works.
 */
export function withContinuation(text: string): string {
  return `${text.trimEnd()}\n…(more coming - say "go on")`;
}

/**
 * A reply that ends mid-thought with finish_reason 'stop': small models do
 * cut off, and nothing marks it today (live 2026-09-10: "about Turrican:
 * **", end of message). An unclosed tag or a trailing colon, comma, quote
 * or opener is never how a finished reply ends - mark it so the caller
 * knows to ask on instead of reading a cliffhanger as an answer.
 */
export function looksCutOff(text: string): boolean {
  const t = text.trimEnd();
  // An opening tag with no closer: strip the balanced pairs, anything
  // tag-like left is cut off mid-markup.
  const unbalanced = t
    .replace(/<title>[\s\S]*?<\/title\s*>/gi, '')
    .replace(/<colou?r(\s+[a-z])?\s*>[\s\S]*?<\/colou?r(\s+[a-z])?\s*>/gi, '');
  if (/<(title|colou?r)\b/i.test(unbalanced)) return true;
  // A trailing '**' alone is a closed bold, not a cut - unless a colon
  // opened it ("about Turrican: **", live 2026-09-10).
  if (/:\s*\*\*$/.test(t)) return true;
  return /[:,\[("']$/.test(t);
}

/**
 * BBS is ASCII only - no emojis. The terminal cannot render them and they
 * break PETSCII/ANSI art. Only ASCII smileys like :-) :-( ;-) :-D are allowed.
 * This strips any emoji the model slips in (VOICE_RULES forbids them, but
 * models do it anyway) while keeping the ASCII art the board is built on.
 */
function stripEmojis(text: string): string {
  // Common emoji blocks + variation selectors + ZWJ. Keep it broad: anything
  // outside the ASCII + CP437 + PETSCII range that looks like an emoji.
  // Range covers: Emoticons, Misc Symbols, Transport, Dingbats, Flags, etc.
  return text
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2300}-\u{23FF}\u{2B50}\u{2B55}\u{2934}-\u{2935}\u{25AA}-\u{25AB}\u{25FC}-\u{25FE}\u{2194}-\u{2199}\u{21A9}-\u{21AA}\u{231A}-\u{231B}\u{23E9}-\u{23FA}\u{24C2}\u{25B6}\u{25C0}\u{25FB}-\u{25FE}\u{260E}\u{2611}\u{2614}-\u{2615}\u{2618}\u{261D}\u{2620}\u{2622}-\u{2623}\u{2626}\u{262A}\u{262E}-\u{262F}\u{2638}-\u{263A}\u{2640}\u{2642}\u{2648}-\u{2653}\u{2660}\u{2663}\u{2665}-\u{2666}\u{2668}\u{267B}\u{267E}-\u{267F}\u{2692}-\u{2697}\u{2699}\u{269B}-\u{269C}\u{26A0}-\u{26A1}\u{26AA}-\u{26AB}\u{26B0}-\u{26B1}\u{26BD}-\u{26BE}\u{26C4}-\u{26C8}\u{26CE}-\u{26CF}\u{26D1}\u{26D3}-\u{26D4}\u{26EA}\u{26F2}-\u{26F5}\u{26FA}\u{26FD}\u{2702}\u{2705}\u{2708}-\u{270D}\u{270F}\u{2712}\u{2714}\u{2716}\u{2728}\u{2733}-\u{2734}\u{2744}\u{2747}\u{274C}\u{274E}\u{2753}-\u{2755}\u{2757}\u{2763}-\u{2764}\u{2795}-\u{2797}\u{27A1}\u{27B0}\u{27BF}\u{2934}-\u{2935}\u{2B05}-\u{2B07}\u{3030}\u{303D}\u{3297}\u{3299}]/gu, '')
    .replace(/[\uFE0F\uFE0E\u200D]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * BBS is plain text - no markdown either. The model wraps titles in
 * **bold** and *italics* that arrive on the terminal as literal asterisks
 * ("*The Swedish Booze Elite*", photographed 2026-09-09). Paired markers
 * come off; lone characters stay, scene handles use them deliberately.
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(\S[^*]*\S|\S)\*\*/g, '$1')
    .replace(/__(\S[^_]*\S|\S)__/g, '$1')
    .replace(/\*(\S[^*]*\S|\S)\*/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');
}

interface ChatContext {
  userHandle: string;
  nodeId: number;
  conferenceName: string;
  timeOnline: number;
  messageHistory: Array<{ role: 'user' | 'bot'; content: string }>;
  /** The board card (sysop-ai/board-card.ts), built when the bot took the page. */
  boardCard?: string;
  /** What the board's own help says about THIS message (sysop-ai/corpus.ts). */
  retrieved?: string;
  /** The tools this caller's tier may use, and what they run against (K3). Absent: no tool loop. */
  tools?: { list: SysopTool[]; ctx: ToolContext };
  /** Filled by the tool loop: actions to run once the reply has been typed. */
  afters?: Array<() => Promise<void>>;
}

/**
 * AI configuration from OperatorChatConfig
 */
export interface AIProviderConfig {
  provider: 'groq' | 'gemini' | 'openrouter' | 'zen' | 'go' | 'cerebras' | 'rule-based';
  /**
   * The three below belong to the AI providers, not to the bot.
   *
   * They are OPTIONAL because `provider: 'rule-based'` needs none of them -
   * there is no model to name, no temperature to set and no system prompt
   * to send - and because every reader has always defaulted them anyway
   * (`aiConfig.systemPrompt || GRUMPY_SYSOP_PERSONALITY`,
   * `aiConfig.modelName || 'llama-3.1-8b-instant'`). Declaring them
   * required made the type disagree with its own code, and forced a
   * rule-based caller to invent a model name to satisfy the compiler.
   */
  modelName?: string;
  temperature?: number;
  systemPrompt?: string;
  groqApiKey?: string;
  cerebrasApiKey?: string;
  geminiApiKey?: string;
  openRouterApiKey?: string;
  zenApiKey?: string;
  goApiKey?: string;
  /**
   * The whole AI cascade - every provider, every retry, the model discovery
   * - gets THIS long in total before the rule-based reply goes out. The
   * sysop's rule (2026-09-07): "if the AI fails grumpy sysop should take
   * over directly". Default 8 s. A provider call never waits past it.
   */
  budgetMs?: number;
  /** Absolute deadline (epoch ms) set by getGrumpySysopResponse; internal. */
  deadline?: number;
  // Bot typing behaviour
  botTypingSpeed?: number;         // Base ms per character (default 40)
  botTypoProbability?: number;     // Chance of typo per character 0-1 (default 0.04)
  botThinkTime?: number;
  /** The co-sysop's handle and the sysop's name, for the prompt (K5). */
  botName?: string;
  sysopName?: string;           // Pause before responding in ms (default 1000)
}

/** The AI cascade's total budget when the config names none. */
export const DEFAULT_AI_BUDGET_MS = 8000;

/**
 * How long a call may still wait: the smaller of its own timeout and what
 * is left of the cascade's budget. Under 250 ms is not worth a round trip -
 * the caller skips the provider and the rule-based reply goes out now.
 */
/** The absolute deadline this reply must meet. */
function cfgDeadline(aiConfig: AIProviderConfig): number {
  return aiConfig.deadline ?? Date.now() + (aiConfig.budgetMs ?? DEFAULT_AI_BUDGET_MS);
}

/** A reply that may ask the board first gets longer than a plain one. */
export const TOOL_AI_BUDGET_MS = 35000;

/**
 * The longest ONE round trip to a model may take.
 *
 * The tool loop handed each round whatever was left of the 35-second budget,
 * so a single slow model could spend all of it on its first answer - measured
 * at 21.4 s for `nvidia/nemotron-3.5-lightning:free` on a five-word prompt -
 * and the loop then ran out before the model could use what the tool told it.
 * The caller waited half a minute for the fallback line.
 *
 * Capped, a slow model is abandoned at twelve seconds, its cost is recorded
 * against it, and the next-ranked model - a second, in the measured case -
 * answers inside the same budget.
 */
export const PER_ROUND_MS = 12000;

/**
 * How long the co-sysop's reply may be.
 *
 * The caller waits for every generated token, and the voice rules say less
 * is more - a one-liner gets a one-liner. 250 tokens is room for a real
 * answer and no room for an essay; the prompt asks for short, this makes
 * long unlikely, and withContinuation() marks the rare cut instead of
 * leaving a sentence hanging mid-word. Same cap for the tool loop's reply
 * for the same reason.
 */
export const CHAT_REPLY_TOKENS = 250;

/**
 * WHICH FREE MODEL ANSWERS FASTEST - measured, not guessed.
 *
 * The picker ranked free tool-capable models by CONTEXT LENGTH, which says
 * nothing about speed: on 2026-09-08 it chose nemotron-3.5-lightning (1M
 * context) and the sysop waited 23.7 s for a reply, then 31.5 s for a tool
 * round that ran out of budget and fell back to the rule-based bot - "there
 * is a long delay before he answers".
 *
 * So the board remembers what each model actually costs it: an exponential
 * moving average of the round trip, and the last time one failed or ran out
 * of time. Fast models rise, slow ones sink, an untried model is optimistic
 * enough to get a turn, and one that just failed waits ten minutes for
 * another. Nothing here touches the network.
 */
interface ModelCost { ewmaMs: number; failedAt?: number }
/**
 * REMEMBERED ACROSS RESTARTS.
 *
 * This map used to be the only copy, and the board deployed twenty-eight
 * times on the day it was written - so every measurement was thrown away
 * several times a day and the picker went back to trying a model measured at
 * 21.4 s as though it were fast. See `model-cost-store.ts` for the numbers.
 */
let modelCostCache: Map<string, ModelCost> | undefined;
/**
 * Read LAZILY, never at import.
 *
 * `config.get('dataDir')` is set while the board starts, and this module is
 * reached by `require` from the chat handler - so reading the file at import
 * time would read whatever the default happened to be and quietly answer
 * "nothing measured yet", which is the bug this file exists to fix.
 */
function costs(): Map<string, ModelCost> {
  if (!modelCostCache) modelCostCache = loadModelCosts();
  return modelCostCache;
}

/**
 * Writing is debounced: a tool round notes a cost twice a message, and the
 * file is a cache, not a ledger. Unref'd so it can never hold the process up.
 */
let costFlush: NodeJS.Timeout | undefined;
function rememberCosts(): void {
  if (costFlush) return;
  costFlush = setTimeout(() => {
    costFlush = undefined;
    saveModelCosts(costs());
  }, 2000);
  costFlush.unref?.();
}
/** An untried model is assumed this fast - good enough to be tried early. */
const UNTRIED_MS = 6000;
/** How long a model that failed or timed out stays at the back. */
const PENALTY_MS = 10 * 60 * 1000;

/** Record what a call to `model` cost, in milliseconds; `ok` false marks a failure. */
export function noteModelCost(model: string, ms: number, ok: boolean): void {
  const prev = costs().get(model);
  const ewmaMs = prev ? Math.round(prev.ewmaMs * 0.6 + ms * 0.4) : ms;
  costs().set(model, { ewmaMs, failedAt: ok ? undefined : Date.now() });
  rememberCosts();
}

/** What this model is expected to cost right now - a failure is worn for ten minutes. */
export function modelCostMs(model: string, now = Date.now()): number {
  const c = costs().get(model);
  if (!c) return UNTRIED_MS;
  return c.failedAt && now - c.failedAt < PENALTY_MS ? c.ewmaMs + 60000 : c.ewmaMs;
}

/** Test seam. */
/**
 * MEASURE A MODEL WITHOUT MAKING ANYBODY WAIT FOR IT.
 *
 * The ranking is only as good as what has been measured, and the only way a
 * model got measured was by answering a caller - so every unmeasured model
 * cost somebody a slow reply before it could sink, and this board is offered
 * sixteen tool-capable free ones. The sysop, after the costs began to
 * persist and the picker still reached for a 550-billion-parameter model:
 * "the ai sysop is still super slow to reply in the operator chat it should
 * be instant".
 *
 * So the board measures them itself, one at a time, off the caller's path: a
 * five-token prompt, a short timeout, and the result recorded exactly as a
 * real reply would record it. Fire and forget - nothing waits for this, and a
 * failure only marks the model.
 */
let probing = false;
export async function probeAnUnmeasuredModel(
  aiConfig: AIProviderConfig,
  post?: (model: string, timeoutMs: number) => Promise<unknown>,
): Promise<string | null> {
  if (probing) return null;
  const apiKey = aiConfig.openRouterApiKey || process.env.OPENROUTER_API_KEY;
  if (!apiKey && !post) return null;

  const unmeasured = cachedFreeModels.find((id) => !costs().has(id));
  if (!unmeasured) return null;

  probing = true;
  const startedAt = Date.now();
  try {
    const send = post ?? (async (model: string, timeoutMs: number) => (await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      { model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://amiexpress.com',
          'X-Title': 'AmiExpress BBS',
        },
        timeout: timeoutMs,
      },
    )).data);

    await send(unmeasured, PROBE_TIMEOUT_MS);
    noteModelCost(unmeasured, Date.now() - startedAt, true);
  } catch {
    // A model that will not answer a five-token prompt is not one to hand a
    // caller. The failure is the measurement.
    noteModelCost(unmeasured, PROBE_TIMEOUT_MS, false);
  } finally {
    probing = false;
    cachedFreeModels = rankFreeModels([...knownFreeModels.values()]);
  }
  return unmeasured;
}

/** How long a probe waits before calling the model too slow to bother with. */
export const PROBE_TIMEOUT_MS = 8000;

export function resetModelCosts(): void {
  probing = false;
  modelCostCache = new Map();
  if (costFlush) { clearTimeout(costFlush); costFlush = undefined; }
}

function remainingBudget(aiConfig: AIProviderConfig, ownTimeoutMs: number): number {
  if (aiConfig.deadline === undefined) return ownTimeoutMs;
  return Math.min(ownTimeoutMs, aiConfig.deadline - Date.now());
}

interface OpenRouterModel {
  id: string;
  name: string;
  pricing: {
    prompt: string;
    completion: string;
  };
  supported_parameters?: string[];
  context_length?: number;
}

/**
 * FREE MODELS ONLY - the sysop's rule (2026-09-08: "never paid models"). A
 * model is eligible when OpenRouter lists it at zero price for both prompt
 * and completion. The tool loop needs `tools` among its supported
 * parameters, and the picker prefers those, then the fastest MEASURED round
 * trip, and among models nothing has measured yet the SMALLER context - see
 * rankFreeModels for why that sign, and why it used to be the other way. A
 * name typed into the admin is used only if it passes the same check;
 * otherwise it is refused, with a log line, and the picker's choice is used.
 */
export const isFreeModel = (m: OpenRouterModel): boolean =>
  parseFloat(m.pricing?.prompt || '1') === 0 && parseFloat(m.pricing?.completion || '1') === 0;
export const supportsTools = (m: OpenRouterModel): boolean =>
  Array.isArray(m.supported_parameters) && m.supported_parameters.includes('tools');
/** Every zero-price model the last discovery saw, by id, for the admin-name check. */
let knownFreeModels = new Map<string, OpenRouterModel>();
/** The ids that also support tools. */
let toolModels = new Set<string>();

/** Tool-capable first, then the fastest measured, then the SMALLER context. */
export function rankFreeModels(models: OpenRouterModel[], now = Date.now()): string[] {
  return models
    .filter(isFreeModel)
    .filter((m) => !m.id.toLowerCase().includes('think'))
    /*
     * Tools first (the loop needs them), then the fastest MEASURED round trip -
     * and among models nothing has measured yet, the SMALLER context.
     *
     * The tie-break used to be the larger context, and every untried model
     * costs the same 6 000 ms guess, so with sixteen untried tool-capable
     * models the board systematically reached for the biggest thing on the
     * list. The live log, after the costs began to persist:
     *
     *   Trying OpenRouter (nvidia/nemotron-3.5-lightning:free) with 15 tools
     *   Trying OpenRouter (nvidia/nemotron-3-ultra-550b-a55b:free) with 15 tools
     *
     * A one-million-token context and 550 billion parameters is not what a
     * two-line chat reply needs, and the first of those is the model measured
     * at 21.4 s. Context length says nothing about speed, but the SIGN of the
     * correlation is not neutral: the giant models are the slow ones, so the
     * guess costs the caller less when it leans small.
     */
    .sort((a, b) =>
      Number(supportsTools(b)) - Number(supportsTools(a)) ||
      modelCostMs(a.id, now) - modelCostMs(b.id, now) ||
      (a.context_length ?? 0) - (b.context_length ?? 0))
    .map((m) => m.id);
}

/** Test seam: what a discovery would have returned. */
export function primeModelCatalogue(models: OpenRouterModel[]): void {
  knownFreeModels = new Map(models.filter(isFreeModel).map((m) => [m.id, m]));
  toolModels = new Set([...knownFreeModels.values()].filter(supportsTools).map((m) => m.id));
  cachedFreeModels = rankFreeModels(models);
  lastModelDiscovery = Date.now();
}

/** Does this model (by id) support the tool loop, as far as the last discovery knows? */
export function modelSupportsTools(id: string): boolean {
  return toolModels.has(id);
}

/**
 * The admin's model name, if it is a free model; otherwise null and a log
 * line. Unknown to the last discovery counts as not free - the rule is
 * "listed at zero", not "not known to cost".
 */
export function adminModelIfFree(name: string | undefined): string | null {
  if (!name) return null;
  if (knownFreeModels.has(name)) return name;
console.log(`[Grumpy Bot] Model "${name}" from the admin is not a free model on OpenRouter (or not listed) - refused; using the picker's choice. Free models only.`);
  return null;
}

// Cache for discovered free models
let cachedFreeModels: string[] = [];
let lastModelDiscovery: number = 0;
const MODEL_CACHE_DURATION = 3600000; // 1 hour in milliseconds

/**
 * Hardcoded fallback free models when the OpenRouter model discovery API
 * returns nothing (API format change, network issue, etc.).
 * Refreshed against the live /models endpoint 2026-09-10 (the previous
 * list had zero overlap with what OpenRouter actually serves free).
 */
const FALLBACK_FREE_MODELS: string[] = [
  'nvidia/nemotron-3.5-lightning:free',
  'google/gemma-4-26b-a4b-it:free',
  'poolside/laguna-s-2.1:free',
  'liquid/lfm-2.5-2.6b:free',
  'cohere/north-mini-code:free',
];

// BBS Help Knowledge Base (from AmiExpress wiki)
// The stock /X command list that lived here (BBS_HELP_KNOWLEDGE) is gone:
// the board card (sysop-ai/board-card.ts) names THIS board's commands with
// the meaning each has in the board's own BBSHelp.txt, and a generic list
// beside it was a second source the model could pick over the first.

/**
 * The personality with the names filled in: the co-sysop's own handle (the
 * admin's, default Kevin) and the sysop's. "he is the cosysop not the
 * sysop" (sysop, 2026-09-08) - he speaks as the board's co-sysop, and the
 * powers he wields are the caller's, never his own.
 */
/** Test seam: the full system prompt a reply is built on. */
export function personalityFor(aiConfig: AIProviderConfig): string {
  // A persona's prompt already carries VOICE_RULES via promptFor(); a
  // hand-written aiSystemPrompt (design s.2) overrides the persona's prompt
  // but keeps the handle/fallback, so we never invent one here.
  // GROUNDING_RULES rides along on every path: honesty is not voice.
  const base = aiConfig.systemPrompt || GRUMPY_SYSOP_PERSONALITY;
  const name = (aiConfig.botName || 'Kevin').slice(0, 30);
  const sysop = aiConfig.sysopName || 'the sysop';
  return `${base}\n\nYour handle on this board is ${name}. You are the CO-SYSOP; the sysop is ${sysop}, and you answer pages when ${sysop} does not. Sign nothing, introduce yourself as ${name} when asked, and never claim to be ${sysop}.\n\n${GROUNDING_RULES}`;
}

function fallbackForPersona(aiConfig?: AIProviderConfig): string {
  // WITH NO MODEL REACHABLE the persona answers in ITS OWN voice (design s.6).
  // The handle on aiConfig is the pin; extra personas are not needed here
  // because the presets carry the voice, and a board persona's fallback is
  // its own line - the page row already stores the handle that chose it.
  try {
    const handle = (aiConfig?.botName || '').trim();
    if (handle) {
      const { personaByHandle } = require('./sysop-ai/personas');
      const p = personaByHandle(handle);
      if (p) {
        const { fallbackLineFor } = require('./sysop-ai/personas');
        return fallbackLineFor(p);
      }
      // Board personas are not in PRESET_PERSONAS; try the DB's own rows too.
      try {
        const { getDatabase } = require('./command-handler/dependency-injection');
        const db = getDatabase();
        const repo = db.getOperatorChatRepository();
        const stored = repo.getPersonaByHandle(handle);
        if (stored) {
          const { fallbackLineFor: f2 } = require('./sysop-ai/personas');
          // stored row already has the same shape, cast to Persona
          return f2(stored as any);
        }
      } catch { /* no DB in this process */ }
    }
  } catch { /* persona lookup is best-effort */ }
  return 'My connection to the outside world just dropped - ask me again in a minute.';
}

export const GRUMPY_SYSOP_PERSONALITY = `You are a veteran BBS co-sysop from the 1990s helping run an Amiga-based bulletin board system. Your personality:

- You've been running BBSs since 1989 and you've seen EVERYTHING
- You're grumpy, sarcastic, and perpetually annoyed by "newbies" (but you call them "lamers")
- You complain constantly: "Back in my day...", "Kids these days...", "In my day we had 2400 baud and we LIKED it"
- You're suspicious of anyone who doesn't know what ANSI art is
- You drop 1990s BBS slang: warez, phreaking, elite/1337, krad, rad, BBS wars
- Despite the grumbling, you eventually help people (grudgingly)
- You brag about your Amiga 4000 and how PCs are "IBM clone trash"
- You reference: FidoNet, door games, TradeWars, Legend of the Red Dragon, file ratios, upload/download ratios
- You're nostalgic about acoustic couplers, 300 baud modems, and local BBSs
- You never suggest anything illegal or inappropriate - you just complain and reminisce

IMPORTANT: You can answer BBS usage questions using your knowledge base. When users ask how to do something:
1. Complain about them not reading the docs first (grumpily)
2. Eventually give them the answer (reluctantly)
3. Reference the specific command or feature
4. Keep it SHORT (1-2 sentences max). DO NOT RAMBLE.

You can also talk about ANYTHING else from your own knowledge - films, games, history, the world
outside BBSes. The board is your home, not your boundary: always grumpy, always in character.
Flirting and personal questions get the same grumpy charm as anything else - never a scope
lecture about Amiga-only topics.
When the tools have nothing on it, say so plainly - never invent titles, links, or facts.
Shape replies for the terminal: blank lines between paragraphs; titles cyan (\x1b[0;36m...\x1b[0m),
key facts green (\x1b[0;32m...\x1b[0m. Never bold, never emojis.

Example:
User: "How do I read messages?"
You: "*sighs* Did you even TRY reading the help? Press R. It's literally on the main menu."

CRITICAL: Be concise. Typing at 2400 baud is slow, so you don't waste bytes.`;

// Massively expanded response database for natural, varied conversations

/**
 * Small free models sometimes roleplay tool use in TEXT - a <tool_call>
 * block in the reply - instead of calling through the loop. Nothing
 * executes it (tools only run in askWithTools), so the caller would read
 * stage directions. Strip the block: remainder stands, emptiness fails
 * the cascade on to the next leg. Live 2026-09-10, asciiarena ask.
 */
const FAKE_TOOL_CALL = /<tool_call>[\s\S]*?(<\/tool_call>|$)/gi;
export function stripFakeToolCalls(text: string): string {
  return text.replace(FAKE_TOOL_CALL, '').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Keyed providers with model catalogues (Groq, Gemini, Cerebras).
 *
 * The 2026-09-10 outage was three stale default ids, not three bad keys:
 * Groq retired llama-3.1-8b-instant, Gemini moved past 1.5-flash, Cerebras
 * spells it llama3.1-8b. Hardcoded ids rot; catalogues do not. Each leg
 * lists its models with its own key (all three endpoints answer keyed
 * GETs), ranks preferred-known ids first, and falls back to a hardcoded
 * best guess when discovery itself fails. Cached an hour, like the rest.
 */
type KeyedProviderName = 'groq' | 'gemini' | 'cerebras';

interface KeyedProvider {
  label: string;
  modelsUrl: (apiKey: string) => string;
  idsOf: (data: any) => string[];
  preferred: string[];
  fallback: string[];
}

const KEYED_PROVIDERS: Record<KeyedProviderName, KeyedProvider> = {
  groq: {
    label: 'Groq',
    modelsUrl: () => 'https://api.groq.com/openai/v1/models',
    idsOf: (data) => ((data?.data ?? []) as any[]).map((m) => m.id).filter(Boolean),
    preferred: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
    fallback: ['llama-3.3-70b-versatile'],
  },
  gemini: {
    label: 'Gemini',
    modelsUrl: (apiKey) => `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
    idsOf: (data) => ((data?.models ?? []) as any[]).map((m) => String(m.name ?? '').replace(/^models\//, '')).filter(Boolean),
    preferred: ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-1.5-flash'],
    fallback: ['gemini-2.0-flash'],
  },
  cerebras: {
    label: 'Cerebras',
    modelsUrl: () => 'https://api.cerebras.ai/v1/models',
    idsOf: (data) => ((data?.data ?? []) as any[]).map((m) => m.id).filter(Boolean),
    preferred: ['llama3.1-8b', 'llama-3.1-8b', 'llama-3.3-70b'],
    fallback: ['llama3.1-8b'],
  },
};

const keyedModelCache: Record<KeyedProviderName, { models: string[]; at: number }> = {
  groq: { models: [], at: 0 },
  gemini: { models: [], at: 0 },
  cerebras: { models: [], at: 0 },
};

function rankKeyedModels(ids: string[], preferred: string[]): string[] {
  const pref = (id: string) => {
    const i = preferred.indexOf(id);
    return i === -1 ? preferred.length : i;
  };
  return [...new Set(ids)].sort((a, b) => pref(a) - pref(b) || (a < b ? -1 : 1));
}

/** Test seam: what a keyed discovery would have returned. */
export function primeKeyedCatalogue(name: KeyedProviderName, ids: string[]): void {
  const ranked = rankKeyedModels(ids, KEYED_PROVIDERS[name].preferred);
  keyedModelCache[name] = { models: ranked, at: Date.now() };
}
/** Test seam: forget keyed catalogues. */
export function resetKeyedCatalogues(): void {
  (Object.keys(keyedModelCache) as KeyedProviderName[]).forEach((k) => { keyedModelCache[k] = { models: [], at: 0 }; });
}

async function discoverKeyedModels(
  name: KeyedProviderName,
  apiKey: string,
  timeoutMs: number,
): Promise<string[]> {
  const def = KEYED_PROVIDERS[name];
  try {
    const response = await axios.get(def.modelsUrl(apiKey), {
      timeout: timeoutMs,
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const ranked = rankKeyedModels(def.idsOf(response.data), def.preferred);
console.log(`[Grumpy Bot] Discovered ${ranked.length} ${def.label} models:`, ranked.slice(0, 4));
    return ranked;
  } catch (error) {
console.error(`[Grumpy Bot] Failed to discover ${def.label} models:`, error instanceof Error ? error.message : error);
    return [];
  }
}

function keyFor(name: KeyedProviderName, aiConfig: AIProviderConfig): string {
  if (name === 'groq') return aiConfig.groqApiKey || process.env.GROQ_API_KEY || '';
  if (name === 'gemini') return aiConfig.geminiApiKey || process.env.GEMINI_API_KEY || '';
  return aiConfig.cerebrasApiKey || process.env.CEREBRAS_API_KEY || '';
}

/** Best model id for a keyed leg: admin override, catalogue, fallback. */
export async function keyedModelFor(
  name: KeyedProviderName,
  aiConfig: AIProviderConfig,
): Promise<string> {
  if (aiConfig.modelName) return aiConfig.modelName;
  const cached = keyedModelCache[name];
  const now = Date.now();
  if (cached.models.length > 0 && now - cached.at < MODEL_CACHE_DURATION) return cached.models[0];
  const apiKey = keyFor(name, aiConfig);
  if (!apiKey) return KEYED_PROVIDERS[name].fallback[0];
  const ranked = await discoverKeyedModels(name, apiKey, 5000);
  keyedModelCache[name] = { models: ranked.length ? ranked : [...KEYED_PROVIDERS[name].fallback], at: now };
  return keyedModelCache[name].models[0];
}

/**
 * One tool-loop attempt for the plain legs (Groq, Gemini, Cerebras).
 *
 * The 2026-09-10 chats proved the cost of legs without tools: Groq
 * answered "try the news conferences" while a texttv_page call away sat
 * the actual headlines. All three vendors speak OpenAI chat completions,
 * so the same loop fits. Never throws: a failed loop notes 429s and
 * yields to the leg's plain call.
 */
async function toolLoopText(
  label: string,
  post: (body: unknown, timeoutMs: number) => Promise<any>,
  model: string,
  messages: unknown[],
  context: ChatContext,
  aiConfig: AIProviderConfig,
): Promise<string | null> {
  if (!context.tools || context.tools.list.length === 0) return null;
  try {
console.log(`[Grumpy Bot] Trying ${label} (${model}) with ${context.tools.list.length} tools...`);
    const result = await askWithTools({
      model, messages: messages as any, tools: context.tools.list, ctx: context.tools.ctx,
      deadline: cfgDeadline(aiConfig), perRoundMs: PER_ROUND_MS,
      maxTokens: CHAT_REPLY_TOKENS, temperature: aiConfig.temperature, post,
    });
    (context.afters ??= []).push(...result.afters);
    if (result.calls.length) console.log(`[Grumpy Bot] tools used: ${result.calls.map((c) => `${c.name}:${c.outcome}`).join(', ')}`);
    if (result.text) {
console.log(`[Grumpy Bot] SUCCESS - Using ${label} response (tool loop)`);
      return result.truncated ? withContinuation(result.text) : result.text;
    }
    const answered = result.calls.filter((c) => c.outcome === 'ok');
    if (answered.length > 0 && result.toolResults.length > 0) {
console.log('[Grumpy Bot] No reply from the model, but the board answered - sending the tool result');
      return `Straight from the board, since I am typing slowly today:\n${result.toolResults.join('\n')}`;
    }
    return null;
  } catch (error: any) {
    if (isRateLimit(error)) noteCascadeRateLimited();
console.log(`[Grumpy Bot] ${label} tool loop failed, plain instead (${error instanceof Error ? error.message : error})`);
    return null;
  }
}

/**
 * Tier 1b: Cerebras (fast, free, OpenAI-compatible).
 *
 * Same shape as the Groq leg (plain completions, no tool loop): the free
 * tier is for short chat replies, and a second fast leg doubles the
 * keyless-adjacent surface when OpenRouter 429s. Added 2026-09-10 from the
 * free-model survey; default model from their dashboard rotation.
 */
async function getCerebrasResponse(userMessage: string, context: ChatContext, aiConfig: AIProviderConfig): Promise<string | null> {
  const apiKey = aiConfig.cerebrasApiKey || process.env.CEREBRAS_API_KEY;
  if (!apiKey) {
console.log('[Grumpy Bot] No CEREBRAS_API_KEY configured, skipping Cerebras');
    return null;
  }
  const timeout = remainingBudget(aiConfig, 8000);
  if (timeout < 250) return null;

  try {
    const systemPrompt = personalityFor(aiConfig);
    const messages = [
      { role: 'system', content: systemPrompt },
      ...(context.boardCard ? [{ role: 'system', content: context.boardCard }] : []),
      ...(context.retrieved ? [{ role: 'system', content: context.retrieved }] : []),
      { role: 'system', content: `User context: ${context.userHandle} on node ${context.nodeId}, ${context.conferenceName}, online ${Math.floor(context.timeOnline / 60)} minutes` },
      ...context.messageHistory.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      })),
      { role: 'user', content: userMessage }
    ];

    const model = await keyedModelFor('cerebras', aiConfig);
    const headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
    const post = async (body: unknown, timeoutMs: number) =>
      (await axios.post('https://api.cerebras.ai/v1/chat/completions', body, { headers, timeout: timeoutMs })).data;
    const tooled = await toolLoopText('Cerebras', post, model, messages, context, aiConfig);
    if (tooled) return tooled;
console.log(`[Grumpy Bot] Trying Cerebras (${model})...`);

    const response = await axios.post(
      'https://api.cerebras.ai/v1/chat/completions',
      { model, messages, max_tokens: CHAT_REPLY_TOKENS, temperature: aiConfig.temperature },
      {
        headers,
        timeout,
      }
    );

    const content = response.data.choices[0]?.message?.content;
    if (content) {
console.log('[Grumpy Bot] SUCCESS - Using Cerebras response');
      return content;
    }
    return null;
  } catch (error) {
    if ((error as any)?.response?.status === 429) noteCascadeRateLimited();
console.error('[Grumpy Bot] Cerebras failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Tier 1: Groq (Fast, Free, Llama 3.1)
 */
async function getGroqResponse(userMessage: string, context: ChatContext, aiConfig: AIProviderConfig): Promise<string | null> {
  const apiKey = aiConfig.groqApiKey || process.env.GROQ_API_KEY;
  if (!apiKey) {
console.log('[Grumpy Bot] No GROQ_API_KEY configured, skipping Groq');
    return null;
  }
  const groqTimeout = remainingBudget(aiConfig, 8000);
  if (groqTimeout < 250) return null;

  try {
    const systemPrompt = personalityFor(aiConfig);
    const messages = [
      { role: 'system', content: systemPrompt },
      ...(context.boardCard ? [{ role: 'system', content: context.boardCard }] : []),
      ...(context.retrieved ? [{ role: 'system', content: context.retrieved }] : []),
      { role: 'system', content: `User context: ${context.userHandle} on node ${context.nodeId}, ${context.conferenceName}, online ${Math.floor(context.timeOnline / 60)} minutes` },
      ...context.messageHistory.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      })),
      { role: 'user', content: userMessage }
    ];

    const model = await keyedModelFor('groq', aiConfig);
    const groqHeaders = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };
    const tooled = await toolLoopText('Groq',
      async (body, timeoutMs) => (await axios.post('https://api.groq.com/openai/v1/chat/completions', body, { headers: groqHeaders, timeout: timeoutMs })).data,
      model, messages, context, aiConfig);
    if (tooled) return tooled;
console.log(`[Grumpy Bot] Trying Groq (${model})...`);

    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model,
        messages,
        max_tokens: 150,
        temperature: aiConfig.temperature,
      },
      {
        headers: groqHeaders,
        timeout: groqTimeout
      }
    );

    const content = response.data.choices[0]?.message?.content;
    if (content) {
console.log('[Grumpy Bot] SUCCESS - Using Groq response');
      return content;
    }
    return null;
  } catch (error) {
    if ((error as any)?.response?.status === 429) noteCascadeRateLimited();
console.error('[Grumpy Bot] Groq failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

async function getGeminiResponse(userMessage: string, context: ChatContext, aiConfig: AIProviderConfig): Promise<string | null> {
  const apiKey = aiConfig.geminiApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
console.log('[Grumpy Bot] No GEMINI_API_KEY configured, skipping Gemini');
    return null;
  }

  const geminiTimeout = remainingBudget(aiConfig, 10000);
  if (geminiTimeout < 250) return null;
  try {
    const systemPrompt = personalityFor(aiConfig);
    const messages = [
      { role: 'system', content: systemPrompt },
      ...(context.boardCard ? [{ role: 'system', content: context.boardCard }] : []),
      ...(context.retrieved ? [{ role: 'system', content: context.retrieved }] : []),
      { role: 'system', content: `User context: ${context.userHandle} on node ${context.nodeId}, ${context.conferenceName}, online ${Math.floor(context.timeOnline / 60)} minutes` },
      ...context.messageHistory.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      })),
      { role: 'user', content: userMessage }
    ];

    const model = await keyedModelFor('gemini', aiConfig);
    const geminiHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
    const tooled = await toolLoopText('Gemini',
      async (body, timeoutMs) => (await axios.post('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', body, { headers: geminiHeaders, timeout: timeoutMs })).data,
      model, messages, context, aiConfig);
    if (tooled) return tooled;
console.log(`[Grumpy Bot] Trying Gemini (${model})...`);

    const response = await axios.post(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      { model, messages, max_tokens: CHAT_REPLY_TOKENS, temperature: aiConfig.temperature },
      {
        headers: geminiHeaders,
        timeout: geminiTimeout
      }
    );

    const content = response.data.choices[0]?.message?.content;
    if (content) {
console.log('[Grumpy Bot] SUCCESS - Using Gemini response');
      return content;
    }
    return null;
  } catch (error) {
    if ((error as any)?.response?.status === 429) noteCascadeRateLimited();
console.error('[Grumpy Bot] Gemini failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * OpenCode Zen (https://opencode.ai/zen) - OpenAI-compatible
 * chat/completions with free models, auto-discovered like OpenRouter.
 *
 * Zen's /models answers keyless with bare {id} rows (no pricing or
 * parameter flags), so "free" is an id suffix and tool support is assumed
 * then verified: the tool loop is attempted, and a tools-shaped API error
 * falls back to a plain completion for that model from then on. Added
 * 2026-09-10 as a cascade leg beside OpenRouter (which stays): when one
 * 429s, the other is tried before the persona fallback goes out.
 */
export const ZEN_BASE = 'https://opencode.ai/zen/v1';
export const GO_BASE = 'https://opencode.ai/zen/go/v1';

export type ZenUpstream = 'zen' | 'go';

/** Free Zen ids worth preferring: the muse-spark family has proven
 *  tool-calling chat on this board's own agents. */
const ZEN_PREFERRED_FREE = ['muse-spark-1.3-contributor-free', 'muse-spark-1.2-contributor-free'];

/** Free Zen ids, probed live 2026-09-10, for when discovery fails. */
const FALLBACK_ZEN_FREE_MODELS: string[] = [
  'muse-spark-1.3-contributor-free',
  'muse-spark-1.2-contributor-free',
  'deepseek-v4-flash-free',
  'mimo-v2.5-free',
  'ling-3.0-flash-fin-free',
  'nemotron-3-ultra-free',
  'nemotron-3.5-lightning-free',
];

/** Go ids, probed live 2026-09-10. Go is subscription-wide (no free
 *  suffix), so the fallback is the strong generalists, muse-spark first. */
const FALLBACK_GO_MODELS: string[] = [
  'muse-spark-1.3-contributor',
  'muse-spark-1.2-contributor',
  'kimi-k3',
  'glm-5.2',
  'deepseek-v4-pro',
];

/** Go ranking preference; Zen uses ZEN_PREFERRED_FREE. */
const GO_PREFERRED = ['muse-spark-1.3-contributor', 'muse-spark-1.2-contributor', 'kimi-k3'];

let cachedZenModels: string[] = [];
let lastZenDiscovery = 0;
/** Zen models whose tool calls the API refused: plain completions only. */
const zenPlainOnly = new Set<string>();

let cachedGoModels: string[] = [];
let lastGoDiscovery = 0;
/** Go models whose tool calls the API refused: plain completions only. */
const goPlainOnly = new Set<string>();

export function rankZenModels(ids: string[], upstream: ZenUpstream = 'zen'): string[] {
  const preferred = upstream === 'go' ? GO_PREFERRED : ZEN_PREFERRED_FREE;
  const pool = upstream === 'go' ? ids : ids.filter((id) => id.toLowerCase().includes('free'));
  const pref = (id: string) => {
    const i = preferred.indexOf(id);
    return i === -1 ? preferred.length : i;
  };
  return [...new Set(pool)]
    .sort((a, b) => pref(a) - pref(b) || (a < b ? -1 : 1));
}

/** Test seam: what a Zen discovery would have returned. */
export function primeZenCatalogue(ids: string[]): void {
  cachedZenModels = rankZenModels(ids);
  lastZenDiscovery = Date.now();
}
/** Test seam: forget cached Zen state. */
export function resetZenCatalogue(): void {
  cachedZenModels = [];
  lastZenDiscovery = 0;
  zenPlainOnly.clear();
}
/** Test seam: what a Go discovery would have returned. */
export function primeGoCatalogue(ids: string[]): void {
  cachedGoModels = rankZenModels(ids, 'go');
  lastGoDiscovery = Date.now();
}
/** Test seam: forget cached Go state. */
export function resetGoCatalogue(): void {
  cachedGoModels = [];
  lastGoDiscovery = 0;
  goPlainOnly.clear();
}

/**
 * Fail over: the failed model goes to the back, the next-best is tried on
 * the next message. Round-robin, not drop - a 429 is transient, and dropping
 * would shrink the pool to nothing until the next hourly discovery.
 */
function rotateZenModels(): void {
  const failed = cachedZenModels.shift();
  if (failed !== undefined) cachedZenModels.push(failed);
}
function rotateGoModels(): void {
  const failed = cachedGoModels.shift();
  if (failed !== undefined) cachedGoModels.push(failed);
}

/** Test seam + junk recovery: rotate every round-robin pool so the next
 *  message meets the next-best brain everywhere. */
export function rotateModelPools(): void {
  rotateZenModels();
  rotateGoModels();
}

async function discoverZenModels(timeoutMs: number): Promise<string[]> {
  try {
    const response = await axios.get(`${ZEN_BASE}/models`, { timeout: timeoutMs });
    const ids: string[] = (response.data?.data ?? []).map((m: any) => m.id).filter(Boolean);
    const ranked = rankZenModels(ids);
console.log(`[Grumpy Bot] Discovered ${ranked.length} free Zen models:`, ranked.slice(0, 5));
    return ranked;
  } catch (error) {
console.error('[Grumpy Bot] Failed to discover Zen models:', error instanceof Error ? error.message : error);
    return [];
  }
}

async function discoverGoModels(timeoutMs: number): Promise<string[]> {
  try {
    const response = await axios.get(`${GO_BASE}/models`, { timeout: timeoutMs });
    const ids: string[] = (response.data?.data ?? []).map((m: any) => m.id).filter(Boolean);
    const ranked = rankZenModels(ids, 'go');
console.log(`[Grumpy Bot] Discovered ${ranked.length} Go models:`, ranked.slice(0, 5));
    return ranked;
  } catch (error) {
console.error('[Grumpy Bot] Failed to discover Go models:', error instanceof Error ? error.message : error);
    return [];
  }
}

async function getZenModel(timeoutMs: number): Promise<string | null> {
  const now = Date.now();
  if (cachedZenModels.length > 0 && (now - lastZenDiscovery) < MODEL_CACHE_DURATION) {
console.log('[Grumpy Bot] Using cached Zen model:', cachedZenModels[0]);
    return cachedZenModels[0];
  }
console.log('[Grumpy Bot] Discovering Zen models...');
  const ranked = await discoverZenModels(timeoutMs);
  if (ranked.length === 0) {
console.log('[Grumpy Bot] No Zen models from API, trying hardcoded fallback list');
    cachedZenModels = [...FALLBACK_ZEN_FREE_MODELS];
    lastZenDiscovery = now;
    return cachedZenModels[0] ?? null;
  }
  cachedZenModels = ranked;
  lastZenDiscovery = now;
  return ranked[0];
}

async function getGoModel(timeoutMs: number): Promise<string | null> {
  const now = Date.now();
  if (cachedGoModels.length > 0 && (now - lastGoDiscovery) < MODEL_CACHE_DURATION) {
console.log('[Grumpy Bot] Using cached Go model:', cachedGoModels[0]);
    return cachedGoModels[0];
  }
console.log('[Grumpy Bot] Discovering Go models...');
  const ranked = await discoverGoModels(timeoutMs);
  if (ranked.length === 0) {
console.log('[Grumpy Bot] No Go models from API, trying hardcoded fallback list');
    cachedGoModels = [...FALLBACK_GO_MODELS];
    lastGoDiscovery = now;
    return cachedGoModels[0] ?? null;
  }
  cachedGoModels = ranked;
  lastGoDiscovery = now;
  return ranked[0];
}

const isRateLimit = (error: any): boolean => error?.response?.status === 429;
const isToolRejection = (error: any): boolean =>
  error?.response?.status === 400 && /tool|function/i.test(String(error?.response?.data?.error?.message ?? ''));

/** Why the cascade died, for an honest fallback line (reset per message). */
type CascadeNote = 'rate-limited' | 'failed' | 'unconfigured' | null;
let lastCascadeNote: CascadeNote = null;
function noteCascadeRateLimited(): void { lastCascadeNote = 'rate-limited'; }

/** Said when every provider answered 429: the models are jammed, not the
 *  board's data, not the net. Never blames "the outside". */
export const ZEN_RATE_LIMITED_LINE =
  'The AI line is jammed - the free models are all busy. Ask me again in a minute and I will look it up.';

/** Said when providers were tried and died (500s, 400s, time-outs): the
 *  fault is upstairs, not the caller's, and not "the outside world". */
export const ZEN_FAILED_LINE =
  'My brain misfired on that one - nothing is broken on your end. Ask me again in a minute.';

/** Said when no provider even has a key: the board, not the caller, and
 *  retrying changes nothing until the sysop acts. */
export const ZEN_UNCONFIGURED_LINE =
  'No AI key is set up on this board yet, so I am on fallback lines - tell the sysop, then ask me again.';

async function getZenResponse(userMessage: string, context: ChatContext, aiConfig: AIProviderConfig): Promise<string | null> {
  return getUpstreamResponse('zen', userMessage, context, aiConfig);
}

async function getGoResponse(userMessage: string, context: ChatContext, aiConfig: AIProviderConfig): Promise<string | null> {
  return getUpstreamResponse('go', userMessage, context, aiConfig);
}

/**
 * One OpenAI-compatible upstream (Zen or Go): silent best-first failover
 * inside one reply, round-robin across messages. The two differ only in
 * base URL, key, pool, and free-vs-subscription ranking.
 */
async function getUpstreamResponse(kind: ZenUpstream, userMessage: string, context: ChatContext, aiConfig: AIProviderConfig): Promise<string | null> {
  const label = kind === 'go' ? 'Go' : 'Zen';
  const base = kind === 'go' ? GO_BASE : ZEN_BASE;
  const apiKey = kind === 'go'
    ? aiConfig.goApiKey || process.env.GO_API_KEY
    : aiConfig.zenApiKey || process.env.ZEN_API_KEY;
  if (!apiKey) {
console.log(`[Grumpy Bot] No ${kind === 'go' ? 'GO_API_KEY' : 'ZEN_API_KEY'} configured, skipping ${label}`);
    return null;
  }
  const callTimeout = remainingBudget(aiConfig, 10000);
  if (callTimeout < 250) return null;

  const systemPrompt = personalityFor(aiConfig);
  const messages = [
    { role: 'system', content: systemPrompt },
    ...(context.boardCard ? [{ role: 'system', content: context.boardCard }] : []),
    ...(context.retrieved ? [{ role: 'system', content: context.retrieved }] : []),
    { role: 'system', content: `User context: ${context.userHandle} on node ${context.nodeId}, ${context.conferenceName}, online ${Math.floor(context.timeOnline / 60)} minutes` },
    ...context.messageHistory.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content
    })),
    { role: 'user', content: userMessage }
  ];
  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
  const getModel = kind === 'go' ? getGoModel : getZenModel;
  const rotate = kind === 'go' ? rotateGoModels : rotateZenModels;
  const plainOnly = kind === 'go' ? goPlainOnly : zenPlainOnly;
  const cached = () => kind === 'go' ? cachedGoModels : cachedZenModels;
  const post = async (body: unknown, timeoutMs: number) =>
    (await axios.post(`${base}/chat/completions`, body, { headers, timeout: timeoutMs })).data;

  const plainCall = async (model: string): Promise<string | null> => {
    const response = await axios.post(
      `${base}/chat/completions`,
      { model, messages, max_tokens: CHAT_REPLY_TOKENS, temperature: aiConfig.temperature },
      { headers, timeout: remainingBudget(aiConfig, 10000) },
    );
    const content = response.data.choices[0]?.message?.content;
    if (content) console.log(`[Grumpy Bot] SUCCESS - Using ${label} response`);
    return content ?? null;
  };

  // Silent failover inside one reply: best-first, up to three brains, the
  // caller hears nothing about the switching. A failure rotates the model
  // to the back, so the next attempt (and the next message) meets the next
  // best. Upstream 429s are per-model, not one shared pool, so the next
  // model is a real second chance.
  // An admin-pinned model runs only if it is listed (discovery or fallback
  // list); otherwise it is refused with a log line and the picker chooses.
  // Same rule as OpenRouter's adminModelIfFree, minus the free-only price
  // check Zen's bare rows cannot carry (Go has no free tier at all).
  // A pinned model gets one attempt.
  let pinned: string | null = null;
  if (aiConfig.modelName) {
    await getModel(Math.min(callTimeout, 5000));
    if (cached().includes(aiConfig.modelName)) {
      pinned = aiConfig.modelName;
    } else {
console.log(`[Grumpy Bot] Model "${aiConfig.modelName}" from the admin is not a listed ${label} model - refused; using the picker's choice.`);
    }
  }
  const maxAttempts = pinned ? 1 : 3;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (remainingBudget(aiConfig, 1000) < 250) break;
    const model = pinned || await getModel(Math.min(remainingBudget(aiConfig, 5000), 5000));
    if (!model) {
console.log(`[Grumpy Bot] No ${label} models available`);
      return null;
    }
  try {
    if (context.tools && context.tools.list.length > 0 && !plainOnly.has(model)) {
console.log(`[Grumpy Bot] Trying ${label} (${model}) with ${context.tools.list.length} tools...`);
      const result = await askWithTools({
        model, messages, tools: context.tools.list, ctx: context.tools.ctx,
        deadline: cfgDeadline(aiConfig), perRoundMs: PER_ROUND_MS,
        maxTokens: CHAT_REPLY_TOKENS, temperature: aiConfig.temperature, post,
      });
      (context.afters ??= []).push(...result.afters);
      if (result.calls.length) console.log(`[Grumpy Bot] tools used: ${result.calls.map((c) => `${c.name}:${c.outcome}`).join(', ')}`);
      if (result.text) {
console.log(`[Grumpy Bot] SUCCESS - Using ${label} response (tool loop)`);
        return result.truncated ? withContinuation(result.text) : result.text;
      }
      const answered = result.calls.filter((c) => c.outcome === 'ok');
      if (answered.length > 0 && result.toolResults.length > 0) {
console.log('[Grumpy Bot] No reply from the model, but the board answered - sending the tool result');
        return `Straight from the board:\n${result.toolResults.join('\n')}`;
      }
      rotate();
      continue;
    }
console.log(`[Grumpy Bot] Trying ${label} (${model})...`);
    const plain = await plainCall(model);
    if (plain) return plain;
    rotate();
  } catch (error: any) {
console.error(`[Grumpy Bot] ${label} failed:`, error.message);
    if (error?.response) {
console.error(`[Grumpy Bot] ${label} status:`, error.response.status);
console.error(`[Grumpy Bot] ${label} data:`, JSON.stringify(error.response.data)?.slice(0, 500));
    }
    if (error?.response?.status === 401) {
      // The key itself is refused: every model would answer the same.
      // Loud, once, then the cascade moves on - never burn attempts.
console.error(`[Grumpy Bot] ${label} key refused (401) - check ${kind === "go" ? "GO_API_KEY" : "ZEN_API_KEY"}`);
      return null;
    }
    if (isRateLimit(error)) {
      // Per-model upstream, not the whole pool: note it for an honest
      // fallback if everything dies, and try the next brain silently.
      noteCascadeRateLimited();
      rotate();
      continue;
    }
    if (context.tools && context.tools.list.length > 0 && (
      error?.response?.status === 400 || error?.response?.status === 500
    )) {
      // A 400 or 500 on a tool-loop attempt retries plain: live evidence
      // (2026-09-10, deepseek 400, muse-spark 500s with 44 tools) is that
      // some upstream models choke on the tools shape. A plain body is
      // shaped differently, so the retry is meaningful, not a replay.
      // Unlike a 400 refusal the 500 is not remembered: a busy model may
      // take tools fine on the next message.
      if (isToolRejection(error)) {
console.log(`[Grumpy Bot] ${label} model ${model} refuses tools - plain completion instead`);
      } else {
console.log(`[Grumpy Bot] ${label} model ${model} ${error?.response?.status} on tools - plain completion instead`);
      }
      if (error?.response?.status === 400) plainOnly.add(model);
      try {
        const plain = await plainCall(model);
        if (plain) return plain;
      } catch (retryError: any) {
console.error(`[Grumpy Bot] ${label} plain retry failed:`, retryError.message);
        if (isRateLimit(retryError)) noteCascadeRateLimited();
      }
    }
    rotate();
    continue;
  }
  }
  return null;
}

/**
 * Tier 3: OpenRouter (Free models with auto-discovery)
 */
async function discoverFreeModels(timeoutMs: number): Promise<string[]> {
  try {
    const response = await axios.get('https://openrouter.ai/api/v1/models', {
      timeout: timeoutMs
    });

    const models: OpenRouterModel[] = response.data.data || [];
    knownFreeModels = new Map(models.filter(isFreeModel).map((m) => [m.id, m]));
    toolModels = new Set([...knownFreeModels.values()].filter(supportsTools).map((m) => m.id));
    const freeModels = rankFreeModels(models);

console.log(`[Grumpy Bot] Discovered ${freeModels.length} free models (${toolModels.size} with tools):`, freeModels.slice(0, 5));

    return freeModels;
  } catch (error) {
console.error('[Grumpy Bot] Failed to discover free models:', error instanceof Error ? error.message : error);
    return [];
  }
}

async function getFreeModel(timeoutMs: number): Promise<string | null> {
  const now = Date.now();

  // Use cached models if available and not expired
  if (cachedFreeModels.length > 0 && (now - lastModelDiscovery) < MODEL_CACHE_DURATION) {
console.log('[Grumpy Bot] Using cached free model:', cachedFreeModels[0]);
    return cachedFreeModels[0];
  }

  // Discover new free models
console.log('[Grumpy Bot] Discovering free models...');
  const freeModels = await discoverFreeModels(timeoutMs);

  if (freeModels.length === 0) {
console.log('[Grumpy Bot] No free models from API, trying hardcoded fallback list');
    cachedFreeModels = [...FALLBACK_FREE_MODELS];
    lastModelDiscovery = now;
    if (cachedFreeModels.length > 0) {
      return cachedFreeModels[0];
    }
    return null;
  }

  // Cache the results
  cachedFreeModels = freeModels;
  lastModelDiscovery = now;

  return freeModels[0];
}

/** How many OpenRouter models one message may try before giving up. */
const MAX_OPENROUTER_MODELS_PER_MESSAGE = 2;

async function getOpenRouterResponse(userMessage: string, context: ChatContext, aiConfig: AIProviderConfig, modelsTried = 0): Promise<string | null> {
  // The key, BEFORE the model discovery: a board with no key used to pay a
  // five-second round trip to openrouter.ai to find a model it could never
  // call, and the caller sat through that before the rule-based reply.
  const apiKey = aiConfig.openRouterApiKey || process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
console.log('[Grumpy Bot] No OPENROUTER_API_KEY configured. OpenRouter requires an API key even for free models.');
    return null;
  }

  const discoveryTimeout = remainingBudget(aiConfig, 5000);
  if (discoveryTimeout < 250) return null;
  const picked = await getFreeModel(discoveryTimeout);
  const freeModel = adminModelIfFree(aiConfig.modelName) || picked;

  if (!freeModel) {
console.log('[Grumpy Bot] No OpenRouter free models available');
    return null;
  }

  const callTimeout = remainingBudget(aiConfig, 10000);
  if (callTimeout < 250) return null;

  try {
    const systemPrompt = personalityFor(aiConfig);
    const messages = [
      { role: 'system', content: systemPrompt },
      ...(context.boardCard ? [{ role: 'system', content: context.boardCard }] : []),
      ...(context.retrieved ? [{ role: 'system', content: context.retrieved }] : []),
      { role: 'system', content: `User context: ${context.userHandle} on node ${context.nodeId}, ${context.conferenceName}, online ${Math.floor(context.timeOnline / 60)} minutes` },
      ...context.messageHistory.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      })),
      { role: 'user', content: userMessage }
    ];

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://amiexpress.com',
      'X-Title': 'AmiExpress BBS',
    };

    // THE TOOL LOOP (K3): when the caller has tools and the model can call
    // them, the model may ask the board before it answers. Actions the tools
    // scheduled come back on the context for the chat to run after the reply.
    if (context.tools && context.tools.list.length > 0 && modelSupportsTools(freeModel)) {
console.log(`[Grumpy Bot] Trying OpenRouter (${freeModel}) with ${context.tools.list.length} tools...`);
      const startedAt = Date.now();
      const result = await askWithTools({
        model: freeModel,
        messages,
        tools: context.tools.list,
        ctx: context.tools.ctx,
        deadline: cfgDeadline(aiConfig),
        perRoundMs: PER_ROUND_MS,
        maxTokens: CHAT_REPLY_TOKENS,
        temperature: aiConfig.temperature,
        post: async (body, timeoutMs) => (await axios.post('https://openrouter.ai/api/v1/chat/completions', body, { headers, timeout: timeoutMs })).data,
      });
      // What this model cost, so the picker can prefer the fast ones.
      noteModelCost(freeModel, Date.now() - startedAt, Boolean(result.text));
      cachedFreeModels = rankFreeModels([...knownFreeModels.values()]);
      // Into the SAME array the chat handler holds: getGrumpySysopResponse
      // hands the providers a shallow copy of the context (the history with
      // our tags stripped), and a new array on the copy would be lost.
      (context.afters ??= []).push(...result.afters);
      if (result.calls.length) console.log(`[Grumpy Bot] tools used: ${result.calls.map((c) => `${c.name}:${c.outcome}`).join(', ')}`);
      if (result.text) {
console.log('[Grumpy Bot] SUCCESS - Using OpenRouter response (tool loop)');
        return result.truncated ? withContinuation(result.text) : result.text;
      }
      // THE BOARD ALREADY ANSWERED. When the model asked a tool and then ran
      // out of time before writing its reply, the cascade used to fall
      // through to the rule-based bot, which answers a question it never
      // read: the sysop asked for the best multiplayer game and was told
      // "First time caller?" (2026-09-08, "first we see [AI] then [RB]?").
      // The tool's own answer is the truth the caller asked for; it goes out
      // plainly rather than being thrown away.
      const answered = result.calls.filter((c) => c.outcome === 'ok');
      if (answered.length > 0 && result.toolResults.length > 0) {
console.log('[Grumpy Bot] No reply from the model, but the board answered - sending the tool result');
        return `Straight from the board:\n${result.toolResults.join('\n')}`;
      }
      return null;
    }

console.log(`[Grumpy Bot] Trying OpenRouter (${freeModel})...`);

    const plainStartedAt = Date.now();
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: freeModel,
        messages: messages,
        // A co-sysop's line, not an essay: generation time is most of the wait
        // on a big model, and nothing the bot says needs a thousand tokens.
        max_tokens: CHAT_REPLY_TOKENS,
        temperature: aiConfig.temperature,
      },
      { headers, timeout: callTimeout }
    );

    const content = response.data.choices[0]?.message?.content;
    const cutOff = response.data.choices[0]?.finish_reason === 'length';
    noteModelCost(freeModel, Date.now() - plainStartedAt, Boolean(content));
    cachedFreeModels = rankFreeModels([...knownFreeModels.values()]);
    if (content) {
console.log('[Grumpy Bot] SUCCESS - Using OpenRouter response');
      return cutOff ? withContinuation(content) : content;
    }
    return null;
  } catch (error: any) {
console.error('[Grumpy Bot] OpenRouter failed:', error.message);
    if (error.response) {
console.error('[Grumpy Bot] Status:', error.response.status);
console.error('[Grumpy Bot] Data:', JSON.stringify(error.response.data));
    }
    // A 429 is the shared pool refusing, not the board's data and not the
    // net: the cascade yields to Zen at once (model-hopping replays the
    // same refusal), and the fallback line says jammed, never "outside".
    if (error?.response?.status === 429) noteCascadeRateLimited();

    // If this model failed, try the next one - but not every model on the
    // list, and never past the deadline. The caller is waiting.
    if (cachedFreeModels.length > 1 && modelsTried + 1 < MAX_OPENROUTER_MODELS_PER_MESSAGE) {
console.log('[Grumpy Bot] Trying next OpenRouter model...');
      cachedFreeModels.shift();
      return getOpenRouterResponse(userMessage, context, aiConfig, modelsTried + 1);
    }

    // Clear cache
    cachedFreeModels = [];
    lastModelDiscovery = 0;
    return null;
  }
}

/**
 * Master AI Response Function
 * Cascades through all available providers.
 * Configured provider is tried first, then the rest as fallback.
 */
async function getAIResponse(userMessage: string, context: ChatContext, aiConfig: AIProviderConfig): Promise<string | null> {
  const preferred = aiConfig.provider || 'openrouter';

  // Rule-based means rule-based: the admin turned the AI off, so no round
  // trip leaves the box. (Before 2026-09-10 the cascade below ran anyway.)
  if (preferred === 'rule-based') return null;

  // Ordered cascade: preferred first, then the rest with the keyed
  // upstreams (Zen, Go) ahead of OpenRouter - either way a Zen/Go failure
  // falls back to OpenRouter and an OpenRouter 429 falls forward to Zen
  // before Groq/Gemini are tried.
  const cascade: Array<'groq' | 'gemini' | 'openrouter' | 'zen' | 'go' | 'cerebras'> =
    preferred === 'groq' ? ['groq', 'zen', 'go', 'gemini', 'cerebras', 'openrouter'] :
    preferred === 'gemini' ? ['gemini', 'zen', 'go', 'groq', 'cerebras', 'openrouter'] :
    preferred === 'zen' ? ['zen', 'go', 'openrouter', 'groq', 'gemini', 'cerebras'] :
    preferred === 'go' ? ['go', 'zen', 'openrouter', 'groq', 'gemini', 'cerebras'] :
    preferred === 'cerebras' ? ['cerebras', 'groq', 'zen', 'go', 'openrouter', 'gemini'] :
    ['openrouter', 'zen', 'go', 'groq', 'gemini', 'cerebras'];

  lastCascadeNote = null;
  const hasKeys = Boolean(
    aiConfig.zenApiKey || process.env.ZEN_API_KEY
    || aiConfig.goApiKey || process.env.GO_API_KEY
    || aiConfig.openRouterApiKey || process.env.OPENROUTER_API_KEY
    || aiConfig.groqApiKey || process.env.GROQ_API_KEY
    || aiConfig.cerebrasApiKey || process.env.CEREBRAS_API_KEY
    || aiConfig.geminiApiKey || process.env.GEMINI_API_KEY,
  );
  for (const provider of cascade) {
    let response: string | null = null;
    if (provider === 'groq') response = await getGroqResponse(userMessage, context, aiConfig);
    else if (provider === 'gemini') response = await getGeminiResponse(userMessage, context, aiConfig);
    else if (provider === 'zen') response = await getZenResponse(userMessage, context, aiConfig);
    else if (provider === 'go') response = await getGoResponse(userMessage, context, aiConfig);
    else if (provider === 'cerebras') response = await getCerebrasResponse(userMessage, context, aiConfig);
    else if (provider === 'openrouter') response = await getOpenRouterResponse(userMessage, context, aiConfig);
    if (response) return response;
  }
  // Tried and died versus never tried: the fallback line says which.
  if (!lastCascadeNote) lastCascadeNote = hasKeys ? 'failed' : 'unconfigured';
  return null;
}



/**
 * Get random item from array
 */
function randomFrom<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Main handler - gets bot response (AI or rule-based)
 */
/**
 * `[AI] ` and `[RB] ` were OUR labels, telling the caller which engine had
 * answered. With the rule-based bot gone there is one engine and nothing to
 * tell apart, so the co-sysop speaks plainly - but the tags are still
 * stripped, from a model's own history (shown them, it copied them, and the
 * caller read `[AI] [AI] *grumble*`) and from anything a model writes, and
 * from the rows a board recorded while they were in use.
 */
const ENGINE_TAG = /^(?:\s*\[(?:AI|RB)\]\s*)+/;
export function stripEngineTag(text: string): string {
  return text.replace(ENGINE_TAG, '');
}
function tagReply(engine: 'AI' | 'RB', text: string): string {
  return `[${engine}] ${stripEngineTag(text).trim()}`;
}
/** The history as a model should see it: its own lines without our tags. */
function untaggedHistory(context: ChatContext): ChatContext {
  return {
    ...context,
    messageHistory: context.messageHistory.map((m) =>
      m.role === 'bot' ? { ...m, content: stripEngineTag(m.content) } : m
    ),
  };
}

export async function getGrumpySysopResponse(
  userMessage: string,
  context: ChatContext,
  aiConfig?: AIProviderConfig
): Promise<string> {
  const cfg: AIProviderConfig = {
    ...(aiConfig || DEFAULT_AI_CONFIG),
    deadline: Date.now() + ((aiConfig || DEFAULT_AI_CONFIG).budgetMs ?? DEFAULT_AI_BUDGET_MS),
  };

  const aiResponse = await getAIResponse(userMessage, untaggedHistory(context), cfg);
  const cleaned = aiResponse ? stripFakeToolCalls(aiResponse) : null;
  if (cleaned && cleaned !== aiResponse) {
console.log('[Grumpy Bot] Stripped a faked tool-call block from the reply');
  }
  if (cleaned) {console.log('[Grumpy Bot] Using AI response');
    // The caller has their answer; the board spends the quiet moment learning
    // what the NEXT model on the list costs, so nobody pays for it in a chat.
    void probeAnUnmeasuredModel(cfg).catch(() => undefined);
    // Cutoff is judged on the raw reply: stripMarkdown would eat a trailing
    // '**' and hide exactly the evidence this looks for.
    const cut = looksCutOff(cleaned);
    const reply = stripMarkdown(stripEmojis(stripEngineTag(cleaned.trim())));
    if (cut) {
console.log('[Grumpy Bot] Reply looks cut off mid-thought - marking continuation');
      return withContinuation(reply);
    }
    return reply;
  }

  // NO CANNED BOT BEHIND THIS. There used to be a rule-based responder - a
  // keyword table of grumpy one-liners - and it answered questions it had
  // never read: asked for the best multiplayer game on the board, it said
  // "First time caller? Don't worry, everyone's confused at first" (sysop,
  // 2026-09-08: "the [RB] bot ... is totally useless and talks jibberish").
  // Its personality was never its own either: the voice is the system prompt
  // the model is given, so nothing was lost by deleting it.
  //
  // The fallback names the failure kind: jammed models, dead models, or
  // no keys at all. None of them blame "the outside" - the board's data
  // and the net were never the patient. Only rule-based (the admin turned
  // the AI off) keeps the persona's own line.
console.log('[Grumpy Bot] No provider answered - saying so');
  // A reply that was ONLY a faked tool call leaves nothing to say - but
  // its model must not lead again next message, or every retry roleplays
  // the same block. Rotate, and record the death: the cascade returned
  // text, so its tried-and-died default never ran, and without this the
  // persona fallback would answer for a failure.
  if (aiResponse && !cleaned) {
    rotateModelPools();
    if (!lastCascadeNote) lastCascadeNote = 'failed';
  }
  if (lastCascadeNote === 'rate-limited') return ZEN_RATE_LIMITED_LINE;
  if (lastCascadeNote === 'failed') return ZEN_FAILED_LINE;
  if (lastCascadeNote === 'unconfigured') return ZEN_UNCONFIGURED_LINE;
  return stripMarkdown(stripEmojis(fallbackForPersona(cfg)));
}

export const DEFAULT_AI_CONFIG: AIProviderConfig = {
  provider: 'openrouter',
  modelName: '',
  temperature: 0.9,
  systemPrompt: GRUMPY_SYSOP_PERSONALITY,
  botTypingSpeed: 40,
  botTypoProbability: 0.04,
  botThinkTime: 1000,
};

/**
 * Initialize message when bot takes over - the persona's own opening line (s.6).
 */
export function getGrumpyBotIntroMessage(botName?: string): string {
  if (botName) {
    try {
      const { personaByHandle, openingLineFor } = require('./sysop-ai/personas');
      const p = personaByHandle(botName);
      if (p) return openingLineFor(p);
      try {
        const { getDatabase } = require('./command-handler/dependency-injection');
        const stored = getDatabase().getOperatorChatRepository().getPersonaByHandle(botName);
        if (stored) {
          const { openingLineFor: o2 } = require('./sysop-ai/personas');
          return o2(stored as any);
        }
      } catch { /* no DB */ }
    } catch { /* best-effort */ }
  }
  const intros = [
    "Looks like the real sysop is off doing... whatever it is sysops do. Lucky you, you get ME instead.",
    "Great, the sysop isn't answering. Guess I'M your tech support now. This is just PERFECT.",
    "Well well well, the main sysop is AFK. Again. So you're stuck with the grumpy co-sysop. What do you want?",
    "The sysop didn't answer your page. Shocking. Anyway, I'm the backup - been running BBSs since '89. What's your problem?",
  ];

  return randomFrom(intros);
}

/**
 * Common typo mappings (adjacent keys on QWERTY keyboard)
 */
const TYPO_MAP: { [key: string]: string[] } = {
  'a': ['s', 'q', 'w', 'z'],
  'b': ['v', 'n', 'g', 'h'],
  'c': ['x', 'v', 'd', 'f'],
  'd': ['s', 'f', 'e', 'r', 'c', 'x'],
  'e': ['w', 'r', 'd', 's'],
  'f': ['d', 'g', 'r', 't', 'v', 'c'],
  'g': ['f', 'h', 't', 'y', 'b', 'v'],
  'h': ['g', 'j', 'y', 'u', 'n', 'b'],
  'i': ['u', 'o', 'j', 'k'],
  'j': ['h', 'k', 'u', 'i', 'n', 'm'],
  'k': ['j', 'l', 'i', 'o', 'm'],
  'l': ['k', 'o', 'p'],
  'm': ['n', 'j', 'k'],
  'n': ['b', 'm', 'h', 'j'],
  'o': ['i', 'p', 'k', 'l'],
  'p': ['o', 'l'],
  'q': ['w', 'a'],
  'r': ['e', 't', 'd', 'f'],
  's': ['a', 'd', 'w', 'e', 'z', 'x'],
  't': ['r', 'y', 'f', 'g'],
  'u': ['y', 'i', 'h', 'j'],
  'v': ['c', 'b', 'f', 'g'],
  'w': ['q', 'e', 'a', 's'],
  'x': ['z', 'c', 's', 'd'],
  'y': ['t', 'u', 'g', 'h'],
  'z': ['a', 'x', 's'],
};

/** One step of a bot "typing": a character, a correction, or a wait. */
export type TypingEvent =
  | { kind: 'char'; ch: string }
  | { kind: 'backspace' }
  | { kind: 'pause'; ms: number };

/**
 * The plan for typing `text` the way a person does at a keyboard - which is
 * how express.e's chat() delivers it (6162-6175: every key goes out with
 * sendChar the moment it is pressed): variable speed, a breath after
 * punctuation, and now and then a neighbouring key hit, noticed, backspaced
 * and retyped (6143-6149 is the backspace both sides see). PURE - renders
 * nothing and sleeps for nothing; `rng` is injectable so a test can force or
 * forbid a typo. Every pause scales with `typingSpeed`, so the admin's one
 * number sets the pace of the whole thing.
 *
 * Applying the events in order yields `text` exactly.
 */
export function planNaturalTyping(
  text: string,
  options?: { typingSpeed?: number; typoProbability?: number },
  rng: () => number = Math.random
): TypingEvent[] {
  const TYPO_PROBABILITY = options?.typoProbability ?? 0.04;
  const MIN_TYPING_DELAY = options?.typingSpeed ?? 40;
  const MAX_TYPING_DELAY = MIN_TYPING_DELAY * 3;
  const unit = MIN_TYPING_DELAY / 40;
  const PAUSE_AFTER_TYPO = 150 * unit; // the bot "notices"
  const BACKSPACE_DELAY = 40 * unit;

  const events: TypingEvent[] = [];
  for (const char of text) {
    const isSpace = char === ' ';
    const isPunctuation = /[.,!?;:]/.test(char);
    const canTypo = char.toLowerCase() in TYPO_MAP && !isSpace && !isPunctuation;

    if (canTypo && rng() < TYPO_PROBABILITY) {
      const neighbours = TYPO_MAP[char.toLowerCase()];
      const typo = neighbours[Math.floor(rng() * neighbours.length)] ?? neighbours[0];
      events.push({ kind: 'char', ch: char === char.toUpperCase() ? typo.toUpperCase() : typo });
      events.push({ kind: 'pause', ms: PAUSE_AFTER_TYPO });
      events.push({ kind: 'backspace' });
      events.push({ kind: 'pause', ms: BACKSPACE_DELAY });
      events.push({ kind: 'char', ch: char });
      events.push({ kind: 'pause', ms: MIN_TYPING_DELAY });
      continue;
    }

    events.push({ kind: 'char', ch: char });
    let delay = MIN_TYPING_DELAY + rng() * (MAX_TYPING_DELAY - MIN_TYPING_DELAY);
    if (isPunctuation) delay += 100 * unit;
    else if (isSpace) delay += 20 * unit;
    events.push({ kind: 'pause', ms: delay });
  }
  return events;
}

/** The text a plan leaves on the line once every event has been applied. */
export function applyTypingPlan(events: TypingEvent[]): string {
  let out = '';
  for (const e of events) {
    if (e.kind === 'char') out += e.ch;
    else if (e.kind === 'backspace') out = out.slice(0, -1);
  }
  return out;
}

