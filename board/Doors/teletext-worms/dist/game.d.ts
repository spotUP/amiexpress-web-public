/**
 * A match: two teams, a landscape, and whose turn it is.
 *
 * Deliberately separate from physics.ts (which decides where a shell lands)
 * and from render.ts (which draws the page). What lives here is the turn
 * order and the win condition, which is the part a rule argument is
 * actually about.
 *
 * One side runs this and nobody else does. When two callers play, the
 * player who opened the lobby owns the match and sends the other a picture
 * of it - so there is no question of two machines having to agree about
 * floating point, which is the classic way a turn-based game desyncs.
 */
import { type Terrain, type Worm, type Damage, type ShotResult, type Rng } from './physics';
export declare const BLAST_RADIUS = 7;
export declare const BLAST_DAMAGE = 45;
export declare const MAX_WIND = 5;
export interface TeamInfo {
    name: string;
    /** Who is playing this team, when a caller is. */
    playerId: string | null;
}
export interface Aim {
    /** Degrees above horizontal, 0 to 90. */
    angle: number;
    /** 1 to 10. */
    power: number;
    facing: -1 | 1;
}
export interface TurnOutcome {
    shot: ShotResult;
    /** What the blast cost, then what the fall cost. */
    blast: Damage[];
    falls: Damage[];
    killed: string[];
}
export interface Match {
    terrain: Terrain;
    worms: Worm[];
    teams: TeamInfo[];
    /** Whose turn: an index into teams. */
    turn: number;
    /** Which worm of each team is up. */
    active: number[];
    wind: number;
    aim: Aim;
    lastOutcome: TurnOutcome | null;
    over: boolean;
    winner: number | null;
    turnsTaken: number;
    rng: Rng;
}
export interface MatchOptions {
    seed?: number;
    wormsPerTeam?: number;
    hp?: number;
    teams?: [string, string];
    playerIds?: [string | null, string | null];
}
export declare function newMatch(options?: MatchOptions): Match;
/** The worm whose turn it is, or null when the match is over. */
export declare function activeWorm(match: Match): Worm | null;
export declare function teamWorms(match: Match, team: number): Worm[];
export declare function teamHp(match: Match, team: number): number;
/** Nudge the aim. Angle and power are clamped, not wrapped. */
export declare function adjustAim(match: Match, change: Partial<Aim>): void;
/**
 * Fire, resolve, and hand the turn over.
 *
 * Everything the caller needs to draw the result comes back in one object,
 * because the next thing that happens is a page being composed from it.
 */
export declare function takeTurn(match: Match): TurnOutcome | null;
/** Pass play to the other team, and roll the wind for them. */
export declare function endTurn(match: Match): void;
/** Who is allowed to press fire right now. */
export declare function activePlayerId(match: Match): string | null;
/**
 * A picture of the match, flat enough to hand to another door instance.
 *
 * The terrain travels as a plain array rather than a typed array because
 * it may be structured-cloned or JSON'd on the way, and a Uint8Array that
 * arrives as `{0: 1, 1: 0, ...}` is a bug nobody enjoys finding.
 */
export interface MatchView {
    width: number;
    height: number;
    solid: number[];
    worms: Worm[];
    teams: TeamInfo[];
    turn: number;
    wind: number;
    aim: Aim;
    over: boolean;
    winner: number | null;
    turnsTaken: number;
    /** Only the arc, which is all the other side needs to draw the shot. */
    lastPath: {
        x: number;
        y: number;
    }[] | null;
    lastImpact: {
        x: number;
        y: number;
    } | null;
    killed: string[];
}
export declare function toView(match: Match): MatchView;
/** The other side's picture, as something render.ts can draw. */
export declare function fromView(view: MatchView): {
    terrain: Terrain;
    worms: Worm[];
    view: MatchView;
};
