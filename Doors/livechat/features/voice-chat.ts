/**
 * Voice/Video Chat Feature
 *
 * Discord-style voice channels with video support
 * - Join/leave voice channels
 * - Grid view of participants
 * - Video tiles with ASCII video streams
 * - Voice activity indicators
 * - Mic/camera controls
 * - Adaptive quality management
 */

import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { NetworkQualityMonitor, AdaptiveQualityManager } from '@amiexpress/bbs-door-sdk';
import type { DoorContext } from '@amiexpress/bbs-door-sdk';

export interface VoiceParticipant {
  userId: number | string;
  username: string;
  isSpeaking: boolean;
  audioLevel: number;
  hasVideo: boolean;
  isMuted: boolean;
  lastUpdate: number;
}

export interface VoiceChannelOptions {
  parent: any;
  screen: any;
  socket: any;
  ctx?: DoorContext;
  onClose?: () => void;
}

export class VoiceChannel {
  private screen: any;
  private socket: any;
  private ctx?: DoorContext;
  private container: any;
  private participantsBox: any;
  private videoGrid: any;
  private controlsBox: any;
  private networkBox: any;
  private qualityBox: any;
  private participants = new Map<number | string, VoiceParticipant>();
  private isInChannel = false;
  private isMuted = false;
  private hasVideo = false;
  private networkMonitor?: NetworkQualityMonitor;
  private qualityManager?: AdaptiveQualityManager;
  private onCloseCallback?: () => void;

  constructor(options: VoiceChannelOptions) {
    this.screen = options.screen;
    this.socket = options.socket;
    this.ctx = options.ctx;
    this.onCloseCallback = options.onClose;

    this.createUI(options.parent);
    this.setupSocketHandlers();
    this.setupAdaptiveQuality();
  }

  private createUI(parent: any) {
    // Main container (right sidebar)
    this.container = blessed.box({
      parent,
      right: 0,
      top: 0,
      width: '25%',
      height: '100%',
      style: {
        fg: 'white',
        bg: 'black',
        border: {
          fg: 'cyan',
        },
      },
      border: {
        type: 'line',
      },
      label: ' Voice Channel ',
      hidden: true,
    });

    // Join/Leave button
    const joinButton = blessed.button({
      parent: this.container,
      top: 1,
      left: 'center',
      width: 'shrink',
      height: 3,
      content: ' Join Voice ',
      style: {
        fg: 'black',
        bg: 'green',
        focus: {
          bg: 'cyan',
        },
        hover: {
          bg: 'cyan',
        },
      },
      border: {
        type: 'line',
      },
      mouse: true,
    });

    joinButton.on('press', () => {
      this.toggleChannel();
    });

    // Participants list
    this.participantsBox = blessed.box({
      parent: this.container,
      top: 5,
      left: 1,
      width: '100%-2',
      height: 12,
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
      label: ' Participants (0) ',
      content: '{center}{gray-fg}No one in channel{/gray-fg}{/center}',
      scrollable: true,
      alwaysScroll: true,
      mouse: true,
    });

    // Network quality panel
    this.networkBox = blessed.box({
      parent: this.container,
      top: 18,
      left: 1,
      width: '100%-2',
      height: 6,
      style: {
        fg: 'white',
        bg: 'black',
        border: {
          fg: 'yellow',
        },
      },
      border: {
        type: 'line',
      },
      label: ' Network ',
      content: '{center}{gray-fg}Not connected{/gray-fg}{/center}',
    });

    // Quality profile panel
    this.qualityBox = blessed.box({
      parent: this.container,
      top: 25,
      left: 1,
      width: '100%-2',
      height: 6,
      style: {
        fg: 'white',
        bg: 'black',
        border: {
          fg: 'magenta',
        },
      },
      border: {
        type: 'line',
      },
      label: ' Quality ',
      content: '{center}{gray-fg}Not streaming{/gray-fg}{/center}',
    });

    // Controls
    this.controlsBox = blessed.box({
      parent: this.container,
      bottom: 1,
      left: 1,
      width: '100%-2',
      height: 8,
      style: {
        fg: 'white',
        bg: 'black',
        border: {
          fg: 'cyan',
        },
      },
      border: {
        type: 'line',
      },
      label: ' Controls ',
      content:
        '{center}{cyan-fg}[M]{/cyan-fg} Toggle Mic{/center}\n' +
        '{center}{cyan-fg}[V]{/cyan-fg} Toggle Video{/center}\n' +
        '{center}{cyan-fg}[A]{/cyan-fg} Auto Quality{/center}\n' +
        '{center}{cyan-fg}[+/-]{/cyan-fg} Quality{/center}\n' +
        '{center}{red-fg}[ESC]{/red-fg} Leave{/center}',
    });

    // Key handlers
    this.screen.key(['m', 'M'], () => {
      if (this.isInChannel) this.toggleMute();
    });

    this.screen.key(['v', 'V'], () => {
      if (this.isInChannel) this.toggleVideo();
    });

    this.screen.key(['a', 'A'], () => {
      if (this.isInChannel) this.toggleAutoQuality();
    });
  }

  private setupSocketHandlers() {
    // Voice channel events
    this.socket.on('voice:joined', (data: any) => {
      if (data.userId !== this.ctx?.user?.id) {
        this.addParticipant(data);
        this.updateParticipantsList();
      }
    });

    this.socket.on('voice:left', (data: any) => {
      this.removeParticipant(data.userId);
      this.updateParticipantsList();
    });

    this.socket.on('voice:speaking', (data: any) => {
      const participant = this.participants.get(data.userId);
      if (participant) {
        participant.isSpeaking = data.isSpeaking;
        participant.audioLevel = data.audioLevel;
        participant.lastUpdate = Date.now();
        this.updateParticipantsList();
      }
    });

    this.socket.on('voice:video-toggle', (data: any) => {
      const participant = this.participants.get(data.userId);
      if (participant) {
        participant.hasVideo = data.hasVideo;
        this.updateParticipantsList();
      }
    });

    // Audio streaming events (from SDK)
    this.socket.on('audio-stream-started', (data: any) => {
      const participant = this.participants.get(data.userId);
      if (participant) {
        this.updateParticipantsList();
      }
    });

    this.socket.on('audio-speaking-status', (data: any) => {
      const participant = this.participants.get(data.userId);
      if (participant) {
        participant.isSpeaking = data.isSpeaking;
        participant.audioLevel = data.audioLevel;
        this.updateParticipantsList();
      }
    });
  }

  private setupAdaptiveQuality() {
    if (!this.ctx?.audio || !this.socket) return;

    // Initialize network monitoring
    this.networkMonitor = new NetworkQualityMonitor(this.socket);
    this.qualityManager = new AdaptiveQualityManager(this.networkMonitor);

    // Listen for quality updates
    this.networkMonitor.on('metrics-update', (metrics: any) => {
      this.updateNetworkDisplay(metrics);
    });

    this.networkMonitor.on('recommendation', (rec: any) => {
      this.updateQualityDisplay(rec);
    });

    this.qualityManager.on('quality-change', (event: any) => {
      // Show notification
      this.showNotification(
        `Quality: ${event.to} (${event.automatic ? 'auto' : 'manual'})`
      );
    });
  }

  private async toggleChannel() {
    if (this.isInChannel) {
      await this.leaveChannel();
    } else {
      await this.joinChannel();
    }
  }

  private async joinChannel() {
    try {
      // Join voice channel on server
      this.socket.emit('voice:join', (response: any) => {
        if (response.success) {
          this.isInChannel = true;

          // Load existing participants
          if (response.participants) {
            for (const p of response.participants) {
              this.addParticipant(p);
            }
          }

          this.updateParticipantsList();
          this.startVoiceStreaming();
        } else {
          this.showError(response.error || 'Failed to join voice channel');
        }
      });
    } catch (error: any) {
      this.showError(error.message);
    }
  }

  private async leaveChannel() {
    try {
      // Stop streaming
      if (this.ctx?.audio) {
        await this.ctx.audio.stopStreaming();
      }

      // Stop network monitoring
      if (this.networkMonitor) {
        this.networkMonitor.stop();
      }

      // Leave channel on server
      this.socket.emit('voice:leave');

      this.isInChannel = false;
      this.isMuted = false;
      this.hasVideo = false;
      this.participants.clear();
      this.updateParticipantsList();
      this.updateNetworkDisplay(null);
      this.updateQualityDisplay(null);
    } catch (error: any) {
      this.showError(error.message);
    }
  }

  private async startVoiceStreaming() {
    if (!this.ctx?.audio || !this.qualityManager) return;

    try {
      // Start network monitoring
      if (this.networkMonitor) {
        this.networkMonitor.start();
      }

      // Get recommended audio settings
      const audioOptions = this.qualityManager.getAudioStreamOptions();

      // Start streaming
      await this.ctx.audio.startStreaming(audioOptions);

      this.showNotification('Voice streaming started');
    } catch (error: any) {
      this.showError('Failed to start audio: ' + error.message);
    }
  }

  private toggleMute() {
    if (!this.ctx?.audio) return;

    this.isMuted = !this.isMuted;
    this.ctx.audio.setMuted(this.isMuted);

    // Notify server
    this.socket.emit('voice:mute', { isMuted: this.isMuted });

    this.showNotification(this.isMuted ? 'Muted' : 'Unmuted');
  }

  private toggleVideo() {
    this.hasVideo = !this.hasVideo;

    // Notify server
    this.socket.emit('voice:video-toggle', { hasVideo: this.hasVideo });

    if (this.hasVideo) {
      this.startVideoStream();
    } else {
      this.stopVideoStream();
    }

    this.showNotification(this.hasVideo ? 'Video ON' : 'Video OFF');
  }

  private async startVideoStream() {
    if (!this.ctx?.video) return;

    try {
      const videoOptions = this.qualityManager?.getVideoProfile() || {};
      const streamId = await this.ctx.video.startStream(
        { type: 'webcam' },
        {
          width: videoOptions.asciiWidth || 80,
          height: videoOptions.asciiHeight || 24,
          fps: videoOptions.fps || 10,
          colored: videoOptions.colored ?? true,
        }
      );
      console.log(`[VoiceChat] Started video stream: ${streamId}`);
    } catch (error: any) {
      this.showError('Failed to start video: ' + error.message);
      this.hasVideo = false;
    }
  }

  private async stopVideoStream() {
    if (!this.ctx?.video) return;

    try {
      // Find our own video stream and stop it
      const streams = await this.ctx.video.getStreams();
      const myStreamId = `video-${(this.ctx as any).socket?.id}`;
      if (streams.includes(myStreamId)) {
        await this.ctx.video.stopStream(myStreamId);
      }
    } catch (error: any) {
      console.error('[VoiceChat] Error stopping video stream:', error);
    }
  }

  private toggleAutoQuality() {
    if (!this.qualityManager) return;

    if (this.qualityManager.isAutoAdjustEnabled()) {
      this.qualityManager.disableAutoAdjust();
      this.showNotification('Auto-quality OFF');
    } else {
      this.qualityManager.enableAutoAdjust();
      this.showNotification('Auto-quality ON');
    }
  }

  private addParticipant(data: any) {
    this.participants.set(data.userId, {
      userId: data.userId,
      username: data.username,
      isSpeaking: false,
      audioLevel: 0,
      hasVideo: false,
      isMuted: false,
      lastUpdate: Date.now(),
    });
  }

  private removeParticipant(userId: number | string) {
    this.participants.delete(userId);
  }

  private updateParticipantsList() {
    if (!this.participantsBox) return;

    const count = this.participants.size;
    this.participantsBox.setLabel(` Participants (${count}) `);

    if (count === 0) {
      this.participantsBox.setContent('{center}{gray-fg}No one in channel{/gray-fg}{/center}');
      this.screen.render();
      return;
    }

    let content = '';
    for (const p of this.participants.values()) {
      // Speaking indicator
      const speakingIcon = p.isSpeaking ? '{green-fg}[*]{/green-fg}' : '{gray-fg}[ ]{/gray-fg}';

      // Video indicator
      const videoIcon = p.hasVideo ? '{cyan-fg}[V]{/cyan-fg}' : '   ';

      // Muted indicator
      const mutedIcon = p.isMuted ? '{red-fg}[M]{/red-fg}' : '   ';

      // Audio level bar
      const level = Math.floor(p.audioLevel * 10);
      const bar = '{cyan-fg}' + '='.repeat(level) + '{/cyan-fg}' + '-'.repeat(10 - level);

      content += `${speakingIcon} ${videoIcon} ${mutedIcon} {bold}${p.username}{/bold}\n`;
      content += `  ${bar}\n\n`;
    }

    this.participantsBox.setContent(content);
    this.screen.render();
  }

  private updateNetworkDisplay(metrics: any) {
    if (!this.networkBox) return;

    if (!metrics) {
      this.networkBox.setContent('{center}{gray-fg}Not connected{/gray-fg}{/center}');
      this.screen.render();
      return;
    }

    const quality = this.networkMonitor?.getRecommendation();
    if (!quality) return;

    let statusColor = 'green';
    if (quality.status === 'fair') statusColor = 'yellow';
    else if (quality.status === 'poor' || quality.status === 'critical') statusColor = 'red';

    const symbol = this.networkMonitor?.getQualitySymbol() || '?';

    let content = '';
    content += `{center}{${statusColor}-fg}{bold}${symbol} ${quality.status.toUpperCase()}{/bold}{/${statusColor}-fg}{/center}\n`;
    content += `{center}RTT: ${Math.floor(metrics.rtt)}ms{/center}\n`;
    content += `{center}Loss: ${metrics.packetLoss.toFixed(1)}%{/center}\n`;
    content += `{center}Score: ${Math.floor(quality.quality)}%{/center}`;

    this.networkBox.setContent(content);
    this.screen.render();
  }

  private updateQualityDisplay(rec: any) {
    if (!this.qualityBox) return;

    if (!rec || !this.isInChannel) {
      this.qualityBox.setContent('{center}{gray-fg}Not streaming{/gray-fg}{/center}');
      this.screen.render();
      return;
    }

    const audioProfile = this.qualityManager?.getAudioProfile();
    if (!audioProfile) return;

    const isAuto = this.qualityManager?.isAutoAdjustEnabled();

    let content = '';
    content += `{center}{bold}${audioProfile.name}{/bold}{/center}\n`;
    content += `{center}${audioProfile.bitrate / 1000}kbps @ ${audioProfile.sampleRate / 1000}kHz{/center}\n`;
    content += `{center}Auto: ${isAuto ? '{green-fg}ON{/green-fg}' : '{yellow-fg}OFF{/yellow-fg}'}{/center}`;

    this.qualityBox.setContent(content);
    this.screen.render();
  }

  private showNotification(message: string) {
    // TODO: Integrate with livechat notification system
    // For now, update status in controls box temporarily
  }

  private showError(message: string) {
    // TODO: Integrate with livechat error dialog
    // For now, update controls box
  }

  public show() {
    this.container.show();
    this.screen.render();
  }

  public hide() {
    this.container.hide();
    this.screen.render();
  }

  public toggle() {
    if (this.container.hidden) {
      this.show();
    } else {
      this.hide();
    }
  }

  public destroy() {
    if (this.isInChannel) {
      this.leaveChannel();
    }

    if (this.networkMonitor) {
      this.networkMonitor.stop();
    }

    this.container.destroy();

    if (this.onCloseCallback) {
      this.onCloseCallback();
    }
  }
}

export function createVoiceChannel(options: VoiceChannelOptions): VoiceChannel {
  return new VoiceChannel(options);
}
