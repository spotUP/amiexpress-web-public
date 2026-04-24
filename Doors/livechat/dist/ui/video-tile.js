"use strict";
/**
 * Video Tile Component
 *
 * Individual tile in the video grid
 * - Shows video stream or avatar
 * - Status indicators (mute, video, speaking)
 * - Active speaker highlighting
 * - Username label
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VideoTile = void 0;
const blessed_1 = __importDefault(require("@amiexpress/bbs-door-sdk/engines/ui/blessed"));
/**
 * Generate ASCII avatar based on username
 */
function generateAvatar(username) {
    const colors = ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan'];
    const colorIndex = username.length % colors.length;
    const color = colors[colorIndex];
    // Simple ASCII face
    return [
        `{${color}-fg}     ███████████  ███████████{/${color}-fg}`,
        `{${color}-fg}     ███████████  ███████████{/${color}-fg}`,
        `{${color}-fg}     ███████████  ███████████{/${color}-fg}`,
        `{${color}-fg}           ████████████{/${color}-fg}`,
        `{${color}-fg}         ████████████████{/${color}-fg}`,
        `{${color}-fg}         ████████████████{/${color}-fg}`,
        `{${color}-fg}           ▀▀▀▀▀▀▀▀▀▀▀▀{/${color}-fg}`,
    ];
}
/**
 * Get background color based on username
 */
function getBackgroundColor(username) {
    const colors = ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan'];
    const colorIndex = username.length % colors.length;
    return colors[colorIndex];
}
/**
 * VideoTile - Individual participant tile
 */
class VideoTile {
    constructor(options) {
        this.isActive = false;
        this.hasFrame = false;
        this.videoError = null;
        this.options = options;
        this.screen = options.screen;
        // Tile container with border
        this.container = blessed_1.default.box({
            parent: options.parent,
            left: options.left,
            top: options.top,
            width: options.width,
            height: options.height,
            border: {
                type: 'line',
            },
            style: {
                border: {
                    fg: 'white',
                },
            },
            tags: true,
        });
        // Video/avatar display area (no border — outer container already provides one)
        this.videoBox = blessed_1.default.box({
            parent: this.container,
            left: 0,
            top: 0,
            width: '100%-2',
            height: '100%-3',
            border: undefined,
            style: {
                bg: 'black',
            },
            tags: true,
        });
        // Render avatar or video placeholder
        this.updateVideoDisplay();
        // Status bar at bottom (username and indicators)
        this.statusBar = blessed_1.default.box({
            parent: this.container,
            left: 0,
            bottom: 0,
            width: '100%',
            height: 1,
            content: this.renderStatusBar(),
            style: {
                bg: 'black',
                fg: 'white',
            },
            tags: true,
        });
    }
    /**
     * Update video/avatar display
     */
    updateVideoDisplay() {
        if (this.options.hasVideo) {
            // Only show placeholder if we haven't received any frames yet
            if (!this.hasFrame) {
                const height = Math.max(0, this.container.height - 3);
                const message = this.videoError || 'WAITING FOR VIDEO...';
                const topPadding = Math.max(0, Math.floor((height - 1) / 2));
                const placeholder = [
                    ...Array(topPadding).fill(''),
                    `{center}{yellow-fg}{bold}${message}{/bold}{/yellow-fg}{/center}`,
                ];
                this.videoBox.setContent(placeholder.join('\n'));
            }
            this.videoBox.style.bg = 'black';
        }
        else {
            // Reset frame tracking and error when video is disabled
            this.hasFrame = false;
            this.videoError = null;
            // Show avatar with colored background
            const avatar = generateAvatar(this.options.username);
            const avatarContent = [
                '',
                ...avatar,
                '',
            ];
            this.videoBox.setContent(avatarContent.join('\n'));
            this.videoBox.style.bg = getBackgroundColor(this.options.username);
        }
    }
    /**
     * Render status bar with username and indicators
     */
    renderStatusBar() {
        const username = this.options.username;
        const speakingIcon = this.options.isSpeaking ? '{green-fg}[*]{/green-fg}' : '[ ]';
        const muteIcon = this.options.isMuted ? '{red-fg}[M]{/red-fg}' : '';
        const videoIcon = this.options.hasVideo ? '{blue-fg}[V]{/blue-fg}' : '';
        const youLabel = this.options.isCurrentUser ? ' {yellow-fg}(you){/yellow-fg}' : '';
        return ` ${speakingIcon} ${username}${youLabel} ${muteIcon} ${videoIcon}`.trim();
    }
    /**
     * Update status indicators
     */
    updateStatus(status) {
        if (status.isMuted !== undefined) {
            this.options.isMuted = status.isMuted;
        }
        if (status.hasVideo !== undefined) {
            const hadVideo = this.options.hasVideo;
            this.options.hasVideo = status.hasVideo;
            // Update video display if video state changed
            if (hadVideo !== status.hasVideo) {
                this.updateVideoDisplay();
            }
        }
        if (status.isSpeaking !== undefined) {
            this.options.isSpeaking = status.isSpeaking;
        }
        if (status.audioLevel !== undefined) {
            this.options.audioLevel = status.audioLevel;
        }
        this.statusBar.setContent(this.renderStatusBar());
        this.screen.render();
    }
    /**
     * Set a new video frame (ASCII)
     */
    setVideoFrame(frame) {
        if (this.options.hasVideo) {
            this.hasFrame = true;
            this.videoError = null; // Clear error on frame
            this.videoBox.setFrame(frame);
            this.screen.render();
        }
    }
    /**
     * Set a video error message
     */
    setVideoError(message) {
        this.videoError = message;
        this.hasFrame = false;
        this.updateVideoDisplay();
        this.screen.render();
    }
    /**
     * Set active speaker highlighting
     */
    setActive(active) {
        this.isActive = active;
        if (active) {
            // Green double-line border for active speaker
            this.container.border = { type: 'line' };
            this.container.style.border = { fg: 'green' };
        }
        else {
            // Normal white border
            this.container.border = { type: 'line' };
            this.container.style.border = { fg: 'white' };
        }
        this.screen.render();
    }
    /**
     * Destroy the tile
     */
    destroy() {
        this.container.destroy();
    }
    /**
     * Get tile container
     */
    getContainer() {
        return this.container;
    }
    /**
     * Get user ID
     */
    getUserId() {
        return this.options.userId;
    }
    /**
     * Get username
     */
    getUsername() {
        return this.options.username;
    }
}
exports.VideoTile = VideoTile;
