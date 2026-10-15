import { SessionRecording, SessionEvent } from '../types';

export type { SessionRecording, SessionEvent };

/**
 * Session recorder class for managing terminal sessions
 */
export class SessionRecorder {
  private recording: SessionRecording | null = null;
  private startTime: number = 0;

  /**
   * Start a new recording session
   */
  startRecording(doorName: string): void {
    this.recording = {
      id: `session_${Date.now()}`,
      doorName,
      startTime: Date.now(),
      endTime: 0,
      events: [],
      metadata: {},
    };
    this.startTime = Date.now();
  }

  /**
   * Stop the current recording session
   */
  stopRecording(): SessionRecording | null {
    if (!this.recording) return null;

    this.recording.endTime = Date.now();
    const finalRecording = this.recording;
    this.recording = null;
    this.startTime = 0;

    return finalRecording;
  }

  /**
   * Add an event to the current recording
   */
  addEvent(type: 'input' | 'output', data: string, ansiData?: string): void {
    if (!this.recording) return;

    const event: SessionEvent = {
      type,
      timestamp: Date.now() - this.startTime,
      data,
      ansiData,
    };

    this.recording.events.push(event);
  }

  /**
   * Check if currently recording
   */
  isRecording(): boolean {
    return this.recording !== null;
  }

  /**
   * Get current recording
   */
  getCurrentRecording(): SessionRecording | null {
    return this.recording;
  }
}

/**
 * Export recording to JSON file
 */
export function exportRecording(recording: SessionRecording): void {
  const json = JSON.stringify(recording, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `${recording.doorName}_${recording.id}.json`;
  link.click();

  setTimeout(() => URL.revokeObjectURL(url), 100);
}

/**
 * Export recording to plain text log
 */
export function exportRecordingAsText(recording: SessionRecording): void {
  const lines: string[] = [
    `Session Recording: ${recording.doorName}`,
    `Started: ${new Date(recording.startTime).toISOString()}`,
    `Ended: ${new Date(recording.endTime).toISOString()}`,
    `Duration: ${((recording.endTime - recording.startTime) / 1000).toFixed(2)}s`,
    `Events: ${recording.events.length}`,
    '',
    '--- Session Log ---',
    '',
  ];

  for (const event of recording.events) {
    const timestamp = (event.timestamp / 1000).toFixed(3);
    const type = event.type.toUpperCase();
    const data = event.data.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    lines.push(`[${timestamp}s] ${type}: ${data}`);
  }

  const text = lines.join('\n');
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `${recording.doorName}_${recording.id}.txt`;
  link.click();

  setTimeout(() => URL.revokeObjectURL(url), 100);
}

/**
 * Import recording from JSON file
 */
export async function importRecording(file: File): Promise<SessionRecording | null> {
  try {
    const text = await file.text();
    const recording: SessionRecording = JSON.parse(text);

    // Validate recording structure
    if (!recording.id || !recording.doorName || !recording.events) {
      throw new Error('Invalid recording format');
    }

    return recording;
  } catch (error) {
    console.error('Failed to import recording:', error);
    return null;
  }
}

/**
 * Playback controller for session recordings
 */
export class PlaybackController {
  private recording: SessionRecording | null = null;
  private currentEventIndex: number = 0;
  private playbackSpeed: number = 1.0;
  private playing: boolean = false;
  private timeoutId: number | null = null;
  private onEvent: ((event: SessionEvent) => void) | null = null;
  private onComplete: (() => void) | null = null;

  /**
   * Load a recording for playback
   */
  loadRecording(recording: SessionRecording): void {
    this.stop();
    this.recording = recording;
    this.currentEventIndex = 0;
  }

  /**
   * Start or resume playback
   */
  play(onEvent: (event: SessionEvent) => void, onComplete?: () => void): void {
    if (!this.recording || this.playing) return;

    this.playing = true;
    this.onEvent = onEvent;
    this.onComplete = onComplete || null;
    this.playNextEvent();
  }

  /**
   * Pause playback
   */
  pause(): void {
    this.playing = false;
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  /**
   * Stop playback and reset
   */
  stop(): void {
    this.pause();
    this.currentEventIndex = 0;
  }

  /**
   * Seek to specific timestamp
   */
  seek(timestamp: number): void {
    if (!this.recording) return;

    // Find the event closest to the timestamp
    let index = 0;
    for (let i = 0; i < this.recording.events.length; i++) {
      if (this.recording.events[i].timestamp <= timestamp) {
        index = i;
      } else {
        break;
      }
    }

    this.currentEventIndex = index;
  }

  /**
   * Set playback speed
   */
  setSpeed(speed: number): void {
    this.playbackSpeed = Math.max(0.1, Math.min(10, speed));
  }

  /**
   * Get current playback position
   */
  getCurrentTimestamp(): number {
    if (!this.recording || this.currentEventIndex >= this.recording.events.length) {
      return 0;
    }
    return this.recording.events[this.currentEventIndex].timestamp;
  }

  /**
   * Check if playback is active
   */
  isPlaying(): boolean {
    return this.playing;
  }

  /**
   * Play next event in the recording
   */
  private playNextEvent(): void {
    if (!this.recording || !this.playing || !this.onEvent) return;

    if (this.currentEventIndex >= this.recording.events.length) {
      this.playing = false;
      this.onComplete?.();
      return;
    }

    const currentEvent = this.recording.events[this.currentEventIndex];
    this.onEvent(currentEvent);
    this.currentEventIndex++;

    // Schedule next event
    if (this.currentEventIndex < this.recording.events.length) {
      const nextEvent = this.recording.events[this.currentEventIndex];
      const delay = (nextEvent.timestamp - currentEvent.timestamp) / this.playbackSpeed;
      this.timeoutId = setTimeout(() => this.playNextEvent(), delay) as unknown as number;
    } else {
      this.playing = false;
      this.onComplete?.();
    }
  }
}
