"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_WIND = exports.BLAST_DAMAGE = exports.BLAST_RADIUS = void 0;
exports.newMatch = newMatch;
exports.activeWorm = activeWorm;
exports.teamWorms = teamWorms;
exports.teamHp = teamHp;
exports.adjustAim = adjustAim;
exports.takeTurn = takeTurn;
exports.endTurn = endTurn;
exports.activePlayerId = activePlayerId;
exports.toView = toView;
exports.fromView = fromView;
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
const physics_1 = require("./physics");
exports.BLAST_RADIUS = 7;
exports.BLAST_DAMAGE = 45;
exports.MAX_WIND = 5;
function newMatch(options = {}) {
    const seed = options.seed ?? Math.floor(Math.random() * 0xffffffff);
    const rng = (0, physics_1.makeRng)(seed);
    const perTeam = Math.max(1, Math.min(4, options.wormsPerTeam ?? 2));
    const hp = options.hp ?? 100;
    const terrain = (0, physics_1.generateTerrain)(rng);
    const worms = [];
    for (let team = 0; team < 2; team++) {
        for (let at = 0; at < perTeam; at++) {
            // Teams start on opposite halves, spread across their own side, so a
            // match never opens with a worm already under the enemy's feet.
            const half = physics_1.FIELD_WIDTH / 2;
            const margin = 6;
            const span = half - margin * 2;
            const x = Math.round(team * half + margin + (span / Math.max(1, perTeam)) * (at + 0.5));
            const at_ = (0, physics_1.place)(terrain, Math.max(1, Math.min(physics_1.FIELD_WIDTH - 2, x)));
            worms.push({ id: `${team}-${at}`, team, x: at_.x, y: at_.y, hp });
        }
    }
    return {
        terrain,
        worms,
        teams: [
            { name: options.teams?.[0] ?? 'RED', playerId: options.playerIds?.[0] ?? null },
            { name: options.teams?.[1] ?? 'BLUE', playerId: options.playerIds?.[1] ?? null },
        ],
        turn: 0,
        active: [0, 0],
        wind: rollWind(rng),
        aim: { angle: 45, power: 6, facing: 1 },
        lastOutcome: null,
        over: false,
        winner: null,
        turnsTaken: 0,
        rng,
    };
}
function rollWind(rng) {
    return Math.round((rng() * 2 - 1) * exports.MAX_WIND);
}
/** The worm whose turn it is, or null when the match is over. */
function activeWorm(match) {
    if (match.over)
        return null;
    const living = teamWorms(match, match.turn);
    if (living.length === 0)
        return null;
    const at = match.active[match.turn] % living.length;
    return living[at];
}
function teamWorms(match, team) {
    return match.worms.filter(worm => worm.team === team && worm.hp > 0);
}
function teamHp(match, team) {
    return teamWorms(match, team).reduce((total, worm) => total + worm.hp, 0);
}
/** Nudge the aim. Angle and power are clamped, not wrapped. */
function adjustAim(match, change) {
    if (change.angle !== undefined) {
        match.aim.angle = Math.max(0, Math.min(90, match.aim.angle + change.angle));
    }
    if (change.power !== undefined) {
        match.aim.power = Math.max(1, Math.min(10, match.aim.power + change.power));
    }
    if (change.facing !== undefined)
        match.aim.facing = change.facing;
}
/**
 * Fire, resolve, and hand the turn over.
 *
 * Everything the caller needs to draw the result comes back in one object,
 * because the next thing that happens is a page being composed from it.
 */
function takeTurn(match) {
    const worm = activeWorm(match);
    if (!worm || match.over)
        return null;
    const shot = (0, physics_1.fire)(match.terrain, worm, match.worms, {
        angle: match.aim.angle,
        power: match.aim.power,
        facing: match.aim.facing,
        wind: match.wind,
    });
    const before = new Map(match.worms.map(w => [w.id, w.hp]));
    let blast = [];
    if (shot.impact) {
        blast = (0, physics_1.explode)(match.terrain, match.worms, shot.impact, exports.BLAST_RADIUS, exports.BLAST_DAMAGE);
    }
    const falls = (0, physics_1.settle)(match.terrain, match.worms);
    const killed = match.worms
        .filter(w => w.hp <= 0 && (before.get(w.id) ?? 0) > 0)
        .map(w => w.id);
    const outcome = { shot, blast, falls, killed };
    match.lastOutcome = outcome;
    match.turnsTaken++;
    endTurn(match);
    return outcome;
}
/** Pass play to the other team, and roll the wind for them. */
function endTurn(match) {
    const red = teamWorms(match, 0).length;
    const blue = teamWorms(match, 1).length;
    if (red === 0 || blue === 0) {
        match.over = true;
        // Both teams wiped out in one blast is a draw, and a draw is a real
        // result in an artillery game - it should not quietly award the win.
        match.winner = red === blue ? null : red > 0 ? 0 : 1;
        return;
    }
    // Next worm of the team that is about to play, so a team's worms take it
    // in turns rather than one worm doing all the work.
    match.active[match.turn] = (match.active[match.turn] + 1) % Math.max(1, teamWorms(match, match.turn).length);
    match.turn = match.turn === 0 ? 1 : 0;
    match.wind = rollWind(match.rng);
}
/** Who is allowed to press fire right now. */
function activePlayerId(match) {
    return match.teams[match.turn]?.playerId ?? null;
}
function toView(match) {
    return {
        width: match.terrain.width,
        height: match.terrain.height,
        solid: Array.from(match.terrain.solid),
        worms: match.worms.map(worm => ({ ...worm })),
        teams: match.teams.map(team => ({ ...team })),
        turn: match.turn,
        wind: match.wind,
        aim: { ...match.aim },
        over: match.over,
        winner: match.winner,
        turnsTaken: match.turnsTaken,
        lastPath: match.lastOutcome ? match.lastOutcome.shot.path.map(p => ({ ...p })) : null,
        lastImpact: match.lastOutcome?.shot.impact ?? null,
        killed: match.lastOutcome?.killed ?? [],
    };
}
/** The other side's picture, as something render.ts can draw. */
function fromView(view) {
    return {
        terrain: {
            width: view.width ?? physics_1.FIELD_WIDTH,
            height: view.height ?? physics_1.FIELD_HEIGHT,
            solid: Uint8Array.from(view.solid ?? []),
        },
        worms: view.worms ?? [],
        view,
    };
}
//# sourceMappingURL=game.js.map