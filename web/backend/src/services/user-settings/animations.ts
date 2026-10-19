/**
 * THE ANIMATIONS-OFF GATE, ONCE (W row 23, users.noanimations).
 *
 * Every board animation asks here: the screen wipe player
 * (wipeEffectsEnabled), the menu cover flow slide (coverflowSlides through
 * MenuCaller.animations), the AEW_ANIMATIONS data field a C door reads, and
 * the SDK effect gate a TypeScript door reads through runInDoorContext.
 *
 * A caller who turned animations off still gets them inside a game: a game's
 * motion is the game (session.runningDoorIsGame, set by executeDoor from the
 * door's package.json category).
 */
export interface AnimationsSession {
  user?: { noAnimations?: boolean } | null;
  runningDoorIsGame?: boolean;
}

export function animationsAllowed(session: AnimationsSession | null | undefined): boolean {
  if (session?.runningDoorIsGame === true) return true;
  return session?.user?.noAnimations !== true;
}
