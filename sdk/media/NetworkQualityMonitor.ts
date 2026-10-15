/**
 * Network Quality Monitor
 *
 * Monitors connection quality and provides recommendations for
 * adaptive quality adjustment for audio/video streaming.
 */

import { EventEmitter } from 'events';

export interface NetworkMetrics {
  /** Round-trip time in milliseconds */
  rtt: number;

  /** Packet loss percentage (0-100) */
  packetLoss: number;

  /** Estimated bandwidth in Kbps */
  bandwidth: number;

  /** Jitter in milliseconds */
  jitter: number;

  /** Timestamp of measurement */
  timestamp: number;
}

export interface QualityRecommendation {
  /** Overall quality level (0-100) */
  quality: number;

  /** Recommended video profile */
  videoProfile: 'ultra' | 'high' | 'medium' | 'low' | 'potato' | 'disabled';

  /** Recommended audio profile */
  audioProfile: 'studio' | 'high' | 'medium' | 'low' | 'emergency';

  /** Whether to enable/disable features */
  recommendations: {
    enableVideoColor: boolean;
    maxConcurrentSpeakers: number;
    videoFps: number;
    audioJitterBuffer: number;
  };

  /** Human-readable status */
  status: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';

  /** User-facing message */
  message: string;
}

export interface NetworkQualityOptions {
  /** Measurement interval in milliseconds */
  measurementInterval?: number;

  /** Number of samples to average */
  sampleSize?: number;

  /** Enable automatic quality adjustment */
  autoAdjust?: boolean;
}

/**
 * Monitors network quality and provides adaptive recommendations
 */
export class NetworkQualityMonitor extends EventEmitter {
  private metrics: NetworkMetrics[] = [];
  private pingInterval: NodeJS.Timeout | null = null;
  private sequenceNumber = 0;
  private pendingPings = new Map<number, number>();
  private options: Required<NetworkQualityOptions>;
  private socket: any;

  constructor(socket: any, options: NetworkQualityOptions = {}) {
    super();

    this.socket = socket;
    this.options = {
      measurementInterval: options.measurementInterval || 2000,
      sampleSize: options.sampleSize || 10,
      autoAdjust: options.autoAdjust !== false,
    };

    this.setupListeners();
  }

  /**
   * Start monitoring network quality
   */
  start(): void {
    if (this.pingInterval) {
      return;
    }

    // Send ping every interval
    this.pingInterval = setInterval(() => {
      this.sendPing();
    }, this.options.measurementInterval);

    // Send initial ping
    this.sendPing();
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Get current network metrics (averaged)
   */
  getMetrics(): NetworkMetrics | null {
    if (this.metrics.length === 0) {
      return null;
    }

    const recent = this.metrics.slice(-this.options.sampleSize);

    return {
      rtt: this.average(recent.map((m) => m.rtt)),
      packetLoss: this.average(recent.map((m) => m.packetLoss)),
      bandwidth: this.average(recent.map((m) => m.bandwidth)),
      jitter: this.calculateJitter(recent),
      timestamp: Date.now(),
    };
  }

  /**
   * Get quality recommendation based on current metrics
   */
  getRecommendation(): QualityRecommendation | null {
    const metrics = this.getMetrics();
    if (!metrics) {
      return null;
    }

    // Calculate quality score (0-100)
    let quality = 100;

    // RTT impact (0-300ms is acceptable)
    if (metrics.rtt > 300) {
      quality -= Math.min(50, (metrics.rtt - 300) / 10);
    }

    // Packet loss impact
    quality -= metrics.packetLoss * 5;

    // Jitter impact
    if (metrics.jitter > 30) {
      quality -= Math.min(20, (metrics.jitter - 30) / 2);
    }

    quality = Math.max(0, Math.min(100, quality));

    // Determine profiles based on quality score
    let videoProfile: QualityRecommendation['videoProfile'];
    let audioProfile: QualityRecommendation['audioProfile'];
    let status: QualityRecommendation['status'];
    let message: string;

    if (quality >= 80) {
      videoProfile = 'ultra';
      audioProfile = 'studio';
      status = 'excellent';
      message = 'Excellent connection - Maximum quality available';
    } else if (quality >= 60) {
      videoProfile = 'high';
      audioProfile = 'high';
      status = 'good';
      message = 'Good connection - High quality recommended';
    } else if (quality >= 40) {
      videoProfile = 'medium';
      audioProfile = 'medium';
      status = 'fair';
      message = 'Fair connection - Medium quality recommended';
    } else if (quality >= 20) {
      videoProfile = 'low';
      audioProfile = 'low';
      status = 'poor';
      message = 'Poor connection - Low quality recommended';
    } else {
      videoProfile = 'potato';
      audioProfile = 'emergency';
      status = 'critical';
      message = 'Critical connection - Minimum quality only';
    }

    // Additional recommendations
    const recommendations = {
      enableVideoColor: quality >= 40,
      maxConcurrentSpeakers: quality >= 60 ? 10 : quality >= 40 ? 5 : 3,
      videoFps: quality >= 80 ? 15 : quality >= 60 ? 10 : quality >= 40 ? 8 : quality >= 20 ? 5 : 2,
      audioJitterBuffer: quality >= 60 ? 50 : quality >= 40 ? 100 : 150,
    };

    return {
      quality,
      videoProfile,
      audioProfile,
      recommendations,
      status,
      message,
    };
  }

  /**
   * Set up socket listeners
   */
  private setupListeners(): void {
    this.socket.on('network-pong', (data: { seq: number; serverTime: number }) => {
      this.handlePong(data);
    });
  }

  /**
   * Send ping to server
   */
  private sendPing(): void {
    const seq = this.sequenceNumber++;
    const clientTime = Date.now();

    this.pendingPings.set(seq, clientTime);
    this.socket.emit('network-ping', { seq, clientTime });

    // Timeout after 5 seconds (assume packet lost)
    setTimeout(() => {
      if (this.pendingPings.has(seq)) {
        this.pendingPings.delete(seq);
        this.recordPacketLoss();
      }
    }, 5000);
  }

  /**
   * Handle pong from server
   */
  private handlePong(data: { seq: number; serverTime: number }): void {
    const sendTime = this.pendingPings.get(data.seq);
    if (!sendTime) {
      return; // Already timed out
    }

    this.pendingPings.delete(data.seq);

    const now = Date.now();
    const rtt = now - sendTime;

    // Estimate bandwidth based on RTT (rough approximation)
    // Lower RTT typically means higher bandwidth capability
    const bandwidth = this.estimateBandwidth(rtt);

    const metric: NetworkMetrics = {
      rtt,
      packetLoss: this.calculatePacketLoss(),
      bandwidth,
      jitter: 0, // Calculated from multiple samples
      timestamp: now,
    };

    this.metrics.push(metric);

    // Keep only recent samples
    if (this.metrics.length > this.options.sampleSize * 2) {
      this.metrics = this.metrics.slice(-this.options.sampleSize * 2);
    }

    // Emit update event
    this.emit('metrics-update', this.getMetrics());

    // Check if recommendation changed
    const recommendation = this.getRecommendation();
    if (recommendation) {
      this.emit('recommendation', recommendation);

      // Auto-adjust if enabled
      if (this.options.autoAdjust) {
        this.emit('auto-adjust', recommendation);
      }
    }
  }

  /**
   * Record packet loss event
   */
  private recordPacketLoss(): void {
    // Add a metric with high packet loss indicator
    this.metrics.push({
      rtt: 5000, // Max timeout
      packetLoss: 100, // Lost packet
      bandwidth: 0,
      jitter: 0,
      timestamp: Date.now(),
    });
  }

  /**
   * Calculate current packet loss percentage
   */
  private calculatePacketLoss(): number {
    const recent = this.metrics.slice(-this.options.sampleSize);
    if (recent.length === 0) {
      return 0;
    }

    const lostPackets = recent.filter((m) => m.packetLoss === 100).length;
    return (lostPackets / recent.length) * 100;
  }

  /**
   * Calculate jitter from recent samples
   */
  private calculateJitter(samples: NetworkMetrics[]): number {
    if (samples.length < 2) {
      return 0;
    }

    const rtts = samples.map((m) => m.rtt);
    let sumDiff = 0;

    for (let i = 1; i < rtts.length; i++) {
      sumDiff += Math.abs(rtts[i] - rtts[i - 1]);
    }

    return sumDiff / (rtts.length - 1);
  }

  /**
   * Estimate bandwidth based on RTT
   */
  private estimateBandwidth(rtt: number): number {
    // Very rough estimation:
    // RTT < 50ms: Excellent (1000+ Kbps)
    // RTT 50-100ms: Good (500-1000 Kbps)
    // RTT 100-200ms: Fair (250-500 Kbps)
    // RTT 200-500ms: Poor (100-250 Kbps)
    // RTT > 500ms: Critical (< 100 Kbps)

    if (rtt < 50) return 1500;
    if (rtt < 100) return 750;
    if (rtt < 200) return 375;
    if (rtt < 500) return 175;
    return 50;
  }

  /**
   * Calculate average of array
   */
  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * Get connection quality as color
   */
  getQualityColor(): 'green' | 'yellow' | 'red' | 'gray' {
    const rec = this.getRecommendation();
    if (!rec) return 'gray';

    if (rec.status === 'excellent' || rec.status === 'good') return 'green';
    if (rec.status === 'fair') return 'yellow';
    return 'red';
  }

  /**
   * Get connection quality as emoji/symbol
   */
  getQualitySymbol(): string {
    const rec = this.getRecommendation();
    if (!rec) return '?';

    switch (rec.status) {
      case 'excellent': return '[***]';
      case 'good': return '[** ]';
      case 'fair': return '[*  ]';
      case 'poor': return '[!  ]';
      case 'critical': return '[X  ]';
      default: return '?';
    }
  }
}
