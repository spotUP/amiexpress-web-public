import { SOUNDS, SoundConfig } from './sounds';

/**
 * Audio service for hybrid door
 *
 * In hybrid mode, audio is played client-side. This service
 * emits socket events that the client.ts listens to and plays.
 */
export class AudioService {
  private socket: any;
  private enabled = true;
  private mentionEnabled = true;

  constructor(socket: any) {
    this.socket = socket;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    // Notify client of enabled state change
    this.socket?.emit('audio:set-enabled', { enabled });
  }

  setMentionEnabled(enabled: boolean): void {
    this.mentionEnabled = enabled;
  }

  setVolume(volume: number): void {
    this.socket?.emit('audio:set-volume', { volume });
  }

  /** Play a library sound effect via client */
  playSound(name: string, params: any = {}): void {
    if (!this.enabled) return;
    // Emit to client for playback
    this.socket?.emit('audio:play', { soundId: name, params });
  }

  /** Play a raw note (fallback) */
  play(name: keyof typeof SOUNDS): void {
    if (!this.enabled) return;
    if (name === 'mention' && !this.mentionEnabled) return;
    const sound = SOUNDS[name];
    if (!sound) return;

    // For hybrid, we just emit the sound name
    // Client will handle the actual synthesis
    this.playSound(name);
  }

  onMessage(isMention: boolean): void {
    if (isMention) {
      this.playSound('mention');
    } else {
      this.playSound('message');
    }
  }

  onJoin(): void { this.playSound('join'); }
  onLeave(): void { this.playSound('leave'); }
  onError(): void { this.playSound('error'); }
  onNotification(): void { this.playSound('notification'); }
  onReaction(): void { this.playSound('reaction'); }
  onDM(): void { this.playSound('dm'); }
}

export { SOUNDS, SoundConfig };
