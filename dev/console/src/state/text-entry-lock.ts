/**
 * Shared "a page owns the keyboard right now" flag.
 *
 * Ink calls every mounted component's `useInput` callback for every
 * keypress, regardless of which panel looks focused - there is no DOM focus
 * model underneath it. App.tsx's global hotkeys (`q` to quit, `?` for help)
 * and Sidebar.tsx's up/down page-cycling therefore fire on EVERY keypress,
 * including ones a page's own form is trying to consume as free text.
 *
 * Before password reset and user creation existed, this only ever
 * surfaced as a cosmetic annoyance (a username search box that also nudged
 * the sidebar). Once a page collects a password, that same collision quits
 * the console mid-entry the first time someone types "q", and `?` discards
 * the form outright by swapping in the help overlay. Arrow-driven forms have
 * the matching defect: with focus still on the sidebar (the default before
 * the first Tab), up/down in a page's own form also cycles the sidebar's
 * selected page and unmounts the form under it.
 *
 * This is a plain module-level flag, not React state - Sidebar.tsx already
 * uses refs for the same reason ("Ink registers the handler once"), and a
 * flag read at keypress time needs to be current regardless of when the
 * owning page last rendered. Pair with `useTextEntryLock` (same directory)
 * from a page component; call the setter directly only from non-component
 * code.
 */
let active = false;

export function setTextEntryActive(value: boolean): void {
  active = value;
}

export function isTextEntryActive(): boolean {
  return active;
}
