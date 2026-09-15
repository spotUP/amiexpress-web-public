/**
 * Nothing in a road sprite may be drawn in the road's own colour.
 *
 * The sysop, 2026-09-15: "frogger has sprites with black pixels that are not
 * visible on black backgrounds. the cars wheels etc."
 *
 * Every vehicle is drawn as half-blocks - the body is the background of a
 * `▀`/`▄` cell and the wheels are the FOREGROUND of the other half. Those
 * wheels were colour 0, which is exactly the colour of the road behind them,
 * so each wheel read as a hole punched through the car rather than a wheel.
 * They are blue now.
 *
 * The rule is stated as a property rather than as four expected values,
 * because the next sprite someone draws by hand will reach for black again.
 */
/** A vehicle's own pixels are visible against the road. */
export declare function noRoadSpriteDrawsInBlack(): Promise<void>;
/**
 * The transparent half is still transparent.
 *
 * A vehicle is a half-block: one half is the body, the other half must let the
 * road through. Recolouring the wheels must not have filled that in - a car
 * with a solid rectangle behind it is a worse bug than an invisible wheel.
 */
export declare function theRoadStillShowsThroughTheOtherHalf(): Promise<void>;
/** Every cell still carries a glyph, so the recolour edited colours only. */
export declare function everyCellStillHasItsGlyph(): Promise<void>;
//# sourceMappingURL=sprite-colours.test.d.ts.map