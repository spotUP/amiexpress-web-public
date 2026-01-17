"use strict";
/**
 * Video Grid Component
 *
 * Discord-style video grid that displays all participants
 * - Adaptive layout: 2x2, 3x3, 4x4 based on participant count
 * - Shows video streams when available, avatars when not
 * - Active speaker highlighting
 * - Status indicators (mute, video, speaking)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VideoGrid = void 0;
exports.createVideoGrid = createVideoGrid;
const blessed_1 = __importDefault(require("@amiexpress/bbs-door-sdk/engines/ui/blessed"));
const video_tile_1 = require("../ui/video-tile");
/**
 * Calculate optimal grid dimensions based on participant count
 */
function calculateGridDimensions(participantCount) {
    if (participantCount <= 1)
        return { cols: 1, rows: 1 };
    if (participantCount <= 2)
        return { cols: 2, rows: 1 };
    if (participantCount <= 4)
        return { cols: 2, rows: 2 };
    if (participantCount <= 6)
        return { cols: 3, rows: 2 };
    if (participantCount <= 9)
        return { cols: 3, rows: 3 };
    if (participantCount <= 12)
        return { cols: 4, rows: 3 };
    if (participantCount <= 16)
        return { cols: 4, rows: 4 };
    if (participantCount <= 20)
        return { cols: 5, rows: 4 };
    return { cols: 5, rows: 5 }; // Max 25 participants
}
/**
 * VideoGrid - Displays all participants in an adaptive grid layout
 */
class VideoGrid {
    constructor(options) {
        this.tiles = new Map();
        this.participants = new Map();
        this.lastWidth = 0;
        this.lastHeight = 0;
        this.screen = options.screen;
        this.currentUserId = options.currentUserId;
        this.currentUsername = options.currentUsername;
        // Main container for video grid
        this.container = blessed_1.default.box({
            parent: options.parent,
            left: options.left ?? 0,
            top: options.top ?? 0,
            width: options.width ?? '100%',
            height: options.height ?? '100%',
            style: {
                bg: 'transparent',
            },
            tags: true,
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
    addParticipant(participant) {
        this.participants.set(String(participant.userId), participant);
        this.updateGrid();
    }
    /**
     * Remove a participant from the grid
     */
    removeParticipant(userId) {
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
    updateParticipant(userId, updates) {
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
    updateParticipantVideo(userId, frame) {
        const id = String(userId);
        const tile = this.tiles.get(id);
        if (tile) {
            tile.setVideoFrame(frame);
        }
    }
    /**
     * Update participant with an error message
     */
    updateParticipantError(userId, error) {
        const id = String(userId);
        const tile = this.tiles.get(id);
        if (tile) {
            tile.setVideoError(error);
        }
    }
    /**
     * Set active speaker (highlighted border)
     */
    setActiveSpeaker(userId) {
        // Remove previous active speaker highlight
        if (this.activeSpeaker !== undefined) {
            const prevTile = this.tiles.get(String(this.activeSpeaker));
            if (prevTile) {
                prevTile.setActive(false);
            }
        }
        // Set new active speaker
        this.activeSpeaker = userId;
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
    updateGrid() {
        const participantArray = Array.from(this.participants.values());
        const participantCount = participantArray.length;
        // Get current container dimensions
        const containerWidth = this.container.width;
        const containerHeight = this.container.height;
        if (participantCount === 0) {
            // Clear all tiles
            for (const tile of this.tiles.values()) {
                tile.destroy();
            }
            this.tiles.clear();
            this.screen.render();
            return;
        }
        // Calculate optimal grid (cols x rows) to fill the space
        // We want to maximize the area of each tile (tileWidth * tileHeight)
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
        // Clear existing tiles
        for (const tile of this.tiles.values()) {
            tile.destroy();
        }
        this.tiles.clear();
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
            const tileOptions = {
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
            const tile = new video_tile_1.VideoTile(tileOptions);
            this.tiles.set(participant.userId, tile);
        });
        this.screen.render();
    }
    /**
     * Show the video grid
     */
    show() {
        this.container.show();
        this.screen.render();
    }
    /**
     * Hide the video grid
     */
    hide() {
        this.container.hide();
        this.screen.render();
    }
    /**
     * Bring grid to front
     */
    setFront() {
        this.container.setFront();
        this.screen.render();
    }
    /**
     * Check if video grid is visible
     */
    isVisible() {
        return this.container.visible;
    }
    /**
     * Destroy the video grid and clean up
     */
    destroy() {
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
    getParticipantCount() {
        return this.participants.size;
    }
    /**
     * Get all participants
     */
    getParticipants() {
        return Array.from(this.participants.values());
    }
}
exports.VideoGrid = VideoGrid;
/**
 * Create a video grid instance
 */
function createVideoGrid(options) {
    return new VideoGrid(options);
}
