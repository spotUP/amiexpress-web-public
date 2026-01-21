# Adaptive Quality Management - Voice Chat Door

This door demonstrates the new adaptive quality management features for audio streaming.

## Features

### Network Quality Monitoring
- Real-time RTT (round-trip time) measurement via ping/pong
- Packet loss detection
- Jitter calculation
- Bandwidth estimation
- Quality score (0-100%) calculation

### Adaptive Audio Quality
- 5 quality tiers: Studio, High, Medium, Low, Emergency
- Automatic quality adjustment based on network conditions
- Manual quality override
- Smooth quality transitions with 3-second debouncing

### Visual Feedback
- Network quality panel showing:
  - Connection status with colored indicators
  - RTT, packet loss, jitter, bandwidth metrics
  - Overall quality score
- Quality profile panel showing:
  - Current audio profile
  - Bitrate and sample rate
  - Auto-adjust status

## Quality Profiles

### Audio Quality Tiers

| Profile | Bitrate | Sample Rate | Bandwidth | Use Case |
|---------|---------|-------------|-----------|----------|
| Studio | 64kbps | 48kHz | 8 KB/s | Music/broadcast quality |
| High Voice | 32kbps | 48kHz | 4 KB/s | Excellent voice quality |
| Voice | 16kbps | 48kHz | 2 KB/s | Good voice quality |
| Telephone | 8kbps | 16kHz | 1 KB/s | Telephone quality |
| Emergency | 6kbps | 16kHz | 0.75 KB/s | Barely intelligible |

### Network Quality Thresholds

| Status | Quality Score | Audio Profile | Video Profile |
|--------|--------------|---------------|---------------|
| Excellent | 80-100% | Studio | Ultra |
| Good | 60-79% | High | High |
| Fair | 40-59% | Medium | Medium |
| Poor | 20-39% | Low | Low |
| Critical | 0-19% | Emergency | Potato |

## Controls

- **[S]** - Start/Stop streaming
- **[M]** - Mute/Unmute microphone
- **[A]** - Toggle auto-quality adjustment ON/OFF
- **[+/-]** - Manually increase/decrease quality
- **[L]** - List all active speakers
- **[Q]** - Quit voice chat

## How It Works

### Automatic Quality Adjustment

1. **Network Monitoring** - Continuously measures connection quality
   - Sends ping every 2 seconds
   - Tracks RTT, packet loss, and jitter
   - Calculates quality score based on metrics

2. **Quality Recommendations** - Generates recommendations based on score
   - Quality score factors in RTT, packet loss, and jitter
   - Debounces changes (3-second delay) to prevent oscillation
   - Emits quality change events when profile changes

3. **Audio Adaptation** - Adjusts bitrate and sample rate
   - Excellent (80%+): 64kbps @ 48kHz
   - Good (60-79%): 32kbps @ 48kHz
   - Fair (40-59%): 16kbps @ 48kHz
   - Poor (20-39%): 8kbps @ 16kHz
   - Critical (<20%): 6kbps @ 16kHz

### Manual Override

Users can disable auto-adjustment and manually control quality:
- Press **[A]** to toggle auto-adjustment ON/OFF
- When OFF, use **[+]** to increase quality
- Use **[-]** to decrease quality
- Quality changes take effect on next stream start

## Implementation Details

### Network Quality Monitor

```typescript
const networkMonitor = new NetworkQualityMonitor(socket);
networkMonitor.start();

networkMonitor.on('metrics-update', (metrics) => {
  // Display RTT, packet loss, jitter, bandwidth
});

networkMonitor.on('recommendation', (rec) => {
  // Get recommended quality profiles
});
```

### Adaptive Quality Manager

```typescript
const qualityManager = new AdaptiveQualityManager(networkMonitor);

// Get current audio profile
const audioProfile = qualityManager.getAudioProfile();

// Get audio stream options
const options = qualityManager.getAudioStreamOptions();
await ctx.audio.startStreaming(options);

// Manual control
qualityManager.setAudioQuality('high');
qualityManager.enableAutoAdjust();
qualityManager.disableAutoAdjust();
```

## Benefits

1. **Better User Experience**
   - Graceful degradation on slow connections
   - No audio dropouts or stuttering
   - Smooth quality transitions

2. **Server Optimization**
   - Reduced bandwidth usage on poor connections
   - Lower server CPU overhead
   - Better scalability for multi-user sessions

3. **Transparency**
   - Real-time quality metrics visible to users
   - Clear indication of network status
   - User control over quality preferences

## Testing Recommendations

1. **Good Connection**
   - Should default to High or Studio quality
   - Network panel shows green status
   - RTT < 100ms, no packet loss

2. **Simulated Poor Connection**
   - Use browser DevTools network throttling
   - Should automatically downgrade to Medium/Low
   - Network panel shows yellow/red status

3. **Manual Override**
   - Disable auto-quality with [A]
   - Use [+/-] to force higher/lower quality
   - Verify quality doesn't auto-change

4. **Quality Transitions**
   - Watch for smooth transitions (3-second debounce)
   - No audio glitches during quality changes
   - Status messages show reason for changes

## Future Enhancements

Potential improvements for adaptive quality:
- Video quality adaptation (ASCII resolution, FPS, color depth)
- Per-user quality preferences saved to profile
- Historical quality tracking and analytics
- Predictive quality adjustment based on patterns
- Bandwidth usage graphs and statistics
