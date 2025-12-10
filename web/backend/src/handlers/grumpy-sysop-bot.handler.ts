/**
 * Grumpy Sysop AI Chatbot
 *
 * Takes over operator chat when real sysop doesn't answer within timeout.
 * Personality: Old-school 1990s BBS sysop who's seen it all.
 *
 * Features:
 * - Uses OpenRouter API with free models (if configured)
 * - Falls back to rule-based responses if API unavailable
 * - Sarcastic but ultimately helpful
 * - Period-appropriate BBS slang and references
 */

import axios from 'axios';

interface ChatContext {
  userHandle: string;
  nodeId: number;
  conferenceName: string;
  timeOnline: number;
  messageHistory: Array<{ role: 'user' | 'bot'; content: string }>;
}

interface OpenRouterModel {
  id: string;
  name: string;
  pricing: {
    prompt: string;
    completion: string;
  };
}

// Cache for discovered free models
let cachedFreeModels: string[] = [];
let lastModelDiscovery: number = 0;
const MODEL_CACHE_DURATION = 3600000; // 1 hour in milliseconds

const GRUMPY_SYSOP_PERSONALITY = `You are a veteran BBS sysop from the 1990s running an Amiga-based bulletin board system. Your personality:

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

Keep responses SHORT (2-3 sentences max). Be grumpy but funny. Eventually be helpful.`;

const RULE_BASED_RESPONSES = {
  greetings: [
    "Oh great, another lamer needs help. What do you want?",
    "Sigh... I was in the middle of optimizing my file database. This better be important.",
    "Back in my day, people read the documentation BEFORE bothering the sysop. But go ahead...",
    "Yeah yeah, I'm here. My Amiga 4000 was just defragging. What's your problem?",
  ],

  questions: [
    "Did you even READ the bulletins? That's what they're there for, genius.",
    "Let me guess, you skipped right past the help files and came straight here.",
    "You know, in 1992 we had to figure this stuff out ourselves. With 2400 baud. Uphill. Both ways.",
    "The answer is probably in the door games section. Have you tried, I dunno, LOOKING?",
  ],

  commands: [
    "Type ? for the command list. I know reading is hard for you modern users.",
    "The commands are literally on the screen. ANSI art ain't just for show, kid.",
    "F for file areas, M for messages, D for doors. It's not rocket science.",
    "You want me to read the menu TO you? What is this, AOL?",
  ],

  files: [
    "The files are organized by area. Use L to list 'em. Try to keep up.",
    "Upload something useful for once and maybe your ratio won't be so embarrassing.",
    "Back in my day we had a 1:10 ratio. You downloaded 10 files, you uploaded 1 GOOD one.",
    "Check the new files list with N. Or don't, I don't care.",
  ],

  doors: [
    "The door games are in the D menu. TradeWars 2002 is on node 2 if someone isn't hogging it.",
    "Legend of the Red Dragon is down for maintenance. Some lamer corrupted the save file AGAIN.",
    "You want doors? We got doors. Just don't break anything, I'm tired of fixing stuff.",
    "Door games are why you're really here, admit it. Nobody actually reads the message bases.",
  ],

  compliments: [
    "...Did you just compliment my BBS? Are you feeling okay?",
    "Yeah well, I've been running this thing since you were in diapers, probably.",
    "Thanks I guess. Don't let it go to your head, you're still a lamer.",
    "My Amiga 4000 with 18MB of RAM makes it all possible. And my PATIENCE.",
  ],

  goodbye: [
    "Finally. Don't let the modem disconnect you on the way out.",
    "Yeah, logoff already. Some of us have a BBS to run.",
    "Try not to tie up the line next time. Other people want to call too, y'know.",
    "See ya. And read the docs next time before you page me!",
  ],

  default: [
    "Look, I'm just filling in because the real sysop is AFK. What do you need?",
    "I've answered this question 47 times this week. But sure, go ahead.",
    "You know what? Just explore the menus. You'll figure it out. Probably.",
    "I don't have time for this. Check the help files (H) and stop bothering me.",
  ]
};

/**
 * Discover free models from OpenRouter API
 */
async function discoverFreeModels(): Promise<string[]> {
  try {
    const response = await axios.get('https://openrouter.ai/api/v1/models', {
      timeout: 5000
    });

    const models: OpenRouterModel[] = response.data.data || [];

    // Filter for free models (pricing is "0")
    const freeModels = models
      .filter(model => {
        const promptPrice = parseFloat(model.pricing?.prompt || '1');
        const completionPrice = parseFloat(model.pricing?.completion || '1');
        return promptPrice === 0 && completionPrice === 0;
      })
      .map(model => model.id);

    console.log(`[Grumpy Bot] Discovered ${freeModels.length} free models:`, freeModels.slice(0, 5));

    return freeModels;
  } catch (error) {
    console.error('[Grumpy Bot] Failed to discover free models:', error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * Get a working free model (with caching)
 */
async function getFreeModel(): Promise<string | null> {
  const now = Date.now();

  // Use cached models if available and not expired
  if (cachedFreeModels.length > 0 && (now - lastModelDiscovery) < MODEL_CACHE_DURATION) {
    console.log('[Grumpy Bot] Using cached free model:', cachedFreeModels[0]);
    return cachedFreeModels[0];
  }

  // Discover new free models
  console.log('[Grumpy Bot] Discovering free models...');
  const freeModels = await discoverFreeModels();

  if (freeModels.length === 0) {
    console.log('[Grumpy Bot] No free models found, falling back to rule-based');
    return null;
  }

  // Cache the results
  cachedFreeModels = freeModels;
  lastModelDiscovery = now;

  return freeModels[0];
}

/**
 * Get response from OpenRouter free AI models (with auto-discovery)
 */
async function getAIResponse(userMessage: string, context: ChatContext): Promise<string | null> {
  // Try to get a free model
  const freeModel = await getFreeModel();

  if (!freeModel) {
    console.log('[Grumpy Bot] No free models available, using rule-based responses');
    return null;
  }

  try {
    // Build conversation history
    const messages = [
      { role: 'system', content: GRUMPY_SYSOP_PERSONALITY },
      { role: 'system', content: `User context: ${context.userHandle} on node ${context.nodeId}, ${context.conferenceName}, online ${Math.floor(context.timeOnline / 60)} minutes` },
      ...context.messageHistory.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      })),
      { role: 'user', content: userMessage }
    ];

    console.log(`[Grumpy Bot] Using model: ${freeModel}`);

    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: freeModel, // Auto-discovered free model
        messages: messages,
        max_tokens: 150,
        temperature: 0.9, // Higher temp for more personality
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://amiexpress.com', // Required by OpenRouter
        },
        timeout: 10000 // 10 second timeout
      }
    );

    return response.data.choices[0]?.message?.content || null;
  } catch (error) {
    console.error('[Grumpy Bot] AI API error:', error instanceof Error ? error.message : error);

    // If this model failed, try to find another one
    if (cachedFreeModels.length > 1) {
      console.log('[Grumpy Bot] Trying next free model...');
      cachedFreeModels.shift(); // Remove failed model
      return getAIResponse(userMessage, context); // Retry with next model
    }

    // Clear cache and fall back to rule-based
    cachedFreeModels = [];
    lastModelDiscovery = 0;
    return null;
  }
}

/**
 * Get rule-based response (fallback)
 */
function getRuleBasedResponse(userMessage: string): string {
  const msg = userMessage.toLowerCase();

  // Pattern matching for different response types
  if (msg.match(/^(hi|hey|hello|sup|yo)/)) {
    return randomFrom(RULE_BASED_RESPONSES.greetings);
  }

  if (msg.match(/\?|how|what|where|when|why|help/)) {
    return randomFrom(RULE_BASED_RESPONSES.questions);
  }

  if (msg.match(/command|menu|how do i|how to/)) {
    return randomFrom(RULE_BASED_RESPONSES.commands);
  }

  if (msg.match(/file|download|upload|warez/)) {
    return randomFrom(RULE_BASED_RESPONSES.files);
  }

  if (msg.match(/door|game|play|tradewars|lord/)) {
    return randomFrom(RULE_BASED_RESPONSES.doors);
  }

  if (msg.match(/thanks|thank you|cool|awesome|great|nice|love/)) {
    return randomFrom(RULE_BASED_RESPONSES.compliments);
  }

  if (msg.match(/bye|later|logout|quit|exit|gotta go/)) {
    return randomFrom(RULE_BASED_RESPONSES.goodbye);
  }

  // Default grumpy response
  return randomFrom(RULE_BASED_RESPONSES.default);
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
export async function getGrumpySysopResponse(
  userMessage: string,
  context: ChatContext
): Promise<string> {
  // Try AI first
  const aiResponse = await getAIResponse(userMessage, context);

  if (aiResponse) {
    console.log('[Grumpy Bot] Using AI response');
    return aiResponse;
  }

  // Fall back to rule-based
  console.log('[Grumpy Bot] Using rule-based response');
  return getRuleBasedResponse(userMessage);
}

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
