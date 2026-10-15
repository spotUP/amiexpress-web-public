/**
 * What the sysop can set on LiveChat, and what the door does with it.
 *
 * The declaration is `door.settings.json` beside this file; the values are
 * `settings.json`, written by the admin. Both are read through the SDK, which
 * resolves the door's root - `__dirname` is this directory in development and
 * `dist/` in production, because the backend imports `index.ts` in one and
 * `dist/index.js` in the other.
 *
 * Read once per door launch (`loadSettings` in createApp), then handed out by
 * `settings()`. Reading per launch rather than per process is what makes a
 * change in the admin reach the next user without a backend restart; reading
 * once per launch rather than per event keeps it off the message path.
 */
export interface LiveChatSettings {
    /** Where users land, and the one channel they may not leave. */
    defaultChannel: string;
    soundEffects: boolean;
    sidebarWidth: number;
    reconnectAttempts: number;
}
/**
 * What LiveChat ran with before it declared anything. A board that sets
 * nothing must behave exactly as it did.
 */
export declare const DEFAULT_SETTINGS: LiveChatSettings;
/**
 * The declared values, made safe to use.
 *
 * The SDK has already applied the manifest's types; this is the door's own
 * floor - a sidebar of 0 columns or 900 reconnect attempts is not a setting,
 * it is a broken screen, and a hand-edited settings.json can carry either.
 */
export declare function applySettings(raw: Record<string, string | number | boolean>): LiveChatSettings;
/** Read what the sysop set. Called once, when a user opens the door. */
export declare function loadSettings(): LiveChatSettings;
/** What the current launch is running with. */
export declare function settings(): LiveChatSettings;
