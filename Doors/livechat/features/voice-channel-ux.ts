/**
 * Discord-Style Voice Channel UX
 *
 * Improved UX matching Discord's patterns:
 * - Voice channels shown in channel list
 * - Click to join (no separate button)
 * - Persistent voice connection
 * - Bottom control bar when in voice
 * - Video grid overlay
 * - Speaking indicators
 */

import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { NetworkQualityMonitor, AdaptiveQualityManager } from '@amiexpress/bbs-door-sdk';
import type { DoorContext } from '@amiexpress/bbs-door-sdk';
import { VideoGrid, type VideoParticipant } from './video-grid';

export interface VoiceChannelItem {
  id: string;
  name: string;
  participants: Array<{
    userId: number | string;
    username: string;
    isSpeaking: boolean;
  }>;
}

export interface VoiceControlBarOptions {
  parent: any;
  screen: any;
  socket: any;
  ctx?: DoorContext;
  username: string;
  onDisconnect?: () => void;
  onVideoToggle?: () => void;
  onGridToggle?: () => void;  // Toggle between speaker/grid view
}

/**
 * Bottom Control Bar (Discord-style)
 * Shows when user is in voice channel
 */
export class VoiceControlBar {
  private screen: any;
  private socket: any;
  private ctx?: DoorContext;
  private container: any;
  private statusBox: any;
  private muteButton: any;
  private videoButton: any;
  private gridToggleButton: any;
  private disconnectButton: any;
  private username: string;
  private isMuted = false;
  private hasVideo = false;
  private isSpeaking = false;
  private onDisconnectCallback?: () => void;
  private onVideoToggleCallback?: () => void;
  private onGridToggleCallback?: () => void;

  constructor(options: VoiceControlBarOptions) {
    this.screen = options.screen;
    this.socket = options.socket;
    this.ctx = options.ctx;
    this.username = options.username;
    this.onDisconnectCallback = options.onDisconnect;
    this.onVideoToggleCallback = options.onVideoToggle;
    this.onGridToggleCallback = options.onGridToggle;

    this.createUI(options.parent);
    this.setupSocketHandlers();
  }

  private createUI(parent: any) {
    // Detect if we are inside a DockablePanel (like the sidebar)
    const isInsidePanel = parent && (parent.constructor.name === 'DockablePanel' || parent.options?.title);
    
    // Bottom control bar container (Discord-style: bottom left corner)
    this.container = blessed.box({
      parent,
      bottom: isInsidePanel ? 0 : 4,
      left: 0,
      width: isInsidePanel ? '100%' : 42,
      height: 3,
      tags: true,
      style: {
        fg: 'white',
        bg: 'black',
        border: {
          fg: 'green',
        },
      },
      border: {
        type: 'line',
      },
      label: ' Voice ',
      hidden: true,
    });

    // Set moderate z-index - above chat content (10) but below command suggestions (10000)
    (this.container as any).zIndex = 100;

    // User status with speaking indicator
    this.statusBox = blessed.box({
      parent: this.container,
      top: 0,
      left: 1,
      width: isInsidePanel ? '35%' : 14,
      height: 1,
      tags: true,
      content: `{gray-fg}[ ]{/gray-fg} ${this.username.substring(0, 8)}`,
      style: {
        fg: 'white',
        bg: 'black',
      },
    });

    // Mute button [M] - shows mic status
    this.muteButton = blessed.box({
      parent: this.container,
      top: 0,
      left: isInsidePanel ? '40%' : 15,
      width: 5,
      height: 1,
      tags: true,
      content: '{green-fg}[M]{/green-fg}',
      mouse: true,
      clickable: true,
      style: {
        fg: 'green',
        bg: 'black',
        hover: {
          fg: 'white',
          bg: 'green',
        },
      },
    }) as any;

    this.muteButton.on('click', () => {
      this.toggleMute();
    });

    // Video button [V] - shows camera status
    this.videoButton = blessed.box({
      parent: this.container,
      top: 0,
      left: isInsidePanel ? '55%' : 21,
      width: 5,
      height: 1,
      tags: true,
      content: '{gray-fg}[V]{/gray-fg}',
      mouse: true,
      clickable: true,
      style: {
        fg: 'gray',
        bg: 'black',
        hover: {
          fg: 'white',
          bg: 'cyan',
        },
      },
    }) as any;

    this.videoButton.on('click', () => {
      this.toggleVideo();
    });

    // Grid toggle button [G] - toggle between speaker/grid view
    this.gridToggleButton = blessed.box({
      parent: this.container,
      top: 0,
      left: isInsidePanel ? '65%' : 27,
      width: 5,
      height: 1,
      tags: true,
      content: '{yellow-fg}[S]{/yellow-fg}',  // S = Speaker mode (default)
      mouse: true,
      clickable: true,
      style: {
        fg: 'yellow',
        bg: 'black',
        hover: {
          fg: 'white',
          bg: 'yellow',
        },
      },
    }) as any;

    this.gridToggleButton.on('click', () => {
      this.toggleGrid();
    });

    // Disconnect button [X] Leave
    this.disconnectButton = blessed.box({
      parent: this.container,
      top: 0,
      right: 1,
      width: isInsidePanel ? '25%' : 12,
      height: 1,
      tags: true,
      content: '{red-fg}[X] Leave{/red-fg}',
      mouse: true,
      clickable: true,
      style: {
        fg: 'red',
        bg: 'black',
        hover: {
          fg: 'white',
          bg: 'red',
        },
      },
    }) as any;

    this.disconnectButton.on('click', () => {
      this.disconnect();
    });
  }

  private setupSocketHandlers() {
    // Update speaking status from audio stream
    this.socket.on('audio-speaking-status', (data: any) => {
      if (data.userId === this.ctx?.user?.id) {
        this.isSpeaking = data.isSpeaking;
        this.updateSpeakingIndicator();
      }
    });
  }

  private toggleMute() {
    if (!this.ctx?.audio) {
      // Toggle local state even without audio API
      this.isMuted = !this.isMuted;
    } else {
      this.isMuted = !this.isMuted;
      this.ctx.audio.setMuted(this.isMuted);
    }

    // Update button with colored tags
    if (this.isMuted) {
      this.muteButton.setContent('{red-fg}[M]{/red-fg}');
    } else {
      this.muteButton.setContent('{green-fg}[M]{/green-fg}');
    }

    // Notify server
    this.socket.emit('voice:mute', { isMuted: this.isMuted });

    this.screen.render();
  }

  private toggleVideo() {
    this.hasVideo = !this.hasVideo;

    // Update button with colored tags
    if (this.hasVideo) {
      this.videoButton.setContent('{green-fg}[V]{/green-fg}');
    } else {
      this.videoButton.setContent('{gray-fg}[V]{/gray-fg}');
    }

    // Call callback to update video grid
    if (this.onVideoToggleCallback) {
      this.onVideoToggleCallback();
    } else {
      // Fallback: notify server directly if no callback
      this.socket.emit('voice:video-toggle', { hasVideo: this.hasVideo });
    }

    this.screen.render();
  }

  private toggleGrid() {
    // Call callback to toggle video grid view mode
    if (this.onGridToggleCallback) {
      this.onGridToggleCallback();
    }
  }

  public updateGridButtonLabel(viewMode: 'speaker' | 'grid') {
    // Update button to show current mode
    if (viewMode === 'speaker') {
      this.gridToggleButton.setContent('{yellow-fg}[S]{/yellow-fg}');  // S = Speaker mode
    } else {
      this.gridToggleButton.setContent('{cyan-fg}[G]{/cyan-fg}');  // G = Grid mode
    }
    this.screen.render();
  }

  private disconnect() {
    if (this.onDisconnectCallback) {
      this.onDisconnectCallback();
    }
    this.hide();
  }

  private updateSpeakingIndicator() {
    if (!this.statusBox) return;

    // Discord-style: green ring when speaking
    if (this.isSpeaking) {
      this.statusBox.setContent(`{green-fg}[*]{/green-fg} ${this.username.substring(0, 8)}`);
    } else {
      this.statusBox.setContent(`{gray-fg}[ ]{/gray-fg} ${this.username.substring(0, 8)}`);
    }

    this.screen.render();
  }

  public show() {
    this.container.show();
    this.container.setFront();  // Bring to front of other elements in parent
    if (this.screen) this.screen.render();
  }

  public hide() {
    this.container.hide();
    this.screen.render();
  }

  public destroy() {
    this.container.destroy();
  }
}

/**
 * Enhanced Voice Channel Integration
 * Discord UX: Voice channels appear in channel list with participants
 */
export interface EnhancedVoiceChannelOptions {
  parent?: any; // Parent for voice control bar
  channelList: any;
  screen: any;
  socket: any;
  ctx?: DoorContext;
  userId: number | string;
  username: string;
  chatPanel?: any; // Optional chat panel to use as parent for video grid
  onJoinVoice?: (channelId: string) => void;
  onLeaveVoice?: () => void;
  showConfirmDialog?: (title: string, message: string) => Promise<boolean>;  // Confirmation dialog
}

export class EnhancedVoiceChannel {
  private parent?: any;
  private channelList: any;
  private screen: any;
  private socket: any;
  private ctx?: DoorContext;
  private userId: number | string;
  private username: string;
  private chatPanel?: any;
  private controlBar?: VoiceControlBar;
  private videoGrid?: VideoGrid;
  private currentVoiceChannel?: string;
  private voiceChannels = new Map<string, VoiceChannelItem>();
  private networkMonitor?: NetworkQualityMonitor;
  private qualityManager?: AdaptiveQualityManager;
  private onJoinVoiceCallback?: (channelId: string) => void;
  private onLeaveVoiceCallback?: () => void;
  private showConfirmDialog?: (title: string, message: string) => Promise<boolean>;
  private videoEnabled = false;

  constructor(options: EnhancedVoiceChannelOptions) {
    this.parent = options.parent;
    this.channelList = options.channelList;
    this.screen = options.screen;
    this.socket = options.socket;
    this.ctx = options.ctx;
    this.userId = options.userId;
    this.username = options.username;
    this.chatPanel = options.chatPanel;
    this.onJoinVoiceCallback = options.onJoinVoice;
    this.onLeaveVoiceCallback = options.onLeaveVoice;
    this.showConfirmDialog = options.showConfirmDialog;

    this.setupSocketHandlers();
    this.setupAdaptiveQuality();
  }

  private setupSocketHandlers() {
    // Voice channel events
    this.socket.on('voice:channels', (channels: VoiceChannelItem[]) => {
      this.voiceChannels.clear();
      for (const channel of channels) {
        this.voiceChannels.set(channel.id, channel);
      }
      this.updateChannelList();
    });

    this.socket.on('voice:joined', (data: any) => {
      const channel = this.voiceChannels.get(data.channelId);
      if (channel) {
        channel.participants.push({
          userId: String(data.userId),
          username: data.username,
          isSpeaking: false,
        });
        this.updateChannelList();
      }

      // Add to video grid
      if (this.videoGrid && String(data.userId) !== String(this.userId)) {
        this.videoGrid.addParticipant({
          userId: String(data.userId),
          username: data.username,
          socketId: '',
          isMuted: data.isMuted || false,
          hasVideo: data.hasVideo || false,
          hasScreenShare: data.hasScreenShare || false,
          isSpeaking: false,
          audioLevel: 0,
        });
      }
    });

    this.socket.on('voice:left', (data: any) => {
      const channel = this.voiceChannels.get(data.channelId);
      if (channel) {
        channel.participants = channel.participants.filter(p => String(p.userId) !== String(data.userId));
        this.updateChannelList();
      }

      // Remove from video grid
      if (this.videoGrid) {
        this.videoGrid.removeParticipant(String(data.userId));
      }
    });

    this.socket.on('audio-speaking-status', (data: any) => {
      for (const channel of this.voiceChannels.values()) {
        const participant = channel.participants.find(p => String(p.userId) === String(data.userId));
        if (participant) {
          participant.isSpeaking = data.isSpeaking;
          this.updateChannelList();
          break;
        }
      }

      // Update video grid
      if (this.videoGrid) {
        this.videoGrid.updateParticipant(String(data.userId), {
          isSpeaking: data.isSpeaking,
          audioLevel: data.audioLevel || 0,
        });

        // Set active speaker highlight (for others)
        const targetId = String(data.userId);
        if (data.isSpeaking && targetId !== String(this.userId)) {
          this.videoGrid.setActiveSpeaker(targetId);
        } else if (!data.isSpeaking && targetId !== String(this.userId)) {
          // If they stopped speaking, remove highlight
          this.videoGrid.setActiveSpeaker(undefined);
        }
      }
    });

    // Video toggle events
    this.socket.on('voice:video-toggle', (data: any) => {
      if (this.videoGrid) {
        this.videoGrid.updateParticipant(String(data.userId), {
          hasVideo: data.hasVideo,
        });

        // Show video grid if anyone has video enabled
        this.updateVideoGridVisibility();
      }
    });

    // Handle incoming video frames
    this.socket.on('video:frame', (data: { userId: string | number, frame: string }) => {
      if (this.videoGrid) {
        this.videoGrid.updateParticipantVideo(String(data.userId), data.frame);
      }
    });

    // Mute events
    this.socket.on('voice:mute', (data: any) => {
      if (this.videoGrid) {
        this.videoGrid.updateParticipant(data.userId, {
          isMuted: data.isMuted,
        });
      }
    });
  }

  private setupAdaptiveQuality() {
    if (!this.ctx?.audio || !this.socket) return;

    this.networkMonitor = new NetworkQualityMonitor(this.socket);
    this.qualityManager = new AdaptiveQualityManager(this.networkMonitor);

    this.networkMonitor.start();
  }

  private updateChannelList() {
    // Update channel list to show voice channels with participants
    // This would integrate with the existing channel list component
    // Format: "🔊 Voice Channel (2)" with participant count
    this.screen.render();
  }

  private updateVideoGridVisibility() {
    if (!this.videoGrid) return;

    // Show video grid ONLY if someone has video enabled (not just for being in voice)
    const inVoice = this.isInVoiceChannel();
    const hasAnyVideo = this.videoGrid.getParticipants().some(p => p.hasVideo);

    if (inVoice && hasAnyVideo && !this.videoGrid.isVisible()) {
      this.videoGrid.show();
      // Don't call setFront() - rely on zIndex so command suggestions stay on top
    } else if ((!inVoice || !hasAnyVideo) && this.videoGrid.isVisible()) {
      this.videoGrid.hide();
    }
  }

  public async toggleVideo() {
    this.videoEnabled = !this.videoEnabled;

    // Check if video API is available (only for web clients, not terminal)
    if (!this.ctx?.video) {
      console.log('[Voice] Video API not available - web client required for video');
      this.videoEnabled = false; // Disable it since it won't work
      return;
    }

    // Notify server
    this.socket.emit('voice:video-toggle', { hasVideo: this.videoEnabled });

    // Handle video streaming
    if (this.videoEnabled) {
      try {
        const videoOptions = this.qualityManager?.getVideoProfile();
        await this.ctx.video.startStream(
          { type: 'webcam' },
          {
            width: videoOptions?.asciiWidth || 80,
            height: videoOptions?.asciiHeight || 24,
            fps: videoOptions?.fps || 10,
            colored: videoOptions?.colored ?? true,
          }
        );

        // Route local frames to the video grid for preview
        this.ctx.video.onFrame((frame: string) => {
          if (this.videoEnabled && this.videoGrid) {
            this.videoGrid.updateParticipantVideo(this.userId, frame);
          }
        });
      } catch (error: any) {
        console.log('[Voice] Video stream failed:', error.message);
        this.videoEnabled = true; // Keep it enabled so we can show the error in the tile

        if (this.videoGrid) {
          const errorMsg = error.message?.includes('denied') ? 'CAMERA BLOCKED' : 'STREAM ERROR';
          this.videoGrid.updateParticipantError(this.userId, errorMsg);
        }

        this.socket.emit('voice:video-toggle', { hasVideo: true });
      }
    } else {
      try {
        const myStreamId = `video-${this.socket.id}`;
        await this.ctx.video.stopStream(myStreamId);
        // Remove listener
        this.ctx.video.onFrame(() => {});
      } catch (error: any) {
        console.log('[Voice] Stop video failed:', error.message);
      }
    }

    // Update own participant in video grid
    if (this.videoGrid) {
      this.videoGrid.updateParticipant(this.userId, {
        hasVideo: this.videoEnabled,
      });
      this.updateVideoGridVisibility();
    }
  }

  /**
   * Show voice permissions dialog and return user's choices
   */
  private async showVoicePermissionsDialog(): Promise<{ enableMic: boolean; enableCamera: boolean } | null> {
    return new Promise((resolve) => {
      // Create modal overlay
      const overlay = blessed.box({
        parent: this.screen,
        top: 'center',
        left: 'center',
        width: 52,
        height: 12,
        border: { type: 'line' },
        style: {
          fg: 'white',
          bg: 'black',
          border: { fg: 'cyan' },
        },
        tags: true,
        label: ' {cyan-fg}Join Voice Channel{/cyan-fg} ',
        ch: ' ',  // Fill background
        // @ts-ignore - zIndex exists but not in types
        zIndex: 99999,
      });

      overlay.setFront();
      this.screen.realloc();

      // Header text
      blessed.text({
        parent: overlay,
        top: 1,
        left: 2,
        width: 48,
        content: 'Enable audio and video for this call?',
        tags: true,
        style: { fg: 'white' },
      });

      // Instructions
      blessed.text({
        parent: overlay,
        top: 2,
        left: 2,
        width: 48,
        content: '{gray-fg}(M/V=toggle, J=join, C=cancel){/gray-fg}',
        tags: true,
      });

      let micEnabled = true;
      let cameraEnabled = true;

      // Microphone checkbox
      const micCheckbox = blessed.text({
        parent: overlay,
        top: 4,
        left: 3,
        width: 46,
        content: '{green-fg}[X]{/green-fg} Enable Microphone (M)',
        tags: true,
        mouse: true,
        clickable: true,
        style: { fg: 'white', hover: { bg: 'blue' } },
      }) as any;

      micCheckbox.on('click', () => {
        micEnabled = !micEnabled;
        micCheckbox.setContent(
          micEnabled
            ? '{green-fg}[X]{/green-fg} Enable Microphone (M)'
            : '{gray-fg}[ ]{/gray-fg} Enable Microphone (M)'
        );
        this.screen.render();
      });

      // Camera checkbox
      const cameraCheckbox = blessed.text({
        parent: overlay,
        top: 5,
        left: 3,
        width: 46,
        content: '{green-fg}[X]{/green-fg} Enable Camera (V)',
        tags: true,
        mouse: true,
        clickable: true,
        style: { fg: 'white', hover: { bg: 'blue' } },
      }) as any;

      cameraCheckbox.on('click', () => {
        cameraEnabled = !cameraEnabled;
        cameraCheckbox.setContent(
          cameraEnabled
            ? '{green-fg}[X]{/green-fg} Enable Camera (V)'
            : '{gray-fg}[ ]{/gray-fg} Enable Camera (V)'
        );
        this.screen.render();
      });

      // Buttons
      const joinButton = blessed.text({
        parent: overlay,
        bottom: 2,
        left: 3,
        width: 20,
        content: '{center}{green-fg}[J] Join{/green-fg}{/center}',
        tags: true,
        mouse: true,
        clickable: true,
        style: { fg: 'white', hover: { bg: 'green' } },
      }) as any;

      joinButton.on('click', () => {
        overlay.destroy();
        this.screen.render();
        resolve({ enableMic: micEnabled, enableCamera: cameraEnabled });
      });

      const cancelButton = blessed.text({
        parent: overlay,
        bottom: 2,
        right: 3,
        width: 20,
        content: '{center}{red-fg}[C] Cancel{/red-fg}{/center}',
        tags: true,
        mouse: true,
        clickable: true,
        style: { fg: 'white', hover: { bg: 'red' } },
      }) as any;

      cancelButton.on('click', () => {
        overlay.destroy();
        this.screen.render();
        resolve(null);
      });

      // Keyboard shortcuts
      overlay.key(['j', 'enter'], () => {
        overlay.destroy();
        this.screen.render();
        resolve({ enableMic: micEnabled, enableCamera: cameraEnabled });
      });

      overlay.key(['c', 'escape'], () => {
        overlay.destroy();
        this.screen.render();
        resolve(null);
      });

      overlay.key(['m'], () => {
        micEnabled = !micEnabled;
        micCheckbox.setContent(
          micEnabled
            ? '{green-fg}[X]{/green-fg} Enable Microphone (M)'
            : '{gray-fg}[ ]{/gray-fg} Enable Microphone (M)'
        );
        this.screen.render();
      });

      overlay.key(['v'], () => {
        cameraEnabled = !cameraEnabled;
        cameraCheckbox.setContent(
          cameraEnabled
            ? '{green-fg}[X]{/green-fg} Enable Camera (V)'
            : '{gray-fg}[ ]{/gray-fg} Enable Camera (V)'
        );
        this.screen.render();
      });

      overlay.focus();
      this.screen.render();
    });
  }

  public async joinVoiceChannel(channelId: string) {
    if (this.currentVoiceChannel === channelId) {
      // Already in this channel, leave instead
      await this.leaveVoiceChannel();
      return;
    }

    // Leave current channel if in one
    if (this.currentVoiceChannel) {
      await this.leaveVoiceChannel();
    }

    // Show permissions dialog
    const permissions = await this.showVoicePermissionsDialog();
    if (!permissions) {
      // User cancelled
      return;
    }

    try {
      // Helper to complete the join (called on success or timeout)
      const completeJoin = async (participants?: any[]) => {
        this.currentVoiceChannel = channelId;

        // Create control bar
        if (!this.controlBar) {
          this.controlBar = new VoiceControlBar({
            parent: this.parent || this.screen,
            screen: this.screen,
            socket: this.socket,
            ctx: this.ctx,
            username: this.username,
            onDisconnect: () => {
              this.leaveVoiceChannel();
            },
            onVideoToggle: () => {
              this.toggleVideo();
            },
            onGridToggle: () => {
              if (this.videoGrid) {
                this.videoGrid.toggleViewMode();
                const newMode = this.videoGrid.getViewMode();
                this.controlBar?.updateGridButtonLabel(newMode);
              }
            },
          });
        }

        // Create video grid
        if (!this.videoGrid) {
          // Use chatPanel as parent if available, otherwise use screen
          const gridParent = this.chatPanel || this.screen;

          this.videoGrid = new VideoGrid({
            parent: gridParent,
            screen: this.screen,
            left: 0,
            top: 0,
            width: '100%',
            height: '100%',
            currentUserId: this.userId,
            currentUsername: this.username,
          });

          // Start hidden until someone enables video
          this.videoGrid.hide();
        }

        // Add current user to video grid
        this.videoGrid.addParticipant({
          userId: this.userId,
          username: this.username,
          socketId: '',
          isMuted: false,
          hasVideo: false,
          hasScreenShare: false,
          isSpeaking: false,
          audioLevel: 0,
        });

        // Add existing participants if provided
        if (participants) {
          for (const p of participants) {
            if (p.userId !== this.userId) {
              this.videoGrid.addParticipant({
                userId: p.userId,
                username: p.username,
                socketId: '',
                isMuted: p.isMuted || false,
                hasVideo: p.hasVideo || false,
                hasScreenShare: p.hasScreenShare || false,
                isSpeaking: false,
                audioLevel: 0,
              });
            }
          }
        }

        // Start audio streaming if mic enabled
        if (permissions.enableMic) {
          await this.startAudioStreaming();
        }

        // Show control bar
        this.controlBar.show();

        // Enable camera if requested
        if (permissions.enableCamera) {
          // Wait a bit for control bar to render
          setTimeout(() => {
            this.toggleVideo();
          }, 100);
        }

        // Update grid visibility (will show avatars by default)
        this.updateVideoGridVisibility();

        if (this.onJoinVoiceCallback) {
          this.onJoinVoiceCallback(channelId);
        }
      };

      // Track if callback was received
      let callbackReceived = false;

      // Join voice channel on server with timeout fallback
      this.socket.emit('voice:join-channel', { channelId }, async (response: any) => {
        callbackReceived = true;
        if (response && response.success) {
          await completeJoin(response.participants);
        } else {
          // Server responded but denied - still show UI for demo/testing
          await completeJoin();
        }
      });

      // Timeout: If server doesn't respond in 2 seconds, proceed anyway (local/demo mode)
      setTimeout(async () => {
        if (!callbackReceived) {
          await completeJoin();
        }
      }, 2000);

    } catch (error: any) {
    }
  }

  public async leaveVoiceChannel() {
    if (!this.currentVoiceChannel) return;

    try {
      // Stop audio streaming
      if (this.ctx?.audio) {
        await this.ctx.audio.stopStreaming();
      }

      // Leave channel on server
      this.socket.emit('voice:leave-channel', {
        channelId: this.currentVoiceChannel,
      });

      // Hide control bar
      if (this.controlBar) {
        this.controlBar.hide();
      }

      this.currentVoiceChannel = undefined;

      if (this.onLeaveVoiceCallback) {
        this.onLeaveVoiceCallback();
      }
    } catch (error: any) {
    }
  }

  private async startAudioStreaming() {
    if (!this.ctx?.audio || !this.qualityManager) {
      // Audio API not available - this is normal for terminal/telnet clients
      // Only web clients have audio support
      return;
    }

    try {
      const audioOptions = this.qualityManager.getAudioStreamOptions();
      await this.ctx.audio.startStreaming(audioOptions);
    } catch (error: any) {
      // Permission denied or getUserMedia failed
      console.log('[Voice] Audio streaming failed:', error.message);
    }
  }

  public showGrid() {
    if (this.videoGrid) {
      this.videoGrid.show();
      // Don't call setFront() - rely on zIndex so command suggestions stay on top
    }
  }

  public hideGrid() {
    if (this.videoGrid) {
      this.videoGrid.hide();
    }
  }

  public isInVoiceChannel(): boolean {
    return !!this.currentVoiceChannel;
  }

  public getCurrentVoiceChannel(): string | undefined {
    return this.currentVoiceChannel;
  }

  public getVoiceChannels(): VoiceChannelItem[] {
    return Array.from(this.voiceChannels.values());
  }

  public destroy() {
    if (this.controlBar) {
      this.controlBar.destroy();
    }

    if (this.videoGrid) {
      this.videoGrid.destroy();
    }

    if (this.networkMonitor) {
      this.networkMonitor.stop();
    }
  }
}

export function createEnhancedVoiceChannel(options: EnhancedVoiceChannelOptions): EnhancedVoiceChannel {
  return new EnhancedVoiceChannel(options);
}

export function createVoiceControlBar(options: VoiceControlBarOptions): VoiceControlBar {
  return new VoiceControlBar(options);
}
