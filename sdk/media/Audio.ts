/**
 * Audio API Implementation
 * 
 * Provides real-time audio streaming capabilities for doors.
 * This implementation acts as a proxy that communicates with the client
 * via Socket.IO events to trigger microphone capture and playback.
 */

import { Socket } from 'socket.io';
import { AudioAPI, AudioStreamOptions, AudioStreamInfo, AudioLevels } from '../core/types';

export class Audio implements AudioAPI {
  private socket: Socket;
  private currentRoomId: string | null = null;
  private activeStreams: AudioStreamInfo[] = [];
  private audioLevels: AudioLevels = { input: 0, output: 0 };
  private muted: boolean = false;
  private volume: number = 1.0;

  constructor(socket: Socket, roomId?: string) {
    this.socket = socket;
    this.currentRoomId = roomId || null;
    this.setupHandlers();
  }

  private setupHandlers() {
    // Listen for audio-related events from the client/server
    this.socket.on('audio:speaking-status', (data: AudioStreamInfo[]) => {
      this.activeStreams = data;
    });

    this.socket.on('audio:levels', (data: AudioLevels) => {
      this.audioLevels = data;
    });
  }

  async startStreaming(options?: AudioStreamOptions): Promise<string> {
    return new Promise((resolve, reject) => {
      this.socket.emit('audio:start-streaming', options, (response: any) => {
        if (response && response.success) {
          resolve(response.streamId);
        } else {
          reject(new Error(response?.error || 'Failed to start audio streaming'));
        }
      });
    });
  }

  async stopStreaming(): Promise<void> {
    return new Promise((resolve) => {
      this.socket.emit('audio:stop-streaming', () => {
        resolve();
      });
    });
  }

  getActiveStreams(): AudioStreamInfo[] {
    return this.activeStreams;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.socket.emit('audio:mute', { muted });
  }

  setVolume(volume: number): void {
    this.volume = volume;
    this.socket.emit('audio:volume', { volume });
  }

  getAudioLevels(): AudioLevels {
    return this.audioLevels;
  }

  async subscribe(userId: number | string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket.emit('audio:subscribe', { userId }, (response: any) => {
        if (response && response.success) {
          resolve();
        } else {
          reject(new Error(response?.error || 'Failed to subscribe to audio stream'));
        }
      });
    });
  }

  async unsubscribe(userId: number | string): Promise<void> {
    return new Promise((resolve) => {
      this.socket.emit('audio:unsubscribe', { userId }, () => {
        resolve();
      });
    });
  }
}
