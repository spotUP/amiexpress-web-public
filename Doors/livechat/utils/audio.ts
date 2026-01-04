import { SOUNDS, SoundConfig } from './sounds';

/** Audio service */
export class AudioService {
  private engine: any;
  private enabled = true;
  private mentionEnabled = true;

  constructor(engine: any) {
    this.engine = engine;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  setMentionEnabled(enabled: boolean): void {
    this.mentionEnabled = enabled;
  }

  /** Play a library sound effect */
  playSound(name: string, params: any = {}): void {
    if (!this.enabled) return;
    this.engine.playSound?.(name, params);
  }

  /** Play a raw note (fallback) */
  play(name: keyof typeof SOUNDS): void {
    if (!this.enabled) return;
    if (name === 'mention' && !this.mentionEnabled) return;
    const sound = SOUNDS[name];
    if (!sound || !this.engine) return;
    if (sound.notes) {
      this.engine.playChord?.(sound.notes, sound.duration);
    } else if (sound.note) {
      this.engine.playNote?.(sound.note, sound.duration);
    }
  }

  onMessage(isMention: boolean): void {
    if (isMention) {
      this.playSound('notification');
    } else {
      this.playSound('click');
    }
  }

  onJoin(): void { this.playSound('success'); }
  onLeave(): void { this.playSound('cancel'); }
  onError(): void { this.playSound('error'); }
  onNotification(): void { this.playSound('notification'); }
  onReaction(): void { this.playSound('confirm'); }
  onDM(): void { this.playSound('confirm'); }
}

export { SOUNDS, SoundConfig };
