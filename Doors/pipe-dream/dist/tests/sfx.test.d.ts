/**
 * The sounds the game asks for.
 *
 * A sound effect cannot report that it never played, so every cue is
 * asserted here rather than left to be noticed by ear. The game pushes
 * names into `game.cues` and never touches a socket, which is what makes
 * this testable at all.
 *
 * Laying a pipe and throwing one away are one keypress apart, and a
 * mis-hit discard costs the level. They must not sound alike.
 */
/** Laying a pipe and discarding one sound different. */
export declare function layingAndDiscardingSoundDifferent(): Promise<void>;
/** A place that cannot happen makes no sound. */
export declare function placingOnAnObstacleIsSilent(): Promise<void>;
/** Moving the cursor is silent - it happens constantly and means nothing. */
export declare function movingTheCursorIsSilent(): Promise<void>;
/** The water arriving is the clock the whole level runs on. */
export declare function theWaterStartingSounds(): Promise<void>;
/** Each pipe the water fills is the tick the player is racing. */
export declare function eachFilledPipeSounds(): Promise<void>;
/** Running out of pipe ends the game; Pipe Dream has no lives to lose. */
export declare function theLeakSoundsGameOverAndNotADeath(): Promise<void>;
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
