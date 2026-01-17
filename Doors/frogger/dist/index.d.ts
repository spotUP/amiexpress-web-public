/**
 * Frogger - Server/Fallback Door Entry Point
 * 1981 Konami arcade game port for AmiExpress BBS
 */
import { CoreDoor as Door } from "@amiexpress/bbs-door-sdk";
import { rpcHandlers } from "./server";
export { rpcHandlers };
/**
 * Main door instance
 */
declare const door: Door;
export default door;
//# sourceMappingURL=index.d.ts.map