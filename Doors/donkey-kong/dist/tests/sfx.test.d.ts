/**
 * The sounds the game asks for.
 *
 * A sound effect cannot report that it never played, so every cue is
 * asserted here rather than left to be noticed by ear. The game pushes
 * names into `game.cues` and never touches a socket, which is what makes
 * this testable at all.
 *
 * Hitting a barrel with the hammer and being hit by one are the same
 * collision in the code and opposite events to the player, so they are the
 * pair worth protecting.
 */
/** The jump. */
export declare function jumpingSounds(): Promise<void>;
/** A jump that cannot happen makes no sound. */
export declare function aJumpInMidAirIsSilent(): Promise<void>;
/** With the hammer a barrel is smashed; without it, it is fatal. */
export declare function theHammerTurnsADeathIntoASmash(): Promise<void>;
/** Picking the hammer up. */
export declare function takingTheHammerSounds(): Promise<void>;
/** Pulling a rivet is the rivet stage's only move. */
export declare function pullingARivetSounds(): Promise<void>;
/** Losing the last life ends the game audibly. */
export declare function losingTheLastLifeSoundsGameOver(): Promise<void>;
/** The death cue fires once, however many barrels are on top of Mario. */
export declare function deathSoundsOnce(): Promise<void>;
/** An undrained queue stays bounded. */
export declare function anUndrainedQueueStaysBounded(): Promise<void>;
/**
 * The effects are sent to a reverb AND an echo: wet, but short.
 *
 * Two corrections, in opposite directions, and this holds the band between
 * them.
 *
 * First pass was reported as needing "much more echo/reverb/wetness". Part
 * of why it was so dry is structural: the SDK builds ONE parallel send at
 * max(reverb.wet, echo.wet), and no echo was declared at all, so the send
 * carried nothing but the reverb wash. Hence the floor on both wets.
 *
 * Second pass was reported as "way too long tails". That is a DIFFERENT
 * knob - decay and feedback, not wet - so the ceiling here is on those, and
 * the wetness floor stays where it is. Anyone tuning this again should move
 * decay and feedback, and leave wet alone.
 */
export declare function theEffectsAreSentWetToBothReverbAndEcho(): Promise<void>;
