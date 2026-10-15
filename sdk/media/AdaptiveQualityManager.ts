/**
 * Adaptive Quality Manager
 *
 * Automatically adjusts audio and video quality based on network conditions
 */

import { EventEmitter } from 'events';
import type { NetworkQualityMonitor, QualityRecommendation } from './NetworkQualityMonitor';
import type { AudioStreamOptions } from '../core/types';

export interface VideoQualityProfile {
  name: string;
  captureWidth: number;
  captureHeight: number;
  asciiWidth: number;
  asciiHeight: number;
  fps: number;
  colored: boolean;
  compressionQuality: number;
}

export interface AudioQualityProfile {
  name: string;
  bitrate: number;
  sampleRate: 16000 | 48000;
  bandwidth: number;
  quality: string;
}

/**
 * Predefined video quality profiles
 */
export const VIDEO_QUALITY_PROFILES: Record<string, VideoQualityProfile> = {
  ultra: {
    name: 'Ultra',
    captureWidth: 160,
    captureHeight: 120,
    asciiWidth: 80,
    asciiHeight: 24,
    fps: 15,
    colored: true,
    compressionQuality: 0.9,
  },

  high: {
    name: 'High',
    captureWidth: 96,
    captureHeight: 72,
    asciiWidth: 48,
    asciiHeight: 18,
    fps: 10,
    colored: true,
    compressionQuality: 0.7,
  },

  medium: {
    name: 'Medium',
    captureWidth: 80,
    captureHeight: 60,
    asciiWidth: 40,
    asciiHeight: 15,
    fps: 8,
    colored: true,
    compressionQuality: 0.5,
  },

  low: {
    name: 'Low',
    captureWidth: 64,
    captureHeight: 48,
    asciiWidth: 32,
    asciiHeight: 12,
    fps: 5,
    colored: false,
    compressionQuality: 0.3,
  },

  potato: {
    name: 'Potato',
    captureWidth: 40,
    captureHeight: 30,
    asciiWidth: 20,
    asciiHeight: 10,
    fps: 2,
    colored: false,
    compressionQuality: 0.1,
  },
};

/**
 * Predefined audio quality profiles
 */
export const AUDIO_QUALITY_PROFILES: Record<string, AudioQualityProfile> = {
  studio: {
    name: 'Studio',
    bitrate: 64000,
    sampleRate: 48000,
    bandwidth: 8,
    quality: 'Music/broadcast quality',
  },

  high: {
    name: 'High Voice',
    bitrate: 32000,
    sampleRate: 48000,
    bandwidth: 4,
    quality: 'Excellent voice quality',
  },

  medium: {
    name: 'Voice',
    bitrate: 16000,
    sampleRate: 48000,
    bandwidth: 2,
    quality: 'Good voice quality',
  },

  low: {
    name: 'Telephone',
    bitrate: 8000,
    sampleRate: 16000,
    bandwidth: 1,
    quality: 'Telephone quality',
  },

  emergency: {
    name: 'Emergency',
    bitrate: 6000,
    sampleRate: 16000,
    bandwidth: 0.75,
    quality: 'Barely intelligible',
  },
};

export interface QualityChangeEvent {
  type: 'video' | 'audio';
  from: string;
  to: string;
  reason: string;
  automatic: boolean;
}

/**
 * Manages adaptive quality adjustment for audio and video
 */
export class AdaptiveQualityManager extends EventEmitter {
  private networkMonitor: NetworkQualityMonitor;
  private currentVideoProfile: string = 'high';
  private currentAudioProfile: string = 'high';
  private manualOverride: boolean = false;
  private changeDebounce: NodeJS.Timeout | null = null;

  constructor(networkMonitor: NetworkQualityMonitor) {
    super();
    this.networkMonitor = networkMonitor;

    // Listen for recommendations
    this.networkMonitor.on('recommendation', (rec: QualityRecommendation) => {
      this.handleRecommendation(rec);
    });
  }

  /**
   * Get current video quality profile
   */
  getVideoProfile(): VideoQualityProfile {
    return VIDEO_QUALITY_PROFILES[this.currentVideoProfile];
  }

  /**
   * Get current audio quality profile
   */
  getAudioProfile(): AudioQualityProfile {
    return AUDIO_QUALITY_PROFILES[this.currentAudioProfile];
  }

  /**
   * Get audio stream options from current profile
   */
  getAudioStreamOptions(): AudioStreamOptions {
    const profile = this.getAudioProfile();
    return {
      codec: 'opus',
      sampleRate: profile.sampleRate,
      bitrate: profile.bitrate,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
      visualize: true,
    };
  }

  /**
   * Manually set video quality (disables auto-adjustment)
   */
  setVideoQuality(profile: string): void {
    if (!VIDEO_QUALITY_PROFILES[profile]) {
      throw new Error(`Unknown video profile: ${profile}`);
    }

    const oldProfile = this.currentVideoProfile;
    this.currentVideoProfile = profile;
    this.manualOverride = true;

    this.emit('quality-change', {
      type: 'video',
      from: oldProfile,
      to: profile,
      reason: 'Manual override',
      automatic: false,
    } as QualityChangeEvent);
  }

  /**
   * Manually set audio quality (disables auto-adjustment)
   */
  setAudioQuality(profile: string): void {
    if (!AUDIO_QUALITY_PROFILES[profile]) {
      throw new Error(`Unknown audio profile: ${profile}`);
    }

    const oldProfile = this.currentAudioProfile;
    this.currentAudioProfile = profile;
    this.manualOverride = true;

    this.emit('quality-change', {
      type: 'audio',
      from: oldProfile,
      to: profile,
      reason: 'Manual override',
      automatic: false,
    } as QualityChangeEvent);
  }

  /**
   * Enable automatic quality adjustment
   */
  enableAutoAdjust(): void {
    this.manualOverride = false;
  }

  /**
   * Disable automatic quality adjustment
   */
  disableAutoAdjust(): void {
    this.manualOverride = true;
  }

  /**
   * Check if auto-adjustment is enabled
   */
  isAutoAdjustEnabled(): boolean {
    return !this.manualOverride;
  }

  /**
   * Handle network quality recommendation
   */
  private handleRecommendation(rec: QualityRecommendation): void {
    if (this.manualOverride) {
      return; // User has manual control
    }

    // Debounce quality changes (don't change too frequently)
    if (this.changeDebounce) {
      clearTimeout(this.changeDebounce);
    }

    this.changeDebounce = setTimeout(() => {
      this.applyRecommendation(rec);
    }, 3000); // Wait 3 seconds before applying
  }

  /**
   * Apply quality recommendation
   */
  private applyRecommendation(rec: QualityRecommendation): void {
    // Update video quality
    if (rec.videoProfile !== 'disabled' && rec.videoProfile !== this.currentVideoProfile) {
      const oldProfile = this.currentVideoProfile;
      this.currentVideoProfile = rec.videoProfile;

      this.emit('quality-change', {
        type: 'video',
        from: oldProfile,
        to: rec.videoProfile,
        reason: `Network quality: ${rec.status} (${Math.floor(rec.quality)}%)`,
        automatic: true,
      } as QualityChangeEvent);
    }

    // Update audio quality
    if (rec.audioProfile !== this.currentAudioProfile) {
      const oldProfile = this.currentAudioProfile;
      this.currentAudioProfile = rec.audioProfile;

      this.emit('quality-change', {
        type: 'audio',
        from: oldProfile,
        to: rec.audioProfile,
        reason: `Network quality: ${rec.status} (${Math.floor(rec.quality)}%)`,
        automatic: true,
      } as QualityChangeEvent);
    }
  }

  /**
   * Get bandwidth estimate for current quality settings
   */
  estimateBandwidth(): { audio: number; video: number; total: number } {
    const audioProfile = this.getAudioProfile();
    const videoProfile = this.getVideoProfile();

    // Video bandwidth estimation (very rough)
    // Colored ASCII: ~500 bytes per frame
    // Monochrome: ~150 bytes per frame
    const frameSizeBytes = videoProfile.colored ? 500 : 150;
    const videoBandwidth = (frameSizeBytes * videoProfile.fps * 8) / 1000; // Kbps

    // Audio bandwidth
    const audioBandwidth = audioProfile.bandwidth;

    return {
      audio: audioBandwidth,
      video: videoBandwidth,
      total: audioBandwidth + videoBandwidth,
    };
  }

  /**
   * Get quality summary for display
   */
  getQualitySummary(): string {
    const video = this.getVideoProfile();
    const audio = this.getAudioProfile();
    const bandwidth = this.estimateBandwidth();
    const metrics = this.networkMonitor.getMetrics();

    let summary = '';
    summary += `Video: ${video.name} (${video.asciiWidth}x${video.asciiHeight}, ${video.fps}fps)\n`;
    summary += `Audio: ${audio.name} (${audio.bitrate / 1000}kbps, ${audio.sampleRate / 1000}kHz)\n`;
    summary += `Bandwidth: ${bandwidth.total.toFixed(1)} Kbps\n`;

    if (metrics) {
      summary += `RTT: ${Math.floor(metrics.rtt)}ms, `;
      summary += `Loss: ${metrics.packetLoss.toFixed(1)}%\n`;
    }

    summary += `Auto-adjust: ${this.manualOverride ? 'OFF' : 'ON'}`;

    return summary;
  }
}
