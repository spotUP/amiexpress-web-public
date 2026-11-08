/**
 * Door-colour themes, screen (board art) themes and co-sysop personas a door reads and sets through BBSApi.
 *
 * Moved out of BBSApi.ts (file size); BBSApi keeps a one-line method for each, so
 * the door-facing surface is unchanged.
 */
import type { Socket } from 'socket.io';

import type { BBSSession } from '../index';


/**
 * The caller's door theme, resolved.
 *
 * This is how a door stops hardcoding colours:
 *
 *     const theme = bbs.getTheme();
 *     const s = themeStyles(theme);
 *     createBox({ ...s.panel, label: ' DOORS ' });
 *
 * Always returns a theme - an absent or unrecognised preference resolves
 * to CLASSIC, which reproduces the board exactly as it has always looked.
 * A door never has to handle "no theme", and a cosmetic setting can never
 * be the reason a door fails to draw.
 */
export function doorGetTheme(session: BBSSession): any {
  const { themeById } = require('@amiexpress/bbs-door-sdk/engines/ui/theme');
  return themeById(session.user?.themePreference);
}

/**
 * Change the caller's theme and remember it.
 *
 * Resolved before it is stored, so an id this board does not have can
 * neither be written to the user's row nor puzzle somebody later - it
 * becomes CLASSIC, which is the board as it always was. Returns the id
 * that was actually saved.
 *
 * Takes effect the next time a door draws: a door already on screen has
 * its widgets built from the old theme, and repainting somebody's UI out
 * from under them is worse than asking them to re-enter it.
 */
export async function doorSetTheme(session: BBSSession, id: string): Promise<string> {
  const { themeById } = require('@amiexpress/bbs-door-sdk/engines/ui/theme');
  const resolved = themeById(id);

  if (session.user) {
    const { db } = require('../database');
    await db.updateUser(session.user.id, { themePreference: resolved.id });
    session.user.themePreference = resolved.id;
  }
  return resolved.id;
}

/** Every theme this board offers, for a door that wants to show a list. */
export function doorListThemes(): Array<{ id: string; name: string; blurb: string }> {
  const { THEMES } = require('@amiexpress/bbs-door-sdk/engines/ui/theme');
  return THEMES.map((t: any) => ({ id: t.id, name: t.name, blurb: t.blurb }));
}

/**
 * The SCREEN themes this caller may wear - the board's ART, not the door
 * colours above.
 *
 * Answered by `selectableThemes`, the same function the loader consults, so
 * a picker can never offer a theme the loader would then refuse.
 */
export function doorListScreenThemes(session: BBSSession): Array<{ slug: string; title: string; author: string; widths: number[]; status: string }> {
  const { selectableThemes } = require('../screens/caller-theme');
  const { config } = require('../config');
  return selectableThemes(config.get('dataDir'), {
    username: session.user?.username,
    secLevel: session.user?.secLevel,
    screenTheme: session.user?.screenTheme,
  }).map((theme: { slug: string; title: string; author: string; widths: number[]; status: string }) => ({
    slug: theme.slug, title: theme.title, author: theme.author,
    widths: theme.widths, status: theme.status,
  }));
}

/** The screen theme this caller is wearing right now. */
export function doorGetScreenTheme(session: BBSSession): string {
  const { resolveCallerTheme } = require('../screens/caller-theme');
  const { config } = require('../config');
  return resolveCallerTheme(config.get('dataDir'), {
    username: session.user?.username,
    secLevel: session.user?.secLevel,
    screenTheme: session.user?.screenTheme,
  });
}

/** Every persona this caller may pick - presets plus the sysop's own. */
export function doorListCoSysopPersonas(): Array<{ slug: string; handle: string; name: string; blurb: string }> {
  try {
    const { allPersonas } = require('../handlers/sysop-ai/personas');
    const { db } = require('../database');
    let extra: any[] = [];
    try { extra = db.getOperatorChatRepository().listPersonas(); } catch { /* table not yet migrated */ }
    return allPersonas(extra).map((p: any) => ({ slug: p.slug, handle: p.handle, name: p.name, blurb: p.blurb }));
  } catch {
    const { PRESET_PERSONAS } = require('../handlers/sysop-ai/personas');
    return PRESET_PERSONAS.map((p: any) => ({ slug: p.slug, handle: p.handle, name: p.name, blurb: p.blurb }));
  }
}

/** The slug the caller chose - '' for the board's, 'random', or a persona slug. */
export function doorGetCoSysopPersona(session: BBSSession): string {
  return (session.user?.aiPersona ?? '') as string;
}

/**
 * Remember which co-sysop answers this caller's pages. Answers the slug
 * actually in force: a slug nothing recognises is REFUSED, because a stored
 * preference the chat would not honour is a caller who pages and gets a
 * stranger while the picker says otherwise.
 */
export async function doorSetCoSysopPersona(session: BBSSession, slug: string): Promise<string> {
  const raw = String(slug ?? '').trim().toLowerCase();
  // '' and 'random' are choices, not personas - the board answers with them.
  if (raw === '' || raw === 'random') {
    if (session.user) {
      const { db } = require('../database');
      await db.updateUser(session.user.id, { aiPersona: raw });
      session.user.aiPersona = raw;
    }
    return raw;
  }
  // Anything else must be a persona the board knows - preset or the sysop's own.
  const roster = doorListCoSysopPersonas();
  const wanted = roster.find((p) => p.slug.toLowerCase() === raw);
  if (!wanted) return doorGetCoSysopPersona(session);
  if (session.user) {
    const { db } = require('../database');
    await db.updateUser(session.user.id, { aiPersona: wanted.slug });
    session.user.aiPersona = wanted.slug;
  }
  return wanted.slug;
}

/**
  * Wear a screen theme. Answers the slug that is actually in force.
 *
 * Refusing rather than storing an unwearable slug is the point: a stored
 * preference the loader will not honour is a caller who sees the default
 * board and a picker that says otherwise. A theme that names a companion
 * DOOR theme applies it in the same action, through `setTheme` so an unknown
 * id resolves to `classic` rather than a broken door - and never the reverse:
 * picking a door theme leaves the board's art alone, because a door theme is
 * the board's and a screen theme may be one artist's work.
 */
export async function doorSetScreenTheme(socket: Socket, session: BBSSession, slug: string): Promise<string> {
  const { canWearTheme, companionDoorTheme, resolveCallerTheme } = require('../screens/caller-theme');
  const { findTheme, DEFAULT_SLUG } = require('../screens/theme-registry');
  const { config } = require('../config');
  const root = config.get('dataDir');

  const caller = {
    username: session.user?.username,
    secLevel: session.user?.secLevel,
    screenTheme: session.user?.screenTheme,
  };

  const wanted = (slug ?? '').trim().toLowerCase();
  const entry = wanted === DEFAULT_SLUG ? null : findTheme(root, wanted);
  const allowed = wanted === DEFAULT_SLUG || (entry && canWearTheme(caller, entry));
  if (!allowed) return resolveCallerTheme(root, caller);

  if (session.user) {
    const { db } = require('../database');
    await db.updateUser(session.user.id, { screenTheme: wanted });
    session.user.screenTheme = wanted;
  }
  // The browser remembers the theme for the screens it draws before the
  // next login (the title). It was told only at login, so a theme picked
  // mid-call drew the OLD theme's title at the next connect and the right
  // one only the time after (sysop, 2026-10-02: h7 picked, 607080's title).
  socket.emit('screen-theme', { screenTheme: wanted });

  const companion = companionDoorTheme(root, wanted);
  if (companion) await doorSetTheme(session, companion);

  return wanted;
}
