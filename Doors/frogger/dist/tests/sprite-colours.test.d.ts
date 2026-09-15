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
/**
 * No visible sprite may contain a cell that draws nothing at all.
 *
 * A cell with black in BOTH halves is a hole: the glyph is painted black on
 * black and the terminal's own ground shows through unchanged. The fly was
 * exactly this - two white wings with its body missing between them - and it
 * survived the wheel fix because the wheels were black on a COLOUR and this
 * is black on black. Both are the same mistake seen from different sides.
 */
export declare function nothingVisibleIsPaintedBlackOnBlack(): Promise<void>;
/**
 * The frog's own pixels are not the road's near-neighbour.
 *
 * The sysop, after the wheels: "the frogger sprite needs to be changed as
 * well". The frog is bright green (10) with legs in dark green (2), which is
 * legible against its own body and nearly not there against the black road.
 * The legs THAT SIT ON THE ROAD are bright now; a dark-green half paired with
 * a coloured half is shading and is left alone, which is why this rule is
 * about the pairing rather than about colour 2.
 */
export declare function theFrogIsNotDarkGreenOnTheRoad(): Promise<void>;
//# sourceMappingURL=sprite-colours.test.d.ts.map