/**
 * The sounds the game asks for.
 *
 * A sound effect cannot report that it never played, so every cue is
 * asserted here rather than left to be noticed by ear. The game pushes
 * names into `game.cues` and never touches a socket, which is what makes
 * this testable at all.
 *
 * The three outcomes of a joust are the point: winning, losing and bouncing
 * off level must sound different, because from the saddle they look almost
 * the same and the player learns the lance height by ear.
 */
/** The flap is Joust's signature sound. */
export declare function flappingSounds(): Promise<void>;
/** Winning a joust, losing one and bouncing are three different sounds. */
export declare function theThreeOutcomesOfAJoustSoundDifferent(): Promise<void>;
/** An egg left behind is worth collecting, and says so. */
export declare function collectingAnEggSounds(): Promise<void>;
/** An egg that hatches puts an enemy back on the board. */
export declare function anEggHatchingSounds(): Promise<void>;
/** Losing the last life ends the game audibly. */
export declare function losingTheLastLifeSoundsGameOver(): Promise<void>;
/** The death cue fires once, however many enemies are on top of the player. */
export declare function deathSoundsOnce(): Promise<void>;
/** Clearing the wave. */
export declare function clearingTheWaveSounds(): Promise<void>;
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
