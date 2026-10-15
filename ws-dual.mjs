import { io } from "socket.io-client";
const a = io("http://127.0.0.1:3001", { transports: ["websocket"] });
const b = io("http://127.0.0.1:3001", { transports: ["websocket"] });
a.on("connect", () => console.log("[A] connect", a.id));
b.on("connect", () => console.log("[B] connect", b.id));
a.on("ansi-output", (d) => process.stdout.write(`[A]${d}`));
b.on("ansi-output", (d) => process.stdout.write(`[B]${d}`));
setTimeout(() => process.exit(0), 600000);
