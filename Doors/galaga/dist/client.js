"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@amiexpress/bbs-door-sdk/client");
const arcade_1 = require("@amiexpress/bbs-door-sdk/engines/ui/arcade");
const door = new client_1.ClientDoor({
    name: "Galaga",
    version: "1.0.0",
    author: "AmiExpress BBS",
    runtime: "hybrid",
    hybrid: true,
});
// ===========================================================================
// Sound effects.
//
// Galaga's game logic runs server-side, so it names what happened and the
// shared arcade channel carries those names here. This is the only piece of
// it a door writes: the engine, with this door's own mix, and one call to
// listen.
//
// Arkanoid does it differently for a reason that does not generalise - its
// client IS its game, so it can call playSound where the ball hits. Every
// other arcade door needs the crossing.
//
// This replaced a `door.on("audio")` handler that every one of these doors
// carried from the same template. Nothing has ever emitted that event, so
// none of them has ever made a sound.
// ===========================================================================
const audio = new client_1.AudioEngine({
    masterVolume: 0.7,
    sfxVolume: 0.6,
    // Shots come faster than anything else in the nine, so the tail has to
    // be gone before the next one lands.
    //
    // Two knobs, and this took three passes to land because they were
    // conflated twice. `wet` is the SEND LEVEL - how much tail is audible -
    // and it stays high, because the first pass was reported as too dry.
    // `decay` and `feedback` are how LONG it rings, and they are now SHORT,
    // because "too long tails" was reported twice: 5-7s, then 1.8-2.4s, and
    // both were still too much. This is a slapback, not a room.
    //
    // If it is ever still too long, these two are the levers. Do not reach
    // for `wet` - a send is parallel, so lowering it takes away audibility
    // without shortening anything.
    sfxReverb: {
        wet: 0.75,
        decay: 0.8,
        preDelay: 0.01,
    },
    // One faint repeat behind the hit. At this feedback the second repeat is
    // already inaudible, which is the point.
    sfxEcho: {
        delayTime: 0.1,
        feedback: 0.14,
        wet: 0.75,
    },
});
let stopSfx = null;
console.log("[Galaga] Client door initializing...");
door.on("init", () => {
    console.log("[Galaga] Client door init event");
});
door.on("connect", (user) => {
    console.log(`[Galaga] Connected as ${user.name}`);
    if (!stopSfx)
        stopSfx = (0, arcade_1.installArcadeSfx)(audio);
});
/**
 * Stop listening.
 *
 * A door is unloaded by removing its script, which detaches nothing it
 * subscribed to. Without this, re-entering the door leaves the previous
 * listener in place and every sound plays twice.
 */
function teardown() {
    if (stopSfx) {
        stopSfx();
        stopSfx = null;
    }
}
// The two ClientDoor actually emits. These doors carried a `close` handler
// too; nothing raises that event, so it has never run.
door.on("disconnect", teardown);
door.on("shutdown", teardown);
console.log("[Galaga] Starting client door...");
door.start();
exports.default = door;
//# sourceMappingURL=client.js.map