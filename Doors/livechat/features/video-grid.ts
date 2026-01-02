/**
 * Video Grid Component
 *
 * Discord-style video grid that displays all participants
 * - Adaptive layout: 2x2, 3x3, 4x4 based on participant count
 * - Shows video streams when available, avatars when not
 * - Active speaker highlighting
 * - Status indicators (mute, video, speaking)
 */

import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { Screen, Box } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { VideoTile, VideoTileOptions } from '../ui/video-tile';

export interface VideoParticipant {
  userId: number | string;
  username: string;
  socketId: string;
  isMuted: boolean;
  hasVideo: boolean;
  hasScreenShare: boolean;
  isSpeaking: boolean;
  audioLevel: number;
  avatar?: string;
}

export interface VideoGridOptions {
  parent: any;
  screen: Screen;
  left?: number | string;
  top?: number | string;
  width?: number | string;
  height?: number | string;
  currentUserId: number | string;
  currentUsername: string;
}

/**
 * Calculate optimal grid dimensions based on participant count
 */
function calculateGridDimensions(participantCount: number): { cols: number; rows: number } {
  if (participantCount <= 1) return { cols: 1, rows: 1 };
  if (participantCount <= 2) return { cols: 2, rows: 1 };
  if (participantCount <= 4) return { cols: 2, rows: 2 };
  if (participantCount <= 6) return { cols: 3, rows: 2 };
  if (participantCount <= 9) return { cols: 3, rows: 3 };
  if (participantCount <= 12) return { cols: 4, rows: 3 };
  if (participantCount <= 16) return { cols: 4, rows: 4 };
  if (participantCount <= 20) return { cols: 5, rows: 4 };
  return { cols: 5, rows: 5 }; // Max 25 participants
}

/**
 * VideoGrid - Displays all participants in an adaptive grid layout
 */
export class VideoGrid {
  private container: any; // Using any since Box type doesn't expose runtime properties
  private screen: Screen;
  private tiles: Map<number | string, VideoTile> = new Map();
  private participants: Map<number | string, VideoParticipant> = new Map();
  private currentUserId: number | string;
  private currentUsername: string;
  private activeSpeaker?: number | string;

  constructor(options: VideoGridOptions) {
    this.screen = options.screen;
    this.currentUserId = options.currentUserId;
    this.currentUsername = options.currentUsername;

    // Main container for video grid
    this.container = blessed.box({
      parent: options.parent,
      left: options.left ?? 0,
      top: options.top ?? 0,
      width: options.width ?? '100%',
      height: options.height ?? '100%-3',
      style: {
        bg: 'black',
      },
      tags: true,
      // Low z-index so it doesn't block modals/dialogs
      // @ts-ignore - zIndex exists but not in types
      zIndex: 10,
    });
  }

  /**
   * Add or update a participant in the grid
   */
  addParticipant(participant: VideoParticipant): void {
    this.participants.set(participant.userId, participant);
    this.updateGrid();
  }

  /**
   * Remove a participant from the grid
   */
  removeParticipant(userId: number | string): void {
    this.participants.delete(userId);
    const tile = this.tiles.get(userId);
    if (tile) {
      tile.destroy();
      this.tiles.delete(userId);
    }
    this.updateGrid();
  }

  /**
   * Update participant status (mute, video, speaking)
   */
  updateParticipant(userId: number | string, updates: Partial<VideoParticipant>): void {
    const participant = this.participants.get(userId);
    if (participant) {
      Object.assign(participant, updates);
      const tile = this.tiles.get(userId);
      if (tile) {
        tile.updateStatus({
          isMuted: participant.isMuted,
          hasVideo: participant.hasVideo,
          isSpeaking: participant.isSpeaking,
          audioLevel: participant.audioLevel,
        });
      }
    }
  }

  /**
   * Update participant with a new video frame
   */
  updateParticipantVideo(userId: number | string, frame: string): void {
    const tile = this.tiles.get(userId);
    if (tile) {
      tile.setVideoFrame(frame);
    }
  }

  /**
   * Set active speaker (highlighted border)
   */
  setActiveSpeaker(userId?: number | string): void {
    // Remove previous active speaker highlight
    if (this.activeSpeaker !== undefined) {
      const prevTile = this.tiles.get(this.activeSpeaker);
      if (prevTile) {
        prevTile.setActive(false);
      }
    }

    // Set new active speaker
    this.activeSpeaker = userId;
    if (userId !== undefined) {
      const tile = this.tiles.get(userId);
      if (tile) {
        tile.setActive(true);
      }
    }

    this.screen.render();
  }

  /**
   * Update the grid layout based on current participants
   */
  private updateGrid(): void {
    const participantArray = Array.from(this.participants.values());
    const participantCount = participantArray.length;

    if (participantCount === 0) {
      // Clear all tiles
      for (const tile of this.tiles.values()) {
        tile.destroy();
      }
      this.tiles.clear();
      this.screen.render();
      return;
    }

    // Calculate grid dimensions
    const { cols, rows } = calculateGridDimensions(participantCount);

    // Calculate tile dimensions
    const containerWidth = this.container.width as number;
    const containerHeight = this.container.height as number;
    const tileWidth = Math.floor(containerWidth / cols);
    const tileHeight = Math.floor(containerHeight / rows);

    // Clear existing tiles
    for (const tile of this.tiles.values()) {
      tile.destroy();
    }
    this.tiles.clear();

    // Create tiles for each participant
    participantArray.forEach((participant, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;

      const tileOptions: VideoTileOptions = {
        parent: this.container,
        screen: this.screen,
        left: col * tileWidth,
        top: row * tileHeight,
        width: tileWidth,
        height: tileHeight,
        userId: participant.userId,
        username: participant.username,
        isMuted: participant.isMuted,
        hasVideo: participant.hasVideo,
        isSpeaking: participant.isSpeaking,
        audioLevel: participant.audioLevel,
        isCurrentUser: participant.userId === this.currentUserId,
        avatar: participant.avatar,
      };

      const tile = new VideoTile(tileOptions);
      this.tiles.set(participant.userId, tile);
    });

    this.screen.render();
  }

  /**
   * Show the video grid
   */
  show(): void {
    this.container.show();
    this.screen.render();
  }

  /**
   * Hide the video grid
   */
  hide(): void {
    this.container.hide();
    this.screen.render();
  }

  /**
   * Bring grid to front
   */
  setFront(): void {
    this.container.setFront();
    this.screen.render();
  }

  /**
   * Check if video grid is visible
   */
  isVisible(): boolean {
    return this.container.visible;
  }

  /**
   * Destroy the video grid and clean up
   */
  destroy(): void {
    for (const tile of this.tiles.values()) {
      tile.destroy();
    }
    this.tiles.clear();
    this.participants.clear();
    this.container.destroy();
  }

  /**
   * Get participant count
   */
  getParticipantCount(): number {
    return this.participants.size;
  }

  /**
   * Get all participants
   */
  getParticipants(): VideoParticipant[] {
    return Array.from(this.participants.values());
  }
}

/**
 * Create a video grid instance
 */
export function createVideoGrid(options: VideoGridOptions): VideoGrid {
  return new VideoGrid(options);
}
