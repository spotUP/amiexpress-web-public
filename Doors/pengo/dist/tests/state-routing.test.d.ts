/**
 * The main input switch in index.ts must not quit to the menu during a
 * timed animation hand-over.
 *
 * Reported: "the game ends after level 1". `GameState` has nine members
 * (menu, playing, dying, levelComplete, gameover, highscores, enterName,
 * paused, help) but the switch only handled seven - `dying` and
 * `levelComplete` fell through to `default: showMenu()`. Both states are
 * entered by PengoGame itself and left on a timer (dying via
 * pengo.isDead/deathFrame counted up in update(); levelComplete via the
 * setTimeout in update() that flips state back to 'playing' after 2000ms).
 * A keypress landing during that window used to drop the player straight to
 * the main menu, which reads exactly like the game ending after level 1.
 *
 * index.ts wires blessed widgets and a live Door at module scope (see
 * `door.onStart` / `new Screen(...)`), so - same as menu.test.ts - these
 * assertions read the switch as source text rather than importing and
 * driving it, to avoid constructing a real Door/Screen in the test process.
 */
/**
 * A keypress during 'levelComplete' must not fall through to the menu.
 *
 * The game itself owns the transition back to 'playing' (the setTimeout in
 * PengoGame.update()); routing player input here has nothing to do and must
 * not touch gameData.state.
 */
export declare function levelCompleteIgnoresInputInsteadOfQuittingToMenu(): Promise<void>;
/** Same guarantee, spelled out for the death animation on its own. */
export declare function dyingIgnoresInputInsteadOfQuittingToMenu(): Promise<void>;
/**
 * The catch-all must be a compile-time exhaustiveness guard, not a runtime
 * "go to the menu" for whatever state didn't get an explicit case - that
 * destructive default is what turned the missing dying/levelComplete cases
 * into "the game ends after level 1" instead of a typecheck failure.
 */
export declare function theDefaultCaseIsExhaustivenessNotAMenuBailout(): Promise<void>;
/**
 * Every other route the switch drove before this fix must still drive the
 * same handler, in the same case, unchanged. This fix is about two missing
 * cases, not a rewrite of the router.
 */
export declare function everyOtherRouteIsUnchanged(): Promise<void>;
/** GameState must be imported so the exhaustiveness check can reference it. */
export declare function gameStateIsImportedForTheExhaustivenessCheck(): Promise<void>;
//# sourceMappingURL=state-routing.test.d.ts.map