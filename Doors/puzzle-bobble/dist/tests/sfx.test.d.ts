/**
 * The sounds the game asks for.
 *
 * A sound effect cannot report that it never played, so every cue is
 * asserted here rather than left to be noticed by ear. The game pushes
 * names into `game.cues` and never touches a socket, which is what makes
 * this testable at all.
 *
 * Every shot ends one of two ways - it sticks, or it pops - and the player
 * aims the next one differently depending on which. That pair is the one
 * worth protecting.
 */
/** Firing. */
export declare function shootingSounds(): Promise<void>;
/** A second shot while one is still flying makes no sound. */
export declare function shootingWhileABubbleIsInFlightIsSilent(): Promise<void>;
/** A shot that sticks and one that pops sound different. */
export declare function stickingAndPoppingSoundDifferent(): Promise<void>;
/** The ceiling coming down is the pressure the whole game applies. */
export declare function theCeilingDroppingSounds(): Promise<void>;
/** Clearing the grid finishes the level. */
export declare function clearingTheGridSoundsTheLevel(): Promise<void>;
/** Bubbles reaching the shooter ends it. */
export declare function reachingTheShooterSoundsGameOver(): Promise<void>;
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
 * Then "too long tails" was reported TWICE - at 5-7s, and again at
 * 1.8-2.4s. That is a DIFFERENT knob from wet: decay and feedback. So the
 * ceiling here is on those two and the wetness floor stays where it is.
 * Anyone tuning this again should move decay and feedback and leave wet
 * alone; a send is parallel, so lowering wet costs audibility without
 * shortening anything.
 */
export declare function theEffectsAreSentWetToBothReverbAndEcho(): Promise<void>;
