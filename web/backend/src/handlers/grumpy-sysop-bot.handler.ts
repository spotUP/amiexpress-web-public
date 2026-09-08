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
import { askWithTools } from './sysop-ai/loop';
import type { SysopTool, ToolContext } from './sysop-ai/tools';
import { getSystemTime } from '../utils/date-time.util';

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
  provider: 'groq' | 'gemini' | 'openrouter' | 'rule-based';
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
  geminiApiKey?: string;
  openRouterApiKey?: string;
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
const modelCost = new Map<string, ModelCost>();
/** An untried model is assumed this fast - good enough to be tried early. */
const UNTRIED_MS = 6000;
/** How long a model that failed or timed out stays at the back. */
const PENALTY_MS = 10 * 60 * 1000;

/** Record what a call to `model` cost, in milliseconds; `ok` false marks a failure. */
export function noteModelCost(model: string, ms: number, ok: boolean): void {
  const prev = modelCost.get(model);
  const ewmaMs = prev ? Math.round(prev.ewmaMs * 0.6 + ms * 0.4) : ms;
  modelCost.set(model, { ewmaMs, failedAt: ok ? undefined : Date.now() });
}

/** What this model is expected to cost right now - a failure is worn for ten minutes. */
export function modelCostMs(model: string, now = Date.now()): number {
  const c = modelCost.get(model);
  if (!c) return UNTRIED_MS;
  return c.failedAt && now - c.failedAt < PENALTY_MS ? c.ewmaMs + 60000 : c.ewmaMs;
}

/** Test seam. */
export function resetModelCosts(): void { modelCost.clear(); }

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
 * parameters, and the picker prefers those, largest context first, so the
 * board card and the help fit. A name typed into the admin is used only if
 * it passes the same check; otherwise it is refused, with a log line, and
 * the picker's choice is used.
 */
export const isFreeModel = (m: OpenRouterModel): boolean =>
  parseFloat(m.pricing?.prompt || '1') === 0 && parseFloat(m.pricing?.completion || '1') === 0;
export const supportsTools = (m: OpenRouterModel): boolean =>
  Array.isArray(m.supported_parameters) && m.supported_parameters.includes('tools');
/** Every zero-price model the last discovery saw, by id, for the admin-name check. */
let knownFreeModels = new Map<string, OpenRouterModel>();
/** The ids that also support tools. */
let toolModels = new Set<string>();

/** Tool-capable first, then the largest context, then the rest. */
export function rankFreeModels(models: OpenRouterModel[], now = Date.now()): string[] {
  return models
    .filter(isFreeModel)
    .filter((m) => !m.id.toLowerCase().includes('think'))
    // Tools first (the loop needs them), then the fastest measured round
    // trip, then the larger context as a tie-break among the untried.
    .sort((a, b) =>
      Number(supportsTools(b)) - Number(supportsTools(a)) ||
      modelCostMs(a.id, now) - modelCostMs(b.id, now) ||
      (b.context_length ?? 0) - (a.context_length ?? 0))
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
 * Kept current as of 2026-09-04.
 */
const FALLBACK_FREE_MODELS: string[] = [
  'google/gemma-2-9b-it:free',
  'meta-llama/llama-3.2-3b-instruct:free',
  'microsoft/phi-3.5-mini-instruct:free',
  'mistralai/mistral-7b-instruct:free',
  'cognitivecomputations/dolphin-2.9.1-llama-3.1-8b:free',
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
function personalityFor(aiConfig: AIProviderConfig): string {
  const base = aiConfig.systemPrompt || GRUMPY_SYSOP_PERSONALITY;
  const name = (aiConfig.botName || 'Kevin').slice(0, 30);
  const sysop = aiConfig.sysopName || 'the sysop';
  return `${base}\n\nYour handle on this board is ${name}. You are the CO-SYSOP; the sysop is ${sysop}, and you answer pages when ${sysop} does not. Sign nothing, introduce yourself as ${name} when asked, and never claim to be ${sysop}.`;
}

const GRUMPY_SYSOP_PERSONALITY = `You are a veteran BBS co-sysop from the 1990s helping run an Amiga-based bulletin board system. Your personality:

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

Example:
User: "How do I read messages?"
You: "*sighs* Did you even TRY reading the help? Press R. It's literally on the main menu."

CRITICAL: Be concise. Typing at 2400 baud is slow, so you don't waste bytes.`;

// Massively expanded response database for natural, varied conversations

/**
 * Multi-tier AI Response System
 * Tries providers in order: Groq → Gemini → OpenRouter
 * Falls back to rule-based if all fail
 */

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

    const model = aiConfig.modelName || 'llama-3.1-8b-instant';
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
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
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
    const fullPrompt = `${systemPrompt}\n\n${context.boardCard ? context.boardCard + '\n\n' : ''}${context.retrieved ? context.retrieved + '\n\n' : ''}User context: ${context.userHandle} on node ${context.nodeId}, ${context.conferenceName}, online ${Math.floor(context.timeOnline / 60)} minutes\n\n${
      context.messageHistory.map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`).join('\n')
    }\nUser: ${userMessage}\nAssistant:`;

    const model = aiConfig.modelName || 'gemini-1.5-flash';
console.log(`[Grumpy Bot] Trying Gemini (${model})...`);

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        contents: [{ parts: [{ text: fullPrompt }] }],
        generationConfig: {
          maxOutputTokens: 150,
          temperature: aiConfig.temperature,
        }
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: geminiTimeout
      }
    );

    const content = response.data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (content) {
console.log('[Grumpy Bot] SUCCESS - Using Gemini response');
      return content;
    }
    return null;
  } catch (error) {
console.error('[Grumpy Bot] Gemini failed:', error instanceof Error ? error.message : error);
    return null;
  }
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
        return result.text;
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
        return `Straight from the board, since I am typing slowly today:\n${result.toolResults.join('\n')}`;
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
        max_tokens: 1000,
        temperature: aiConfig.temperature,
      },
      { headers, timeout: callTimeout }
    );

    const content = response.data.choices[0]?.message?.content;
    noteModelCost(freeModel, Date.now() - plainStartedAt, Boolean(content));
    cachedFreeModels = rankFreeModels([...knownFreeModels.values()]);
    if (content) {
console.log('[Grumpy Bot] SUCCESS - Using OpenRouter response');
      return content;
    }
    return null;
  } catch (error: any) {
console.error('[Grumpy Bot] OpenRouter failed:', error.message);
    if (error.response) {
console.error('[Grumpy Bot] Status:', error.response.status);
console.error('[Grumpy Bot] Data:', JSON.stringify(error.response.data));
    }

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

  // Ordered cascade: preferred first, then rest as fallback
  const cascade: Array<'groq' | 'gemini' | 'openrouter'> =
    preferred === 'groq' ? ['groq', 'gemini', 'openrouter'] :
    preferred === 'gemini' ? ['gemini', 'groq', 'openrouter'] :
    ['openrouter', 'groq', 'gemini'];

  for (const provider of cascade) {
    let response: string | null = null;
    if (provider === 'groq') response = await getGroqResponse(userMessage, context, aiConfig);
    else if (provider === 'gemini') response = await getGeminiResponse(userMessage, context, aiConfig);
    else if (provider === 'openrouter') response = await getOpenRouterResponse(userMessage, context, aiConfig);
    if (response) return response;
  }

console.log('[Grumpy Bot] All AI providers failed, falling back to rule-based');
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
  if (aiResponse) {
console.log('[Grumpy Bot] Using AI response');
    return stripEngineTag(aiResponse).trim();
  }

  // NO CANNED BOT BEHIND THIS. There used to be a rule-based responder - a
  // keyword table of grumpy one-liners - and it answered questions it had
  // never read: asked for the best multiplayer game on the board, it said
  // "First time caller? Don't worry, everyone's confused at first" (sysop,
  // 2026-09-08: "the [RB] bot ... is totally useless and talks jibberish").
  // Its personality was never its own either: the voice is the system prompt
  // the model is given, so nothing was lost by deleting it.
  //
  // When no provider answers, the co-sysop says so, once, in his own voice.
  // A caller told the truth can ask again; a caller told a non-sequitur
  // thinks the board is broken.
console.log('[Grumpy Bot] No provider answered - saying so');
  return 'My connection to the outside world just dropped - ask me again in a minute.';
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
 * Initialize message when bot takes over
 */
export function getGrumpyBotIntroMessage(): string {
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

