/**
 * LiveChat - Hybrid Door Client Component
 *
 * This client runs in the browser and handles:
 * - Audio playback via SDK AudioEngine
 * - Future browser-side enhancements
 *
 * The UI is rendered server-side via neo-blessed and sent as ANSI to the terminal.
 * This client only handles audio - the UI remains unchanged.
 */

import {
  ClientDoor,
  AudioEngine,
} from '@amiexpress/bbs-door-sdk/client';

// =============================================================================
// LiveChat Client
// =============================================================================

class LiveChatClient {
  private door: ClientDoor;
  private audio: AudioEngine;
  private audioInitialized: boolean = false;
  private pendingSounds: Array<{ soundId: string; params?: any }> = [];

  constructor() {
    this.door = new ClientDoor({
      name: 'LiveChat',
      version: '3.2.0',
      author: 'AmiExpress-Web',
      description: 'Multi-user chat with audio support',
      runtime: 'hybrid',
      hybrid: true,
    });

    this.audio = new AudioEngine({
      masterVolume: 0.7,
      musicVolume: 0.3,
      sfxVolume: 0.6,
    });

    this.setupEventHandlers();
    this.setupUserGestureHandler();
  }

  /**
   * Browser autoplay policy requires user gesture to start audio.
   * Listen for first user interaction to initialize AudioEngine.
   */
  private setupUserGestureHandler(): void {
    const initOnGesture = async () => {
      if (this.audioInitialized) return;

      try {
        await this.audio.init();
        this.audioInitialized = true;
        console.log('[LiveChatClient] Audio initialized on user gesture');

        // Play any sounds that were queued before initialization
        for (const pending of this.pendingSounds) {
          this.audio.playSound(pending.soundId, pending.params);
        }
        this.pendingSounds = [];
      } catch (error) {
        console.debug('[LiveChatClient] Audio init failed:', error);
      }

      // Remove listeners after successful init
      document.removeEventListener('keydown', initOnGesture);
      document.removeEventListener('click', initOnGesture);
      document.removeEventListener('touchstart', initOnGesture);
    };

    // Listen for any user interaction
    document.addEventListener('keydown', initOnGesture, { once: false });
    document.addEventListener('click', initOnGesture, { once: false });
    document.addEventListener('touchstart', initOnGesture, { once: false });
  }

  private setupEventHandlers(): void {
    // Listen for audio events from server
    this.door.on('audio:play', async (data: { soundId: string; params?: any }) => {
      await this.playSound(data.soundId, data.params);
    });

    // Listen for audio control events
    this.door.on('audio:set-enabled', (data: { enabled: boolean }) => {
      if (data.enabled) {
        this.audio.setUISoundsEnabled(true);
      } else {
        this.audio.setUISoundsEnabled(false);
      }
    });

    this.door.on('audio:set-volume', (data: { volume: number }) => {
      this.audio.setSfxVolume(data.volume);
    });

    // Handle door lifecycle
    this.door.on('connect', () => {
      console.log('[LiveChatClient] Connected to server');
    });

    this.door.on('disconnect', () => {
      console.log('[LiveChatClient] Disconnected from server');
    });
  }

  private async playSound(soundId: string, params?: any): Promise<void> {
    // Queue sounds if audio isn't initialized yet (waiting for user gesture)
    if (!this.audioInitialized) {
      // Only queue a few recent sounds to avoid overwhelming on first interaction
      if (this.pendingSounds.length < 3) {
        this.pendingSounds.push({ soundId, params });
      }
      console.debug('[LiveChatClient] Audio not ready, queued sound:', soundId);
      return;
    }

    try {
      this.audio.playSound(soundId, params);
    } catch (error) {
      console.debug('[LiveChatClient] Audio playback failed:', error);
    }
  }

  public start(): void {
    // No FPS needed - we're not rendering, just handling events
    this.door.start();
    console.log('[LiveChatClient] Started - listening for audio events');
  }
}

// =============================================================================
// Entry Point
// =============================================================================

const client = new LiveChatClient();
client.start();
