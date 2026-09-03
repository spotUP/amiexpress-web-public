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
import { T, S, CURRENT, applyTheme } from './door-theme';
import { attachDoorChrome, type DoorChrome } from '@amiexpress/bbs-door-sdk/engines/ui/theme';

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

/**
 * The running chrome, at module scope because two teardown paths need it:
 * the screen's own `destroy` event and the door's `onClose`, and only one
 * of those fires when a caller drops the line.
 */
let activeChrome: DoorChrome | null = null;

/** Stop the rail. Safe to call twice; the second call does nothing. */
function stopChrome(): void {
  if (!activeChrome) return;
  try { activeChrome.stop(); } catch { /* leaving anyway */ }
  activeChrome = null;
}

const door = new Door({
  name: 'Voice Chat',
  version: '1.0.0',
  author: 'AmiExpress Team',
  description: 'Multi-party voice chat with real-time audio streaming',
});

door.onStart(async (ctx: DoorContext) => {
  // The board's theme, before any widget reads a colour from it.
  applyTheme(ctx.bbs);

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
      fg: T.ink,
      bg: T.ground,
    },
  });

  // Title bar
  const titleBar = blessed.box({
    parent: mainBox,
    top: 0,
    left: 0,
    width: '100%',
    height: 3,
    // The masthead is painted by attachDoorChrome below. The key line that
    // used to sit under the title was never on screen: a three-row box with
    // a line border has ONE interior row, so only the first line ever
    // reached the glass. The keys are listed in the Controls panel.
    content: '',
    style: {
      fg: T.ink,
      bg: T.ground,
      border: {
        fg: T.accent,
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
      fg: T.ink,
      bg: T.ground,
      border: {
        fg: T.ok,
      },
    },
    border: {
      type: 'line',
    },
    label: ' Active Speakers ',
    content: `{${T.accentAlt}-fg}No speakers connected{/${T.accentAlt}-fg}`,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
      ch: ' ',
      style: {
        bg: T.dim,
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
      fg: T.ink,
      bg: T.ground,
      border: {
        fg: T.accentAlt,
      },
    },
    border: {
      type: 'line',
    },
    label: ' Your Audio Level ',
    content: `{${T.accentAlt}-fg}Not streaming{/${T.accentAlt}-fg}`,
  });

  // Status panel
  const statusBox = blessed.box({
    parent: mainBox,
    top: 18,
    left: '50%',
    width: '50%-1',
    height: 6,
    style: {
      fg: T.ink,
      bg: T.ground,
      border: {
        fg: T.accentAlt,
      },
    },
    border: {
      type: 'line',
    },
    label: ' Status ',
    content: `{${T.accentAlt}-fg}Ready to start{/${T.accentAlt}-fg}`,
  });

  // Network quality panel
  const networkBox = blessed.box({
    parent: mainBox,
    top: 24,
    left: '50%',
    width: '50%-1',
    height: 7,
    style: {
      fg: T.ink,
      bg: T.ground,
      border: {
        fg: T.ok,
      },
    },
    border: {
      type: 'line',
    },
    label: ' Network Quality ',
    content: `{${T.accentAlt}-fg}Monitoring not started{/${T.accentAlt}-fg}`,
  });

  // Quality profile panel
  const qualityBox = blessed.box({
    parent: mainBox,
    top: 31,
    left: '50%',
    width: '50%-1',
    height: 8,
    style: {
      fg: T.ink,
      bg: T.ground,
      border: {
        fg: T.accentAlt,
      },
    },
    border: {
      type: 'line',
    },
    label: ' Quality Profile ',
    content: `{${T.accentAlt}-fg}Not streaming{/${T.accentAlt}-fg}`,
  });

  // Controls info panel
  const controlsBox = blessed.box({
    parent: mainBox,
    top: 39,
    left: '50%',
    width: '50%-1',
    height: '100%-42',
    style: {
      fg: T.ink,
      bg: T.ground,
      border: {
        fg: T.accent,
      },
    },
    border: {
      type: 'line',
    },
    label: ' Controls ',
    content:
      `{${T.accent}-fg}[S]{/${T.accent}-fg} Start/Stop Streaming\n` +
      `{${T.accent}-fg}[M]{/${T.accent}-fg} Mute/Unmute\n` +
      `{${T.accent}-fg}[A]{/${T.accent}-fg} Toggle Auto-Quality\n` +
      `{${T.accent}-fg}[+/-]{/${T.accent}-fg} Manual Quality\n` +
      `{${T.accent}-fg}[L]{/${T.accent}-fg} List Active Speakers\n\n` +
      `{${T.alert}-fg}[Q]{/${T.alert}-fg} Quit Voice Chat`,
  });

  // Footer help bar
  const footerBox = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 4,
    style: {
      fg: T.ground,
      bg: T.accent,
    },
    content:
      `{center}{bold}Real-Time Voice Chat{/bold}{/center}\n` +
      `{center}Opus Codec - 48kHz - Voice Activity Detection{/center}\n` +
      `{center}Client-side audio processing for optimal server performance{/center}`,
  });

  /**
   * The chrome, from the ONE SDK call: the theme's animated rail across the
   * title bar. This door took the theme's colours and none of its chrome.
   *
   * No footer and no glitches on purpose. The bottom bar carries the codec
   * facts rather than key hints, and every panel on this screen shows LIVE
   * audio state - a glitch on a speaker list or a level meter would read as
   * the call breaking up, which is the one lie a voice door must not tell.
   */
  activeChrome = attachDoorChrome(CURRENT, {
    width: ((screen as any).width as number) || 80,
    title: 'VOICE CHAT',
    masthead: titleBar as any,
    // Two columns less again: the masthead sits inside a framed title bar.
    mastheadWidth: Math.max(1, (((screen as any).width as number) || 80) - 3),
    styles: S,
    render: () => screen.render(),
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
      `{${T.accent}-fg}Quality changed to ${event.type}: ${event.to}{/${T.accent}-fg}\n` +
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
        updateStatus(state, `{${T.ok}-fg}${data.username} joined the chat{/${T.ok}-fg}`);
      }
    });

    // Stream stopped by other users
    ctx.socket.on('audio-stream-stopped', (data: any) => {
      if (data.userId !== state.myUserId) {
        const speaker = state.speakers.get(data.userId);
        if (speaker) {
          state.speakers.delete(data.userId);
          updateSpeakersList(state);
          updateStatus(state, `{${T.accentAlt}-fg}${speaker.username} left the chat{/${T.accentAlt}-fg}`);
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
      updateStatus(state, `{${T.alert}-fg}Audio Error: ${data.message}{/${T.alert}-fg}`);
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
    // Just destroy: the listener below is the ONE place the chrome stops,
    // so every way out of this door goes through the same teardown.
    screen.destroy();
  });

  // Focus management
  screen.focusPush(mainBox as any);

  // Keep the door running until closed.
  //
  // The chrome stops HERE rather than in the quit key, because quitting is
  // not the only way out. A caller who drops the line never presses Q, and
  // the rail's 20fps interval was left writing into a destroyed screen -
  // which is how a door takes the session with it. `destroy` fires for
  // every path; onClose below catches a teardown that never got this far.
  await new Promise<void>((resolve) => screen.on('destroy', () => {
    stopChrome();
    resolve();
  }));
});

door.onClose(async (ctx: DoorContext) => {
  // A disconnect can tear the door down without the screen ever emitting
  // `destroy`, so this is the second of the two doors out.
  stopChrome();

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
    state.speakersBox.setContent(`{${T.accentAlt}-fg}No other speakers connected{/${T.accentAlt}-fg}`);
  } else {
    let content = '';
    for (const speaker of speakers) {
      const speakingIndicator = speaker.isSpeaking ? `{${T.ok}-fg}[SPEAKING]{/${T.ok}-fg}` : `{${T.dim}-fg}[IDLE]{/${T.dim}-fg}`;
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
    content = `{${T.alert}-fg}{bold}MUTED{/bold}{/${T.alert}-fg}\n\n`;
    content += `{${T.dim}-fg}Audio input disabled{/${T.dim}-fg}`;
  } else if (state.isStreaming) {
    // Audio level bar
    const bar = renderAudioBar(audioLevel);
    content = `{${T.accent}-fg}Input Level:{/${T.accent}-fg}\n${bar}\n\n`;

    // Simple waveform (just show last few samples)
    if (waveform.length > 0) {
      content += `{${T.accent}-fg}Waveform:{/${T.accent}-fg}\n`;
      const samples = waveform.slice(-30);
      for (const sample of samples) {
        const height = Math.floor(Math.abs(sample) * 10);
        content += height > 0 ? `{${T.ok}-fg}|{/${T.ok}-fg}` : `{${T.dim}-fg}·{/${T.dim}-fg}`;
      }
    }

    const isSpeaking = audioLevel > 0.01;
    if (isSpeaking) {
      content += `\n\n{${T.ok}-fg}{bold}SPEAKING{/bold}{/${T.ok}-fg}`;
    } else {
      content += `\n\n{${T.dim}-fg}Idle{/${T.dim}-fg}`;
    }
  } else {
    content = `{${T.accentAlt}-fg}Not streaming{/${T.accentAlt}-fg}`;
  }

  state.waveformBox.setContent(content);
  state.screen.render();
}

async function toggleStreaming(ctx: DoorContext, state: AppState): Promise<void> {
  if (!ctx.socket) {
    updateStatus(state, `{${T.alert}-fg}Error: Socket not available{/${T.alert}-fg}`);
    return;
  }

  try {
    if (state.isStreaming) {
      // Stop streaming - emit to client
      ctx.socket.emit('audio:stop-streaming');
      state.isStreaming = false;
      state.isMuted = false;
      updateStatus(state, `{${T.accentAlt}-fg}Stopped streaming{/${T.accentAlt}-fg}`);
      updateWaveform(state, { input: 0, output: 0 });
      updateQualityDisplay(state);
    } else {
      // Start streaming - emit to client with quality settings
      updateStatus(state, `{${T.accentAlt}-fg}Starting audio stream...{/${T.accentAlt}-fg}`);

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
        `{${T.ok}-fg}Streaming active{/${T.ok}-fg}\n` +
        `Stream ID: ${streamId.substring(0, 8)}...\n` +
        `Quality: ${audioProfile?.name || 'High'} (${(audioOptions.bitrate || 32000) / 1000}kbps)`
      );
      updateQualityDisplay(state);
    }
  } catch (error: any) {
    updateStatus(state, `{${T.alert}-fg}Error: ${error.message}{/${T.alert}-fg}`);
  }
}

async function toggleMute(ctx: DoorContext, state: AppState): Promise<void> {
  if (!state.isStreaming || !ctx.socket) {
    updateStatus(state, `{${T.accentAlt}-fg}Not streaming - cannot mute{/${T.accentAlt}-fg}`);
    return;
  }

  try {
    state.isMuted = !state.isMuted;

    // Emit to client (browser) to mute/unmute
    ctx.socket.emit('audio:mute', { muted: state.isMuted });

    if (state.isMuted) {
      updateStatus(state, `{${T.alert}-fg}Microphone MUTED{/${T.alert}-fg}`);
    } else {
      updateStatus(state, `{${T.ok}-fg}Microphone UNMUTED{/${T.ok}-fg}`);
    }

    updateWaveform(state, { input: state.isMuted ? 0 : state.myAudioLevel, output: 0 });
  } catch (error: any) {
    updateStatus(state, `{${T.alert}-fg}Error: ${error.message}{/${T.alert}-fg}`);
  }
}

async function listActiveSpeakers(ctx: DoorContext, state: AppState): Promise<void> {
  // List speakers from our local state (populated by socket events)
  const speakers = Array.from(state.speakers.values());

  let content = `{${T.accent}-fg}Active Speakers:{/${T.accent}-fg} ${speakers.length + (state.isStreaming ? 1 : 0)}\n\n`;

  // Add self if streaming
  if (state.isStreaming) {
    const status = state.myAudioLevel > 0.01 ? `{${T.ok}-fg}SPEAKING{/${T.ok}-fg}` : `{${T.dim}-fg}IDLE{/${T.dim}-fg}`;
    const level = Math.floor(state.myAudioLevel * 100);
    content += `{${T.accentAlt}-fg}[YOU]{/${T.accentAlt}-fg} ${ctx.user.username || 'You'} ${status}\n`;
    content += `  Audio Level: ${level}%\n\n`;
  }

  // Add other speakers
  for (const speaker of speakers) {
    const status = speaker.isSpeaking ? `{${T.ok}-fg}SPEAKING{/${T.ok}-fg}` : `{${T.dim}-fg}IDLE{/${T.dim}-fg}`;
    const level = Math.floor(speaker.audioLevel * 100);
    content += `${speaker.username} ${status}\n`;
    content += `  Audio Level: ${level}%\n\n`;
  }

  if (speakers.length === 0 && !state.isStreaming) {
    content += `{${T.accentAlt}-fg}No active speakers{/${T.accentAlt}-fg}\n`;
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
    state.networkBox.setContent(`{${T.accentAlt}-fg}Measuring network quality...{/${T.accentAlt}-fg}`);
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
  content += `RTT: {${T.accent}-fg}${Math.floor(metrics.rtt)}ms{/${T.accent}-fg} `;
  content += `Loss: {${T.accent}-fg}${metrics.packetLoss.toFixed(1)}%{/${T.accent}-fg}\n`;
  content += `Jitter: {${T.accent}-fg}${Math.floor(metrics.jitter)}ms{/${T.accent}-fg} `;
  content += `BW: {${T.accent}-fg}${Math.floor(metrics.bandwidth)}kbps{/${T.accent}-fg}\n`;
  content += `Score: {${T.accent}-fg}${Math.floor(rec.quality)}%{/${T.accent}-fg}`;

  state.networkBox.setContent(content);
  state.screen.render();
}

function updateQualityDisplay(state: AppState): void {
  if (!state.qualityBox || !state.qualityManager) {
    return;
  }

  if (!state.isStreaming) {
    state.qualityBox.setContent(`{${T.accentAlt}-fg}Not streaming{/${T.accentAlt}-fg}`);
    state.screen.render();
    return;
  }

  const audioProfile = state.qualityManager.getAudioProfile();
  const isAuto = state.qualityManager.isAutoAdjustEnabled();

  let content = '';
  content += `{${T.accent}-fg}Audio:{/${T.accent}-fg} {bold}${audioProfile.name}{/bold}\n`;
  content += `  Bitrate: ${audioProfile.bitrate / 1000}kbps\n`;
  content += `  Sample Rate: ${audioProfile.sampleRate / 1000}kHz\n`;
  content += `  Quality: ${audioProfile.quality}\n\n`;
  content += `{${T.accent}-fg}Auto-Adjust:{/${T.accent}-fg} `;
  content += isAuto ? `{${T.ok}-fg}ON{/${T.ok}-fg}` : `{${T.accentAlt}-fg}OFF{/${T.accentAlt}-fg}`;

  state.qualityBox.setContent(content);
  state.screen.render();
}

function toggleAutoQuality(state: AppState): void {
  if (!state.qualityManager) {
    return;
  }

  if (state.qualityManager.isAutoAdjustEnabled()) {
    state.qualityManager.disableAutoAdjust();
    updateStatus(state, `{${T.accentAlt}-fg}Auto-quality adjustment disabled{/${T.accentAlt}-fg}`);
  } else {
    state.qualityManager.enableAutoAdjust();
    updateStatus(state, `{${T.ok}-fg}Auto-quality adjustment enabled{/${T.ok}-fg}`);
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
    updateStatus(state, `{${T.accentAlt}-fg}Already at ` + (direction === 'up' ? 'maximum' : 'minimum') + ` quality{/${T.accentAlt}-fg}`);
    return;
  }

  const newProfile = audioProfiles[newIndex];
  state.qualityManager.setAudioQuality(newProfile);
  updateStatus(state, `{${T.accent}-fg}Quality manually set to: ${newProfile}{/${T.accent}-fg}`);
  updateQualityDisplay(state);
}

export default door;
