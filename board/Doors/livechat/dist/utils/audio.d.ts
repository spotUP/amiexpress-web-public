import { SOUNDS, SoundConfig } from './sounds';
/**
 * Audio service for hybrid door
 *
 * In hybrid mode, audio is played client-side. This service
 * emits socket events that the client.ts listens to and plays.
 */
export declare class AudioService {
    private socket;
    private enabled;
    private mentionEnabled;
    constructor(socket: any);
    setEnabled(enabled: boolean): void;
    setMentionEnabled(enabled: boolean): void;
    setVolume(volume: number): void;
    /** Play a library sound effect via client */
    playSound(name: string, params?: any): void;
    /** Play a raw note (fallback) */
    play(name: keyof typeof SOUNDS): void;
    onMessage(isMention: boolean): void;
    onJoin(): void;
    onLeave(): void;
    onError(): void;
    onNotification(): void;
    onReaction(): void;
    onDM(): void;
}
export { SOUNDS, SoundConfig };
