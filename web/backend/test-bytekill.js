require("reflect-metadata");
const { AmigaDoorSession } = require("./dist/amiga-emulation/AmigaDoorSession.js");

async function main() {
  const config = {
    executablePath: "~/Code/amiexpress-web/doors/bytekiller/Bytekillhandler",
    args: ["BBS:Node1/CallersLog"],
    doorType: "SIM",
    stack: 32768,
    nodeId: 1,
    bbsSession: {
      nodeId: 1,
    },
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
