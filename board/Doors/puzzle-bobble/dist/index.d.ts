/**
 * Puzzle Bobble (Bust-A-Move) - Server/Fallback Door Entry Point
 * 1994 Taito bubble-matching puzzle game
 */
import { CoreDoor as Door } from "@amiexpress/bbs-door-sdk";
import { rpcHandlers } from "./server";
export { rpcHandlers };
declare const door: Door;
export default door;
