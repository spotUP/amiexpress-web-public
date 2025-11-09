// Sound Effects System using Web Audio API
export class SoundEffects {
  private audioContext: AudioContext | null = null;
  private enabled: boolean = true;
  private volume: number = 0.3;

  constructor() {
    if (typeof window !== 'undefined' && 'AudioContext' in window) {
      this.audioContext = new AudioContext();
    }
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
  }

  // Play a simple tone
  private playTone(frequency: number, duration: number, type: OscillatorType = 'sine') {
    if (!this.enabled || !this.audioContext) return;

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = type;

    gainNode.gain.setValueAtTime(this.volume, this.audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.01,
      this.audioContext.currentTime + duration
    );

    oscillator.start(this.audioContext.currentTime);
    oscillator.stop(this.audioContext.currentTime + duration);
  }

  // Success sound - pleasant ascending tones
  success() {
    this.playTone(523.25, 0.1); // C5
    setTimeout(() => this.playTone(659.25, 0.1), 80); // E5
    setTimeout(() => this.playTone(783.99, 0.15), 160); // G5
  }

  // Error sound - descending dissonant tones
  error() {
    this.playTone(400, 0.1, 'square');
    setTimeout(() => this.playTone(300, 0.15, 'square'), 100);
  }

  // Click sound - short pop
  click() {
    this.playTone(800, 0.05, 'square');
  }

  // Whoosh sound - for panel transitions
  whoosh() {
    if (!this.enabled || !this.audioContext) return;

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(200, this.audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(
      50,
      this.audioContext.currentTime + 0.3
    );

    gainNode.gain.setValueAtTime(this.volume * 0.5, this.audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.01,
      this.audioContext.currentTime + 0.3
    );

    oscillator.start(this.audioContext.currentTime);
    oscillator.stop(this.audioContext.currentTime + 0.3);
  }

  // Notification sound - subtle alert
  notification() {
    this.playTone(800, 0.08);
    setTimeout(() => this.playTone(1000, 0.08), 100);
  }

  // Build complete sound
  buildComplete() {
    this.playTone(440, 0.1); // A4
    setTimeout(() => this.playTone(554.37, 0.1), 80); // C#5
    setTimeout(() => this.playTone(659.25, 0.15), 160); // E5
    setTimeout(() => this.playTone(880, 0.2), 240); // A5
  }

  // Hover sound - very subtle
  hover() {
    if (!this.enabled || !this.audioContext) return;
    this.playTone(1200, 0.03, 'sine');
  }
}

// Singleton instance
let soundEffectsInstance: SoundEffects | null = null;

export const getSoundEffects = (): SoundEffects => {
  if (!soundEffectsInstance) {
    soundEffectsInstance = new SoundEffects();
  }
  return soundEffectsInstance;
};

// React hook for sound effects
import { useEffect, useState } from 'react';

export const useSoundEffects = () => {
  const [sfx] = useState(() => getSoundEffects());

  return sfx;
};

export default SoundEffects;
