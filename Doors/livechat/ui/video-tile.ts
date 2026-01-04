/**
 * Video Tile Component
 *
 * Individual tile in the video grid
 * - Shows video stream or avatar
 * - Status indicators (mute, video, speaking)
 * - Active speaker highlighting
 * - Username label
 */

import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { Screen, Box } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

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
}

/**
 * Generate ASCII avatar based on username
 */
function generateAvatar(username: string): string[] {
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
function getBackgroundColor(username: string): string {
  const colors = ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan'];
  const colorIndex = username.length % colors.length;
  return colors[colorIndex];
}

/**
 * VideoTile - Individual participant tile
 */
export class VideoTile {
  private container: any; // Using any since Box type doesn't expose runtime properties
  private videoBox: any;
  private statusBar: any;
  private screen: Screen;
  private options: VideoTileOptions;
  private isActive: boolean = false;
  private hasFrame: boolean = false;
  private videoError: string | null = null;

  constructor(options: VideoTileOptions) {
    this.options = options;
    this.screen = options.screen;

    // Tile container with border
    this.container = blessed.box({
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

    // Video/avatar display area
    this.videoBox = blessed.box({
      parent: this.container,
      left: 0,
      top: 0,
      width: '100%',
      height: '100%-1',
      style: {
        bg: options.hasVideo ? 'black' : getBackgroundColor(options.username),
      },
      tags: true,
    });

    // Render avatar or video placeholder
    this.updateVideoDisplay();

    // Status bar at bottom (username and indicators)
    this.statusBar = blessed.box({
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
  private updateVideoDisplay(): void {
    if (this.options.hasVideo) {
      // Only show placeholder if we haven't received any frames yet
      if (!this.hasFrame) {
        const width = (this.container.width as number) - 4;
        const height = (this.container.height as number) - 4;
        
        // Create a centered message
        const message = this.videoError || 'WAITING FOR VIDEO...';
        const topPadding = Math.max(0, Math.floor((height - 1) / 2));
        
        const placeholder = [
          '{gray-fg}' + '┌' + '─'.repeat(width) + '┐' + '{/gray-fg}',
          ...Array(topPadding).fill('{gray-fg}│' + ' '.repeat(width) + '│{/gray-fg}'),
          '{gray-fg}│{/gray-fg}{center}{yellow-fg}{bold}' + message + '{/yellow-fg}{/bold}{/center}{gray-fg}│{/gray-fg}',
          ...Array(Math.max(0, height - topPadding - 1)).fill('{gray-fg}│' + ' '.repeat(width) + '│{/gray-fg}'),
          '{gray-fg}└' + '─'.repeat(width) + '┘' + '{/gray-fg}',
        ];
        
        this.videoBox.setContent(placeholder.join('\n'));
      }
      this.videoBox.style.bg = 'black';
    } else {
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
  private renderStatusBar(): string {
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
  updateStatus(status: {
    isMuted?: boolean;
    hasVideo?: boolean;
    isSpeaking?: boolean;
    audioLevel?: number;
  }): void {
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
  setVideoFrame(frame: string): void {
    if (this.options.hasVideo) {
      this.hasFrame = true;
      this.videoError = null; // Clear error on frame
      this.videoBox.setContent(frame);
      this.screen.render();
    }
  }

  /**
   * Set a video error message
   */
  setVideoError(message: string): void {
    this.videoError = message;
    this.hasFrame = false;
    this.updateVideoDisplay();
    this.screen.render();
  }

  /**
   * Set active speaker highlighting
   */
  setActive(active: boolean): void {
    this.isActive = active;

    if (active) {
      // Green double-line border for active speaker
      this.container.border = { type: 'line' };
      this.container.style.border = { fg: 'green' };
    } else {
      // Normal white border
      this.container.border = { type: 'line' };
      this.container.style.border = { fg: 'white' };
    }

    this.screen.render();
  }

  /**
   * Destroy the tile
   */
  destroy(): void {
    this.container.destroy();
  }

  /**
   * Get tile container
   */
  getContainer(): any {
    return this.container;
  }

  /**
   * Get user ID
   */
  getUserId(): number | string {
    return this.options.userId;
  }

  /**
   * Get username
   */
  getUsername(): string {
    return this.options.username;
  }
}
