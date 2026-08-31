/**
 * Who a high score is recorded under.
 *
 * Reported live 2026-08-31: "i cant type all characters in the highscore
 * entry", and "the name can be auto filled the bbs knows the username so
 * entry can be skipped like in gmaster".
 *
 * The door took three characters, and only letters and digits, so a BBS
 * handle with a symbol in it could not be typed at all - and it asked for
 * initials the BBS already knew.
 */
/** A handle is longer than three initials. */
export declare function aNameHasRoomForAHandle(): Promise<void>;
/** Letters and digits still go in. */
export declare function lettersAndDigitsAreAccepted(): Promise<void>;
/**
 * ...and so does everything else a handle can contain. This is the reported
 * bug: the filter was /[A-Za-z0-9]/, so none of these could be typed.
 */
export declare function theRestOfAHandleIsAcceptedToo(): Promise<void>;
/** Control keys are not characters and do not go in the name. */
export declare function controlKeysAreNotTyped(): Promise<void>;
export declare function theBbsUsernameIsTakenWhenThereIsOne(): Promise<void>;
export declare function anAbsentUsernameFallsBackToAsking(): Promise<void>;
//# sourceMappingURL=highscore-name.test.d.ts.map