/**
 * Frogger - Game Types
 * 1981 Konami arcade game port
 */
export type GameState = "attract" | "menu" | "playing" | "dying" | "levelComplete" | "gameover" | "highscores" | "enterName" | "paused";
export type Direction = "up" | "down" | "left" | "right";
export type LaneType = "safe" | "road" | "water" | "home";
export type VehicleType = "car" | "truck" | "racecar";
export type RiverObjectType = "log" | "turtle" | "crocodile" | "otter" | "snake" | "alligator";
/** Which kind of log a water lane is made of (FAQ 6.4's #S/#L/#M). */
export type LogSize = "short" | "medium" | "long";
export interface Position {
    x: number;
    y: number;
}
export interface Frog {
    x: number;
    y: number;
    direction: Direction;
    isJumping: boolean;
    jumpProgress: number;
    isDead: boolean;
    deathType: "car" | "water" | "timeout" | "edge" | "snake" | "crocodile" | null;
    deathFrame: number;
    onObject: RiverObject | null;
    /**
     * Where on that object the frog is standing, in whole cells.
     *
     * Held as an offset rather than as its own position, so the frog and its
     * footing round to the same cell and move as one.
     */
    rideOffset?: number;
}
export interface Vehicle {
    id: number;
    type: VehicleType;
    x: number;
    y: number;
    lane: number;
    width: number;
    speed: number;
}
export interface RiverObject {
    id: number;
    type: RiverObjectType;
    x: number;
    y: number;
    lane: number;
    width: number;
    speed: number;
    isDiving?: boolean;
    diveTimer?: number;
    /** Turtle sets that dive; the FAQ's #D counts one diving set per lane. */
    canDive?: boolean;
    /**
     * Where a diving set is in its cycle: riding high, going down but still
     * solid, or under the surface and deadly.
     */
    diveStage?: 'up' | 'sinking' | 'down';
    /** A snake riding this log (FAQ 7: "they sometimes like to ride on the logs"). */
    snakeAt?: number | null;
    /**
     * The lady frog riding this log (FAQ 7: "You may see a purple frog hopping
     * around on the log in water lane #2").
     */
    ladyFrogAt?: number | null;
    /** Which end of a crocodile or otter is its mouth: the leading edge. */
    mouthWidth?: number;
}
export interface HomeSlot {
    x: number;
    occupied: boolean;
    hasFly: boolean;
    hasAlligator: boolean;
    /** When the fly or crocodile currently sitting here goes away. */
    visitorUntil?: number;
}
export interface Lane {
    type: LaneType;
    y: number;
    /** The FAQ's own lane number, counting away from the median. */
    lane: number;
    objects: (Vehicle | RiverObject)[];
    direction: 1 | -1;
    speed: number;
}
/** A snake patrolling the median (FAQ 6.4: snakes appear there or on a log). */
export interface Snake {
    id: number;
    x: number;
    y: number;
    direction: 1 | -1;
    speed: number;
}
export interface HighScore {
    name: string;
    score: number;
    level: number;
    date: string;
}
export interface FroggerData {
    state: GameState;
    score: number;
    lives: number;
    level: number;
    timeRemaining: number;
    frog: Frog;
    lanes: Lane[];
    homes: HomeSlot[];
    homesCompleted: number;
    vehicleIdCounter: number;
    riverObjectIdCounter: number;
    flyTimer: number;
    alligatorTimer: number;
    ladyFrogTimer: number;
    otterTimer: number;
    /** Snakes patrolling the median (FAQ 6.4). */
    snakes: Snake[];
    snakeIdCounter: number;
    /** Carrying the lady frog home is worth 200 (FAQ 6.3). */
    carryingLadyFrog: boolean;
    /**
     * The highest row this frog has reached on this trip, as a y coordinate.
     * Hop points are paid once per row, capped per home (FAQ 6.3).
     */
    furthestRow: number;
    hopPointsThisHome: number;
    /** How many lives a new game starts with (FAQ 6.3's operator setting). */
    startingLives: number;
    /** Whether the free frog at 20,000 has been handed out yet. */
    extraLifeAwarded: boolean;
    /** When the current frog's trip began, for the lane 4 speed-up. */
    frogStartTime: number;
    highscores: HighScore[];
    menuSelection: number;
    playerName: string;
    lastUpdateTime: number;
    frameCount: number;
}
export type InputKey = "up" | "down" | "left" | "right" | "space" | "enter" | "escape" | "p" | "q" | "backspace" | string;
/**
 * One row of FAQ 6.4's level table.
 */
export interface LevelConfig {
    level: number;
    /** How many vehicles sit in road lanes 1..5. */
    cars: number[];
    /** The table's F/S for lane 4. */
    lane4Fast: boolean;
    /** The #D figures: sets of turtles in water lanes 1 and 4. */
    turtleSets: [number, number];
    /** #S, water lane 2. */
    shortLogs: number;
    /** #L, water lane 3. */
    longLogs: number;
    /** #M, water lane 5. */
    mediumLogs: number;
    /** The table's C: lane 5 is a crocodile rather than logs. */
    lane5Crocodile: boolean;
    /** "Every Nth log in lane #5 a crocodile", or null for none. */
    crocEveryNth: number | null;
    /** One snake from level 3, a second from level 7. */
    snakes: number;
    /** "CROC IN HOME MAKES APPEARANCE" from level 2. */
    crocInHome: boolean;
}
export type SoundEffect = "hop" | "splash" | "squash" | "home" | "levelComplete" | "timeWarning" | "gameOver" | "bonusFly" | "ladyFrog" | "extraLife";
export interface RPCMethods {
    getHighscores: () => Promise<HighScore[]>;
    saveHighscore: (params: {
        name: string;
        score: number;
        level: number;
    }) => Promise<void>;
}
//# sourceMappingURL=types.d.ts.map