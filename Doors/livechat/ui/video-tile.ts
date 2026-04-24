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
 * Generate the no-video avatar: a large block-letter initial of the user's
 * handle, in a per-user foreground colour so tiles are visually distinct.
 * Replaced the face-glyph (two block columns + chin) which 2026-04-24
 * feedback flagged as looking like Mickey Mouse ears.
 */
function generateAvatar(username: string): string[] {
  const colors = ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan'];
  const color = colors[username.length % colors.length];
  const initial = (username?.[0] || '?').toUpperCase();
  return blockLetter(initial).map(row => `{${color}-fg}${row}{/${color}-fg}`);
}

/**
 * 8x8 block-letter glyphs for A-Z and '?'. Rendered with █ for ink,
 * space for background. Terminal rows are roughly half as tall as wide,
 * so the glyph looks proportional in a typical font.
 */
function blockLetter(ch: string): string[] {
  const G: Record<string, string[]> = {
    A: [
      '   ████   ',
      '  ██  ██  ',
      ' ██    ██ ',
      ' ████████ ',
      ' ██    ██ ',
      ' ██    ██ ',
    ],
    B: [
      ' ███████  ',
      ' ██    ██ ',
      ' ███████  ',
      ' ██    ██ ',
      ' ██    ██ ',
      ' ███████  ',
    ],
    C: [
      '  ███████ ',
      ' ██       ',
      ' ██       ',
      ' ██       ',
      ' ██       ',
      '  ███████ ',
    ],
    D: [
      ' ██████   ',
      ' ██   ██  ',
      ' ██    ██ ',
      ' ██    ██ ',
      ' ██   ██  ',
      ' ██████   ',
    ],
    E: [
      ' ████████ ',
      ' ██       ',
      ' ██████   ',
      ' ██       ',
      ' ██       ',
      ' ████████ ',
    ],
    F: [
      ' ████████ ',
      ' ██       ',
      ' ██████   ',
      ' ██       ',
      ' ██       ',
      ' ██       ',
    ],
    G: [
      '  ███████ ',
      ' ██       ',
      ' ██  ████ ',
      ' ██    ██ ',
      ' ██    ██ ',
      '  ██████  ',
    ],
    H: [
      ' ██    ██ ',
      ' ██    ██ ',
      ' ████████ ',
      ' ██    ██ ',
      ' ██    ██ ',
      ' ██    ██ ',
    ],
    I: [
      ' ████████ ',
      '    ██    ',
      '    ██    ',
      '    ██    ',
      '    ██    ',
      ' ████████ ',
    ],
    J: [
      ' ████████ ',
      '      ██  ',
      '      ██  ',
      '      ██  ',
      ' ██   ██  ',
      '  █████   ',
    ],
    K: [
      ' ██    ██ ',
      ' ██   ██  ',
      ' █████    ',
      ' ██   ██  ',
      ' ██    ██ ',
      ' ██    ██ ',
    ],
    L: [
      ' ██       ',
      ' ██       ',
      ' ██       ',
      ' ██       ',
      ' ██       ',
      ' ████████ ',
    ],
    M: [
      ' ██    ██ ',
      ' ███  ███ ',
      ' ██ ██ ██ ',
      ' ██    ██ ',
      ' ██    ██ ',
      ' ██    ██ ',
    ],
    N: [
      ' ██    ██ ',
      ' ███   ██ ',
      ' ████  ██ ',
      ' ██ ██ ██ ',
      ' ██  ████ ',
      ' ██   ███ ',
    ],
    O: [
      '  ██████  ',
      ' ██    ██ ',
      ' ██    ██ ',
      ' ██    ██ ',
      ' ██    ██ ',
      '  ██████  ',
    ],
    P: [
      ' ███████  ',
      ' ██    ██ ',
      ' ███████  ',
      ' ██       ',
      ' ██       ',
      ' ██       ',
    ],
    Q: [
      '  ██████  ',
      ' ██    ██ ',
      ' ██    ██ ',
      ' ██ ██ ██ ',
      ' ██  ████ ',
      '  ███████ ',
    ],
    R: [
      ' ███████  ',
      ' ██    ██ ',
      ' ███████  ',
      ' ██  ██   ',
      ' ██   ██  ',
      ' ██    ██ ',
    ],
    S: [
      '  ███████ ',
      ' ██       ',
      '  ██████  ',
      '       ██ ',
      '       ██ ',
      ' ███████  ',
    ],
    T: [
      ' ████████ ',
      '    ██    ',
      '    ██    ',
      '    ██    ',
      '    ██    ',
      '    ██    ',
    ],
    U: [
      ' ██    ██ ',
      ' ██    ██ ',
      ' ██    ██ ',
      ' ██    ██ ',
      ' ██    ██ ',
      '  ██████  ',
    ],
    V: [
      ' ██    ██ ',
      ' ██    ██ ',
      ' ██    ██ ',
      '  ██  ██  ',
      '   ████   ',
      '    ██    ',
    ],
    W: [
      ' ██    ██ ',
      ' ██    ██ ',
      ' ██    ██ ',
      ' ██ ██ ██ ',
      ' ███  ███ ',
      ' ██    ██ ',
    ],
    X: [
      ' ██    ██ ',
      '  ██  ██  ',
      '   ████   ',
      '   ████   ',
      '  ██  ██  ',
      ' ██    ██ ',
    ],
    Y: [
      ' ██    ██ ',
      '  ██  ██  ',
      '   ████   ',
      '    ██    ',
      '    ██    ',
      '    ██    ',
    ],
    Z: [
      ' ████████ ',
      '      ██  ',
      '    ██    ',
      '  ██      ',
      ' ██       ',
      ' ████████ ',
    ],
    '?': [
      '  ██████  ',
      '      ██  ',
      '    ███   ',
      '   ██     ',
      '          ',
      '   ██     ',
    ],
  };
  return G[ch] || G['?'];
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

    // Tile container — no inner border; the parent chat panel already
    // has its own. Adding another one just makes the video area look like
    // nested windows (reported 2026-04-24).
    this.container = blessed.box({
      parent: options.parent,
      left: options.left,
      top: options.top,
      width: options.width,
      height: options.height,
      border: undefined,
      style: { bg: 'black' },
      tags: true,
    });

    // Video/avatar display area — fills the container, leaving one row
    // at the bottom for the status bar (container is now borderless).
    this.videoBox = blessed.box({
      parent: this.container,
      left: 0,
      top: 0,
      width: '100%',
      height: '100%-1',
      border: undefined,
      style: {
        bg: 'black',
      },
      tags: true,
    }) as any;

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
        // Container is borderless now; videoBox is height-1 inside it
        // (status bar takes the last row).
        const height = Math.max(0, (this.container.height as number) - 1);
        const message = this.videoError || 'WAITING FOR VIDEO...';
        const topPadding = Math.max(0, Math.floor((height - 1) / 2));
        const placeholder = [
          ...Array(topPadding).fill(''),
          `{center}{yellow-fg}{bold}${message}{/bold}{/yellow-fg}{/center}`,
        ];
        this.videoBox.setContent(placeholder.join('\n'));
      }
      this.videoBox.style.bg = 'black';
    } else {
      // Reset frame tracking and error when video is disabled
      this.hasFrame = false;
      this.videoError = null;
      // Show avatar on black — avatar fg is per-user (see generateAvatar)
      // so users are visually distinct without a loud background tint.
      const avatar = generateAvatar(this.options.username);
      const avatarContent = [
        '',
        ...avatar,
        '',
      ];
      this.videoBox.setContent(avatarContent.join('\n'));
      this.videoBox.style.bg = 'black';
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
    // Match the working neoshowcase webcam-demo pattern: if a frame
    // arrives for this tile, paint it. The old `if (hasVideo)` gate was
    // racing with the hasVideo flip in updateStatus — frames landed
    // between startStream() returning and updateParticipant(hasVideo:true)
    // firing, and got silently dropped while the tile still showed the
    // no-video avatar.
    this.hasFrame = true;
    this.videoError = null;
    this.videoBox.setContent(frame);
    // Also flip our copy of hasVideo so updateVideoDisplay won't rewrite
    // the avatar back over the frame on the next state tick.
    this.options.hasVideo = true;
    this.screen.render();
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
   * Set active speaker highlighting. Tile container is borderless now (to
   * avoid nested-window visual clutter), so indicate active speaker via
   * the status bar background instead.
   */
  setActive(active: boolean): void {
    this.isActive = active;
    if (this.statusBar) {
      this.statusBar.style.bg = active ? 'green' : 'black';
      this.statusBar.style.fg = active ? 'black' : 'white';
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
   * Get the actual character dimensions of the inner video area (excluding
   * the 1-row status bar). Used to ask the SDK to render ASCII frames at
   * the tile's real size so the picture fills the available space instead
   * of leaving a 80x24 patch in a much larger panel.
   */
  getVideoDims(): { width: number; height: number } {
    const w = (this.videoBox.width as number) || 0;
    const h = (this.videoBox.height as number) || 0;
    return { width: w, height: h };
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
