/**
 * Media Module Exports
 *
 * Network quality monitoring and adaptive quality management for audio/video streaming
 */

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
