import "reflect-metadata";
import { AmigaDoorSession } from "./src/amiga-emulation/AmigaDoorSession.js";

// Set required env
process.env.BBS_DATA_DIR = "~/Code/amiexpress-web";

async function main() {
  const config: any = {
    executablePath: "~/Code/amiexpress-web/doors/bytekiller/Bytekillhandler",
    args: ["BBS:Node1/CallersLog"],
    doorType: "SIM",
    stack: 32768,
    nodeId: 1,
    bbsSession: {
      nodeId: 1,
      env: process.env,
    },
    env: process.env,
  };

  console.log("Creating AmigaDoorSession...");
  const session = new AmigaDoorSession(config);
  console.log("Initializing...");
  await session.initialize();
  console.log("Running door...");
  const result = await session.run();
  console.log("Door result:", result);
}

main().catch(console.error);
