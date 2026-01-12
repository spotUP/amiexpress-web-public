/**
 * GRANDMASTER - Hybrid client audio bridge
 *
 * Listens for audio events from the server and plays WAV samples in the browser.
 */

import { ClientDoor } from '@amiexpress/bbs-door-sdk/client';
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
  private unlocked = false;
  private pending: Array<() => void | Promise<void>> = [];
  private sfxVolume = 1;
  private musicVolume = 0.8;
  private currentMusic: HTMLAudioElement | null = null;
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

    this.setupUnlockHandler();
    this.bindSocketEvents();
  }

  private setupUnlockHandler(): void {
    const unlock = () => {
      if (this.unlocked) return;
      this.unlocked = true;
      void this.initTone();
      this.flushPending();
      document.removeEventListener('keydown', unlock);
      document.removeEventListener('click', unlock);
      document.removeEventListener('touchstart', unlock);
    };

    document.addEventListener('keydown', unlock);
    document.addEventListener('click', unlock);
    document.addEventListener('touchstart', unlock);
  }

  private bindSocketEvents(): void {
    const socket = (globalThis as any)?.__BBS__?.socket;
    if (!socket || typeof socket.on !== 'function') {
      console.warn('[GrandmasterAudioClient] No Socket.IO connection for audio events');
      return;
    }

    socket.on('audio:sfx', (data: SfxPayload) => this.playSfx(data));
    socket.on('audio:voice', (data: SfxPayload) => this.playVoice(data));
    socket.on('audio:music', (data: MusicPayload) => this.playMusic(data));
    socket.on('audio:music:stop', () => this.stopMusic());
    socket.on('audio:music:volume', (data: { volume?: number }) => {
      if (typeof data?.volume === 'number') {
        this.musicVolume = this.clampVolume(data.volume);
        if (this.currentMusic) {
          this.currentMusic.volume = this.musicVolume;
        }
      }
    });
  }

  private playSfx(data: SfxPayload): void {
    if (!data?.file) return;
    const volume = this.clampVolume(typeof data.volume === 'number' ? data.volume : this.sfxVolume);
    this.queuePlayback(() => this.playFile(data.file!, volume));
  }

  private playVoice(data: SfxPayload): void {
    if (!data?.file) return;
    const volume = this.clampVolume(typeof data.volume === 'number' ? data.volume : this.sfxVolume);
    this.queuePlayback(() => this.playFile(data.file!, volume));
  }

  private playMusic(data: MusicPayload): void {
    if (!data?.file) return;
    const volume = this.clampVolume(typeof data.volume === 'number' ? data.volume : this.musicVolume);
    this.queuePlayback(() => {
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
    });
  }

  private stopMusic(): void {
    if (!this.currentMusic) return;
    this.currentMusic.pause();
    this.currentMusic.currentTime = 0;
    this.currentMusic = null;
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

  private queuePlayback(action: () => void | Promise<void>): void {
    if (this.unlocked) {
      void action();
    } else {
      this.pending.push(action);
    }
  }

  private flushPending(): void {
    const pending = [...this.pending];
    this.pending = [];
    pending.forEach((action) => { void action(); });
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

new GrandmasterAudioClient();
