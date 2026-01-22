/**
 * Voice Chat Door - Hybrid Door Server Component
 *
 * This is the server-side component that:
 * - Renders the neo-blessed UI
 * - Sends audio commands to the browser client
 * - Receives audio level updates from the client
 *
 * The client.ts component handles actual Web Audio:
 * - Microphone capture via getUserMedia
 * - Opus encoding via MediaRecorder
 * - Audio playback of other users
 *
 * Communication flow:
 * - Server emits 'audio:start-streaming' -> Client starts capture
 * - Server emits 'audio:stop-streaming' -> Client stops capture
 * - Server emits 'audio:mute' -> Client mutes/unmutes
 * - Client emits 'audio:levels' -> Server updates UI
 * - Client emits 'voice:speaking' -> Backend broadcasts to room
 */
declare const door: any;
export default door;
//# sourceMappingURL=index.d.ts.map