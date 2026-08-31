import { ClientDoor, AudioEngine, TrackerEngine } from "@amiexpress/bbs-door-sdk/client";
const door = new ClientDoor({
    name: "Super Qix",
    version: "1.0.0",
    author: "AmiExpress BBS",
    runtime: "hybrid",
    hybrid: true,
});
const audio = new AudioEngine();
console.log("[Super Qix] Client door initializing...");
// ===========================================================================
// Music - real tracker modules (Zabutom XM pack) via the SDK TrackerEngine.
//
// Arkanoid's client drives its own music because Arkanoid's client IS the
// game and knows what is on screen. Super Qix runs server-side, so this
// client has to ASK: getMusicTrack answers from the same pure trackForState
// the door's tests cover, and the poll below keeps the music in step with
// the screen. That is the whole reason for a poll rather than a push - there
// is no server-to-client event path for a door that a browser handler picks
// up (audio:music reaches nothing), and music that quietly plays silence is
// worse than music that costs one small request a second.
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
            // A PRIVATE AudioContext, as Arkanoid learned the hard way: sharing
            // the AudioEngine's context made the music silent outright, because
            // chiptune3 does not cope with the context Tone hands out. Owning it
            // also means it can be resumed - by door time the user has long since
            // typed at the BBS, so sticky activation lets resume() win.
            trackerContext = new AudioContext();
            tracker = new TrackerEngine({
                audioContext: trackerContext,
                repeatCount: -1, // loop the module until the screen changes it
                volume: 0.95,
            });
        }
        catch (e) {
            console.warn("[Super Qix] tracker unavailable:", e);
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
        // chiptune3 never resumes a context the autoplay policy suspended. By
        // door time the player has long since typed at the BBS, so sticky
        // activation lets resume() win.
        if (trackerContext && trackerContext.state === 'suspended') {
            void trackerContext.resume().catch(() => { });
        }
        let buffer = trackCache.get(name);
        if (!buffer) {
            const base = globalThis.__BBS__?.backendUrl || "";
            const res = await fetch(`${base}/api/doors/SUPERQIX/assets/${encodeURIComponent(name)}`);
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
        console.warn("[Super Qix] music unavailable:", e);
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
            // The door may not be listening yet, or may have closed. Either way
            // there is nothing to do but ask again next time.
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
door.on("init", () => {
    console.log("[Super Qix] Client door init event");
});
door.on("connect", (user) => {
    console.log(`[Super Qix] Connected as ${user.name}`);
    startMusicPoll();
});
door.on("disconnect", () => {
    stopMusic();
});
door.on("close", () => {
    stopMusic();
});
door.on("audio", async (data) => {
    try {
        if (data && data.action === "play" && data.name) {
            await audio.init();
            audio.playSound(data.name, data.options || { frequency: 440, duration: 0.1 });
        }
        else if (data && data.action === "stop") {
            audio.stopMusic();
        }
    }
    catch (err) {
        console.error("Audio error:", err);
    }
});
console.log("[Super Qix] Starting client door...");
door.start();
export default door;
