/**
 * Bubble Bobble - Server/Fallback Door Entry Point
 * 1986 Taito arcade platformer
 */
import { CoreDoor as Door } from "@amiexpress/bbs-door-sdk";
import { rpcHandlers } from "./server";
export { rpcHandlers };
declare const door: Door;
export default door;
