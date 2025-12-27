/**
 * Card Lobby - Hybrid Door Client Component
 *
 * Handles web audio for the server-side card lobby UI.
 * Rich Tone.js synthesized sounds for authentic casino experience.
 */

import { ClientDoor } from '@amiexpress/bbs-door-sdk/client';
import type { KeyEvent } from '@amiexpress/bbs-door-sdk/client';
// @ts-ignore - ESM import for browser bundling
import * as Tone from 'tone/build/esm/index.js';

const { start: toneStart, now: toneNow, Gain, Synth, NoiseSynth, Filter, MetalSynth, MembraneSynth, PolySynth } = Tone;

const door = new ClientDoor({
  name: 'Card Lobby',
  version: '2.0.0',
  author: 'AmiExpress Team',
  description: 'Multiplayer card lobby with web audio',
  runtime: 'hybrid',
  hybrid: true,
});

let audioReady = false;
let sfxGain: Gain;

// Key mapping for input forwarding
const KEY_MAP: Record<string, string> = {
  ArrowUp: '\x1b[A',
  ArrowDown: '\x1b[B',
  ArrowRight: '\x1b[C',
  ArrowLeft: '\x1b[D',
  Enter: '\r',
  Escape: '\x1b',
  Tab: '\t',
  Backspace: '\x7f',
  Space: ' ',
  ' ': ' ',
};

const keyToRaw = (key: KeyEvent): string => {
  const raw = (key as any).raw;
  if (typeof raw === 'string' && raw.length > 0) {
    return raw;
  }

  const keyName = (key as any).key ?? '';
  if (typeof keyName === 'string' && keyName.startsWith('{')) {
    return keyName;
  }

  if (typeof keyName === 'string' && KEY_MAP[keyName]) {
    return KEY_MAP[keyName];
  }

  if (typeof keyName === 'string' && keyName.length === 1) {
    return keyName;
  }

  return '';
};

const initAudio = async (): Promise<void> => {
  if (audioReady) return;
  try {
    await toneStart();
    sfxGain = new Gain(0.7).toDestination();
    audioReady = true;
  } catch {
    // Ignore audio init failures
  }
};

// Sound generators using Tone.js for rich casino sounds
const sounds = {
  // Card deal - quick snap with slight pitch variation
  'card-deal': () => {
    const noise = new NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.02 },
    }).connect(sfxGain);
    const filter = new Filter(2000, 'highpass').connect(sfxGain);
    noise.connect(filter);
    noise.triggerAttackRelease(0.04);
    setTimeout(() => { noise.dispose(); filter.dispose(); }, 200);
  },

  // Card flip - layered snap with tonal component
  'card-flip': () => {
    const noise = new NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.03 },
    }).connect(sfxGain);
    const synth = new Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.02 },
    }).connect(sfxGain);
    synth.volume.value = -12;
    noise.triggerAttackRelease(0.08);
    synth.triggerAttackRelease(800 + Math.random() * 200, 0.05);
    setTimeout(() => { noise.dispose(); synth.dispose(); }, 300);
  },

  // Card shuffle - multiple rapid snaps with filtering
  'card-shuffle': () => {
    const noise = new NoiseSynth({
      noise: { type: 'pink' },
      envelope: { attack: 0.001, decay: 0.02, sustain: 0, release: 0.01 },
    }).connect(sfxGain);
    const filter = new Filter(3000, 'lowpass').connect(sfxGain);
    noise.connect(filter);
    for (let i = 0; i < 8; i++) {
      setTimeout(() => {
        filter.frequency.value = 2000 + Math.random() * 2000;
        noise.triggerAttackRelease(0.02);
      }, i * 25 + Math.random() * 10);
    }
    setTimeout(() => { noise.dispose(); filter.dispose(); }, 400);
  },

  // Chips bet - ceramic click with low resonance
  'chips-bet': () => {
    const synth = new MetalSynth({
      frequency: 300,
      envelope: { attack: 0.001, decay: 0.08, release: 0.05 },
      harmonicity: 3.1,
      modulationIndex: 8,
      resonance: 2000,
      octaves: 1,
    }).connect(sfxGain);
    synth.volume.value = -8;
    synth.triggerAttackRelease(0.08);
    setTimeout(() => synth.dispose(), 300);
  },

  // Chips win - cascading ceramic sounds (winning pot)
  'chips-win': () => {
    for (let i = 0; i < 6; i++) {
      setTimeout(() => {
        const synth = new MetalSynth({
          frequency: 250 + Math.random() * 150,
          envelope: { attack: 0.001, decay: 0.1, release: 0.08 },
          harmonicity: 2.5 + Math.random(),
          modulationIndex: 6,
          resonance: 1500 + Math.random() * 1000,
          octaves: 1,
        }).connect(sfxGain);
        synth.volume.value = -10;
        synth.triggerAttackRelease(0.1);
        setTimeout(() => synth.dispose(), 400);
      }, i * 50 + Math.random() * 30);
    }
  },

  // Chips pot - single chip to pot
  'chips-pot': () => {
    const synth = new MetalSynth({
      frequency: 280,
      envelope: { attack: 0.001, decay: 0.12, release: 0.06 },
      harmonicity: 2.8,
      modulationIndex: 10,
      resonance: 1800,
      octaves: 1.2,
    }).connect(sfxGain);
    synth.volume.value = -6;
    synth.triggerAttackRelease(0.12);
    setTimeout(() => synth.dispose(), 350);
  },

  // Your turn - attention chime (two-note ascending)
  'your-turn': () => {
    const synth = new Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.01, decay: 0.15, sustain: 0.1, release: 0.2 },
    }).connect(sfxGain);
    synth.triggerAttackRelease('E5', 0.1, toneNow());
    synth.triggerAttackRelease('A5', 0.15, toneNow() + 0.12);
    setTimeout(() => synth.dispose(), 600);
  },

  // Player join - welcoming arpeggio
  'player-join': () => {
    const synth = new Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.01, decay: 0.1, sustain: 0.05, release: 0.1 },
    }).connect(sfxGain);
    synth.volume.value = -6;
    synth.triggerAttackRelease('C5', 0.08, toneNow());
    synth.triggerAttackRelease('E5', 0.08, toneNow() + 0.08);
    synth.triggerAttackRelease('G5', 0.12, toneNow() + 0.16);
    setTimeout(() => synth.dispose(), 500);
  },

  // Player leave - descending tones
  'player-leave': () => {
    const synth = new Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.01, decay: 0.15, sustain: 0, release: 0.1 },
    }).connect(sfxGain);
    synth.volume.value = -8;
    synth.triggerAttackRelease('G4', 0.1, toneNow());
    synth.triggerAttackRelease('E4', 0.1, toneNow() + 0.1);
    synth.triggerAttackRelease('C4', 0.15, toneNow() + 0.2);
    setTimeout(() => synth.dispose(), 600);
  },

  // Game start - fanfare
  'game-start': () => {
    const synth = new PolySynth(Synth).connect(sfxGain);
    synth.set({
      oscillator: { type: 'square' },
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.3 },
    });
    synth.volume.value = -10;
    synth.triggerAttackRelease(['C4', 'E4', 'G4'], 0.15, toneNow());
    synth.triggerAttackRelease(['C5', 'E5', 'G5'], 0.25, toneNow() + 0.2);
    setTimeout(() => synth.dispose(), 800);
  },

  // Game end - resolution chord
  'game-end': () => {
    const synth = new PolySynth(Synth).connect(sfxGain);
    synth.set({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.05, decay: 0.4, sustain: 0.2, release: 0.5 },
    });
    synth.volume.value = -8;
    synth.triggerAttackRelease(['C4', 'E4', 'G4', 'C5'], 0.6, toneNow());
    setTimeout(() => synth.dispose(), 1500);
  },

  // Fold - low thud (giving up)
  'fold': () => {
    const synth = new MembraneSynth({
      pitchDecay: 0.05,
      octaves: 4,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.1 },
    }).connect(sfxGain);
    synth.volume.value = -10;
    synth.triggerAttackRelease('C2', 0.2);
    setTimeout(() => synth.dispose(), 400);
  },

  // Check - soft tap
  'check': () => {
    const synth = new Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.02 },
    }).connect(sfxGain);
    synth.triggerAttackRelease('G5', 0.05);
    setTimeout(() => synth.dispose(), 200);
  },

  // Call - confirmation beep
  'call': () => {
    const synth = new Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.01, decay: 0.08, sustain: 0, release: 0.05 },
    }).connect(sfxGain);
    synth.triggerAttackRelease('A5', 0.08);
    setTimeout(() => synth.dispose(), 250);
  },

  // Raise - ascending emphasis
  'raise': () => {
    const synth = new Synth({
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.01, decay: 0.1, sustain: 0.05, release: 0.1 },
    }).connect(sfxGain);
    synth.volume.value = -12;
    synth.triggerAttackRelease('C5', 0.08, toneNow());
    synth.triggerAttackRelease('E5', 0.1, toneNow() + 0.08);
    setTimeout(() => synth.dispose(), 400);
  },

  // All-in - dramatic crescendo
  'all-in': () => {
    const synth = new PolySynth(Synth).connect(sfxGain);
    synth.set({
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.05, decay: 0.3, sustain: 0.2, release: 0.4 },
    });
    synth.volume.value = -8;
    synth.triggerAttackRelease(['C4', 'G4'], 0.15, toneNow());
    synth.triggerAttackRelease(['E4', 'B4'], 0.15, toneNow() + 0.1);
    synth.triggerAttackRelease(['G4', 'D5', 'G5'], 0.4, toneNow() + 0.2);
    setTimeout(() => synth.dispose(), 1000);
  },

  // Menu select - crisp click
  'menu-select': () => {
    const synth = new Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.02 },
    }).connect(sfxGain);
    synth.triggerAttackRelease('A5', 0.04);
    setTimeout(() => synth.dispose(), 150);
  },

  // Menu move - subtle tick
  'menu-move': () => {
    const synth = new Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.02, sustain: 0, release: 0.01 },
    }).connect(sfxGain);
    synth.volume.value = -6;
    synth.triggerAttackRelease('E5', 0.02);
    setTimeout(() => synth.dispose(), 100);
  },

  // Error - dissonant buzz
  'error': () => {
    const synth = new Synth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.01, decay: 0.15, sustain: 0, release: 0.1 },
    }).connect(sfxGain);
    synth.volume.value = -10;
    synth.triggerAttackRelease('C3', 0.08, toneNow());
    synth.triggerAttackRelease('B2', 0.12, toneNow() + 0.08);
    setTimeout(() => synth.dispose(), 400);
  },

  // Success - bright ding
  'success': () => {
    const synth = new Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.2 },
    }).connect(sfxGain);
    synth.triggerAttackRelease('C6', 0.15);
    setTimeout(() => synth.dispose(), 500);
  },

  // Notification - gentle bell
  'notification': () => {
    const synth = new Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.01, decay: 0.15, sustain: 0.05, release: 0.2 },
    }).connect(sfxGain);
    synth.triggerAttackRelease('G5', 0.1);
    setTimeout(() => synth.dispose(), 400);
  },
};

type SoundType = keyof typeof sounds;

const playSound = async (type: string): Promise<void> => {
  await initAudio();
  if (!audioReady) return;

  const soundFn = sounds[type as SoundType];
  if (soundFn) {
    soundFn();
  }
};

// Handle sound events from server
door.onMessage('sound', async (data: { type: string }) => {
  if (data?.type) {
    await playSound(data.type);
  }
});

// Forward all input to server
door.onInput((_user, key) => {
  const keyType = (key as any).type;
  if (keyType === 'keyup') {
    return; // Ignore key up events
  }

  const keyName = (key as any).key ?? '';

  // Check for mouse events
  if (typeof keyName === 'string' && keyName.startsWith('{')) {
    try {
      const mouseEvent = JSON.parse(keyName);
      if (mouseEvent.type === 'mouse-click') {
        void playSound('menu-select');
      }
    } catch {
      // Not a mouse event
    }
  }

  // Play UI sounds based on key
  if (keyName === 'Enter' || keyName === '\r') {
    void playSound('menu-select');
  } else if (keyName === 'ArrowUp' || keyName === 'ArrowDown') {
    void playSound('menu-move');
  }

  // Forward input to server
  const raw = keyToRaw(key);
  if (raw) {
    void door.rpc('input', { raw }).catch(() => undefined);
  }
});

door.onConnect(async () => {
  // Pre-initialize audio on first user interaction
  await initAudio();
});

door.start();
