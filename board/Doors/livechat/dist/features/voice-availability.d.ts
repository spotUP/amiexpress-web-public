/**
 * Voice chat needs a browser: the microphone, the WebRTC stream and the
 * playback all live in the web client. A telnet, SSH or terminal-websocket
 * caller has none of that, so every voice surface (sidebar section, /voice
 * commands, help text, shortcut hints, the render-mode key) is hidden for them.
 *
 * Same transport test as notify/app.ts and sdk/utils/door-input-manager.ts:
 * `bbs.connectionType` is 'web' for the browser terminal and anything else
 * (telnet, ssh) otherwise; absent means a standalone web page.
 */
export declare function voiceAvailable(bbs: {
    connectionType?: string;
} | undefined | null): boolean;
