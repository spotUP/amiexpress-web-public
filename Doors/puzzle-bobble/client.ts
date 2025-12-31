import { ClientDoor, AudioEngine } from "@amiexpress/bbs-door-sdk/client";

const door = new ClientDoor({
  name: "Puzzle Bobble",
  version: "1.0.0",
  author: "AmiExpress BBS",
  runtime: "hybrid",
  hybrid: true,
});

const audio = new AudioEngine();

console.log("[Puzzle Bobble] Client door initializing...");

door.on("init", () => {
  console.log("[Puzzle Bobble] Client door init event");
});

door.on("connect", (user: any) => {
  console.log(`[Puzzle Bobble] Connected as ${user.name}`);
});

door.on("audio", async (data: any) => {
  try {
    if (data && data.action === "play" && data.name) {
      await audio.init();
      audio.playSound(
        data.name,
        data.options || { frequency: 440, duration: 0.1 }
      );
    } else if (data && data.action === "stop") {
      if (audio.stopMusic) audio.stopMusic();
    }
  } catch (err) {
    console.error("Audio error:", err);
  }
});

console.log("[Puzzle Bobble] Starting client door...");
door.start();

export default door;
