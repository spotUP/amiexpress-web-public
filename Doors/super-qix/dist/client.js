import { ClientDoor, AudioEngine } from "@amiexpress/bbs-door-sdk/client";
const door = new ClientDoor({
    name: "Super Qix",
    version: "1.0.0",
    author: "AmiExpress BBS",
    runtime: "hybrid",
    hybrid: true,
});
const audio = new AudioEngine();
console.log("[Super Qix] Client door initializing...");
door.on("init", () => {
    console.log("[Super Qix] Client door init event");
});
door.on("connect", (user) => {
    console.log(`[Super Qix] Connected as ${user.name}`);
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
