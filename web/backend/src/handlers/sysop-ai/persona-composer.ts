/**
 * THE BUILDER'S COMPOSER - a persona from a form, not from a prompt box.
 *
 * Sysops write bad system prompts. Not through carelessness: the voice rules
 * in `personas.ts` are INVISIBLE to whoever is typing into a text box, so a
 * hand-written persona silently drops the constraints that keep SHIFTY and
 * MERCURY funny instead of a liability. So the admin offers a BUILDER and the
 * prompt is composed here, from one template, and every board persona
 * inherits the voice rules automatically.
 *
 * That is the whole reason the builder exists: the rules are in the template,
 * not in the sysop's memory. Nothing in this module lets a caller - or a
 * sysop - hand the model a prompt that has not been through it.
 *
 * Design: thoughts/shared/plans/2026-09-08-co-sysop-personas-design.md, s.9.
 */
import {
  VOICE_RULES,
  MAX_HANDLE_LENGTH,
  normalizeHandle,
  normalizeSlug,
  type Persona,
} from './personas';

/** Warm or cold, patient or impatient, terse or verbose, formal or slangy. */
export interface PersonaTemperament {
  warmth: 'warm' | 'cold';
  patience: 'patient' | 'impatient';
  length: 'terse' | 'verbose';
  register: 'formal' | 'slangy';
}

/** What the sysop fills in. Opening and fallback lines are optional. */
export interface PersonaDraft {
  slug?: string;
  handle: string;
  name: string;
  trade: string;
  temperament: PersonaTemperament;
  /** Something they say. */
  catchphrase?: string;
  /** The one thing they always bring up. */
  alwaysBringsUp?: string;
  /** The one thing they refuse to discuss. */
  refusesToDiscuss?: string;
  /** Blank means generated. */
  openingLines?: string[];
  /** Blank means generated. */
  fallbackLines?: string[];
}

export const DEFAULT_TEMPERAMENT: PersonaTemperament = {
  warmth: 'warm',
  patience: 'patient',
  length: 'terse',
  register: 'slangy',
};

const WARMTH_LINE: Record<PersonaTemperament['warmth'], string> = {
  warm: 'You are warm. You are pleased to hear from people and it shows.',
  cold: 'You are cool and unsentimental - never cruel, never humiliating, just unbothered.',
};
const PATIENCE_LINE: Record<PersonaTemperament['patience'], string> = {
  patient: 'You are patient. A question asked twice gets answered twice.',
  impatient: 'You are impatient. You answer and you move on, and you let it show that you are busy.',
};
const LENGTH_LINE: Record<PersonaTemperament['length'], string> = {
  terse: 'You are terse: one or two sentences, and no filler.',
  verbose: 'You take a couple of sentences more than you need, because you enjoy talking.',
};
const REGISTER_LINE: Record<PersonaTemperament['register'], string> = {
  formal: 'You speak properly - full sentences, no slang.',
  slangy: 'You speak in scene slang, the way a BBS did in 1993.',
};

/** A one-line trimmed field, or an empty string. */
function line(raw: string | null | undefined): string {
  return String(raw ?? '').replace(/\s+/g, ' ').trim();
}

/** Non-empty lines only, capped so a form cannot become a novel. */
function lines(raw: string[] | null | undefined, cap = 6): string[] {
  return (raw ?? []).map((l) => line(l)).filter((l) => l !== '').slice(0, cap);
}

/**
 * THE TEMPLATE. Every board persona's prompt comes out of here, and the voice
 * rules are the last thing in it so they outrank whatever the sysop typed.
 */
export function composePersonaPrompt(draft: PersonaDraft): string {
  const handle = normalizeHandle(draft.handle) || 'CO-SYSOP';
  const name = line(draft.name);
  const trade = line(draft.trade);
  const temperament = { ...DEFAULT_TEMPERAMENT, ...(draft.temperament ?? {}) };

  const parts: string[] = [];
  parts.push(
    `You are ${handle}${name ? ` - ${name}` : ''}, ${trade ? `${/^[aeiou]/i.test(trade) ? 'an' : 'a'} ${trade.toLowerCase()} and ` : ''}the co-sysop of this Amiga bulletin board. You answer pages when the sysop does not.`,
  );
  parts.push('');
  parts.push(WARMTH_LINE[temperament.warmth]);
  parts.push(PATIENCE_LINE[temperament.patience]);
  parts.push(LENGTH_LINE[temperament.length]);
  parts.push(REGISTER_LINE[temperament.register]);

  const always = line(draft.alwaysBringsUp);
  if (always) parts.push(`You always bring the conversation back to ${always}.`);

  const refuses = line(draft.refusesToDiscuss);
  if (refuses) parts.push(`You refuse to discuss ${refuses}, and you change the subject when it comes up.`);

  const catchphrase = line(draft.catchphrase);
  if (catchphrase) parts.push(`You say "${catchphrase}" now and then, and never twice in a row.`);

  if (name) parts.push(`Your name is ${name}; ${handle} is your handle on the board.`);

  parts.push('');
  parts.push(VOICE_RULES);

  return parts.join('\n');
}

/** Something to say when it takes a page, if the sysop wrote nothing. */
function generatedOpeningLines(handle: string): string[] {
  return [
    `${handle} here. The sysop is not answering, so you have got me. What do you need?`,
    `The sysop is out. ${handle}, co-sysop. Go ahead.`,
    `${handle}. Sysop is away. What can I do for you?`,
  ];
}

/** Something to say when no model is reachable, if the sysop wrote nothing. */
function generatedFallbackLines(handle: string): string[] {
  return [
    'My connection to the outside just dropped - ask me again in a minute.',
    `${handle} here - I cannot reach anything outside the board right now. Try again shortly.`,
  ];
}

/**
 * A finished persona from the builder's form.
 *
 * The prompt is ALWAYS composed, never taken from the draft: a stored prompt
 * that did not come through `composePersonaPrompt` is a prompt without the
 * voice rules, which is exactly what the builder exists to prevent.
 */
export function personaFromDraft(draft: PersonaDraft): Persona {
  const handle = normalizeHandle(draft.handle);
  const slug = normalizeSlug(draft.slug || handle);
  const openingLines = lines(draft.openingLines);
  const fallbackLines = lines(draft.fallbackLines);
  const trade = line(draft.trade);
  const name = line(draft.name);

  return {
    slug,
    handle: handle.slice(0, MAX_HANDLE_LENGTH),
    name,
    blurb: [trade, line(draft.alwaysBringsUp)].filter((s) => s !== '').join('. ') || `${handle}, co-sysop.`,
    systemPrompt: composePersonaPrompt(draft),
    openingLines: openingLines.length > 0 ? openingLines : generatedOpeningLines(handle || 'The co-sysop'),
    fallbackLines: fallbackLines.length > 0 ? fallbackLines : generatedFallbackLines(handle || 'The co-sysop'),
  };
}

/**
 * "Describe it and let the board write it."
 *
 * One model call, reusing the co-sysop's own configured model, filling the
 * BUILDER'S FIELDS - not a prompt. The output still goes through the composer,
 * so a generated persona is no less constrained than a typed one.
 */
export function describePersonaPrompt(description: string): string {
  return [
    'You fill in a form. Answer with ONE JSON object and nothing else - no prose, no markdown fence, no explanation.',
    '',
    'The keys, all of them required:',
    '  handle            a scene alias, upper case, at most 30 characters',
    '  name              a full human name',
    '  trade             what they do, two or three words',
    '  warmth            "warm" or "cold"',
    '  patience          "patient" or "impatient"',
    '  length            "terse" or "verbose"',
    '  register          "formal" or "slangy"',
    '  catchphrase       one short thing they say',
    '  alwaysBringsUp    the one subject they always return to',
    '  refusesToDiscuss  the one subject they will not discuss',
    '',
    'Invent nothing about real people. The description:',
    '',
    line(description),
  ].join('\n');
}

const ONE_OF = <T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(String(raw ?? '').trim().toLowerCase() as T)
    ? (String(raw).trim().toLowerCase() as T)
    : fallback;

/**
 * The model's answer, as builder fields - or NULL.
 *
 * NULL IS THE POINT. A model that answers with prose, or with JSON that has no
 * handle in it, leaves the form for the sysop to fill rather than half-filling
 * it with rubbish he then has to notice and undo. The one accommodation made
 * is a fenced block, because models fence JSON even when told not to.
 */
export function parseDescribedPersona(raw: string | null | undefined): PersonaDraft | null {
  const text = String(raw ?? '');
  if (text.trim() === '') return null;

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

  const handle = normalizeHandle(typeof parsed.handle === 'string' ? parsed.handle : '');
  // No handle, no persona: the handle is the pin a revived chat is recovered
  // by, and a draft without one cannot be saved anyway.
  if (handle === '') return null;

  return {
    handle,
    name: line(typeof parsed.name === 'string' ? parsed.name : ''),
    trade: line(typeof parsed.trade === 'string' ? parsed.trade : ''),
    temperament: {
      warmth: ONE_OF(parsed.warmth, ['warm', 'cold'] as const, DEFAULT_TEMPERAMENT.warmth),
      patience: ONE_OF(parsed.patience, ['patient', 'impatient'] as const, DEFAULT_TEMPERAMENT.patience),
      length: ONE_OF(parsed.length, ['terse', 'verbose'] as const, DEFAULT_TEMPERAMENT.length),
      register: ONE_OF(parsed.register, ['formal', 'slangy'] as const, DEFAULT_TEMPERAMENT.register),
    },
    catchphrase: line(typeof parsed.catchphrase === 'string' ? parsed.catchphrase : ''),
    alwaysBringsUp: line(typeof parsed.alwaysBringsUp === 'string' ? parsed.alwaysBringsUp : ''),
    refusesToDiscuss: line(typeof parsed.refusesToDiscuss === 'string' ? parsed.refusesToDiscuss : ''),
  };
}
