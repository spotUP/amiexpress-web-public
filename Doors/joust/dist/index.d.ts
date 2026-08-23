/**
 * Joust - Server/Fallback Door Entry Point
 * 1982 Williams Electronics arcade jousting game
 */
import { CoreDoor as Door } from "@amiexpress/bbs-door-sdk";
import { rpcHandlers } from "./server";
export { rpcHandlers };
declare const door: Door;
export default door;
