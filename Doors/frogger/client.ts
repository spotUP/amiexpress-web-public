import { ClientDoor, AudioEngine } from "@amiexpress/bbs-door-sdk/client";
import { installArcadeSfx } from "@amiexpress/bbs-door-sdk/engines/ui/arcade";

const door = new ClientDoor({
  name: "Frogger",
  version: "1.0.0",
  author: "AmiExpress BBS",
  runtime: "hybrid",
  hybrid: true,
});

// ===========================================================================
// Sound effects.
//
// Frogger's game logic runs server-side, so it names what happened - a hop,
// a plunk, a home - and the shared arcade channel carries those names here.
// This is the only piece of it a door writes: the engine, with the door's
// own mix, and one call to listen.
//
// Arkanoid does this differently for a reason that does not generalise: its
// client IS its game, so it can call playSound where the ball hits. Every
// other arcade door needs the crossing.
// ===========================================================================

const audio = new AudioEngine({
  masterVolume: 0.7,
  sfxVolume: 0.6,
  // Close and dry-ish: a hop lands every couple of hundred milliseconds
  // and nothing may still be ringing when the next one does.
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
    feedback: 0.1,
    wet: 0.72,
  },
});

let stopSfx: (() => void) | null = null;

console.log("[Frogger] Client door initializing...");

door.on("init", () => {
  console.log("[Frogger] Client door init event");
});

door.on("connect", (user: any) => {
  console.log(`[Frogger] Connected as ${user.name}`);
  if (!stopSfx) stopSfx = installArcadeSfx(audio);
});

/**
 * Stop listening.
 *
 * A door is unloaded by removing its script, which detaches nothing it
 * subscribed to. Without this, re-entering Frogger leaves the previous
 * listener in place and every hop plays twice.
 */
function teardown(): void {
  if (stopSfx) {
    stopSfx();
    stopSfx = null;
  }
}

// The two ClientDoor actually emits. Other doors carry a `close` handler
// too; nothing raises that event, so it has never run.
door.on("disconnect", teardown);
door.on("shutdown", teardown);

console.log("[Frogger] Starting client door...");
door.start();

export default door;
