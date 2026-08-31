/**
 * The sounds the game asks for.
 *
 * A sound effect cannot report that it never played, so every cue is
 * asserted here rather than left to be noticed by ear. The game pushes
 * names into `game.cues` and never touches a socket, which is what makes
 * this testable at all.
 *
 * The boss takes two shots, so the first one must SOUND different from the
 * second: a hit that does not kill is the only way the player learns the
 * boss is not a bee.
 */
/** Firing. */
export declare function firingSounds(): Promise<void>;
/** A hit that kills and one that does not are different sounds. */
export declare function aBossTakingAHitSoundsDifferentFromDying(): Promise<void>;
/** Rescuing the captured fighter is Galaga's whole risk-and-reward. */
export declare function rescuingTheCapturedFighterSounds(): Promise<void>;
/** Being shot down. */
export declare function beingShotDownSounds(): Promise<void>;
/** Losing the last life ends the game audibly. */
export declare function losingTheLastLifeSoundsGameOver(): Promise<void>;
/** Clearing the sky finishes the stage. */
export declare function clearingTheStageSounds(): Promise<void>;
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
//# sourceMappingURL=sfx.test.d.ts.map