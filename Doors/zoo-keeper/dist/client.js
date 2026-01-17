import { ClientDoor, AudioEngine } from "@amiexpress/bbs-door-sdk/client";
const door = new ClientDoor({
    name: "Zoo Keeper",
    version: "1.0.0",
    author: "AmiExpress BBS",
    runtime: "hybrid",
    hybrid: true,
});
const audio = new AudioEngine();
console.log("[Zoo Keeper] Client door initializing...");
door.on("init", () => {
    console.log("[Zoo Keeper] Client door init event");
});
door.on("connect", (user) => {
    console.log(`[Zoo Keeper] Connected as ${user.name}`);
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
console.log("[Zoo Keeper] Starting client door...");
door.start();
export default door;
