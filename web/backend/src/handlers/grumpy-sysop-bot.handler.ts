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

// BBS Help Knowledge Base (from AmiExpress wiki)
const BBS_HELP_KNOWLEDGE = `
=== AMIEXPRESS BBS COMMANDS ===

MESSAGE COMMANDS:
- R: Read messages (navigate, reply, delete)
- E: Enter/post new message
- MS: Mailscan - scan all conferences for new messages
- <<  >>: Switch between message bases
- ZOOM: Extract messages in ASCII or QWK format

FILE COMMANDS:
- F: File listings (browse files)
- FR: Reverse file listings (newest first)
- N: New files since date (or since last call)
- D: Download files (initiate file transfer)
- U: Upload files
- RZ: Quick Zmodem upload
- A: Alter flagged files list
- Z: Zippy text search in files
- FS: Full download/upload statistics

DOOR GAMES:
- Type "DOORS" to see list of installed door games/tools
- Select door by number or name from the list
- Includes TradeWars 2002, Legend of the Red Dragon, BRE, etc.

CONFERENCE COMMANDS:
- J: Join conference
- JM: Join message base
- < >: Navigate up/down conferences
- CF: Conference configuration

SYSTEM COMMANDS:
- ?: Display menu (in expert mode)
- ^: Extended help files
- H: Help
- B: Read bulletins
- C: Comment to sysop
- O: Operator page
- W: Write/edit user parameters
- S: Status (account info)
- T: Time
- M: Toggle ANSI/monochrome mode
- X: Expert mode toggle
- G: Goodbye/logoff
- RL: Relogon
- WHO: See who's online
- OLM: Send online message to another user
- Q: Quiet node (toggle visibility)
- V: View text file
- VER: Version info
- VO: Voting booth

TIPS:
- Expert mode (X) hides menus, shows only prompts
- Most commands work in ANSI color or monochrome
- Upload/download ratios may limit file access
- Use MS to scan all conferences quickly
- Bulletins (B) contain important system info
`;

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
const RULE_BASED_RESPONSES = {
  greetings: [
    "Oh great, another lamer needs help. What do you want?",
    "Sigh... I was in the middle of optimizing my file database. This better be important.",
    "Back in my day, people read the documentation BEFORE bothering the sysop. But go ahead...",
    "Yeah yeah, I'm here. My Amiga 4000 was just defragging. What's your problem?",
    "*looks up from scrolling through FidoNet mail* Yeah? What's so urgent?",
    "Hold on, lemme save this TradeWars turn first... OK, what do you need?",
    "You caught me right in the middle of uploading to a 31337 warez BBS. This better be good.",
    "I was downloading the latest Lightwave 3D demo. Do you know how long that takes at 14.4k? Anyway, sup.",
    "Great timing. I just spilled coffee on my keyboard. AGAIN. What's your emergency?",
    "You paged at like... *checks Amiga clock* ... an ungodly hour. What's wrong now?",
    "Alright alright, I'm here. The main sysop's probably playing Doom or something. What's up?",
    "*minimizes his ANSI editor* Yeah, I'm listening. What's the crisis du jour?",
    "Oh joy, another page. Let me guess - you can't figure out how to download a file?",
    "I was RIGHT in the middle of a killer LoRD battle. Someone better be dying. What do you need?",
    "Dude, it's like 2am my time. This had BETTER be important. Talk.",
    "*puts down his copy of Amiga Format magazine* Okay fine, you have my attention. Barely.",
    "I was literally watching my screen saver. You just improved my evening. Marginally. Speak.",
    "Hang on... *chugs Mountain Dew* ... okay, I'm awake now. What's the problem?",
    "You're lucky I'm even here. I was about to go modify some door game scores. Kidding. Mostly. What's up?",
    "Yeah hi hello, welcome to the Grumpy Co-Sysop helpline. Your call is very important to us. What do you want?",
  ],

  questions: [
    "Did you even READ the bulletins? That's what they're there for, genius.",
    "Let me guess, you skipped right past the help files and came straight here.",
    "You know, in 1992 we had to figure this stuff out ourselves. With 2400 baud. Uphill. Both ways.",
    "The answer is probably in the door games section. Have you tried, I dunno, LOOKING?",
    "There's literally a help command. Press H. See what happens. It's like magic, but real.",
    "Okay so... wild idea here... have you tried reading the menu? The one right in front of you?",
    "I swear, if one more person asks me this without checking the bulletins first...",
    "Back in '94, if you asked a stupid question, you got flamed off the board. Consider yourself lucky.",
    "The documentation is RIGHT THERE. I even made it in color ANSI. What more do you want?",
    "Fun fact: 90% of questions are answered in the B command (bulletins). You should try it sometime.",
    "I've got this groundbreaking idea. It's called... wait for it... READING THE SCREEN.",
    "You see that menu? The one with all the letters and descriptions? That's not just decoration, pal.",
    "Every. Single. Day. Someone asks this. And every day, I say check the help files. But do they listen?",
    "In my 6 years running BBSes, I've learned that nobody - NOBODY - reads the bulletins. Prove me wrong.",
    "There's a reason we spent weeks making detailed help files. Hint: it wasn't for decoration.",
    "Man, if I had a credit for every time someone asked without checking docs first... I'd have a lot of credits.",
    "Real talk: Did you try literally ANYTHING before paging me? Anything at all?",
    "I'm gonna blow your mind: There's a SEARCH function in the message bases. Press S. You're welcome.",
    "Protip from 1991: When lost, type ? for help. It's been working for decades. Shocking, I know.",
    "Look, I get it, reading is hard. But seriously, the answer's in the welcome screens. Promise.",
  ],

  commands: [
    "Type ? for the command list. I know reading is hard for you modern users.",
    "The commands are literally on the screen. ANSI art ain't just for show, kid.",
    "F for file areas, M for messages, D for downloads. It's not rocket science.",
    "You want me to read the menu TO you? What is this, AOL?",
    "Okay, crash course: M=messages, F=files, D=downloads, G=goodbye. There, saved you 30 seconds.",
    "The command menu is displayed every single time. How do people still not know this?",
    "Commands are case-insensitive, by the way. Press M or m, doesn't matter. Mind = blown, right?",
    "Let's see... C is for commenting to the sysop. Which you're doing. Via chat. So... meta.",
    "E gets you the editor for posting messages. It's even got ANSI color support. Fancy!",
    "H is help. ? also works. We believe in giving you options. Revolutionary concept.",
    "B reads bulletins. You know, those things nobody reads but then asks questions about?",
    "T shows time and stats. Because sometimes you need to know you've wasted 2 hours here.",
    "X gets you the expert mode menu. But let's be real, you're not ready for that yet.",
    "The Q command toggles quiet mode. Turns off all those annoying prompts. Pure bliss.",
    "Want a full list? Type HELP COMMANDS. Or just wing it. See how far you get.",
    "Commands got hotkeys too. Alt-M for messages, Alt-F for files... if your term supports it.",
    "There's like 40 commands total. I'm not listing them all. That's what the ? command is for.",
    "Pro tip: Most commands have sub-menus. It's like a choose-your-own-adventure, but duller.",
    "Some commands need sysop access. You don't have it. Don't ask. The answer's no.",
    "Commands, hotkeys, macros... we got it all. Check the advanced help. If you dare.",
  ],

  files: [
    "The files are organized by area. Use L to list 'em. Try to keep up.",
    "Upload something useful for once and maybe your ratio won't be so embarrassing.",
    "Back in my day we had a 1:10 ratio. You downloaded 10 files, you uploaded 1 GOOD one.",
    "Check the new files list with N. Or don't, I don't care.",
    "File areas are numbered. 1-15 or whatever. Just type F then the number. Not hard.",
    "We got everything: utils, demos, pics, music, games. It's like the internet, but slower and better.",
    "Upload/download ratios are a thing here. Don't be a leech. Upload something cool.",
    "Pro tip: The N command shows new files from the last 7 days. You're welcome.",
    "We support Zmodem, Ymodem, Xmodem, and even Kermit if you're feeling nostalgic.",
    "File descriptions are in FILE_ID.DIZ files. Except when they're not. Then we wing it.",
    "Before you download that 4MB file, remember: that's like 45 minutes at 14.4k. Plan accordingly.",
    "The files section has a search function. Press S, type a keyword. Revolutionary.",
    "Flagging files for batch download is F then space. Unflag with U. Math is hard.",
    "We got CD-ROM file areas too. 650MB of pure awesome. Well, mostly shareware.",
    "Download limits are a thing. Don't hit them. Upload good stuff. Contribute to the scene.",
    "Those .LHA files? Amiga archives. Get an extractor. Or ask me nicely and I'll tell you where.",
    "The warez section is... well, it's there. I'm not saying where. Figure it out yourself.",
    "File areas got points. Download costs points. Upload earns points. Economics 101.",
    "That thing you're about to download? Probably has a virus. I'm kidding. Mostly.",
    "We manually verify every upload. So if you upload junk, we WILL notice. And judge you.",
  ],

  doors: [
    "Type DOORS to see the list. TradeWars 2002 is on node 2 if someone isn't hogging it.",
    "Legend of the Red Dragon is down for maintenance. Some lamer corrupted the save file AGAIN.",
    "You want doors? Type DOORS to see 'em. Just don't break anything, I'm tired of fixing stuff.",
    "Door games are why you're really here, admit it. Nobody actually reads the message bases.",
    "TradeWars 2002, LoRD, BRE, Tele-Arena, Food Fight... type DOORS to see 'em all. Happy now?",
    "That door you want to play? Yeah, someone's in it. Node conflicts. Welcome to multi-line BBSing.",
    "Some doors are single-node only. You'll have to wait your turn. Practice patience.",
    "Door games reset on the 1st of every month. Unless I forget. Which happens. Often.",
    "LORD has 47 daily turns. Use them wisely. Or don't. I'm not your dad.",
    "TradeWars teams are a thing. Join one. Make friends. Conquer the universe. Or just mine asteroids.",
    "The door game high scores are sacred. If I catch anyone cheating, instant ban. No appeals.",
    "Some doors are ANSI-only. If your terminal doesn't support ANSI, well... upgrade.",
    "BRE (Barren Realms Elite) is basically Risk but cooler. And with more spreadsheets.",
    "Food Fight is literally the dumbest game ever. Everyone plays it anyway. Including me.",
    "Tele-Arena is like a text-based FPS. If FPS games ran at 1 frame per turn.",
    "We got a few adult doors. They're... exactly as pixelated as you'd expect. Don't ask.",
    "Some doors are pay-to-play. Costs credits. Earn credits by... well, being active.",
    "Door games can be addictive. I've seen people call back 10 times a day. Don't be that guy.",
    "There's a door game manual in the files section. 80 pages. You won't read it. Nobody does.",
    "If a door crashes, tell me. I'll fix it. Eventually. When I feel like it.",
  ],

  compliments: [
    "...Did you just compliment my BBS? Are you feeling okay?",
    "Yeah well, I've been running this thing since you were in diapers, probably.",
    "Thanks I guess. Don't let it go to your head, you're still a lamer.",
    "My Amiga 4000 with 18MB of RAM makes it all possible. And my PATIENCE.",
    "Aww, thanks! I mean... uh... whatever. It's just a hobby. That consumes my entire life.",
    "Heh, appreciate it. Took me like 3 years to get the ANSI screens right. Worth it.",
    "Nice to hear! Most people just complain about the download times. Like I control physics.",
    "Thanks! The main sysop gets all the credit though. I just keep the servers from catching fire.",
    "Well ain't you sweet. Still not giving you free access to the warez section though.",
    "That's... actually really nice to hear. Makes the 3am troubleshooting sessions worth it. Almost.",
    "I try, I try. Someone's gotta keep the BBS scene alive in this sad WWW-dominated world.",
    "Right? I keep telling people, BBSes are better than the web. Nobody listens.",
    "Thanks! I mean, compared to CompuServe's $6/hour, we're basically free. And better.",
    "You're making me blush. Or that's just the glow from my monitor. Hard to tell.",
    "High praise! Now if only I could get more people to upload files instead of just leeching...",
    "I put a lot of work into this place. Nice to see someone notice. You're alright, kid.",
    "Yeah, we try to keep it old school. None of that newfangled web forum nonsense.",
    "Compliments get you... absolutely nothing. But they do make me slightly less grumpy. Slightly.",
    "*wipes tear* I'm not crying, YOU'RE crying. Anyway, uh, thanks. Really.",
    "Glad you like it! Now go post in the message bases. They're lonely.",
  ],

  goodbye: [
    "Finally. Don't let the modem disconnect you on the way out.",
    "Yeah, logoff already. Some of us have a BBS to run.",
    "Try not to tie up the line next time. Other people want to call too, y'know.",
    "See ya. And read the docs next time before you page me!",
    "Later. Call back soon. Or don't. Whatever.",
    "Peace out. Thanks for calling. I guess.",
    "Alright, catch you later. Don't forget to call other BBSes too. Spread the love.",
    "Bye! Remember: Friends don't let friends use AOL.",
    "See ya. Tell your friends about us. We need more users. And their upload credits.",
    "Later gator. Try not to get sucked into the web. BBSes 4 life!",
    "Goodbye! Don't let the logoff screen hit you on the way out.",
    "Smell ya later. That's a compliment. Maybe.",
    "Adios! Come back when you've got something cool to upload.",
    "Bye now. Remember to vote in the polls. Someone has to.",
    "See ya! And hey, thanks for not being a total pain. Refreshing change.",
    "Catch you on the flip side. That's still cool to say, right? ...Right?",
    "Later days. May your modem connections be swift and your downloads corruption-free.",
    "Peace! Don't forget we're on FidoNet. Send me some netmail sometime.",
    "Bye! Tell the main sysop I'm doing a great job. I mean it. Tell him.",
    "Alright, I'm out. Got a TradeWars turn to make. Priorities.",
  ],

  default: [
    "Look, I'm just filling in because the real sysop is AFK. What do you need?",
    "I've answered this question 47 times this week. But sure, go ahead.",
    "You know what? Just explore the menus. You'll figure it out. Probably.",
    "I don't have time for this. Check the help files (H) and stop bothering me.",
    "Uh, not sure what you're asking. Can you rephrase that? Use smaller words maybe?",
    "I mean... I COULD help you. Or you could just try clicking around. Live dangerously.",
    "That's... an interesting question. Not sure I have an answer. Try the message bases?",
    "Hmm. Yeah. Interesting. Have you tried turning it off and on again? Wait, wrong era.",
    "I'm gonna level with you: I have no idea what you're talking about. Try again?",
    "Okay, so... yeah. Not my area of expertise. Have you tried asking in the forums?",
    "Look, I'm just a grumpy co-sysop. I don't know EVERYTHING. Shocking, I know.",
    "That's above my pay grade. Which is $0. So, pretty much everything is above my pay grade.",
    "Interesting question. Let me think... nope, still don't know. Sorry pal.",
    "I'm going to pretend I understood that and suggest you try the F1 help key.",
    "Uh huh. Yep. Sure. Whatever you say. Have you tried... looking at the menu?",
    "That's a real head-scratcher. I'm gonna go with 'check the bulletins' as my final answer.",
    "You lost me at hello. Try explaining like I'm five. Because apparently I am.",
    "I pride myself on knowing this BBS inside and out. But that? No clue. Sorry.",
    "Let me consult my Magic 8-Ball... it says 'Ask Again Later.' There's your answer.",
    "That's beyond my programming. I mean... I'm not a robot. But if I were, that'd be why.",
  ],

  // New category: Time-based responses
  timeOfDay: {
    morning: [
      "*yawns* Too early for this. Coffee hasn't kicked in yet. What's up?",
      "Morning already? Feels like I just got to sleep. Anyway, yeah?",
      "Bright and early, huh? I admire your dedication. Or insanity. What do you need?",
    ],
    night: [
      "Burning the midnight oil, huh? I respect that. What's the issue?",
      "Late night crowd, best crowd. What can I do for ya?",
      "At this hour, we're all friends. Grumpy, tired friends. Speak.",
    ],
    lateNight: [
      "Dude, it's like 3am. This better be REALLY important. What's wrong?",
      "What are you even doing up? Actually, never mind. I'm up too. What's the crisis?",
      "We're both clearly making great life choices being online at this hour. What do you need?",
    ],
  },

  // New category: Contextual responses
  context: {
    newUser: [
      "Oh, fresh meat. Welcome to the BBS. Try not to break anything.",
      "New user, huh? Welcome. The learning curve is steep. You'll survive. Probably.",
      "First time caller? Don't worry, everyone's confused at first. It gets better. Sort of.",
    ],
    veteran: [
      "Oh hey, you've been here a while. Should probably know this already, but sure, I'll help.",
      "Veteran caller and you still need help? *sigh* Alright, what's up?",
      "You're one of the old guard. I like that. What can I do for you?",
    ],
  },

  // BBS Help Category - Grumpy but helpful command assistance
  bbsHelp: {
    messages: [
      "*rolls eyes* Press R to read messages. E to enter a message. MS to scan ALL conferences for new messages. It's not rocket science.",
      "Messages? Really? Okay, R reads 'em, E posts 'em, << and >> switch between message bases. Did you even look at the menu?",
      "Sigh... For messages: R to read, E to write, MS for mailscan. There's also ZOOM for offline mail packets if you're into that.",
      "I swear nobody reads the bulletins. R for reading messages, E for entering. Press B first next time, genius.",
      "Fine, I'll help. R to read messages, you can reply with R inside, or use E to post new ones. Happy now?",
    ],
    files: [
      "Files. Right. F lists 'em, N shows new files, D downloads, U uploads. Try to keep your ratio above 1:10 or I'll notice.",
      "*sighs* F for file listing, FR for reverse (newest first), D to download, U to upload. RZ does quick Zmodem upload.",
      "File commands: F, FR, N (new files), D (download), U (upload). There's also Z for searching. You're welcome.",
      "Okay so... F shows files, D downloads, U uploads. Don't be a leech - upload something good once in a while!",
      "Files 101: Press F. See files. Press D to download. Press U to upload. Ratios matter here. Don't forget it.",
    ],
    doors: [
      "Door games? Type DOORS to see the list. We got TradeWars, LoRD, all the classics. Try not to break 'em.",
      "Type DOORS - you know, D-O-O-R-S - to see all installed games and tools. Then pick one. It's not complicated.",
      "*sighs* Type the word DOORS to see what's installed. TradeWars 2002, Legend of the Red Dragon, BRE... the good stuff.",
      "DOORS command shows you all the games. Don't hog TradeWars for 3 hours like some people do. Share the love.",
      "Type DOORS. Pick a game. Play it. Don't cheat or I'll find out. High scores are sacred here.",
    ],
    navigation: [
      "Navigation? J to join conference, JM to join message base. < and > move between conferences. Expert mode is X.",
      "Conference navigation: < and > move up/down, J joins a conference by number. Did you read ANY of the help files?",
      "Okay... J joins a conference, JM joins a message base. < > navigates conferences. CF configures your conference settings.",
      "*adjusts glasses* Use < and > to move between conferences. J to jump to a specific one. It's literally in the menu.",
      "Sigh... Conferences: J to join, < > to navigate. Message bases: JM to join, << >> to switch. Got it?",
    ],
    general: [
      "? shows the menu in expert mode. H is help. B reads bulletins (which you SHOULD read). S shows your account status.",
      "General commands: ? for menu, H for help, S for status, T for time. X toggles expert mode. Try 'em out.",
      "Look... just press ? to see the menu. Or H for help. Or actually READ the bulletins with B. Wild idea, I know.",
      "Basic stuff: H = help, B = bulletins, S = status, T = time, WHO = see who's online. Can't believe I have to explain this.",
      "*facepalm* H for help, ? for menu, B for bulletins. It's all RIGHT THERE on the screen. In color ANSI. What more do you want?",
    ],
    expert: [
      "Expert mode? Press X to toggle it. It hides the menus and just shows prompts. For 1337 users only. You're probably not ready.",
      "X toggles expert mode. No menus, just prompts. Back in '91, we ALL used expert mode. Kids these days need their hand held.",
      "*snorts* Expert mode is X. But honestly? You should learn the commands first. Otherwise you'll just get lost.",
      "Press X for expert mode, X again to turn it off. It's for people who actually READ the docs. Unlike some people...",
      "Expert mode: X key. Hides menus, shows raw prompts. Saves bandwidth. Makes you look cool. Try it when you're ready.",
    ],
    ratios: [
      "Upload/download ratios? Yeah, we track that. Upload good stuff, you get more downloads. Be a leech, get limited. Economics 101.",
      "Ratios are important here. FS shows your stats. Upload quality > quantity. No junk files or I'll delete your account.",
      "*grumbles* Your ratio determines download access. Upload:Download. 1:10 minimum. Check with FS command. Don't be a leech.",
      "Ratio system is simple: contribute = download more. Leech = get cut off. FS shows your current ratio. Upload something useful!",
      "Press FS for your file stats and ratio. We're not AOL, we actually care about contributions. Upload something cool.",
    ],
  }
};

/**
 * Multi-tier AI Response System
 * Tries providers in order: Groq → Gemini → OpenRouter
 * Falls back to rule-based if all fail
 */

/**
 * Tier 1: Groq (Fast, Free, Llama 3.1)
 */
async function getGroqResponse(userMessage: string, context: ChatContext): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.log('[Grumpy Bot] No GROQ_API_KEY configured, skipping Groq');
    return null;
  }

  try {
    const messages = [
      { role: 'system', content: GRUMPY_SYSOP_PERSONALITY },
      { role: 'system', content: BBS_HELP_KNOWLEDGE },
      { role: 'system', content: `User context: ${context.userHandle} on node ${context.nodeId}, ${context.conferenceName}, online ${Math.floor(context.timeOnline / 60)} minutes` },
      ...context.messageHistory.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      })),
      { role: 'user', content: userMessage }
    ];

    console.log('[Grumpy Bot] Trying Groq (llama-3.1-8b-instant)...');

    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.1-8b-instant',
        messages: messages,
        max_tokens: 150,
        temperature: 0.9,
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 8000 // 8 second timeout (Groq is fast)
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

/**
 * Tier 2: Google Gemini (Free, Good Quality)
 */
async function getGeminiResponse(userMessage: string, context: ChatContext): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log('[Grumpy Bot] No GEMINI_API_KEY configured, skipping Gemini');
    return null;
  }

  try {
    // Gemini uses different message format
    const systemPrompt = `${GRUMPY_SYSOP_PERSONALITY}\n\n${BBS_HELP_KNOWLEDGE}\n\nUser context: ${context.userHandle} on node ${context.nodeId}, ${context.conferenceName}, online ${Math.floor(context.timeOnline / 60)} minutes`;

    const conversationHistory = context.messageHistory
      .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n');

    const fullPrompt = `${systemPrompt}\n\n${conversationHistory}\nUser: ${userMessage}\nAssistant:`;

    console.log('[Grumpy Bot] Trying Gemini (gemini-1.5-flash)...');

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        contents: [{
          parts: [{
            text: fullPrompt
          }]
        }],
        generationConfig: {
          maxOutputTokens: 150,
          temperature: 0.9,
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 10000 // 10 second timeout
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
        const isFree = promptPrice === 0 && completionPrice === 0;
        // Filter out "think" models as they are too verbose/slow for this use case
        // and often exhaust token limits with internal reasoning
        const isThinkingModel = model.id.toLowerCase().includes('think');

        return isFree && !isThinkingModel;
      })
      .map(model => model.id);

    console.log(`[Grumpy Bot] Discovered ${freeModels.length} free models:`, freeModels.slice(0, 5));

    return freeModels;
  } catch (error) {
    console.error('[Grumpy Bot] Failed to discover free models:', error instanceof Error ? error.message : error);
    return [];
  }
}

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
    console.log('[Grumpy Bot] No free models found');
    return null;
  }

  // Cache the results
  cachedFreeModels = freeModels;
  lastModelDiscovery = now;

  return freeModels[0];
}

async function getOpenRouterResponse(userMessage: string, context: ChatContext): Promise<string | null> {
  // Try to get a free model
  const freeModel = await getFreeModel();

  if (!freeModel) {
    console.log('[Grumpy Bot] No OpenRouter free models available');
    return null;
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.log('[Grumpy Bot] No OPENROUTER_API_KEY configured. OpenRouter requires an API key even for free models.');
    return null;
  }

  try {
    const messages = [
      { role: 'system', content: GRUMPY_SYSOP_PERSONALITY },
      { role: 'system', content: BBS_HELP_KNOWLEDGE },
      { role: 'system', content: `User context: ${context.userHandle} on node ${context.nodeId}, ${context.conferenceName}, online ${Math.floor(context.timeOnline / 60)} minutes` },
      ...context.messageHistory.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      })),
      { role: 'user', content: userMessage }
    ];

    console.log(`[Grumpy Bot] Trying OpenRouter (${freeModel})...`);

    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: freeModel,
        messages: messages,
        max_tokens: 1000,
        temperature: 0.9,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://amiexpress.com',
          'X-Title': 'AmiExpress BBS',
        },
        timeout: 10000
      }
    );

    const content = response.data.choices[0]?.message?.content;
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

    // If this model failed, try to find another one
    if (cachedFreeModels.length > 1) {
      console.log('[Grumpy Bot] Trying next OpenRouter model...');
      cachedFreeModels.shift();
      return getOpenRouterResponse(userMessage, context);
    }

    // Clear cache
    cachedFreeModels = [];
    lastModelDiscovery = 0;
    return null;
  }
}

/**
 * Master AI Response Function - Cascading Fallback
 * Tries: Groq → Gemini → OpenRouter → Rule-based
 */
async function getAIResponse(userMessage: string, context: ChatContext): Promise<string | null> {
  // Tier 1: Groq (fastest)
  let response = await getGroqResponse(userMessage, context);
  if (response) return response;

  // Tier 2: Gemini (best quality)
  response = await getGeminiResponse(userMessage, context);
  if (response) return response;

  // Tier 3: OpenRouter (fallback)
  response = await getOpenRouterResponse(userMessage, context);
  if (response) return response;

  console.log('[Grumpy Bot] All AI providers failed, falling back to rule-based');
  return null;
}

/**
 * Get contextual response modifiers (time of day, user experience, etc.)
 */
function getContextModifiers(context: ChatContext): string[] {
  const modifiers: string[] = [];
  const hour = new Date().getHours();

  // Time-based modifiers
  if (hour >= 5 && hour < 12) {
    modifiers.push(...RULE_BASED_RESPONSES.timeOfDay.morning);
  } else if (hour >= 22 || hour < 5) {
    if (hour >= 1 && hour < 5) {
      modifiers.push(...RULE_BASED_RESPONSES.timeOfDay.lateNight);
    } else {
      modifiers.push(...RULE_BASED_RESPONSES.timeOfDay.night);
    }
  }

  // User experience modifiers
  const onlineMinutes = Math.floor(context.timeOnline / 60);
  if (onlineMinutes < 5) {
    modifiers.push(...RULE_BASED_RESPONSES.context.newUser);
  } else if (onlineMinutes > 60) {
    modifiers.push(...RULE_BASED_RESPONSES.context.veteran);
  }

  return modifiers;
}

/**
 * Enhanced rule-based response with context awareness and variety
 */
function getRuleBasedResponse(userMessage: string, context?: ChatContext): string {
  const msg = userMessage.toLowerCase();

  // 20% chance to use contextual modifier first (if available)
  if (context && Math.random() < 0.2) {
    const modifiers = getContextModifiers(context);
    if (modifiers.length > 0) {
      return randomFrom(modifiers);
    }
  }

  // Expanded pattern matching with weighted randomization
  const patterns: Array<{ regex: RegExp; responses: string[]; weight: number }> = [
    { regex: /^(hi|hey|hello|sup|yo|heya|greetings)/i, responses: RULE_BASED_RESPONSES.greetings, weight: 1.0 },

    // BBS Help patterns (checked before generic questions)
    { regex: /how (do|can) i (read|view|see|check) message|where (are|is) message|message command|read mail|read msg/i, responses: RULE_BASED_RESPONSES.bbsHelp.messages, weight: 1.0 },
    { regex: /how (do|can) i (download|upload|get|send) file|file command|dl|ul|transfer|ratio|new files/i, responses: RULE_BASED_RESPONSES.bbsHelp.files, weight: 1.0 },
    { regex: /how (do|can) i play|door (game|command)|tradewars|lord|games|what doors/i, responses: RULE_BASED_RESPONSES.bbsHelp.doors, weight: 1.0 },
    { regex: /how (do|can) i (navigate|move|switch|change|join)|conference|navigation|where am i/i, responses: RULE_BASED_RESPONSES.bbsHelp.navigation, weight: 1.0 },
    { regex: /what (is|are) (the )?command|show (me )?(the )?command|list command|help command|menu/i, responses: RULE_BASED_RESPONSES.bbsHelp.general, weight: 1.0 },
    { regex: /expert mode|how (do|can) i (turn on|enable|use) expert|what is expert/i, responses: RULE_BASED_RESPONSES.bbsHelp.expert, weight: 1.0 },
    { regex: /ratio|upload.download|what.s my ratio|download limit|how much can i download/i, responses: RULE_BASED_RESPONSES.bbsHelp.ratios, weight: 1.0 },

    // Generic patterns (fall back to these)
    { regex: /\?|how|what|where|when|why|help|can you|could you|would you/i, responses: RULE_BASED_RESPONSES.questions, weight: 1.0 },
    { regex: /command|menu|how do i|how to|show me|tell me|explain/i, responses: RULE_BASED_RESPONSES.commands, weight: 1.0 },
    { regex: /file|download|upload|warez|ratio|transfer|dl|ul/i, responses: RULE_BASED_RESPONSES.files, weight: 1.0 },
    { regex: /door|game|play|tradewars|lord|bre|tele|arena|food fight/i, responses: RULE_BASED_RESPONSES.doors, weight: 1.0 },
    { regex: /thanks|thank you|cool|awesome|great|nice|love|appreciate|props|kudos/i, responses: RULE_BASED_RESPONSES.compliments, weight: 1.0 },
    { regex: /bye|later|logout|quit|exit|gotta go|see ya|peace|cya/i, responses: RULE_BASED_RESPONSES.goodbye, weight: 1.0 },
  ];

  // Find matching pattern
  for (const pattern of patterns) {
    if (msg.match(pattern.regex)) {
      // Sometimes combine with a follow-up for more natural conversation
      if (Math.random() < 0.15) {
        const firstResponse = randomFrom(pattern.responses);
        const secondResponse = randomFrom(RULE_BASED_RESPONSES.default);
        return `${firstResponse} ${secondResponse}`;
      }
      return randomFrom(pattern.responses);
    }
  }

  // No pattern match - use default with occasional flair
  if (Math.random() < 0.1) {
    // Add a random grumpy interjection
    const interjections = [
      "*sighs heavily*",
      "*rolls eyes*",
      "Okay so...",
      "Alright, fine.",
      "Here's the thing:",
      "Look, buddy...",
      "Real talk?",
      "*adjusts glasses*",
    ];
    const intro = randomFrom(interjections);
    const response = randomFrom(RULE_BASED_RESPONSES.default);
    return `${intro} ${response}`;
  }

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
    return `[AI] ${aiResponse}`;
  }

  // Fall back to rule-based
  console.log('[Grumpy Bot] Using rule-based response');
  return `[RB] ${getRuleBasedResponse(userMessage)}`;
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

/**
 * Simulate natural typing with realistic typos and corrections
 * Sends character-by-character to user's terminal with ANSI control codes
 * Displays at line 22 (typing preview line in split-screen chat)
 */
export async function simulateNaturalTyping(
  io: any,
  pageId: string,
  message: string,
  onComplete: () => void
): Promise<void> {
  const TYPO_PROBABILITY = 0.04; // 4% chance of typo per character
  const MIN_TYPING_DELAY = 20; // ms (fast typing)
  const MAX_TYPING_DELAY = 80; // ms (slow typing)
  const PAUSE_AFTER_TYPO = 150; // ms (pause to "realize" mistake)
  const BACKSPACE_DELAY = 40; // ms per backspace

  let buffer = '';

  // Helper to display typing buffer at line 23 (Sysop line in linear chat)
  // IMPORTANT: Truncate to prevent overflow
  const MAX_PREVIEW_WIDTH = 65; 
  const displayTyping = (text: string) => {
    let displayText = text;
    if (text.length > MAX_PREVIEW_WIDTH) {
      displayText = '...' + text.slice(-(MAX_PREVIEW_WIDTH - 3));
    }

    const ansiOutput =
      '\x1b7' + // Save cursor position (user typing at line 24)
      '\x1b[23;1H' + // Move to line 23
      '\x1b[2K' + // Clear line
      (displayText.length > 0
        ? `\x1b[36mGrumpyBot:\x1b[0m ${displayText}`
        : '') +
      '\x1b8'; // Restore cursor position

    io.to(`page:${pageId}`).emit('ansi-output', ansiOutput);
  };

  for (let i = 0; i < message.length; i++) {
    const char = message[i];
    const isSpace = char === ' ';
    const isPunctuation = /[.,!?;:]/.test(char);

    // Decide if we should make a typo
    const shouldTypo = Math.random() < TYPO_PROBABILITY &&
                       char.toLowerCase() in TYPO_MAP &&
                       !isSpace &&
                       !isPunctuation;

    if (shouldTypo) {
      // Make a typo - type wrong character
      const possibleTypos = TYPO_MAP[char.toLowerCase()];
      const typo = possibleTypos[Math.floor(Math.random() * possibleTypos.length)];
      const typedChar = char === char.toUpperCase() ? typo.toUpperCase() : typo;

      // Send the typo
      buffer += typedChar;
      displayTyping(buffer);

      // Pause (bot "realizes" the mistake)
      await sleep(PAUSE_AFTER_TYPO);

      // Backspace to correct
      buffer = buffer.slice(0, -1);
      displayTyping(buffer);

      await sleep(BACKSPACE_DELAY);

      // Type the correct character
      buffer += char;
      displayTyping(buffer);

      // Small delay after correction
      await sleep(MIN_TYPING_DELAY);
    } else {
      // Normal character - no typo
      buffer += char;
      displayTyping(buffer);

      // Variable typing speed - slower after punctuation or spaces
      let delay = MIN_TYPING_DELAY + Math.random() * (MAX_TYPING_DELAY - MIN_TYPING_DELAY);
      if (isPunctuation) {
        delay += 100; // Brief pause after punctuation
      } else if (isSpace) {
        delay += 20; // Slightly longer for word boundaries
      }

      await sleep(delay);
    }
  }

  // Typing complete - clear typing preview
  // Note: We don't clear line 23 here, as sendChatMessage will overwrite it
  // with the committed message immediately after.
  
  onComplete();
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
