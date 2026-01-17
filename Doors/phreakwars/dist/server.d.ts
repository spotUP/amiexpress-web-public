/**
 * Phreak Wars SDK Door Server
 *
 * Fully refactored to use proper SDK patterns:
 * - No BBSSession internals access
 * - Game state stored locally in door
 * - Socket.IO input handling
 * - Portable and self-contained
 */
/**
 * SDK-compatible runDoor export
 * Follows the same pattern as bbslinkwall and other SDK doors
 */
export declare function runDoor(doorSession: any): Promise<void>;
