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
import { layoutSignature, pickSpeaker, resolveBoxSize, autoViewMode } from './video-layout';

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
  /**
   * Called whenever the tiles have been rebuilt at a new size.
   *
   * Whoever owns the camera needs this: the picture is encoded to fit a
   * TILE, so it has to be re-encoded whenever the tile changes shape. The
   * window resizing is only one of the ways that happens - toggling the
   * sidebar, switching view mode and someone joining all resize the tiles
   * too, and none of them are a window resize.
   */
  onLayoutChanged?: () => void;
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
  private onLayoutChanged?: () => void;

  /**
   * What the tiles were last laid out FOR. A relayout destroys and rebuilds
   * every tile, so it must happen only when the geometry actually changes -
   * see updateGrid.
   */
  private layoutSignature: string | null = null;

  /**
   * True once the user has picked a view mode themselves. Their choice then
   * stands, whoever joins or leaves.
   */
  private viewModeChosen = false;

  /**
   * The last frame each participant sent.
   *
   * A rebuilt tile starts blank and paints the avatar until the next frame
   * arrives. When a relayout is genuinely needed - someone joins - that is a
   * visible blink of the avatar over a live picture, so the new tile is
   * handed the last frame immediately.
   */
  private lastFrames: Map<string, string> = new Map();

  constructor(options: VideoGridOptions) {
    this.screen = options.screen;
    this.currentUserId = options.currentUserId;
    this.currentUsername = options.currentUsername;
    this.viewMode = options.viewMode ?? 'speaker';  // Default to speaker mode for low-res terminals
    this.onTileRightClick = options.onTileRightClick;
    this.onLayoutChanged = options.onLayoutChanged;

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

    // Re-layout when the container is explicitly resized...
    this.container.on('resize', () => {
      this.updateGrid();
    });

    // ...and when the WINDOW changes, which is not the same event.
    //
    // An Element emits 'resize' only when its own width or height is SET.
    // This container is sized '100%', so its size changes with its parent
    // without anything ever being assigned to it - and it stayed silent
    // through every window resize. The grid therefore never rebuilt its
    // tiles, the tiles kept reporting the size they were built at, and the
    // camera was never asked to re-encode: "I started with a wide browser, I
    // get a wide image", and it never changed afterwards. Only the Screen
    // knows the window moved.
    this.screen.on('resize', () => {
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
    this.lastFrames.delete(id);
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
    this.lastFrames.set(id, frame);
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
  /** See video-layout.ts - the rules live there so they can be tested. */
  private speakerModeParticipant(participantArray: VideoParticipant[]): VideoParticipant | undefined {
    return pickSpeaker(participantArray, this.activeSpeaker, this.currentUserId);
  }

  private computeLayoutSignature(
    participantArray: VideoParticipant[],
    width: number,
    height: number
  ): string {
    return layoutSignature(
      this.viewMode,
      width,
      height,
      participantArray,
      this.activeSpeaker,
      this.currentUserId
    );
  }

  /** Push current status onto the tiles without rebuilding them. */
  private refreshTileStatus(participantArray: VideoParticipant[]): void {
    for (const participant of participantArray) {
      const tile = this.tiles.get(String(participant.userId));
      if (!tile) continue;
      tile.updateStatus({
        isMuted: participant.isMuted,
        hasVideo: participant.hasVideo,
        isSpeaking: participant.isSpeaking,
        audioLevel: participant.audioLevel,
      });
    }
  }

  /**
   * Hand a newly built tile the last picture its participant sent, so a
   * relayout does not blink the avatar over live video.
   */
  private restoreFrame(tile: VideoTile, userId: number | string): void {
    const frame = this.lastFrames.get(String(userId));
    if (frame) tile.setVideoFrame(frame);
  }

  /**
   * Lay the tiles out.
   *
   * This DESTROYS AND REBUILDS every tile, which is why it now begins by
   * asking whether the layout changed at all. It used to run on any
   * participant update, and a rebuilt tile starts with no frame - so it
   * painted the avatar until the next frame arrived, roughly a tenth of a
   * second later. Frame, avatar, frame, avatar: reported as "every second
   * frame in the video is broken", and only in the 80x25 view, because that
   * view runs in SPEAKER mode where setActiveSpeaker() relayouts - while
   * voice activity toggles the active speaker continuously. In grid mode the
   * same event only recolours a border, so the big view never flickered.
   */
  private updateGrid(): void {
    const participantArray = Array.from(this.participants.values());
    const participantCount = participantArray.length;

    // Get current container dimensions.
    //
    // From the RESOLVED COORDS, not container.width - that returns the
    // layout spec it was built with ('100%'), which never changes however
    // the window is resized. See resolveBoxSize.
    const size = resolveBoxSize(this.container as any, { width: 80, height: 24 });
    const containerWidth = size.width;
    const containerHeight = size.height;

    if (participantCount === 0) {
      // Clear all tiles
      for (const tile of this.tiles.values()) {
        tile.destroy();
      }
      this.tiles.clear();
      this.layoutSignature = null;
      this.screen.render();
      return;
    }

    // One person: fill the panel with them. Two or more: show them all -
    // a call where you cannot see the other person is not a video call.
    this.viewMode = autoViewMode(participantCount, this.viewModeChosen, this.viewMode);

    const signature = this.computeLayoutSignature(participantArray, containerWidth, containerHeight);
    console.log('[GridDiag] updateGrid sig=%s prev=%s tiles=%d -> %s', signature, this.layoutSignature, this.tiles.size,
      (signature === this.layoutSignature && this.tiles.size > 0) ? 'SKIP' : 'REBUILD');
    if (signature === this.layoutSignature && this.tiles.size > 0) {
      // Same geometry: the tiles stay, and with them the picture they hold.
      this.refreshTileStatus(participantArray);
      this.screen.render();
      return;
    }
    this.layoutSignature = signature;

    // Clear existing tiles
    for (const tile of this.tiles.values()) {
      tile.destroy();
    }
    this.tiles.clear();

    // SPEAKER MODE: Show only the active speaker (or self if nobody speaking)
    if (this.viewMode === 'speaker') {
      const participantToShow = this.speakerModeParticipant(participantArray);

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
          isCurrentUser: String(participantToShow.userId) === String(this.currentUserId),
          avatar: participantToShow.avatar,
        };

        const tile = new VideoTile(tileOptions);
        this.tiles.set(String(participantToShow.userId), tile);
        this.restoreFrame(tile, participantToShow.userId);
        this.attachTileRightClick(tile, participantToShow.userId);
      }

      this.screen.render();
      this.onLayoutChanged?.();
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
        isCurrentUser: String(participant.userId) === String(this.currentUserId),
        avatar: participant.avatar,
      };

      const tile = new VideoTile(tileOptions);
      this.tiles.set(String(participant.userId), tile);
      this.restoreFrame(tile, participant.userId);
      this.attachTileRightClick(tile, participant.userId);
    });

    this.screen.render();
    this.onLayoutChanged?.();
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
    // From here on the mode is the user's, not ours.
    this.viewModeChosen = true;
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
    this.lastFrames.clear();
    this.layoutSignature = null;
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
