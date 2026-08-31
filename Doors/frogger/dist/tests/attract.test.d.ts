/**
 * Attract mode: the title, the point table, the score ranking, the
 * invitation, and the machine playing itself.
 */
/** The title spells FROGGER in a block font. */
export declare function theTitleSpellsFrogger(): Promise<void>;
/** The title carries the arcade's yellow shading beside the green. */
export declare function theTitleIsShaded(): Promise<void>;
/**
 * The point table quotes the four scoring rules, and quotes the numbers the
 * game actually pays rather than hard-coded ones.
 */
export declare function thePointTableListsWhatTheGamePays(): Promise<void>;
/** The ranking lists five places, highest score first. */
export declare function theRankingListsTheTopFiveInOrder(): Promise<void>;
/** The invitation names the lives setting rather than a fixed number. */
export declare function theInvitationNamesTheLivesSetting(): Promise<void>;
/** ...and asks for a key, because a BBS door has no coin slot. */
export declare function theInvitationAsksForAKeyNotACoin(): Promise<void>;
/** The invitation blinks. */
export declare function theInvitationBlinks(): Promise<void>;
/** The credit goes to Konami without claiming their copyright for us. */
export declare function theCreditNamesKonamiWithoutClaimingTheirCopyright(): Promise<void>;
/** The phases rotate in order and wrap round. */
export declare function thePhasesRotateAndWrap(): Promise<void>;
/** Every panel carries the title and the credit; the demo carries neither. */
export declare function everyPanelCarriesTheTitleExceptTheDemo(): Promise<void>;
/** Each phase holds for a sensible while. */
export declare function everyPhaseHasADuration(): Promise<void>;
/**
 * The demo actually plays: from the bank, it works its way up the board.
 */
export declare function theDemoPlaysTheGame(): Promise<void>;
/**
 * The demo will not hop into a car.
 *
 * Asserted by putting one exactly where it wants to go, rather than by
 * playing on and hoping: level 1 has three cars in forty cells, so a demo
 * that ignores traffic entirely still usually survives a few seconds.
 */
export declare function theDemoWillNotHopIntoACar(): Promise<void>;
/** With the lane clear, it hops. */
export declare function theDemoHopsWhenTheRoadIsClear(): Promise<void>;
/** It will not hop into open water either. */
export declare function theDemoWillNotHopIntoWater(): Promise<void>;
/** A demo game is a game like any other: it starts on the bank. */
export declare function theDemoStartsOnTheBank(): Promise<void>;
//# sourceMappingURL=attract.test.d.ts.map