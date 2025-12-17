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
    this.play(isMention ? 'mention' : 'message');
  }

  onJoin(): void { this.play('join'); }
  onLeave(): void { this.play('leave'); }
  onError(): void { this.play('error'); }
  onNotification(): void { this.play('notification'); }
  onReaction(): void { this.play('reaction'); }
  onDM(): void { this.play('dm'); }
}

export { SOUNDS, SoundConfig };
