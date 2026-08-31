/**
 * The sounds the game asks for.
 *
 * A sound effect cannot report that it never played, so every cue is
 * asserted here rather than left to be noticed by ear. The game pushes
 * names into `game.cues` and never touches a socket, which is what makes
 * this testable at all.
 *
 * The distinctions matter as much as the presence: a wall shake that stuns
 * a Sno-Bee and one that catches nobody must not sound the same, because
 * the difference is the whole timing of the move.
 */
/** Pushing a block is what Pengo does; it should be what Pengo sounds like. */
export declare function pushingABlockSounds(): Promise<void>;
/** A block that catches a Sno-Bee crushes it, audibly. */
export declare function crushingASnoBeeSounds(): Promise<void>;
/** A wall shake that stuns and one that catches nobody are different sounds. */
export declare function aWallShakeSaysWhetherItCaughtAnything(): Promise<void>;
/** Lining the diamonds up is the biggest score in the game. */
export declare function liningUpTheDiamondsSounds(): Promise<void>;
/** ...and it announces itself once, not on every push thereafter. */
export declare function theDiamondFanfareDoesNotRepeat(): Promise<void>;
/** Being caught by a Sno-Bee. */
export declare function beingCaughtSounds(): Promise<void>;
/** The death cue fires once, not on every frame of the death animation. */
export declare function deathSoundsOnce(): Promise<void>;
/** Losing the last life ends the game audibly. */
export declare function losingTheLastLifeSoundsGameOver(): Promise<void>;
/** Clearing the board finishes the level. */
export declare function clearingTheBoardSoundsTheLevel(): Promise<void>;
/** An undrained queue stays bounded, so attract mode neither sounds nor leaks. */
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