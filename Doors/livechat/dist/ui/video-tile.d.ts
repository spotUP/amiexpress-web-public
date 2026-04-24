/**
 * Video Tile Component
 *
 * Individual tile in the video grid
 * - Shows video stream or avatar
 * - Status indicators (mute, video, speaking)
 * - Active speaker highlighting
 * - Username label
 */
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
export interface VideoTileOptions {
    parent: any;
    screen: Screen;
    left: number;
    top: number;
    width: number;
    height: number;
    userId: number | string;
    username: string;
    isMuted: boolean;
    hasVideo: boolean;
    isSpeaking: boolean;
    audioLevel: number;
    isCurrentUser: boolean;
    avatar?: string;
    renderMode?: string;
}
/**
 * VideoTile - Individual participant tile
 */
export declare class VideoTile {
    private container;
    private videoBox;
    private statusBar;
    private screen;
    private options;
    private isActive;
    private hasFrame;
    private videoError;
    constructor(options: VideoTileOptions);
    /**
     * Update video/avatar display
     */
    private updateVideoDisplay;
    /**
     * Render status bar with username and indicators
     */
    private renderStatusBar;
    /**
     * Update status indicators
     */
    updateStatus(status: {
        isMuted?: boolean;
        hasVideo?: boolean;
        isSpeaking?: boolean;
        audioLevel?: number;
        renderMode?: string;
    }): void;
    /**
     * Set a new video frame (ASCII)
     */
    setVideoFrame(frame: string): void;
    /**
     * Set a video error message
     */
    setVideoError(message: string): void;
    /**
     * Set active speaker highlighting. Tile container is borderless now (to
     * avoid nested-window visual clutter), so indicate active speaker via
     * the status bar background instead.
     */
    setActive(active: boolean): void;
    /**
     * Destroy the tile
     */
    destroy(): void;
    /**
     * Get tile container
     */
    getContainer(): any;
    /**
     * Get the actual character dimensions of the inner video area (excluding
     * the 1-row status bar). Used to ask the SDK to render ASCII frames at
     * the tile's real size so the picture fills the available space instead
     * of leaving a 80x24 patch in a much larger panel.
     */
    getVideoDims(): {
        width: number;
        height: number;
    };
    /**
     * Get user ID
     */
    getUserId(): number | string;
    /**
     * Get username
     */
    getUsername(): string;
}
