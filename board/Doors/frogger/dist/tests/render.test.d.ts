/**
 * How the board is drawn.
 *
 * These read the CELL BUFFER that `buildBoard` returns, not the tag string
 * the door finally sends. The old versions pulled each rendered row apart
 * with a regular expression that knew the glyph painter's tag format; when
 * the renderer changed, the regex matched nothing and every one of these
 * tests started asserting against an empty array - passing or failing for
 * reasons that had nothing to do with the board. Cells cannot go stale
 * that way: there is one representation and the tests read it.
 *
 * What is checked here is what a PLAYER can see - that a log looks like a
 * log, that the frog is never hidden by the thing carrying it, that a
 * submerged turtle leaves water behind. Four bugs reached the user during
 * this rewrite because nothing rendered a board and looked at it.
 */
/** The board is exactly the screen it is drawn into. */
export declare function theBoardIsTheSizeOfTheScreen(): Promise<void>;
/**
 * Every lane is drawn, and drawn where the rules put it.
 *
 * A lane that renders one row off is the fault that made the game feel
 * "offset from the level": what the player reads and what the rules use
 * have to be the same rows.
 */
export declare function everyLaneIsDrawnOnItsOwnRows(): Promise<void>;
/** A log is drawn where the log is, and it is not water-coloured. */
export declare function aLogIsDrawnAsALog(): Promise<void>;
/** Turtles are drawn, and they are not the same as a log. */
export declare function turtlesAreDrawnAsTurtles(): Promise<void>;
/**
 * A submerged turtle leaves water, not footing.
 *
 * The frog drowns on it, so it must not look like something to stand on.
 */
export declare function aDivedTurtleShowsOnlyWater(): Promise<void>;
/**
 * Traffic faces the way it travels.
 *
 * The sprite is drawn facing one way and mirrored for the other, so a lane
 * can be read at a glance. Two vehicles going opposite ways must not draw
 * the same cells.
 */
export declare function aVehicleFacesTheWayItIsGoing(): Promise<void>;
/**
 * The frog is drawn over whatever carries it.
 *
 * A frog hidden under its own log is the worst thing this door can do: the
 * player loses track of where they are.
 */
export declare function theFrogIsDrawnOverItsFooting(): Promise<void>;
/** A home shows whether it is empty, taken, or holding a crocodile. */
export declare function aHomeShowsWhatIsInIt(): Promise<void>;
/**
 * An empty home is visible against the hedge.
 *
 * Reported live: "i cant see any homes to jump into". The opening was drawn
 * transparent, so the hedge showed through it and there was nothing to aim
 * at. An opening the player cannot see is an opening they cannot use.
 */
export declare function anEmptyHomeStandsOutFromTheHedge(): Promise<void>;
/** The banks carry a texture rather than being a flat block of colour. */
export declare function theBanksAreTextured(): Promise<void>;
/** A snake riding a log is drawn on top of it. */
export declare function aSnakeOnALogIsVisible(): Promise<void>;
/** A dying frog animates rather than sitting still. */
export declare function aDyingFrogAnimates(): Promise<void>;
/** Drowning looks different from being run over. */
export declare function drowningLooksDifferentFromBeingRunOver(): Promise<void>;
/**
 * Every sprite is drawn inside its own lane.
 *
 * Reported live twice: a two-row sprite in a one-row lane either hung off
 * the bottom of the board ("the frog starts halfway outside the bottom of
 * the screen") or leaned into the lane above and lied about where it stood
 * ("it feels like I should do one more jump but I end up in the water").
 * Nothing may draw outside the rows its lane owns.
 */
export declare function nothingIsDrawnOutsideItsLane(): Promise<void>;
/** The frog is visible against every lane it can stand on. */
export declare function theFrogStandsOutFromEveryLane(): Promise<void>;
/** The game-over panel is laid over the board, not instead of it. */
export declare function theGameOverPanelDoesNotBlackOutTheBoard(): Promise<void>;
/** The frog rides its log rather than drifting off it. */
export declare function theFrogStaysPutOnTheLogItRides(): Promise<void>;
/**
 * The board uses only characters a BBS terminal draws.
 *
 * It is NOT pure ASCII any more, and cannot be: the sprites are half-block
 * pixel art, the same as Pengo's, and the block glyphs are what make a
 * five-by-four pixel frog possible at all. What matters is that every
 * character is one the CP437/ANSI terminals this BBS serves can render -
 * the block set and the space, nothing exotic.
 */
export declare function theBoardUsesOnlyDrawableCharacters(): Promise<void>;
//# sourceMappingURL=render.test.d.ts.map