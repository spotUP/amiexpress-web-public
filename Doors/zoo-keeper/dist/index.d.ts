/**
 * Zoo Keeper - Server/Fallback Door Entry Point
 * 1982 Taito arcade game port for AmiExpress BBS
 *
 * This file serves as:
 * 1. The fallback door for terminal-only sessions (no audio)
 * 2. The server entry point for hybrid door mode
 */
import { CoreDoor as Door } from "@amiexpress/bbs-door-sdk";
import { rpcHandlers } from "./server";
export { rpcHandlers };
/**
 * Main door entry point
 */
declare const door: Door;
export default door;
//# sourceMappingURL=index.d.ts.map