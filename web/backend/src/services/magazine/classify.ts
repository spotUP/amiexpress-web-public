/**
 * WHICH DESK A STORY SITS AT, AND WHICH PAGES IT LANDS ON.
 *
 * §3 warns against the obvious failure: "Do not let one popular topic dominate
 * simply because it produces more online content." A feed mix skews hard
 * towards security news because security feeds post more often. Classification
 * is what stops the magazine from becoming that feed with a masthead.
 *
 * Rules before scores: a story that says "detroit techno" is music even when
 * the word "techno" also appears in a security story's URL.
 */
import { PAGE_FAMILIES, type Desk, type Story, type StoryFormat } from './story-store';

/**
 * Term -> desk, weighted. A term that appears in the headline or the summary
 * votes; the headline counts double, because a summary mentions the scene far
 * more often than the headline commits to it.
 */
const SIGNALS: Array<{ desk: Desk; terms: RegExp; weight: number }> = [
  // --- music: §3A, the largest coverage area in the brief.
  // "acid" alone is NOT a music signal: AcidCMS is a product and "acid" is an
  // adjective. The styles that carry the word carry it with the word.
  { desk: 'music', terms: /\b(acid house|acid techno|acid trance|electro|electrofunk|machine funk|techno|house|jungle|ragga|drum\s*&\s*bass|dnb|breakbeat|breakcore|rave|hardcore|garage|dubstep|industrial|power electronics|rhythmic noise|ebm|dark ambient|musique concr[eè]te|tape music|noise|sound art|hip-?hop|beat tape|turntabl|trip-?hop|downtempo|modular|synth|sid tune|tracker music|vinyl|12"|cassette|pressing|record shop|flyer|sound system|warehouse)\b/i, weight: 3 },
  { desk: 'music', terms: /\b(ninja tune|hessle|metalheadz|hyperdub|raster-?noton|ghostly|planet mu|cpu-?records|ovum|delsin|prspct|murder channel|hospital|temPLE|cost\?exalt|nothing\?trust|mekk\?texan|blasphemy|dub plate)\b/i, weight: 4 },
  // --- demoscene, retro, BBS: §3E, §3F
  { desk: 'scene', terms: /\b(amiga|commodore|c64|atari|st\b|68k|68000|assembler|asm\b|cracktro|demo\b|intro\b|cracktro|demo party|demoparty|intro|diskmag|scener|group|tracker chip|sid tune|chip music|vaporware|scene\.org|pouet|demozoo|bbs|bulletin board|express\.e|door|door game|petcs|c64\b|c16|plus4|vic20|atari)\b/i, weight: 3 },
  { desk: 'scene', terms: /\b(skaven|the silents|crionics|subhumans|phenomena|spaceballs|trash\b|cortex|hoeb|dr\. dream|bullet|software preserv|abandonware)\b/i, weight: 4 },
  // --- hacking, phreaking: §3D
  { desk: 'hack', terms: /\b(cve\b|cve-\d|vulnerab|0day|zero-?day|shellcode|payload|privilege escalation|rce\b|remote code execution|sql injection|buffer overflow|heap|rop\b|gadget|rootkit|metasploit|burp|malware|ransomware|infostealer|botnet|phish|reverse engineer|disassembl|decompil|ghidra|radare|crackme|keygen|crypto\b|cipher|kernel|exploit)\b/i, weight: 3 },
  { desk: 'hack', terms: /\b(phreak|blue box|pbx\b|ss7\b|voip\b|sip\b|war dial|pager|beeper|bluebox|maiden|trunk line|dtmf|modem|acoustic coupler|2600|cisco\\\\c|phrack|tone control)\b/i, weight: 4 },
  { desk: 'hack', terms: /\b(sdr\b|rtl-?sdr|gnuradio|spectrum|transmitter|fm\b|am\b pirate|pirate radio|pirate station|antenna|gnuradio|sdr#|airband|adsb)\b/i, weight: 3 },
  // --- graffiti: §3C
  { desk: 'graffiti', terms: /\b(graffiti|graff\b|writer\b|crew\b|piece\b|throw-?up|train\b bombing|fresco|mural|street art|urbex|urban exploration|abandoned|squat\b|tag\b|bombing|bombed|wildstyle|pieceing)\b/i, weight: 3 },
  // --- people: §3J
  { desk: 'people', terms: /\b(interview|talk(?:ed)? with|q&a|profile|podcast|conversation with|in conversation|the story of|documentary|oral history)\b/i, weight: 3 },
];

/**
 * A source whose whole subject is one desk's (a retro-computing essayist's
 * teaser often names no machine at all) lands there when the words carry no
 * signal of their own. Content still wins: a signal of its own outranks this.
 */
const SOURCE_HOME_DESK: Record<string, Desk> = {
  'datagubbe.se': 'scene',
};

export function classify(story: Pick<Story, 'headline' | 'summary' | 'source'>): Desk {
  const head = story.headline ?? '';
  const body = story.summary ?? '';
  const scores: Record<string, number> = {};

  for (const sig of SIGNALS) {
    const inHead = sig.terms.test(head);
    const inBody = sig.terms.test(body);
    if (inHead) scores[sig.desk] = (scores[sig.desk] ?? 0) + sig.weight * 2;
    if (inBody) scores[sig.desk] = (scores[sig.desk] ?? 0) + sig.weight;
  }

  // §3's own warning, enforced: a source that posts a lot does not get a desk.
  // A story with no signal is a general story and lands on the front page,
  // where a human decides, rather than being shoved into whichever feed is
  // chattiest this week.
  let best: Desk = 'general';
  let bestScore = 0;
  for (const [desk, score] of Object.entries(scores)) {
    if (score > bestScore) {
      best = desk as Desk;
      bestScore = score;
    }
  }
  if (bestScore >= 3) return best;
  return SOURCE_HOME_DESK[story.source ?? ''] ?? 'general';
}

/**
 * The format a story is written AS (§5). Derived from the wording, because the
 * format is a property of the sentence, not of the desk.
 */
export function classifyFormat(story: Pick<Story, 'headline' | 'summary'>): StoryFormat {
  // A real space, not `\s`: inside a template literal `\s` is not an escape,
  // it is the letter s - so the headline and the summary were welded together
  // and every word boundary between them stopped matching.
  const text = `${story.headline ?? ''} ${story.summary ?? ''}`;
  if (/\b(releases?|released?|launch(?:es|ed)?|out now|new (?:ep|lp|album|version|release)|announc(?:e|ed|ing)|drops?)\b/i.test(text)) return 'RELEASE';
  if (/\b(announc(?:e|ed)|tonight|saturday|sunday|party at|line-?up|doors|gig|event|raver|warehouse)\b/i.test(story.summary ?? '')) return 'EVENT';
  if (/\b(interview|talk(?:ed)? with|q&a|podcast|in conversation)\b/i.test(text)) return 'INTERVIEW';
  if (/\b(how to|technique|tutorial|diy|build your|walkthrough|reverse engineer|crackme|step by step)\b/i.test(text)) return 'TECHNIQUE';
  if (/\b(archive|preserv|restor|rediscov|lost|forgotten|recovered|found on)\b/i.test(text)) return 'ARCHIVE';
  if (/\b(history|back in|origin of|used to|back then|remember when|in the 80s|in the 90s)\b/i.test(text)) return 'HISTORY';
  if (/\b(odd|weird|strange|curiosit|absurd|bizarre)\b/i.test(text)) return 'DISCOVERY';
  return 'NEWS';
}

/** The page range a desk owns. */
export function familyFor(desk: Desk) {
  return PAGE_FAMILIES[desk];
}