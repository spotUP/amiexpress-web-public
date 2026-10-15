/**
 * Media Module Exports
 *
 * Network quality monitoring and adaptive quality management for audio/video streaming
 */

export { Audio } from './Audio';
export { VoiceCapture, type VoiceCaptureOptions } from './VoiceCapture';
export { Video } from './Video';

export {
  NetworkQualityMonitor,
  type NetworkMetrics,
  type QualityRecommendation,
  type NetworkQualityOptions,
} from './NetworkQualityMonitor';

export {
  AdaptiveQualityManager,
  VIDEO_QUALITY_PROFILES,
  AUDIO_QUALITY_PROFILES,
  type VideoQualityProfile,
  type AudioQualityProfile,
  type QualityChangeEvent,
} from './AdaptiveQualityManager';
