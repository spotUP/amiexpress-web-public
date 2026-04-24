/**
 * Voice Chat Door - Hybrid Door Server Component
 *
 * This is the server-side component that:
 * - Renders the neo-blessed UI
 * - Sends audio commands to the browser client
 * - Receives audio level updates from the client
 *
 * The client.ts component handles actual Web Audio:
 * - Microphone capture via getUserMedia
 * - Opus encoding via MediaRecorder
 * - Audio playback of other users
 *
 * Communication flow:
 * - Server emits 'audio:start-streaming' -> Client starts capture
 * - Server emits 'audio:stop-streaming' -> Client stops capture
 * - Server emits 'audio:mute' -> Client mutes/unmutes
 * - Client emits 'audio:levels' -> Server updates UI
 * - Client emits 'voice:speaking' -> Backend broadcasts to room
 */

import { CoreDoor as Door, createScreen } from '@amiexpress/bbs-door-sdk';
import type { DoorContext } from '@amiexpress/bbs-door-sdk';
import blessed, { renderAudioLevel } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import {
  NetworkQualityMonitor,
  AdaptiveQualityManager,
  type NetworkMetrics,
  type QualityRecommendation,
} from '@amiexpress/bbs-door-sdk';

interface AudioLevels {
  input: number;
  output: number;
  waveform?: number[];
}

interface SpeakerInfo {
  userId: number | string;
  username: string;
  isSpeaking: boolean;
  audioLevel: number;
  lastUpdate: number;
}

interface AppState {
  screen: any;
  mainBox: any;
  speakersBox: any;
  waveformBox: any;
  statusBox: any;
  controlsBox: any;
  networkBox: any;
  qualityBox: any;
  isStreaming: boolean;
  isMuted: boolean;
  speakers: Map<number | string, SpeakerInfo>;
  myUserId: number | string;
  myAudioLevel: number;
  networkMonitor?: NetworkQualityMonitor;
  qualityManager?: AdaptiveQualityManager;
  currentMetrics?: NetworkMetrics;
  currentRecommendation?: QualityRecommendation;
}

const door = new Door({
  name: 'Voice Chat',
  version: '1.0.0',
  author: 'AmiExpress Team',
  description: 'Multi-party voice chat with real-time audio streaming',
});

door.onStart(async (ctx: DoorContext) => {
  // Create blessed screen using SDK helper (connects output to BBS socket)
  const screen = createScreen(ctx.bbs, {
    title: 'Voice Chat',
  });
  screen.program.write('\x1b[2J');
  screen.program.write('\x1b[H');
  screen.clearRegion(0, screen.width, 0, screen.height);
  screen.alloc();

  // Setup input handler to route terminal input to blessed
  const bbsSession = (ctx as any).bbsSession;
  if (bbsSession) {
    bbsSession.doorInputHandler = (data: string) => {
      screen.program.emit('data', data);
      return true;
    };
  }

  // Main container
  const mainBox = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: '100%-4',
    style: {
      fg: 'white',
      bg: 'black',
    },
  });

  // Title bar
  const titleBar = blessed.box({
    parent: mainBox,
    top: 0,
    left: 0,
    width: '100%',
    height: 3,
    content:
      `{center}{cyan-fg}{bold}Voice Chat with Adaptive Quality{/bold}{/cyan-fg}{/center}\n` +
      `{center}{white-fg}S:Start  M:Mute  A:Auto-Quality  +/-:Quality  Q:Quit{/white-fg}{/center}`,
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
  });

  // Active speakers panel
  const speakersBox = blessed.box({
    parent: mainBox,
    top: 3,
    left: 1,
    width: '50%-1',
    height: '100%-6',
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
    label: ' Active Speakers ',
    content: '{yellow-fg}No speakers connected{/yellow-fg}',
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
      ch: ' ',
      style: {
        bg: 'gray',
      },
    },
  });

  // Waveform visualization panel
  const waveformBox = blessed.box({
    parent: mainBox,
    top: 3,
    left: '50%',
    width: '50%-1',
    height: 15,
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
    label: ' Your Audio Level ',
    content: '{yellow-fg}Not streaming{/yellow-fg}',
  });

  // Status panel
  const statusBox = blessed.box({
    parent: mainBox,
    top: 18,
    left: '50%',
    width: '50%-1',
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
    label: ' Status ',
    content: '{yellow-fg}Ready to start{/yellow-fg}',
  });

  // Network quality panel
  const networkBox = blessed.box({
    parent: mainBox,
    top: 24,
    left: '50%',
    width: '50%-1',
    height: 7,
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
    label: ' Network Quality ',
    content: '{yellow-fg}Monitoring not started{/yellow-fg}',
  });

  // Quality profile panel
  const qualityBox = blessed.box({
    parent: mainBox,
    top: 31,
    left: '50%',
    width: '50%-1',
    height: 8,
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
    label: ' Quality Profile ',
    content: '{yellow-fg}Not streaming{/yellow-fg}',
  });

  // Controls info panel
  const controlsBox = blessed.box({
    parent: mainBox,
    top: 39,
    left: '50%',
    width: '50%-1',
    height: '100%-42',
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
      `{cyan-fg}[S]{/cyan-fg} Start/Stop Streaming\n` +
      `{cyan-fg}[M]{/cyan-fg} Mute/Unmute\n` +
      `{cyan-fg}[A]{/cyan-fg} Toggle Auto-Quality\n` +
      `{cyan-fg}[+/-]{/cyan-fg} Manual Quality\n` +
      `{cyan-fg}[L]{/cyan-fg} List Active Speakers\n\n` +
      `{red-fg}[Q]{/red-fg} Quit Voice Chat`,
  });

  // Footer help bar
  const footerBox = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 4,
    style: {
      fg: 'black',
      bg: 'cyan',
    },
    content:
      `{center}{bold}Real-Time Voice Chat{/bold}{/center}\n` +
      `{center}Opus Codec - 48kHz - Voice Activity Detection{/center}\n` +
      `{center}Client-side audio processing for optimal server performance{/center}`,
  });

  screen.render();

  // Initialize network monitoring and adaptive quality
  const networkMonitor = new NetworkQualityMonitor(ctx.socket);
  const qualityManager = new AdaptiveQualityManager(networkMonitor);

  // App state
  const state: AppState = {
    screen,
    mainBox,
    speakersBox,
    waveformBox,
    statusBox,
    controlsBox,
    networkBox,
    qualityBox,
    isStreaming: false,
    isMuted: false,
    speakers: new Map(),
    myUserId: ctx.user.id,
    myAudioLevel: 0,
    networkMonitor,
    qualityManager,
  };

  // Start network monitoring
  networkMonitor.start();

  // Listen for network quality updates
  networkMonitor.on('metrics-update', (metrics: NetworkMetrics) => {
    state.currentMetrics = metrics;
    updateNetworkDisplay(state);
  });

  networkMonitor.on('recommendation', (rec: QualityRecommendation) => {
    state.currentRecommendation = rec;
    updateNetworkDisplay(state);
  });

  // Listen for quality changes
  qualityManager.on('quality-change', (event: any) => {
    updateQualityDisplay(state);
    updateStatus(
      state,
      `{cyan-fg}Quality changed to ${event.type}: ${event.to}{/cyan-fg}\n` +
      `Reason: ${event.reason}\n` +
      `Auto: ${event.automatic ? 'Yes' : 'No'}`
    );
  });

  // Handle audio events via Socket.IO
  // In hybrid mode, the client.ts handles Web Audio and emits events back
  if (ctx.socket) {
    // Stream started by other users
    ctx.socket.on('audio-stream-started', (data: any) => {
      if (data.userId !== state.myUserId) {
        state.speakers.set(data.userId, {
          userId: data.userId,
          username: data.username,
          isSpeaking: false,
          audioLevel: 0,
          lastUpdate: Date.now(),
        });
        updateSpeakersList(state);
        updateStatus(state, `{green-fg}${data.username} joined the chat{/green-fg}`);
      }
    });

    // Stream stopped by other users
    ctx.socket.on('audio-stream-stopped', (data: any) => {
      if (data.userId !== state.myUserId) {
        const speaker = state.speakers.get(data.userId);
        if (speaker) {
          state.speakers.delete(data.userId);
          updateSpeakersList(state);
          updateStatus(state, `{yellow-fg}${speaker.username} left the chat{/yellow-fg}`);
        }
      }
    });

    // Speaking status updates from other users (relayed by backend)
    ctx.socket.on('audio-speaking-status', (data: any) => {
      if (data.userId !== state.myUserId) {
        const speaker = state.speakers.get(data.userId);
        if (speaker) {
          speaker.isSpeaking = data.isSpeaking;
          speaker.audioLevel = data.audioLevel;
          speaker.lastUpdate = Date.now();
          updateSpeakersList(state);
        }
      }
    });

    // Audio levels from OUR client.ts (browser side)
    // The client calculates RMS from Web Audio and sends it here
    ctx.socket.on('audio:levels', (levels: AudioLevels) => {
      if (state.isStreaming) {
        state.myAudioLevel = levels.input;
        updateWaveform(state, levels);
      }
    });

    // Audio error from client
    ctx.socket.on('audio:error', (data: { message: string }) => {
      updateStatus(state, `{red-fg}Audio Error: ${data.message}{/red-fg}`);
    });

    // Update speaker list periodically (remove stale entries)
    setInterval(() => {
      const now = Date.now();
      for (const [userId, speaker] of state.speakers.entries()) {
        if (now - speaker.lastUpdate > 5000) {
          state.speakers.delete(userId);
          updateSpeakersList(state);
        }
      }
    }, 1000);
  }

  // Key handlers
  screen.key(['s', 'S'], async () => {
    await toggleStreaming(ctx, state);
  });

  screen.key(['m', 'M'], async () => {
    await toggleMute(ctx, state);
  });

  screen.key(['a', 'A'], () => {
    toggleAutoQuality(state);
  });

  screen.key(['+', '='], () => {
    adjustQuality(state, 'up');
  });

  screen.key(['-', '_'], () => {
    adjustQuality(state, 'down');
  });

  screen.key(['l', 'L'], () => {
    listActiveSpeakers(ctx, state);
  });

  screen.key(['q', 'Q', 'escape'], () => {
    screen.destroy();
  });

  // Focus management
  screen.focusPush(mainBox as any);

  // Keep the door running until closed
  await new Promise<void>((resolve) => screen.on('destroy', resolve));
});

door.onClose(async (ctx: DoorContext) => {
  // Cleanup: Stop audio streaming by emitting to client
  if (ctx.socket) {
    try {
      ctx.socket.emit('audio:stop-streaming');
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  // Stop network monitoring
  const state = (ctx as any).state;
  if (state?.networkMonitor) {
    state.networkMonitor.stop();
  }

  // Clear input handler
  const bbsSession = (ctx as any).bbsSession;
  if (bbsSession) {
    delete bbsSession.doorInputHandler;
  }
});

// Helper functions

function updateStatus(state: AppState, message: string): void {
  if (state.statusBox) {
    const timestamp = new Date().toLocaleTimeString();
    state.statusBox.setContent(`[${timestamp}]\n${message}`);
    state.screen.render();
  }
}

function updateSpeakersList(state: AppState): void {
  if (!state.speakersBox) {
    return;
  }

  const speakers = Array.from(state.speakers.values());

  if (speakers.length === 0) {
    state.speakersBox.setContent('{yellow-fg}No other speakers connected{/yellow-fg}');
  } else {
    let content = '';
    for (const speaker of speakers) {
      const speakingIndicator = speaker.isSpeaking ? '{green-fg}[SPEAKING]{/green-fg}' : '{gray-fg}[IDLE]{/gray-fg}';
      const audioBar = renderAudioBar(speaker.audioLevel);
      const username = speaker.isSpeaking ? `{bold}${speaker.username}{/bold}` : speaker.username;
      content += `${speakingIndicator} ${username}\n${audioBar}\n\n`;
    }
    state.speakersBox.setContent(content);
  }

  state.screen.render();
}

// Use SDK's renderAudioLevel instead of custom renderAudioBar
function renderAudioBar(level: number): string {
  return renderAudioLevel(level, { barWidth: 40 });
}

function updateWaveform(state: AppState, levels: any): void {
  if (!state.waveformBox) {
    return;
  }

  const waveform = levels.waveform || [];
  const audioLevel = state.myAudioLevel;

  // Simple waveform visualization
  let content = '';

  if (state.isMuted) {
    content = '{red-fg}{bold}MUTED{/bold}{/red-fg}\n\n';
    content += '{gray-fg}Audio input disabled{/gray-fg}';
  } else if (state.isStreaming) {
    // Audio level bar
    const bar = renderAudioBar(audioLevel);
    content = `{cyan-fg}Input Level:{/cyan-fg}\n${bar}\n\n`;

    // Simple waveform (just show last few samples)
    if (waveform.length > 0) {
      content += '{cyan-fg}Waveform:{/cyan-fg}\n';
      const samples = waveform.slice(-30);
      for (const sample of samples) {
        const height = Math.floor(Math.abs(sample) * 10);
        content += height > 0 ? '{green-fg}|{/green-fg}' : '{gray-fg}·{/gray-fg}';
      }
    }

    const isSpeaking = audioLevel > 0.01;
    if (isSpeaking) {
      content += '\n\n{green-fg}{bold}SPEAKING{/bold}{/green-fg}';
    } else {
      content += '\n\n{gray-fg}Idle{/gray-fg}';
    }
  } else {
    content = '{yellow-fg}Not streaming{/yellow-fg}';
  }

  state.waveformBox.setContent(content);
  state.screen.render();
}

async function toggleStreaming(ctx: DoorContext, state: AppState): Promise<void> {
  if (!ctx.socket) {
    updateStatus(state, '{red-fg}Error: Socket not available{/red-fg}');
    return;
  }

  try {
    if (state.isStreaming) {
      // Stop streaming - emit to client
      ctx.socket.emit('audio:stop-streaming');
      state.isStreaming = false;
      state.isMuted = false;
      updateStatus(state, '{yellow-fg}Stopped streaming{/yellow-fg}');
      updateWaveform(state, { input: 0, output: 0 });
      updateQualityDisplay(state);
    } else {
      // Start streaming - emit to client with quality settings
      updateStatus(state, '{yellow-fg}Starting audio stream...{/yellow-fg}');

      const audioOptions = state.qualityManager?.getAudioStreamOptions() || {
        codec: 'opus',
        sampleRate: 48000,
        bitrate: 32000,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      };

      const streamId = `audio-${ctx.user.id}-${Date.now()}`;

      // Emit to client (browser) to start Web Audio capture
      ctx.socket.emit('audio:start-streaming', { options: audioOptions, streamId });

      state.isStreaming = true;
      state.isMuted = false;

      const audioProfile = state.qualityManager?.getAudioProfile();
      updateStatus(
        state,
        `{green-fg}Streaming active{/green-fg}\n` +
        `Stream ID: ${streamId.substring(0, 8)}...\n` +
        `Quality: ${audioProfile?.name || 'High'} (${(audioOptions.bitrate || 32000) / 1000}kbps)`
      );
      updateQualityDisplay(state);
    }
  } catch (error: any) {
    updateStatus(state, `{red-fg}Error: ${error.message}{/red-fg}`);
  }
}

async function toggleMute(ctx: DoorContext, state: AppState): Promise<void> {
  if (!state.isStreaming || !ctx.socket) {
    updateStatus(state, '{yellow-fg}Not streaming - cannot mute{/yellow-fg}');
    return;
  }

  try {
    state.isMuted = !state.isMuted;

    // Emit to client (browser) to mute/unmute
    ctx.socket.emit('audio:mute', { muted: state.isMuted });

    if (state.isMuted) {
      updateStatus(state, '{red-fg}Microphone MUTED{/red-fg}');
    } else {
      updateStatus(state, '{green-fg}Microphone UNMUTED{/green-fg}');
    }

    updateWaveform(state, { input: state.isMuted ? 0 : state.myAudioLevel, output: 0 });
  } catch (error: any) {
    updateStatus(state, `{red-fg}Error: ${error.message}{/red-fg}`);
  }
}

async function listActiveSpeakers(ctx: DoorContext, state: AppState): Promise<void> {
  // List speakers from our local state (populated by socket events)
  const speakers = Array.from(state.speakers.values());

  let content = `{cyan-fg}Active Speakers:{/cyan-fg} ${speakers.length + (state.isStreaming ? 1 : 0)}\n\n`;

  // Add self if streaming
  if (state.isStreaming) {
    const status = state.myAudioLevel > 0.01 ? '{green-fg}SPEAKING{/green-fg}' : '{gray-fg}IDLE{/gray-fg}';
    const level = Math.floor(state.myAudioLevel * 100);
    content += `{yellow-fg}[YOU]{/yellow-fg} ${ctx.user.username || 'You'} ${status}\n`;
    content += `  Audio Level: ${level}%\n\n`;
  }

  // Add other speakers
  for (const speaker of speakers) {
    const status = speaker.isSpeaking ? '{green-fg}SPEAKING{/green-fg}' : '{gray-fg}IDLE{/gray-fg}';
    const level = Math.floor(speaker.audioLevel * 100);
    content += `${speaker.username} ${status}\n`;
    content += `  Audio Level: ${level}%\n\n`;
  }

  if (speakers.length === 0 && !state.isStreaming) {
    content += '{yellow-fg}No active speakers{/yellow-fg}\n';
  }

  updateStatus(state, content);
}

function updateNetworkDisplay(state: AppState): void {
  if (!state.networkBox || !state.networkMonitor) {
    return;
  }

  const metrics = state.currentMetrics;
  const rec = state.currentRecommendation;

  if (!metrics || !rec) {
    state.networkBox.setContent('{yellow-fg}Measuring network quality...{/yellow-fg}');
    state.screen.render();
    return;
  }

  // Color based on quality
  let statusColor = 'green';
  if (rec.status === 'fair') statusColor = 'yellow';
  else if (rec.status === 'poor' || rec.status === 'critical') statusColor = 'red';

  const qualitySymbol = state.networkMonitor.getQualitySymbol();

  let content = '';
  content += `{${statusColor}-fg}{bold}${qualitySymbol} ${rec.status.toUpperCase()}{/bold}{/${statusColor}-fg}\n`;
  content += `RTT: {cyan-fg}${Math.floor(metrics.rtt)}ms{/cyan-fg} `;
  content += `Loss: {cyan-fg}${metrics.packetLoss.toFixed(1)}%{/cyan-fg}\n`;
  content += `Jitter: {cyan-fg}${Math.floor(metrics.jitter)}ms{/cyan-fg} `;
  content += `BW: {cyan-fg}${Math.floor(metrics.bandwidth)}kbps{/cyan-fg}\n`;
  content += `Score: {cyan-fg}${Math.floor(rec.quality)}%{/cyan-fg}`;

  state.networkBox.setContent(content);
  state.screen.render();
}

function updateQualityDisplay(state: AppState): void {
  if (!state.qualityBox || !state.qualityManager) {
    return;
  }

  if (!state.isStreaming) {
    state.qualityBox.setContent('{yellow-fg}Not streaming{/yellow-fg}');
    state.screen.render();
    return;
  }

  const audioProfile = state.qualityManager.getAudioProfile();
  const isAuto = state.qualityManager.isAutoAdjustEnabled();

  let content = '';
  content += `{cyan-fg}Audio:{/cyan-fg} {bold}${audioProfile.name}{/bold}\n`;
  content += `  Bitrate: ${audioProfile.bitrate / 1000}kbps\n`;
  content += `  Sample Rate: ${audioProfile.sampleRate / 1000}kHz\n`;
  content += `  Quality: ${audioProfile.quality}\n\n`;
  content += `{cyan-fg}Auto-Adjust:{/cyan-fg} `;
  content += isAuto ? '{green-fg}ON{/green-fg}' : '{yellow-fg}OFF{/yellow-fg}';

  state.qualityBox.setContent(content);
  state.screen.render();
}

function toggleAutoQuality(state: AppState): void {
  if (!state.qualityManager) {
    return;
  }

  if (state.qualityManager.isAutoAdjustEnabled()) {
    state.qualityManager.disableAutoAdjust();
    updateStatus(state, '{yellow-fg}Auto-quality adjustment disabled{/yellow-fg}');
  } else {
    state.qualityManager.enableAutoAdjust();
    updateStatus(state, '{green-fg}Auto-quality adjustment enabled{/green-fg}');
  }

  updateQualityDisplay(state);
}

function adjustQuality(state: AppState, direction: 'up' | 'down'): void {
  if (!state.qualityManager) {
    return;
  }

  const audioProfiles = ['emergency', 'low', 'medium', 'high', 'studio'];
  const currentProfile = state.qualityManager.getAudioProfile();
  const currentIndex = audioProfiles.indexOf(currentProfile.name.toLowerCase().includes('emergency') ? 'emergency' :
    currentProfile.name.toLowerCase().includes('telephone') ? 'low' :
    currentProfile.name.toLowerCase().includes('voice') && !currentProfile.name.toLowerCase().includes('high') ? 'medium' :
    currentProfile.name.toLowerCase().includes('high') ? 'high' : 'studio');

  let newIndex = currentIndex;
  if (direction === 'up' && currentIndex < audioProfiles.length - 1) {
    newIndex = currentIndex + 1;
  } else if (direction === 'down' && currentIndex > 0) {
    newIndex = currentIndex - 1;
  } else {
    updateStatus(state, '{yellow-fg}Already at ' + (direction === 'up' ? 'maximum' : 'minimum') + ' quality{/yellow-fg}');
    return;
  }

  const newProfile = audioProfiles[newIndex];
  state.qualityManager.setAudioQuality(newProfile);
  updateStatus(state, `{cyan-fg}Quality manually set to: ${newProfile}{/cyan-fg}`);
  updateQualityDisplay(state);
}

export default door;
