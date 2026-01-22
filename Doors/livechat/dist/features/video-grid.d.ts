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
}
/**
 * VideoGrid - Displays all participants in an adaptive grid layout
 */
export declare class VideoGrid {
    private container;
    private screen;
    private tiles;
    private participants;
    private currentUserId;
    private currentUsername;
    private activeSpeaker?;
    private lastWidth;
    private lastHeight;
    private viewMode;
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
     * Get all participants
     */
    getParticipants(): VideoParticipant[];
}
/**
 * Create a video grid instance
 */
export declare function createVideoGrid(options: VideoGridOptions): VideoGrid;
