/**
 * Delete guard for the Co-Sysop Personas page: a persona is never one click.
 *
 * The Trash button called `del.mutate(p.slug)` straight from `onClick`, so a
 * stray click on a row deleted a persona the board answers callers with -
 * its handle, its voice, its opening lines - with nothing asked and nothing
 * to undo. Same shape as `node-kick-guard.ts`: a pure function that says what
 * the dialog should say, so the words are testable without a render.
 */

export interface PersonaTarget {
  slug: string;
  handle?: string;
  name?: string;
}

export interface PersonaDeleteConfirm {
  title: string;
  message: string;
  confirmText: string;
  type: 'danger' | 'warning';
}

export function personaDeleteConfirmFor(persona: PersonaTarget): PersonaDeleteConfirm {
  const handle = persona.handle?.trim();
  const name = persona.name?.trim();
  const who = handle ? (name ? `${handle} (${name})` : handle) : persona.slug;
  return {
    title: 'Delete this persona?',
    message:
      `${who} is deleted from the board - its voice, catchphrase, opening lines and ` +
      `fallbacks go with it, and a caller paging the co-sysop will be answered by ` +
      `somebody else. Presets cannot be deleted, so this one cannot be restored from them.`,
    confirmText: 'Delete persona',
    type: 'danger',
  };
}
