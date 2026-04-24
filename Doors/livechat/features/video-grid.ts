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
  viewMode?: 'speaker' | 'grid';  // Default: 'speaker' for low-res terminals
  onTileRightClick?: (userId: string, x: number, y: number) => void;
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
  private lastWidth: number = 0;
  private lastHeight: number = 0;
  private viewMode: 'speaker' | 'grid';  // speaker = show one person, grid = show all
  private onTileRightClick?: (userId: string, x: number, y: number) => void;

  constructor(options: VideoGridOptions) {
    this.screen = options.screen;
    this.currentUserId = options.currentUserId;
    this.currentUsername = options.currentUsername;
    this.viewMode = options.viewMode ?? 'speaker';  // Default to speaker mode for low-res terminals
    this.onTileRightClick = options.onTileRightClick;

    // Main container for video grid (no outer border — tiles have their own)
    this.container = blessed.box({
      parent: options.parent,
      left: options.left ?? 0,
      top: options.top ?? 0,
      width: options.width ?? '100%',
      height: options.height ?? '100%',
      border: undefined,
      style: {
        bg: 'transparent',
      },
      tags: true,
      mouse: false,  // Don't capture mouse events - pass through to chat panel
      // Low z-index so it doesn't block modals/dialogs
      // @ts-ignore - zIndex exists but not in types
      zIndex: 10,
    });

    // Re-layout on container resize
    this.container.on('resize', () => {
      this.updateGrid();
    });
  }

  /**
   * Add or update a participant in the grid
   */
  addParticipant(participant: VideoParticipant): void {
    this.participants.set(String(participant.userId), participant);
    this.updateGrid();
  }

  /**
   * Remove a participant from the grid
   */
  removeParticipant(userId: number | string): void {
    const id = String(userId);
    this.participants.delete(id);
    const tile = this.tiles.get(id);
    if (tile) {
      tile.destroy();
      this.tiles.delete(id);
    }
    this.updateGrid();
  }

  /**
   * Update participant status (mute, video, speaking)
   */
  updateParticipant(userId: number | string, updates: Partial<VideoParticipant>): void {
    const id = String(userId);
    const participant = this.participants.get(id);
    if (participant) {
      Object.assign(participant, updates);
      const tile = this.tiles.get(id);
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
    const id = String(userId);
    const tile = this.tiles.get(id);
    console.log('[video-grid] updateParticipantVideo id=%s hasTile=%s tileCount=%d participantCount=%d', id, !!tile, this.tiles.size, this.participants.size);
    if (tile) {
      tile.setVideoFrame(frame);
    }
  }

  /**
   * Update participant with an error message
   */
  updateParticipantError(userId: number | string, error: string): void {
    const id = String(userId);
    const tile = this.tiles.get(id);
    if (tile) {
      tile.setVideoError(error);
    }
  }

  /**
   * Set active speaker (highlighted border in grid mode, switch to speaker in speaker mode)
   */
  setActiveSpeaker(userId?: number | string): void {
    const prevSpeaker = this.activeSpeaker;
    this.activeSpeaker = userId;

    // In speaker mode, switch to showing the new speaker
    if (this.viewMode === 'speaker' && prevSpeaker !== userId) {
      this.updateGrid();
      return;
    }

    // In grid mode, just highlight the border
    // Remove previous active speaker highlight
    if (prevSpeaker !== undefined) {
      const prevTile = this.tiles.get(String(prevSpeaker));
      if (prevTile) {
        prevTile.setActive(false);
      }
    }

    // Set new active speaker highlight
    if (userId !== undefined) {
      const tile = this.tiles.get(String(userId));
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

    // Get current container dimensions
    const containerWidth = this.container.width as number;
    const containerHeight = this.container.height as number;

    if (participantCount === 0) {
      // Clear all tiles
      for (const tile of this.tiles.values()) {
        tile.destroy();
      }
      this.tiles.clear();
      this.screen.render();
      return;
    }

    // Clear existing tiles
    for (const tile of this.tiles.values()) {
      tile.destroy();
    }
    this.tiles.clear();

    // SPEAKER MODE: Show only the active speaker (or self if nobody speaking)
    if (this.viewMode === 'speaker') {
      // Determine who to show: active speaker, or self if nobody is speaking
      let participantToShow = participantArray.find(p => String(p.userId) === String(this.activeSpeaker));

      // If no active speaker, show yourself
      if (!participantToShow) {
        participantToShow = participantArray.find(p => String(p.userId) === String(this.currentUserId));
      }

      // If still nothing, show first participant
      if (!participantToShow && participantArray.length > 0) {
        participantToShow = participantArray[0];
      }

      if (participantToShow) {
        // Show single participant filling entire container
        const tileOptions: VideoTileOptions = {
          parent: this.container,
          screen: this.screen,
          left: 0,
          top: 0,
          width: containerWidth,
          height: containerHeight,
          userId: participantToShow.userId,
          username: participantToShow.username,
          isMuted: participantToShow.isMuted,
          hasVideo: participantToShow.hasVideo,
          isSpeaking: participantToShow.isSpeaking,
          audioLevel: participantToShow.audioLevel,
          isCurrentUser: participantToShow.userId === this.currentUserId,
          avatar: participantToShow.avatar,
        };

        const tile = new VideoTile(tileOptions);
        this.tiles.set(String(participantToShow.userId), tile);
        this.attachTileRightClick(tile, participantToShow.userId);
      }

      this.screen.render();
      return;
    }

    // GRID MODE: Show all participants in a grid (original behavior)
    // Calculate optimal grid (cols x rows) to fill the space
    let bestCols = 1;
    let bestRows = 1;
    let maxArea = 0;

    for (let cols = 1; cols <= participantCount; cols++) {
      const rows = Math.ceil(participantCount / cols);
      const tileWidth = Math.floor(containerWidth / cols);
      const tileHeight = Math.floor(containerHeight / rows);
      const area = tileWidth * tileHeight;

      if (area > maxArea) {
        maxArea = area;
        bestCols = cols;
        bestRows = rows;
      }
    }

    const tileWidth = Math.floor(containerWidth / bestCols);
    const tileHeight = Math.floor(containerHeight / bestRows);

    // Create tiles for each participant
    participantArray.forEach((participant, index) => {
      const row = Math.floor(index / bestCols);
      const col = index % bestCols;

      // For the last row, center the remaining tiles if any
      let xOffset = 0;
      const isLastRow = row === bestRows - 1;
      if (isLastRow) {
        const tilesInLastRow = participantCount - (row * bestCols);
        if (tilesInLastRow < bestCols) {
          const rowWidth = tilesInLastRow * tileWidth;
          xOffset = Math.floor((containerWidth - rowWidth) / 2);
        }
      }

      const tileOptions: VideoTileOptions = {
        parent: this.container,
        screen: this.screen,
        left: (col * tileWidth) + xOffset,
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
      this.tiles.set(String(participant.userId), tile);
      this.attachTileRightClick(tile, participant.userId);
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
   * Toggle between speaker mode and grid mode
   */
  toggleViewMode(): void {
    this.viewMode = this.viewMode === 'speaker' ? 'grid' : 'speaker';
    this.updateGrid();
  }

  /**
   * Get current view mode
   */
  getViewMode(): 'speaker' | 'grid' {
    return this.viewMode;
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
   * Get the inner video-area dims (chars) of a tile. Used by callers that
   * stream their own webcam to ask the SDK for an ASCII frame that
   * matches the tile size — so a single-tile speaker view fills the chat
   * panel instead of leaving 80x24 in a much larger area.
   */
  getTileVideoDims(userId: number | string): { width: number; height: number } | null {
    const tile = this.tiles.get(String(userId));
    if (!tile) return null;
    return tile.getVideoDims();
  }

  /**
   * Set the render-mode label for a tile's status bar. Only the sender
   * sees this (the VideoTile only shows it when isCurrentUser), so
   * calling it for a remote participant is a safe no-op label-wise.
   */
  setTileRenderMode(userId: number | string, mode: string): void {
    const tile = this.tiles.get(String(userId));
    if (!tile) return;
    tile.updateStatus({ renderMode: mode });
  }

  /**
   * Attach a right-click handler to a freshly-created tile so the door
   * host can pop its shared context menu. No-op when no callback was
   * supplied at grid construction.
   */
  private attachTileRightClick(tile: VideoTile, userId: number | string): void {
    if (!this.onTileRightClick) return;
    const container = tile.getContainer();
    try {
      // blessed needs `mouse: true` for rightclick events to fire.
      container.enableMouse?.();
      container.mouse = true;
    } catch { /* ignore */ }
    container.on('rightclick', (data: any) => {
      this.onTileRightClick?.(String(userId), data?.x ?? 0, data?.y ?? 0);
    });
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
