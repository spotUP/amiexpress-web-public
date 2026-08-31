import { ClientDoor, AudioEngine } from "@amiexpress/bbs-door-sdk/client";
import { installArcadeSfx } from "@amiexpress/bbs-door-sdk/engines/ui/arcade";

const door = new ClientDoor({
  name: "Donkey Kong",
  version: "1.0.0",
  author: "AmiExpress BBS",
  runtime: "hybrid",
  hybrid: true,
});

// ===========================================================================
// Sound effects.
//
// Donkey Kong's game logic runs server-side, so it names what happened and the
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

const audio = new AudioEngine({
  masterVolume: 0.7,
  sfxVolume: 0.6,
  // Girders: a hard, short ring rather than a hall.
  //
  // Two knobs, not one, and the difference is what the tuning got wrong in
  // both directions. `wet` is the SEND LEVEL - how much tail is audible -
  // and it stays high, because the first pass was reported as too dry.
  // `decay` and `feedback` are how LONG it rings, and they are short,
  // because the second pass was reported as "way too long tails". A send
  // is parallel: raising wet adds tail beside the dry hit rather than
  // taking anything away from it.
  sfxReverb: {
    wet: 0.78,
    decay: 1.8,
    preDelay: 0.02,
  },
  // The bounce. A couple of audible repeats, not a decaying cloud: the SDK
  // builds ONE send at max(reverb.wet, echo.wet), so this wet matches the
  // reverb's and the feedback alone decides how many repeats survive.
  sfxEcho: {
    delayTime: 0.13,
    feedback: 0.25,
    wet: 0.78,
  },
});

let stopSfx: (() => void) | null = null;

console.log("[Donkey Kong] Client door initializing...");

door.on("init", () => {
  console.log("[Donkey Kong] Client door init event");
});

door.on("connect", (user: any) => {
  console.log(`[Donkey Kong] Connected as ${user.name}`);
  if (!stopSfx) stopSfx = installArcadeSfx(audio);
});

/**
 * Stop listening.
 *
 * A door is unloaded by removing its script, which detaches nothing it
 * subscribed to. Without this, re-entering the door leaves the previous
 * listener in place and every sound plays twice.
 */
function teardown(): void {
  if (stopSfx) {
    stopSfx();
    stopSfx = null;
  }
}

// The two ClientDoor actually emits. These doors carried a `close` handler
// too; nothing raises that event, so it has never run.
door.on("disconnect", teardown);
door.on("shutdown", teardown);

console.log("[Donkey Kong] Starting client door...");
door.start();

export default door;
