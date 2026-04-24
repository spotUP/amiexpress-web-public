/**
 * Video API Implementation
 * 
 * Provides real-time ASCII video streaming capabilities for doors.
 * Converts video sources (webcam, files, URLs) to ASCII art with 16-color ANSI palette.
 */

import { Socket } from 'socket.io';
import { VideoAPI, VideoSource, VideoStreamOptions, VideoFrameHandler } from '../core/types';

export class Video implements VideoAPI {
  private socket: Socket;
  private activeStreams: string[] = [];
  private frameHandler: VideoFrameHandler | null = null;

  constructor(socket: Socket) {
    this.socket = socket;
    this.setupHandlers();
  }

  private setupHandlers() {
    this.socket.on('video:streams-update', (streams: string[]) => {
      this.activeStreams = streams;
    });

    this.socket.on('video:frame', (data: { frame: string }) => {
      if (this.frameHandler) {
        this.frameHandler(data.frame);
      }
    });
  }

  onFrame(handler: VideoFrameHandler): void {
    this.frameHandler = handler;
  }

  async startStream(source: VideoSource, options?: VideoStreamOptions): Promise<string> {
    // Browser-side ClientDoor doesn't ack; resolve immediately after emitting.
    this.socket.emit('video:start-stream', { source, options });
    return `video-${Date.now()}`;
  }

  async stopStream(streamId: string): Promise<void> {
    this.socket.emit('video:stop-stream', { streamId });
  }

  async subscribe(streamId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket.emit('video:subscribe', { streamId }, (response: any) => {
        if (response && response.success) {
          resolve();
        } else {
          reject(new Error(response?.error || 'Failed to subscribe to video stream'));
        }
      });
    });
  }

  async unsubscribe(streamId: string): Promise<void> {
    return new Promise((resolve) => {
      this.socket.emit('video:unsubscribe', { streamId }, () => {
        resolve();
      });
    });
  }

  async getStreams(): Promise<string[]> {
    return new Promise((resolve) => {
      this.socket.emit('video:get-streams', (streams: string[]) => {
        this.activeStreams = streams;
        resolve(streams);
      });
    });
  }

  async pauseStream(streamId: string): Promise<void> {
    return new Promise((resolve) => {
      this.socket.emit('video:pause-stream', { streamId }, () => {
        resolve();
      });
    });
  }

  async resumeStream(streamId: string): Promise<void> {
    return new Promise((resolve) => {
      this.socket.emit('video:resume-stream', { streamId }, () => {
        resolve();
      });
    });
  }
}
