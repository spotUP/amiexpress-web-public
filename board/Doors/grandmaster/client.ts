/**
 * GRANDMASTER - Hybrid client audio bridge
 *
 * Listens for audio events from the server and plays WAV samples in the browser.
 */

import { ClientDoor } from '@amiexpress/bbs-door-sdk/client';
import { VoiceCapture } from '@amiexpress/bbs-door-sdk/client';
import * as Tone from 'tone';

interface SfxPayload {
  effect?: string;
  volume?: number;
  file?: string;
}

interface MusicPayload {
  track?: string;
  loop?: boolean;
  volume?: number;
  file?: string;
}

class GrandmasterAudioClient {
  private door: ClientDoor;
  private voiceCapture: VoiceCapture | null = null;
  private sfxVolume = 1;
  private musicVolume = 0.8;
  private currentMusic: HTMLAudioElement | null = null;
  private currentToneMusicFile: string | null = null;  // Track which Tone player is playing music
  private toneReady = false;
  private tonePlayers = new Map<string, Tone.Player>();
  private toneLoads = new Map<string, Promise<Tone.Player>>();

  constructor() {
    this.door = new ClientDoor({
      name: 'Grandmaster',
      version: '1.0.0',
      author: 'AmiExpress',
      description: 'TGM3-inspired multiplayer Tetris audio bridge',
      runtime: 'hybrid',
      hybrid: true,
    });

    // User has already interacted with the page (login), so autoplay is allowed.
    // Initialize Tone.js immediately.
    void this.initTone();
    this.bindSocketEvents();
  }

  private socketHandlers: Array<[string, (...args: any[]) => void]> = [];

  private bindSocketEvents(): void {
    const socket = (globalThis as any)?.__BBS__?.socket;
    if (!socket || typeof socket.on !== 'function') {
      console.warn('[GrandmasterAudioClient] No Socket.IO connection for audio events');
      return;
    }

    const on = (event: string, handler: (...args: any[]) => void) => {
      socket.on(event, handler);
      this.socketHandlers.push([event, handler]);
    };

    on('audio:sfx', (data: SfxPayload) => this.playSfx(data));
    on('audio:voice', (data: SfxPayload) => this.playVoice(data));
    on('audio:music', (data: MusicPayload) => this.playMusic(data));
    on('audio:music:stop', () => this.stopMusic());
    on('audio:music:volume', (data: { volume?: number }) => {
      if (typeof data?.volume === 'number') {
        this.musicVolume = this.clampVolume(data.volume);
        if (this.currentMusic) {
          this.currentMusic.volume = this.musicVolume;
        }
      }
    });

    // Clean up listeners when door becomes inactive
    const doorActiveHandler = (active: boolean) => {
      if (!active) {
        this.cleanup();
        socket.off('door-active', doorActiveHandler);
      }
    };
    on('door-active', doorActiveHandler);

    // Voice chat: VoiceCapture reacts to audio:start-streaming/stop-streaming
    // automatically via door events. Forward speaking/level state to server.
    const vc = new VoiceCapture(this.door);
    this.voiceCapture = vc;

    vc.on('speaking', (speaking: boolean) => {
      this.door.emit('voice:speaking', { speaking });
    });
    vc.on('level', (level: number) => {
      this.door.emit('voice:level', { level });
    });
    vc.on('error', (err: Error) => {
      console.warn('[GrandmasterAudioClient] Mic error:', err.message);
    });
  }

  cleanup(): void {
    this.stopMusic();
    const socket = (globalThis as any)?.__BBS__?.socket;
    if (socket) {
      for (const [event, handler] of this.socketHandlers) {
        socket.off(event, handler);
      }
    }
    this.socketHandlers = [];
    // Dispose Tone.js players
    for (const player of this.tonePlayers.values()) {
      try { player.dispose(); } catch { /* ignore */ }
    }
    this.tonePlayers.clear();
    this.toneLoads.clear();
    this.voiceCapture?.destroy();
    this.voiceCapture = null;
  }

  private playSfx(data: SfxPayload): void {
    if (!data?.file) return;
    const volume = this.clampVolume(typeof data.volume === 'number' ? data.volume : this.sfxVolume);
    void this.playFile(data.file!, volume);
  }

  private playVoice(data: SfxPayload): void {
    if (!data?.file) return;
    const volume = this.clampVolume(typeof data.volume === 'number' ? data.volume : this.sfxVolume);
    void this.playFile(data.file!, volume);
  }

  private playMusic(data: MusicPayload): void {
    if (!data?.file) return;
    const volume = this.clampVolume(typeof data.volume === 'number' ? data.volume : this.musicVolume);
    this.stopMusic();
    if (this.toneReady) {
      void this.playToneMusic(data.file!, volume, Boolean(data.loop));
      return;
    }
    const audio = new Audio(data.file!);
    audio.loop = Boolean(data.loop);
    audio.volume = volume;
    this.currentMusic = audio;
    audio.play().catch(() => {
      /* ignore autoplay failures */
    });
  }

  private stopMusic(): void {
    // Stop HTMLAudioElement music
    if (this.currentMusic) {
      this.currentMusic.pause();
      this.currentMusic.currentTime = 0;
      this.currentMusic = null;
    }

    // Stop Tone.js music player
    if (this.currentToneMusicFile) {
      const player = this.tonePlayers.get(this.currentToneMusicFile);
      if (player) {
        try {
          player.stop();
        } catch {
          // Player may already be stopped
        }
      }
      this.currentToneMusicFile = null;
    }
  }

  private async playFile(file: string, volume: number): Promise<void> {
    if (this.toneReady) {
      await this.playToneSample(file, volume);
      return;
    }
    const audio = new Audio(file);
    audio.volume = volume;
    audio.play().catch(() => {
      /* ignore autoplay failures */
    });
  }

  private async initTone(): Promise<void> {
    if (this.toneReady) return;
    try {
      await Tone.start();
      this.toneReady = true;
    } catch {
      this.toneReady = false;
    }
  }

  private async getTonePlayer(file: string): Promise<Tone.Player> {
    const existing = this.tonePlayers.get(file);
    if (existing) return existing;

    const pending = this.toneLoads.get(file);
    if (pending) return pending;

    const loadPromise = (async () => {
      const player = new Tone.Player().toDestination();
      await player.load(file);
      this.tonePlayers.set(file, player);
      this.toneLoads.delete(file);
      return player;
    })();

    this.toneLoads.set(file, loadPromise);
    return loadPromise;
  }

  private async playToneSample(file: string, volume: number): Promise<void> {
    try {
      const player = await this.getTonePlayer(file);
      player.volume.value = volume <= 0 ? -Infinity : Tone.gainToDb(volume);
      player.start();
    } catch {
      const audio = new Audio(file);
      audio.volume = volume;
      audio.play().catch(() => {
        /* ignore autoplay failures */
      });
    }
  }

  private async playToneMusic(file: string, volume: number, loop: boolean): Promise<void> {
    try {
      const player = await this.getTonePlayer(file);
      player.loop = loop;
      player.volume.value = volume <= 0 ? -Infinity : Tone.gainToDb(volume);
      player.start();
      this.currentToneMusicFile = file;  // Track for stopMusic()
    } catch {
      const audio = new Audio(file);
      audio.loop = loop;
      audio.volume = volume;
      this.currentMusic = audio;
      audio.play().catch(() => {
        /* ignore autoplay failures */
      });
    }
  }

  private clampVolume(value: number): number {
    if (Number.isNaN(value)) return 0;
    return Math.max(0, Math.min(1, value));
  }
}

// Destroy any previous instance (handles door re-entry without page reload)
const prev = (globalThis as any).__grandmasterAudio as GrandmasterAudioClient | undefined;
if (prev && typeof (prev as any).cleanup === 'function') {
  (prev as any).cleanup();
}
const instance = new GrandmasterAudioClient();
(globalThis as any).__grandmasterAudio = instance;
