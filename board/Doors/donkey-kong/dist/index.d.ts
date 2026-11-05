/**
 * Donkey Kong - Server/Fallback Door Entry Point
 * 1981 Nintendo arcade classic
 */
import { CoreDoor as Door } from "@amiexpress/bbs-door-sdk";
import { rpcHandlers } from "./server";
export { rpcHandlers };
declare const door: Door;
export default door;
