/**
 * The shipped sprite sheet is complete and valid.
 *
 * The renderer (game/render.ts) asks for these sprites and animations BY
 * NAME; a missing one throws mid-game. This test walks the exact set the
 * renderer uses, so a renamed animation fails here, not in front of a
 * player.
 */
export declare function everySpriteAndAnimationTheRendererNamesExists(): Promise<void>;
export declare function everySpriteIsOneBoardCell(): Promise<void>;
export declare function deathHoldsItsLastFrame(): Promise<void>;
//# sourceMappingURL=sprites-assets.test.d.ts.map