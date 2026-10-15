"use strict";
/**
 * Worms in teletext: the part that decides where the shell lands.
 *
 * The 1996 original could not have this file. A television had no
 * processor, so Team17 drew every screen the game could ever reach in
 * advance and broadcast them as hidden pages - and the game died because a
 * day's broadcast could not hold enough of them. A BBS can simply work out
 * the shot.
 *
 * The playfield is what teletext gives us and no more: block graphics are
 * 2x3 pixels per character cell, so twenty rows of a 40-column page is
 * exactly 80 by 60 pixels. Every constant here is chosen for that size -
 * there is no point in a physics model finer than the screen.
 *
 * Pure and deterministic: same terrain, same angle, same power, same
 * landing. Nothing here knows what a socket is.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WIND_FORCE = exports.GRAVITY = exports.FIELD_HEIGHT = exports.FIELD_WIDTH = void 0;
exports.makeRng = makeRng;
exports.emptyTerrain = emptyTerrain;
exports.isSolid = isSolid;
exports.generateTerrain = generateTerrain;
exports.surfaceAt = surfaceAt;
exports.carve = carve;
exports.fire = fire;
exports.explode = explode;
exports.settle = settle;
exports.place = place;
/** The playfield, in pixels. 40 cells across, 20 rows down. */
exports.FIELD_WIDTH = 80;
exports.FIELD_HEIGHT = 60;
/** Pixels per step of flight. Small enough not to tunnel through terrain. */
const STEP = 0.5;
/** Downward acceleration per step. Tuned so a full-power shot crosses ~60px. */
exports.GRAVITY = 0.035;
/**
 * How hard the wind pushes, per unit of wind, per step.
 *
 * Measured rather than guessed: at 0.004 a full five of wind moved a shot
 * 44 pixels on a field 80 wide, which is more than the difference between
 * power 6 and power 10. Wind is supposed to be the thing you correct for,
 * not the thing that decides the match.
 */
exports.WIND_FORCE = 0.0018;
/** Speed at power 10. */
const MAX_SPEED = 1.6;
/** A shot that has not landed by now is gone. */
const MAX_STEPS = 2000;
/**
 * A seeded generator, so a match can be replayed and a test can be written.
 * Mulberry32 - small, fast, good enough for a landscape.
 */
function makeRng(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
// --- Terrain -------------------------------------------------------------
function emptyTerrain(width = exports.FIELD_WIDTH, height = exports.FIELD_HEIGHT) {
    return { width, height, solid: new Uint8Array(width * height) };
}
function isSolid(terrain, x, y) {
    const px = Math.floor(x);
    const py = Math.floor(y);
    if (px < 0 || py < 0 || px >= terrain.width || py >= terrain.height)
        return false;
    return terrain.solid[py * terrain.width + px] === 1;
}
function setSolid(terrain, x, y, value) {
    const px = Math.floor(x);
    const py = Math.floor(y);
    if (px < 0 || py < 0 || px >= terrain.width || py >= terrain.height)
        return;
    terrain.solid[py * terrain.width + px] = value;
}
/**
 * A landscape, by midpoint displacement.
 *
 * Rough enough to hide behind, smooth enough that a worm is not stranded on
 * a one-pixel spike.
 */
function generateTerrain(rng, width = exports.FIELD_WIDTH, height = exports.FIELD_HEIGHT) {
    const heights = new Array(width).fill(0);
    const base = Math.floor(height * 0.55);
    heights[0] = base + (rng() - 0.5) * height * 0.2;
    heights[width - 1] = base + (rng() - 0.5) * height * 0.2;
    const displace = (left, right, scale) => {
        if (right - left < 2)
            return;
        const middle = Math.floor((left + right) / 2);
        heights[middle] = (heights[left] + heights[right]) / 2 + (rng() - 0.5) * scale;
        displace(left, middle, scale / 2);
        displace(middle, right, scale / 2);
    };
    displace(0, width - 1, height * 0.5);
    const terrain = emptyTerrain(width, height);
    for (let x = 0; x < width; x++) {
        const top = Math.max(4, Math.min(height - 3, Math.round(heights[x])));
        for (let y = top; y < height; y++)
            setSolid(terrain, x, y, 1);
    }
    return terrain;
}
/** The topmost solid pixel in a column, or the floor if the column is empty. */
function surfaceAt(terrain, x) {
    for (let y = 0; y < terrain.height; y++) {
        if (isSolid(terrain, x, y))
            return y;
    }
    return terrain.height;
}
/** Blow a hole in the ground. */
function carve(terrain, at, radius) {
    const r2 = radius * radius;
    for (let y = Math.floor(at.y - radius); y <= Math.ceil(at.y + radius); y++) {
        for (let x = Math.floor(at.x - radius); x <= Math.ceil(at.x + radius); x++) {
            const dx = x - at.x;
            const dy = y - at.y;
            if (dx * dx + dy * dy <= r2)
                setSolid(terrain, x, y, 0);
        }
    }
}
/**
 * Fire, and follow the shell until something stops it.
 *
 * Stepping by half a pixel rather than by a time slice is what keeps a
 * fast shot from tunnelling through a one-pixel ridge - at this resolution
 * a single missed sample is the difference between a hit and a miss.
 */
function fire(terrain, from, worms, options) {
    const angle = (Math.max(0, Math.min(90, options.angle)) * Math.PI) / 180;
    const speed = (Math.max(1, Math.min(10, options.power)) / 10) * MAX_SPEED;
    const wind = options.wind ?? 0;
    let x = from.x + options.facing * 1.5;
    let y = from.y - 1.5;
    let vx = Math.cos(angle) * speed * options.facing;
    let vy = -Math.sin(angle) * speed;
    const path = [{ x, y }];
    for (let step = 0; step < MAX_STEPS; step++) {
        vx += wind * exports.WIND_FORCE * STEP;
        vy += exports.GRAVITY * STEP;
        x += vx * STEP;
        y += vy * STEP;
        path.push({ x, y });
        // Off the sides or out of the bottom: gone. Above the field is fine -
        // a lobbed shot is supposed to leave the top of the screen and return.
        if (x < -8 || x > terrain.width + 8 || y > terrain.height + 8) {
            return { path, impact: null, ending: 'offfield', hit: null };
        }
        const struck = worms.find(worm => worm.hp > 0 && hits(worm, x, y));
        if (struck) {
            return { path, impact: { x, y }, ending: 'worm', hit: struck.id };
        }
        if (y >= 0 && isSolid(terrain, x, y)) {
            return { path, impact: { x, y }, ending: 'terrain', hit: null };
        }
    }
    return { path, impact: null, ending: 'offfield', hit: null };
}
/** A worm is two pixels wide and three tall - one character cell. */
function hits(worm, x, y) {
    return Math.abs(x - worm.x) <= 1 && y >= worm.y - 2 && y <= worm.y + 0.5;
}
/**
 * The blast, and what it costs whoever was standing near it.
 *
 * Damage falls off linearly with distance, which is crude and is exactly
 * what the game it imitates does.
 */
function explode(terrain, worms, at, radius, maxDamage) {
    carve(terrain, at, radius);
    const damage = [];
    for (const worm of worms) {
        if (worm.hp <= 0)
            continue;
        const distance = Math.hypot(worm.x - at.x, worm.y - at.y);
        if (distance > radius + 1)
            continue;
        const share = Math.max(0, 1 - distance / (radius + 1));
        const amount = Math.max(1, Math.round(maxDamage * share));
        worm.hp = Math.max(0, worm.hp - amount);
        damage.push({ id: worm.id, amount });
    }
    return damage;
}
/**
 * Let gravity finish the job.
 *
 * A worm standing on ground that has just been blown out from under it
 * falls, and a long fall hurts. Returns what the fall cost.
 */
function settle(terrain, worms) {
    const damage = [];
    for (const worm of worms) {
        if (worm.hp <= 0)
            continue;
        const before = worm.y;
        let y = worm.y;
        while (y < terrain.height - 1 && !isSolid(terrain, worm.x, y + 1))
            y++;
        worm.y = y;
        const fell = y - before;
        if (fell > 6) {
            const amount = Math.round((fell - 6) * 1.5);
            worm.hp = Math.max(0, worm.hp - amount);
            damage.push({ id: worm.id, amount });
        }
        // Out of the bottom of the world is out of the game.
        if (worm.y >= terrain.height - 1 && !isSolid(terrain, worm.x, terrain.height - 1)) {
            damage.push({ id: worm.id, amount: worm.hp });
            worm.hp = 0;
        }
    }
    return damage;
}
/** Stand a worm on the surface of its column. */
function place(terrain, x) {
    return { x, y: Math.max(0, surfaceAt(terrain, x) - 1) };
}
//# sourceMappingURL=physics.js.map