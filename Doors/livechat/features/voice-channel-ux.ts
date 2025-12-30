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
  private settingsButton: any;
  private disconnectButton: any;
  private username: string;
  private isMuted = false;
  private hasVideo = false;
  private isSpeaking = false;
  private onDisconnectCallback?: () => void;
  private onVideoToggleCallback?: () => void;

  constructor(options: VoiceControlBarOptions) {
    this.screen = options.screen;
    this.socket = options.socket;
    this.ctx = options.ctx;
    this.username = options.username;
    this.onDisconnectCallback = options.onDisconnect;
    this.onVideoToggleCallback = options.onVideoToggle;

    this.createUI(options.parent);
    this.setupSocketHandlers();
  }

  private createUI(parent: any) {
    // Bottom control bar container (Discord-style: bottom left corner)
    // Position above status bar (height 1) and input box (height 3)
    this.container = blessed.box({
      parent,
      bottom: 4,  // Above status bar (1) and input box (3)
      left: 0,
      width: 42,
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

    // Set high z-index to appear above other elements
    (this.container as any).zi = 9999;

    // User status with speaking indicator
    this.statusBox = blessed.box({
      parent: this.container,
      top: 0,
      left: 1,
      width: 14,
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
      left: 15,
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
      left: 21,
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

    // Disconnect button [X] Leave
    this.disconnectButton = blessed.box({
      parent: this.container,
      top: 0,
      left: 27,
      width: 12,
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
    this.container.setFront();  // Bring to front of other elements
    this.screen.render();
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
  channelList: any;
  screen: any;
  socket: any;
  ctx?: DoorContext;
  userId: number | string;
  username: string;
  chatPanel?: any; // Optional chat panel to use as parent for video grid
  onJoinVoice?: (channelId: string) => void;
  onLeaveVoice?: () => void;
}

export class EnhancedVoiceChannel {
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
  private videoEnabled = false;

  constructor(options: EnhancedVoiceChannelOptions) {
    this.channelList = options.channelList;
    this.screen = options.screen;
    this.socket = options.socket;
    this.ctx = options.ctx;
    this.userId = options.userId;
    this.username = options.username;
    this.chatPanel = options.chatPanel;
    this.onJoinVoiceCallback = options.onJoinVoice;
    this.onLeaveVoiceCallback = options.onLeaveVoice;

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
          userId: data.userId,
          username: data.username,
          isSpeaking: false,
        });
        this.updateChannelList();
      }

      // Add to video grid
      if (this.videoGrid && data.userId !== this.userId) {
        this.videoGrid.addParticipant({
          userId: data.userId,
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
        channel.participants = channel.participants.filter(p => p.userId !== data.userId);
        this.updateChannelList();
      }

      // Remove from video grid
      if (this.videoGrid) {
        this.videoGrid.removeParticipant(data.userId);
      }
    });

    this.socket.on('voice:speaking', (data: any) => {
      for (const channel of this.voiceChannels.values()) {
        const participant = channel.participants.find(p => p.userId === data.userId);
        if (participant) {
          participant.isSpeaking = data.isSpeaking;
          this.updateChannelList();
          break;
        }
      }

      // Update video grid
      if (this.videoGrid) {
        this.videoGrid.updateParticipant(data.userId, {
          isSpeaking: data.isSpeaking,
          audioLevel: data.audioLevel || 0,
        });

        // Set active speaker
        if (data.isSpeaking) {
          this.videoGrid.setActiveSpeaker(data.userId);
        }
      }
    });

    // Video toggle events
    this.socket.on('voice:video-toggle', (data: any) => {
      if (this.videoGrid) {
        this.videoGrid.updateParticipant(data.userId, {
          hasVideo: data.hasVideo,
        });

        // Show video grid if anyone has video enabled
        this.updateVideoGridVisibility();
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

    // Show video grid if anyone (including current user) has video enabled
    const hasAnyVideo = this.videoGrid.getParticipants().some(p => p.hasVideo);

    if (hasAnyVideo && !this.videoGrid.isVisible()) {
      this.videoGrid.show();
    } else if (!hasAnyVideo && this.videoGrid.isVisible()) {
      this.videoGrid.hide();
    }
  }

  public toggleVideo() {
    this.videoEnabled = !this.videoEnabled;

    // Notify server
    this.socket.emit('voice:video-toggle', { hasVideo: this.videoEnabled });

    // Update own participant in video grid
    if (this.videoGrid) {
      this.videoGrid.updateParticipant(this.userId, {
        hasVideo: this.videoEnabled,
      });
      this.updateVideoGridVisibility();
    }
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

    try {
      // Helper to complete the join (called on success or timeout)
      const completeJoin = async (participants?: any[]) => {
        this.currentVoiceChannel = channelId;

        // Create control bar
        if (!this.controlBar) {
          this.controlBar = new VoiceControlBar({
            parent: this.screen,
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

        // Start audio streaming
        await this.startAudioStreaming();

        // Show control bar
        this.controlBar.show();

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
          console.warn('Voice channel join denied by server, using local mode');
          await completeJoin();
        }
      });

      // Timeout: If server doesn't respond in 2 seconds, proceed anyway (local/demo mode)
      setTimeout(async () => {
        if (!callbackReceived) {
          console.warn('Voice channel server timeout, using local mode');
          await completeJoin();
        }
      }, 2000);

    } catch (error: any) {
      console.error('Failed to join voice channel:', error);
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
      console.error('Failed to leave voice channel:', error);
    }
  }

  private async startAudioStreaming() {
    if (!this.ctx?.audio || !this.qualityManager) return;

    try {
      const audioOptions = this.qualityManager.getAudioStreamOptions();
      await this.ctx.audio.startStreaming(audioOptions);
    } catch (error: any) {
      console.error('Failed to start audio streaming:', error);
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
