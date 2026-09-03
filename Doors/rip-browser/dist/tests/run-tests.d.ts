/**
 * Minimal test runner for the RIP BROWSER door.
 *
 * Same pattern as WHIP, LiveChat, CARD LOBBY and VOICE CHAT: dependency-free
 * async functions plus node assert, run via tsx (`npm test`). A test fails by
 * throwing.
 */
declare const TEST_MODULES: string[];
declare const realLog: {
    (...data: any[]): void;
    (message?: any, ...optionalParams: any[]): void;
};
