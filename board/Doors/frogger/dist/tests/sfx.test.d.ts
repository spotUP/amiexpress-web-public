/**
 * The sounds the game asks for.
 *
 * A sound effect cannot report that it never played, so every cue is
 * asserted here rather than left to be noticed by ear. The game pushes
 * names into `game.cues` and never touches a socket, which is what makes
 * this testable at all.
 *
 * The distinctions matter as much as the presence: drowning and being run
 * over must not sound the same, or the sound is decoration rather than
 * feedback.
 */
/** A hop the player made is a hop the player hears. */
export declare function aHopMakesASound(): Promise<void>;
/** A hop into the wall goes nowhere, so it says nothing. */
export declare function aHopIntoTheWallIsSilent(): Promise<void>;
/** Drowning and being run over are different sounds. */
export declare function drowningSoundsDifferentFromBeingRunOver(): Promise<void>;
/** Running out of time is its own warning, not a generic death. */
export declare function theClockRunningOutSoundsLikeAClock(): Promise<void>;
/** Getting a frog home is the reward the game is built around. */
export declare function reachingAHomeSounds(): Promise<void>;
/** The fly in the home is a bonus, and it is heard as one. */
export declare function eatingTheFlyAddsItsOwnSound(): Promise<void>;
/** Carrying the lady frog home pays 200, and says so. */
export declare function deliveringTheLadyFrogSounds(): Promise<void>;
/** Filling all five homes finishes the level. */
export declare function fillingTheLastHomeSoundsTheLevel(): Promise<void>;
/** FAQ 6.3: "you get one free frog at 20,000 points" - and you hear it. */
export declare function theFreeFrogSounds(): Promise<void>;
/** Losing the last frog ends the game audibly. */
export declare function losingTheLastFrogSoundsGameOver(): Promise<void>;
/**
 * Attract mode stays silent.
 *
 * Not by suppressing anything: the demo game's cues are simply never
 * drained, and the queue is bounded, so a menu left up all night neither
 * makes a noise nor grows.
 */
export declare function anUndrainedDemoStaysBounded(): Promise<void>;
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
//# sourceMappingURL=sfx.test.d.ts.map