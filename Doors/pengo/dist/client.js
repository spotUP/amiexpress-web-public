"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@amiexpress/bbs-door-sdk/client");
const arcade_1 = require("@amiexpress/bbs-door-sdk/engines/ui/arcade");
const door = new client_1.ClientDoor({
    name: "Pengo",
    version: "1.0.0",
    author: "AmiExpress BBS",
    runtime: "hybrid",
    hybrid: true,
});
// ===========================================================================
// Sound effects.
//
// Pengo's game logic runs server-side, so it names what happened and the
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
    // Hard ice, close walls. A short bright slap, not a cavern.
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
        wet: 0.72,
        decay: 0.5,
        preDelay: 0.01,
    },
    // One faint repeat behind the hit. At this feedback the second repeat is
    // already inaudible, which is the point.
    sfxEcho: {
        delayTime: 0.09,
        feedback: 0.12,
        wet: 0.72,
    },
});
let stopSfx = null;
// ===========================================================================
// Music - two user-supplied ProTracker MODs via the SDK TrackerEngine.
//
// Same shape as Super Qix's, for the same reason: Pengo runs server-side,
// so this client ASKS what should be playing - getMusicTrack answers from
// the same pure trackForState the door's tests cover, and the poll keeps
// the music in step with the screen at the cost of one small request a
// second.
// ===========================================================================
/** How often to ask the door what should be playing. */
const MUSIC_POLL_MS = 1000;
let tracker = null;
let trackerContext = null;
let currentTrack = null;
let trackSeq = 0;
let musicPoll = null;
const trackCache = new Map();
function ensureTracker() {
    if (!tracker) {
        try {
            // A PRIVATE AudioContext, the lesson Arkanoid paid for: chiptune3
            // does not cope with the context Tone hands out, and owning it means
            // it can be resumed once the player has interacted.
            trackerContext = new AudioContext();
            tracker = new client_1.TrackerEngine({
                audioContext: trackerContext,
                repeatCount: -1, // loop until the screen changes it
                volume: 0.9,
            });
        }
        catch (e) {
            console.warn("[Pengo] tracker unavailable:", e);
            return null;
        }
    }
    return tracker;
}
async function playTrack(name) {
    if (currentTrack === name)
        return;
    currentTrack = name;
    const seq = ++trackSeq;
    try {
        const engine = ensureTracker();
        if (!engine)
            return;
        if (trackerContext && trackerContext.state === "suspended") {
            void trackerContext.resume().catch(() => { });
        }
        let buffer = trackCache.get(name);
        if (!buffer) {
            const base = globalThis.__BBS__?.backendUrl || "";
            const res = await fetch(`${base}/api/doors/PENGO/assets/${encodeURIComponent(name)}`);
            if (!res.ok)
                throw new Error(`asset ${name}: HTTP ${res.status}`);
            buffer = await res.arrayBuffer();
            trackCache.set(name, buffer);
        }
        // The screen may have moved on while the module downloaded; a stale
        // fetch must not stomp the track the door now wants.
        if (seq !== trackSeq)
            return;
        engine.play(buffer);
    }
    catch (e) {
        // Music is optional. The game and its sound effects keep working.
        console.warn("[Pengo] music unavailable:", e);
    }
}
function startMusicPoll() {
    if (musicPoll)
        return;
    musicPoll = setInterval(async () => {
        try {
            const result = await door.rpc("getMusicTrack", {});
            if (result && result.track)
                void playTrack(result.track);
        }
        catch {
            // The door may not be listening yet, or may have closed.
        }
    }, MUSIC_POLL_MS);
}
function stopMusic() {
    if (musicPoll) {
        clearInterval(musicPoll);
        musicPoll = null;
    }
    try {
        tracker?.stop();
    }
    catch { /* already gone */ }
    try {
        void trackerContext?.close();
    }
    catch { /* already gone */ }
    tracker = null;
    trackerContext = null;
    currentTrack = null;
}
console.log("[Pengo] Client door initializing...");
door.on("init", () => {
    console.log("[Pengo] Client door init event");
});
door.on("connect", (user) => {
    console.log(`[Pengo] Connected as ${user.name}`);
    if (!stopSfx)
        stopSfx = (0, arcade_1.installArcadeSfx)(audio);
    startMusicPoll();
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
    stopMusic();
}
// The two ClientDoor actually emits. These doors carried a `close` handler
// too; nothing raises that event, so it has never run.
door.on("disconnect", teardown);
door.on("shutdown", teardown);
console.log("[Pengo] Starting client door...");
door.start();
exports.default = door;
//# sourceMappingURL=client.js.map