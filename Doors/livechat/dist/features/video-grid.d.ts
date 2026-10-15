/**
 * Video Grid Component
 *
 * Discord-style video grid that displays all participants
 * - Adaptive layout: 2x2, 3x3, 4x4 based on participant count
 * - Shows video streams when available, avatars when not
 * - Active speaker highlighting
 * - Status indicators (mute, video, speaking)
 */
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
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
    viewMode?: 'speaker' | 'grid';
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
 * VideoGrid - Displays all participants in an adaptive grid layout
 */
export declare class VideoGrid {
    private container;
    private screen;
    private tiles;
    private participants;
    /** One line saying nobody else is here, when nobody else is. */
    private emptyNoticeBox;
    private currentUserId;
    private currentUsername;
    private activeSpeaker?;
    private lastWidth;
    private lastHeight;
    private viewMode;
    private onTileRightClick?;
    private onLayoutChanged?;
    /**
     * What the tiles were last laid out FOR. A relayout destroys and rebuilds
     * every tile, so it must happen only when the geometry actually changes -
     * see updateGrid.
     */
    private layoutSignature;
    /**
     * True once the user has picked a view mode themselves. Their choice then
     * stands, whoever joins or leaves.
     */
    private viewModeChosen;
    /**
     * The last frame each participant sent.
     *
     * A rebuilt tile starts blank and paints the avatar until the next frame
     * arrives. When a relayout is genuinely needed - someone joins - that is a
     * visible blink of the avatar over a live picture, so the new tile is
     * handed the last frame immediately.
     */
    private lastFrames;
    constructor(options: VideoGridOptions);
    /**
     * Add or update a participant in the grid
     */
    addParticipant(participant: VideoParticipant): void;
    /**
     * Remove a participant from the grid
     */
    removeParticipant(userId: number | string): void;
    /**
     * Update participant status (mute, video, speaking)
     */
    updateParticipant(userId: number | string, updates: Partial<VideoParticipant>): void;
    /**
     * Update participant with a new video frame
     */
    /** Is this person already in the grid? */
    hasParticipant(userId: number | string): boolean;
    updateParticipantVideo(userId: number | string, frame: string): void;
    /**
     * Update participant with an error message
     */
    updateParticipantError(userId: number | string, error: string): void;
    /**
     * Set active speaker (highlighted border in grid mode, switch to speaker in speaker mode)
     */
    setActiveSpeaker(userId?: number | string): void;
    /**
     * Update the grid layout based on current participants
     */
    /** See video-layout.ts - the rules live there so they can be tested. */
    private speakerModeParticipant;
    private computeLayoutSignature;
    /** Push current status onto the tiles without rebuilding them. */
    private refreshTileStatus;
    /**
     * Hand a newly built tile the last picture its participant sent, so a
     * relayout does not blink the avatar over live video.
     */
    private restoreFrame;
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
    /**
     * Say when there is nobody to wait for.
     *
     * A tile that reads "waiting" is only honest if somebody is expected. Alone
     * in a channel, the wait never ends, and the first person it happened to
     * spent two days believing his camera was broken.
     *
     * Rebuilt with the tiles rather than kept: a relayout destroys the
     * container's children, and forceFullRedraw() forgets what the terminal was
     * showing.
     */
    private updateEmptyChannelNotice;
    private updateGrid;
    /**
     * Show the video grid
     */
    show(): void;
    /**
     * Hide the video grid
     */
    hide(): void;
    /**
     * Toggle between speaker mode and grid mode
     */
    toggleViewMode(): void;
    /**
     * Get current view mode
     */
    getViewMode(): 'speaker' | 'grid';
    /**
     * Bring grid to front
     */
    setFront(): void;
    /**
     * Check if video grid is visible
     */
    isVisible(): boolean;
    /**
     * Destroy the video grid and clean up
     */
    destroy(): void;
    /**
     * Get participant count
     */
    getParticipantCount(): number;
    /**
     * Get the inner video-area dims (chars) of a tile. Used by callers that
     * stream their own webcam to ask the SDK for an ASCII frame that
     * matches the tile size — so a single-tile speaker view fills the chat
     * panel instead of leaving 80x24 in a much larger area.
     */
    getTileVideoDims(userId: number | string): {
        width: number;
        height: number;
    } | null;
    /**
     * Set the render-mode label for a tile's status bar. Only the sender
     * sees this (the VideoTile only shows it when isCurrentUser), so
     * calling it for a remote participant is a safe no-op label-wise.
     */
    setTileRenderMode(userId: number | string, mode: string): void;
    /**
     * Attach a right-click handler to a freshly-created tile so the door
     * host can pop its shared context menu. No-op when no callback was
     * supplied at grid construction.
     */
    private attachTileRightClick;
    /**
     * Get all participants
     */
    getParticipants(): VideoParticipant[];
}
/**
 * Create a video grid instance
 */
export declare function createVideoGrid(options: VideoGridOptions): VideoGrid;
