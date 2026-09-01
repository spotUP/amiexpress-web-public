/**
 * Frogger - Game Engine
 * Core game logic for the 1981 Konami arcade classic
 *
 * The level's traffic, footing and hazards all come from FAQ 6.4's table by
 * way of getLevelConfig; nothing here invents a count or a direction.
 */
import { Sprite } from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';
import { FroggerData, Direction } from './types';
import { SfxCues } from '@amiexpress/bbs-door-sdk/engines/ui/arcade';
export declare class FroggerGame {
    private data;
    private renderCallback;
    /**
     * What just happened, for whoever is listening.
     *
     * The game never touches a socket: it names the moment and the door
     * decides whether anybody hears it. That keeps the sound design
     * assertable - a test can step the game and check that drowning sounds
     * different from being run over - and it keeps attract mode silent, since
     * the demo's cues are simply never drained.
     */
    readonly cues: SfxCues;
    /**
     * The sprite sheet the board is drawn from.
     *
     * Required, not optional: there is no second renderer to fall back to.
     * A door that can draw without its art is a door whose art can silently
     * stop being used, which is how the glyph painter this replaced managed
     * to outlive its usefulness.
     */
    private sheet;
    constructor(data: FroggerData, onRender: (content: string) => void, sheet: Record<string, Sprite>);
    /**
     * The game's own clock, in milliseconds of play.
     *
     * Driven by the frame counter rather than the wall clock, so that when a
     * fly is due after eight seconds it is due after eight seconds of GAME,
     * not of real time - a paused or slow-running door would otherwise skew
     * every timer in here.
     */
    private clock;
    /**
     * Initialize a new level
     */
    initLevel(): void;
    /**
     * Fill the road lanes with the table's car counts (FAQ 6.4).
     *
     * Spread evenly with a little jitter rather than dropped at random: the
     * FAQ's advice is to "plan for gaps to form in the first three lanes so
     * you don't become trapped", and gaps only exist if the traffic is spaced.
     */
    private populateRoad;
    private vehicleForLane;
    /**
     * Fill the water lanes, each with what the FAQ says belongs in it: sets of
     * turtles in lanes 1 and 4, short logs in 2, long logs in 3, and medium
     * logs - or crocodiles - in 5.
     */
    private populateWater;
    /**
     * A lane of turtle sets, exactly one of which dives.
     *
     * FAQ 6.4's key: "#D = NUMBER OF SETS OF TURTLES ALONG WITH THE SET OF
     * DIVING TURTLES" - the diving set is one of the count, not an extra, and
     * there is always exactly one.
     */
    private fillTurtleLane;
    private fillLogLane;
    /**
     * Water lane 5, which is where the crocodiles live.
     *
     * The table's C means the lane IS crocodiles (levels 5 and 10); otherwise
     * the notes column says every Nth log up here is one instead.
     */
    private fillLaneFive;
    private makeCrocodile;
    /**
     * Put the level's snakes out (FAQ 6.4: "Snakes appear randomly in either
     * the median, log, or both places").
     */
    private placeSnakes;
    /**
     * How much quicker the river is running than it should be.
     *
     * FAQ 7: "if you waste too much time, the things on the river will move
     * quicker so you will have to adjust your strategy accordingly."
     */
    riverSpeedScale(): number;
    /**
     * The extra speed lane 4 picks up as a trip drags on.
     *
     * FAQ 6.4: "cars in Lane 4 will travel fast after a specific period of
     * time if they aren't traveling fast already" - a lane the table already
     * marked fast does not get it twice.
     */
    lane4SpeedScale(): number;
    /**
     * Handle direction input
     */
    handleDirection(direction: Direction): void;
    /**
     * Main game update
     */
    update(): void;
    /** FAQ 6.3: "you get one free frog at 20,000 points". */
    private awardExtraLife;
    /**
     * Update all moving objects
     */
    private updateObjects;
    /**
     * Surface and dive the turtle sets that dive.
     *
     * FAQ 7: "Be wary of the diving turtles and only use them as a quick
     * bypass to a more solid footing." Only the set the level table marks as
     * divers goes under; the rest are dependable.
     */
    private updateTurtle;
    /** Walk the median snakes back and forth. */
    private updateSnakes;
    /**
     * The things that come and go: the fly in a home, the crocodile in a home,
     * the lady frog on a lane 2 log, and the otter on the water.
     */
    private updateVisitors;
    /**
     * Update frog position when riding an object
     */
    private updateFrogOnObject;
    /**
     * Check all collisions
     */
    checkCollisions(): void;
    /** Is the frog on the leading, business end of a crocodile or otter? */
    private inMouth;
    /** FAQ 7: the snake "is deadly to your frog and you cannot hop over it". */
    private checkMedianSnake;
    private overlaps;
    /**
     * Check if frog reached a home slot.
     *
     * FAQ 7: "You must hit exact center or your frog will die." The door used
     * to take anything within two cells.
     */
    checkHomeArrival(): void;
    /**
     * Put the frog in a home and pay for it (FAQ 6.3).
     */
    settleFrogInHome(index: number): void;
    /**
     * Move on to the next level.
     *
     * Driven by the door rather than a timer in here, so that the hand-over
     * can be shown for as long as the door wants to show it.
     */
    advanceLevel(): void;
    /**
     * Kill the frog
     */
    private killFrog;
    /**
     * Respawn frog after death
     */
    private respawnFrog;
    /** A fresh trip: back to the bank, full clock, hop points reset. */
    private startNextTrip;
    /**
     * Reset frog to starting position
     */
    private resetFrogPosition;
    /**
     * One move of the machine playing itself, for attract mode.
     *
     * Deliberately cautious rather than clever: it only hops when the row it
     * is hopping into has something to land on, edges towards a free home on
     * the last row, and otherwise waits. A demo that dies every few seconds
     * reads as a broken game rather than an invitation to play.
     */
    demoStep(): void;
    /** Is the cell the demo wants to hop into free of traffic? */
    private roadIsClear;
    /** Is there something to stand on where the demo wants to hop? */
    private footingAt;
    /** Line the demo up with a free home, then hop in. */
    private demoAimForHome;
    /**
     * Render the board.
     *
     * Coloured lanes with character sprites laid over them, in the style of
     * Philippe Majerus's Frogger ANSI. Each logical cell is CELL_WIDTH
     * characters wide, so a cell comes out roughly square and forty of them
     * fill the eighty-column screen exactly.
     */
    render(): void;
    /**
     * The GAME OVER panel, laid over the middle of the board.
     *
     * Written into the CELL BUFFER, before anything becomes a tag string.
     * It used to pull each rendered row apart with a regular expression that
     * knew the old painter's tag format; the engine writes tags in a
     * different shape, so the panel silently landed in an empty array and
     * the game-over screen came up blank. Cells cannot go stale that way -
     * there is one representation and the panel writes into it.
     *
     * The cabinet blinks GAME OVER and asks for a coin; a BBS door has no
     * coin slot, so it asks for a key.
     */
    private overlayGameOver;
}
//# sourceMappingURL=frogger-game.d.ts.map