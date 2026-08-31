import { ClientDoor, AudioEngine, TrackerEngine } from "@amiexpress/bbs-door-sdk/client";
import { installArcadeSfx } from "@amiexpress/bbs-door-sdk/engines/ui/arcade";

const door = new ClientDoor({
  name: "Super Qix",
  version: "1.0.0",
  author: "AmiExpress BBS",
  runtime: "hybrid",
  hybrid: true,
});

const audio = new AudioEngine({
  masterVolume: 0.7,
  // The tracker music plays on its own context (see ensureTracker), so what
  // balances the mix against it is sfxVolume, not musicVolume.
  sfxVolume: 0.55,
  // Two knobs, and this took three passes. `wet` is the SEND LEVEL - how
  // much tail is audible - and it stays high, because the first pass was
  // reported as too dry. `decay` and `feedback` are how LONG it rings, and
  // they are now SHORT, because "too long tails" was reported twice.
  // Claims come in bursts here, so anything that outlasts one covers the
  // next.
  sfxReverb: {
    wet: 0.72,
    decay: 0.6,
    preDelay: 0.01,
  },
  // One faint repeat behind the hit, and no more.
  sfxEcho: {
    delayTime: 0.10,
    feedback: 0.12,
    wet: 0.72,
  },
});

/** Detach from the sound-effect channel. Set while the door is connected. */
let stopSfx: (() => void) | null = null;

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

let tracker: TrackerEngine | null = null;
let trackerContext: AudioContext | null = null;
let currentTrack: string | null = null;
let trackSeq = 0;
let musicPoll: ReturnType<typeof setInterval> | null = null;
const trackCache = new Map<string, ArrayBuffer>();

function ensureTracker(): TrackerEngine | null {
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
        repeatCount: -1,  // loop the module until the screen changes it
        volume: 0.95,
      });
    } catch (e) {
      console.warn("[Super Qix] tracker unavailable:", e);
      return null;
    }
  }
  return tracker;
}

async function playTrack(name: string): Promise<void> {
  if (currentTrack === name) return;
  currentTrack = name;
  const seq = ++trackSeq;

  try {
    const engine = ensureTracker();
    if (!engine) return;

    // chiptune3 never resumes a context the autoplay policy suspended. By
    // door time the player has long since typed at the BBS, so sticky
    // activation lets resume() win.
    if (trackerContext && trackerContext.state === 'suspended') {
      void trackerContext.resume().catch(() => { /* retried next poll */ });
    }

    let buffer = trackCache.get(name);
    if (!buffer) {
      const base = (globalThis as any).__BBS__?.backendUrl || "";
      const res = await fetch(
        `${base}/api/doors/SUPERQIX/assets/${encodeURIComponent(name)}`
      );
      if (!res.ok) throw new Error(`asset ${name}: HTTP ${res.status}`);
      buffer = await res.arrayBuffer();
      trackCache.set(name, buffer);
    }

    // The screen may have moved on while the module downloaded; a stale
    // fetch must not stomp the track the door now wants.
    if (seq !== trackSeq) return;

    engine.play(buffer);
  } catch (e) {
    // Music is optional. The game and its sound effects keep working.
    console.warn("[Super Qix] music unavailable:", e);
  }
}

function startMusicPoll(): void {
  if (musicPoll) return;
  musicPoll = setInterval(async () => {
    try {
      const result = await door.rpc("getMusicTrack", {});
      if (result && result.track) void playTrack(result.track);
    } catch {
      // The door may not be listening yet, or may have closed. Either way
      // there is nothing to do but ask again next time.
    }
  }, MUSIC_POLL_MS);
}

function stopMusic(): void {
  if (musicPoll) {
    clearInterval(musicPoll);
    musicPoll = null;
  }
  try {
    tracker?.stop();
  } catch { /* already gone */ }
  try {
    void trackerContext?.close();
  } catch { /* already gone */ }
  tracker = null;
  trackerContext = null;
  currentTrack = null;
}

door.on("init", () => {
  console.log("[Super Qix] Client door init event");
});

door.on("connect", (user: any) => {
  console.log(`[Super Qix] Connected as ${user.name}`);
  startMusicPoll();
  if (!stopSfx) stopSfx = installArcadeSfx(audio);
});

door.on("disconnect", () => {
  stopMusic();
  stopArcadeSfx();
});

door.on("close", () => {
  stopMusic();
  stopArcadeSfx();
});

/**
 * Stop listening for sound effects.
 *
 * A door is unloaded by removing its script, which detaches nothing it
 * subscribed to. Without this, re-entering Super Qix leaves the previous
 * listener in place and every claim plays twice.
 */
function stopArcadeSfx(): void {
  if (stopSfx) {
    stopSfx();
    stopSfx = null;
  }
}

// This file used to carry a `door.on("audio")` handler, copied from the
// same template as every other arcade door. Nothing has ever emitted that
// event, so it has never run.
door.on("shutdown", () => {
  stopMusic();
  stopArcadeSfx();
});

console.log("[Super Qix] Starting client door...");
door.start();

export default door;
