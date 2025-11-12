// Sound Effects System using Web Audio API with Reverb and Echo
export class SoundEffects {
  private audioContext: AudioContext | null = null;
  private enabled: boolean = true;
  private volume: number = 0.3;
  private reverbNode: ConvolverNode | null = null;
  private delayNode: DelayNode | null = null;
  private feedbackGain: GainNode | null = null;
  private wetGain: GainNode | null = null;
  private dryGain: GainNode | null = null;
  private masterGain: GainNode | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'AudioContext' in window) {
      this.audioContext = new AudioContext();
      this.setupEffectsChain();
    }
  }

  // Setup reverb and echo effects chain
  private setupEffectsChain() {
    if (!this.audioContext) return;

    // Create reverb using impulse response
    this.reverbNode = this.audioContext.createConvolver();
    this.reverbNode.buffer = this.createReverbImpulse(3.0, 3.0); // 3 second decay, strong reverb

    // Create echo/delay effect
    this.delayNode = this.audioContext.createDelay(2.0);
    this.delayNode.delayTime.value = 0.25; // 250ms delay time (reduced)

    // Feedback gain for echo repeats
    this.feedbackGain = this.audioContext.createGain();
    this.feedbackGain.gain.value = 0.3; // 30% feedback - moderate echo (halved)

    // Wet/dry mix
    this.wetGain = this.audioContext.createGain();
    this.wetGain.gain.value = 0.5; // 50% wet - balanced mix (reduced from 85%)

    this.dryGain = this.audioContext.createGain();
    this.dryGain.gain.value = 0.5; // 50% dry - balanced with wet

    // Master output
    this.masterGain = this.audioContext.createGain();
    this.masterGain.gain.value = 1.0;

    // Connect echo feedback loop
    this.delayNode.connect(this.feedbackGain);
    this.feedbackGain.connect(this.delayNode);

    // Connect wet signal: delay -> reverb -> wetGain -> master
    this.delayNode.connect(this.reverbNode);
    this.reverbNode.connect(this.wetGain);
    this.wetGain.connect(this.masterGain);

    // Connect dry signal: dryGain -> master
    this.dryGain.connect(this.masterGain);

    // Connect master to output
    this.masterGain.connect(this.audioContext.destination);
  }

  // Create reverb impulse response (synthetic)
  private createReverbImpulse(duration: number, decay: number): AudioBuffer {
    if (!this.audioContext) throw new Error('No audio context');

    const sampleRate = this.audioContext.sampleRate;
    const length = sampleRate * duration;
    const impulse = this.audioContext.createBuffer(2, length, sampleRate);
    const leftChannel = impulse.getChannelData(0);
    const rightChannel = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const n = length - i;
      // Exponential decay with random diffusion for realistic reverb
      leftChannel[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      rightChannel[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }

    return impulse;
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
  }

  // Play a simple tone with reverb and echo
  private playTone(frequency: number, duration: number, type: OscillatorType = 'sine') {
    if (!this.enabled || !this.audioContext || !this.delayNode || !this.dryGain) return;

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    // Connect to both wet (effects) and dry paths
    oscillator.connect(gainNode);
    gainNode.connect(this.delayNode); // Wet path (reverb + echo)
    gainNode.connect(this.dryGain);   // Dry path

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

  // Whoosh sound - for panel transitions (with reverb and echo)
  whoosh() {
    if (!this.enabled || !this.audioContext || !this.delayNode || !this.dryGain) return;

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    // Connect to both wet (effects) and dry paths
    oscillator.connect(gainNode);
    gainNode.connect(this.delayNode); // Wet path (reverb + echo)
    gainNode.connect(this.dryGain);   // Dry path

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
