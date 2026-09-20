/**
 * The media channels: WebRTC and Web Audio, in and out.
 *
 * Lifted out of `transport-event-rulings.ts` (2026-09-20) when that file
 * crossed the 2000-line gate - the same move `wait-budget.ts` and
 * `command-classes.ts` were. One coherent group, all of it web-only for the
 * same reason: a byte terminal has no media stack at all, so there is nothing
 * to translate a stream, a level or a mute into.
 */
import type { EventRuling } from './transport-event-rulings';

export const MEDIA_RULINGS: Readonly<Record<string, EventRuling>> = {
  "audio-speaking-status": {
    kind: "web-only",
    note:
    "Browser media API channel (WebRTC / Web Audio), emitted at " +
    "handlers/audio-video.handler.ts:1147. Door-side listener: " +
    "Doors/voice-chat/src/index.ts, Doors/livechat/features/voice-chat.ts. A " +
    "byte terminal has no media stack at all, so there is nothing to translate " +
    "this into.",
  },
  "audio:data": {
    kind: "web-only",
    note:
    "Browser media API channel (WebRTC / Web Audio), emitted at " +
    "handlers/audio-video.handler.ts:257. Browser consumer: " +
    "packages/terminal/src/utils/media-handler.ts. Door-side listener: " +
    "Doors/voice-chat/src/client.ts, Doors/grandmaster/app.ts. A byte terminal " +
    "has no media stack at all, so there is nothing to translate this into.",
  },
  "audio:levels": {
    kind: "web-only",
    note:
    "Browser media API channel (WebRTC / Web Audio), emitted at " +
    "handlers/audio-video.handler.ts:220. Door-side listener: " +
    "Doors/neo-blessed-showcase/app.ts, Doors/voice-chat/src/index.ts. A byte " +
    "terminal has no media stack at all, so there is nothing to translate this " +
    "into.",
  },
  "audio:muted": {
    kind: "web-only",
    note:
    "Browser media API channel (WebRTC / Web Audio), emitted at " +
    "handlers/audio-video.handler.ts:157. Browser consumer: " +
    "packages/terminal/src/utils/media-handler.ts. A byte terminal has no media " +
    "stack at all, so there is nothing to translate this into.",
  },
  "audio:play-sfx": {
    kind: "web-only",
    note:
    "A real session-socket emit the backend census could never see: the SDK " +
    "audio engine writes it to `this.socket`, the caller's own socket, assigned " +
    "from the constructor argument (sdk/engines/audio/audio-engine.ts:102). " +
    "Sites: sdk/engines/audio/audio-engine.ts:1196, :1214, :1231. A byte " +
    "terminal has no Web Audio context, so there is nothing to play.",
  },
  "audio:set-ui-sounds": {
    kind: "web-only",
    note:
    "A real session-socket emit the backend census could never see: the SDK " +
    "audio engine writes it to `this.socket`, the caller's own socket, assigned " +
    "from the constructor argument (sdk/engines/audio/audio-engine.ts:102). " +
    "Sites: sdk/engines/audio/audio-engine.ts:243. A byte terminal has no Web " +
    "Audio context, so there is nothing to play.",
  },
  "audio:set-volume": {
    kind: "web-only",
    note:
    "A real session-socket emit the backend census could never see: the SDK " +
    "audio engine writes it to `this.socket`, the caller's own socket, assigned " +
    "from the constructor argument (sdk/engines/audio/audio-engine.ts:102). " +
    "Sites: sdk/engines/audio/audio-engine.ts:266. A byte terminal has no Web " +
    "Audio context, so there is nothing to play.",
  },
  "audio:start-streaming": {
    kind: "web-only",
    note:
    "Browser media API channel (WebRTC / Web Audio), emitted at " +
    "handlers/audio-video.handler.ts:115. Browser consumer: " +
    "packages/terminal/src/components/BBSTerminal.tsx. Door-side listener: " +
    "Doors/neo-blessed-showcase/client.ts, Doors/voice-chat/src/client.ts. A " +
    "byte terminal has no media stack at all, so there is nothing to translate " +
    "this into.",
  },
  "audio:stop-streaming": {
    kind: "web-only",
    note:
    "Browser media API channel. Emitted by a DOOR onto the caller's socket - " +
    "Doors/neo-blessed-showcase/app.ts:3445, whose own comment says \"Tell " +
    "browser client to start audio capture\" three lines above the start half. " +
    "The backend also registers an INBOUND handler of the same name " +
    "(handlers/audio-video.handler.ts:131) and the browser an outbound one " +
    "(packages/terminal/src/components/BBSTerminal.tsx:1558). A byte terminal " +
    "has no capture device and no Web Audio context.",
  },
  "audio:stream-started": {
    kind: "web-only",
    note:
    "Browser media API channel (WebRTC / Web Audio), emitted at " +
    "handlers/audio-video.handler.ts:120. A byte terminal has no media stack at " +
    "all, so there is nothing to translate this into.",
  },
  "audio:stream-stopped": {
    kind: "web-only",
    note:
    "Browser media API channel (WebRTC / Web Audio), emitted at " +
    "handlers/audio-video.handler.ts:141. A byte terminal has no media stack at " +
    "all, so there is nothing to translate this into.",
  },
  "voice:joined": {
    kind: "web-only",
    note:
    "Browser media API channel (WebRTC / Web Audio), emitted at " +
    "handlers/voice-channel.handler.ts:140, " +
    "handlers/voice-channel.handler.ts:283. Door-side listener: " +
    "Doors/livechat/features/voice-chat.ts, " +
    "Doors/livechat/features/voice-channel-ux.ts. A byte terminal has no media " +
    "stack at all, so there is nothing to translate this into.",
  },
  "voice:left": {
    kind: "web-only",
    note:
    "Browser media API channel (WebRTC / Web Audio), emitted at " +
    "handlers/voice-channel.handler.ts:183, " +
    "handlers/voice-channel.handler.ts:330, " +
    "handlers/voice-channel.handler.ts:438. Door-side listener: " +
    "Doors/livechat/features/voice-chat.ts, " +
    "Doors/livechat/features/voice-channel-ux.ts. A byte terminal has no media " +
    "stack at all, so there is nothing to translate this into.",
  },
  "voice:mute": {
    kind: "web-only",
    note:
    "Browser media API channel (WebRTC / Web Audio), emitted at " +
    "handlers/voice-channel.handler.ts:209. Door-side listener: " +
    "Doors/livechat/features/voice-channel-ux.ts. A byte terminal has no media " +
    "stack at all, so there is nothing to translate this into.",
  },
  "voice:mute-remote": {
    kind: "web-only",
    note:
    "LiveChat asks the caller's browser to mute one remote participant's audio " +
    "(Doors/livechat/server.ts:1604). Browser WebRTC; a byte terminal has no " +
    "media stack at all.",
  },
  "voice:screenshare-toggle": {
    kind: "web-only",
    note:
    "Browser media API channel (WebRTC / Web Audio), emitted at " +
    "handlers/voice-channel.handler.ts:387. A byte terminal has no media stack " +
    "at all, so there is nothing to translate this into.",
  },
  "voice:speaking": {
    kind: "web-only",
    note:
    "Browser media API channel (WebRTC / Web Audio), emitted at " +
    "handlers/voice-channel.handler.ts:413. Door-side listener: " +
    "Doors/livechat/features/voice-chat.ts, " +
    "Doors/grandmaster/ui/versus-screen.ts. A byte terminal has no media stack " +
    "at all, so there is nothing to translate this into.",
  },
  "voice:video-toggle": {
    kind: "web-only",
    note:
    "Browser media API channel (WebRTC / Web Audio), emitted at " +
    "handlers/voice-channel.handler.ts:232. Door-side listener: " +
    "Doors/livechat/features/voice-chat.ts, " +
    "Doors/livechat/features/voice-channel-ux.ts. A byte terminal has no media " +
    "stack at all, so there is nothing to translate this into.",
  },
};
