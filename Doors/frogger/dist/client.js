"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@amiexpress/bbs-door-sdk/client");
const door = new client_1.ClientDoor({
    name: "Frogger",
    version: "1.0.0",
    author: "AmiExpress BBS",
    runtime: "hybrid",
    hybrid: true,
});
const audio = new client_1.AudioEngine();
console.log("[Frogger] Client door initializing...");
door.on("init", () => {
    console.log("[Frogger] Client door init event");
});
door.on("connect", (user) => {
    console.log(`[Frogger] Connected as ${user.name}`);
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
console.log("[Frogger] Starting client door...");
door.start();
exports.default = door;
//# sourceMappingURL=client.js.map