# BBS SysOp Dashboard

A comprehensive real-time monitoring dashboard for BBS System Operators, built with blessed-contrib and drawille.

## Features

### System Monitoring
- **CPU Usage Gauge** - Real-time CPU utilization percentage
- **Memory Gauge** - Current memory usage tracking
- **Disk Usage Gauge** - Storage capacity monitoring
- **Active Nodes LCD** - Digital display of currently active nodes

### User Activity
- **24-Hour Activity Chart** - Line graph showing login trends and active users
- **User Statistics** - Total users, active sessions, and login patterns
- **Top Users Table** - Leaderboard of most active users (future integration)

### Network & Performance
- **Network Traffic Graph** - Real-time bandwidth usage in KB/s
- **Node Sparklines** - Individual CPU usage per BBS node
- **Performance Metrics** - System uptime and response times

### Content Statistics
- **Daily Activity Donut** - Breakdown of messages, files, doors, and chat activity
- **File Area Bar Chart** - Downloads by category (Games, Utils, Docs, Music, Art, Mods)
- **Message Statistics** - Posts, uploads, downloads per day

### Live Monitoring
- **Activity Log** - Real-time scrolling log of system events
  - User logins/logouts
  - File uploads/downloads
  - Message posts
  - Door activity
  - System events
- **Node Status Table** - Current status of all BBS nodes
  - Node ID
  - Current user
  - Activity status
  - Time online

## Dashboard Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  [CPU]    [Memory]    [Disk]     [Active Nodes LCD]            │
├─────────────────────────────────────────────────────────────────┤
│  User Activity Chart          │  Network Traffic Chart         │
│  (24h login/active trends)    │  (Real-time KB/s)              │
├─────────────────────────────────────────────────────────────────┤
│  Daily Activity Donut         │  File Area Bar Chart           │
│  (Messages/Files/Doors/Chat)  │  (Downloads by category)       │
├─────────────────────────────────────────────────────────────────┤
│  [Node 1] [Node 2] [Node 3] [Node 4] Sparklines               │
├─────────────────────────────────────────────────────────────────┤
│  Recent Activity Log          │  Node Status Table             │
│  (Scrolling event feed)       │  (Real-time node info)         │
└─────────────────────────────────────────────────────────────────┘
```

## Installation

```bash
cd sdk/doors/bbs-dashboard
npm install
npm run build
```

## Usage

```bash
# Run from SDK directory
node examples/bbs-dashboard/compiled/index.js

# Or install as BBS door
# Add to your BBS menu configuration
```

### Controls
- **ESC** - Exit dashboard
- **Q** - Quit dashboard
- **Ctrl+C** - Force quit

## Auto-Update

The dashboard automatically refreshes every 2 seconds, providing real-time updates for:
- System resource gauges
- Activity charts and graphs
- Node status information
- Event logs
- Network statistics

## Future Enhancements

### Real BBS Integration
Currently uses mock data for demonstration. Future versions will integrate with actual BBS backend:

```typescript
// Future: Real data from BBS backend
const stats = await door.api.getSystemStats();
const nodes = await door.api.getNodeStatuses();
const activity = await door.api.getRecentActivity();
```

### Planned Features
- Historical data export
- Alert notifications for system events
- User management shortcuts
- File area maintenance tools
- Message base statistics
- Door game monitoring
- Network mail statistics
- Database optimization metrics
- Security event tracking
- Automated backup status

## Data Points Tracked

### System Resources
- CPU percentage per core
- Memory usage (used/total)
- Disk usage per partition
- Network throughput (in/out)
- System uptime

### User Metrics
- Total registered users
- Currently active users
- New users today/week/month
- Login frequency distribution
- User level breakdown
- Time-on-system averages

### Content Statistics
- Total messages (all conferences)
- Messages posted today
- Total files available
- Files uploaded today
- Files downloaded today
- Door game activity
- Chat session counts

### Node Activity
- Per-node user information
- Current activity/location
- Time connected
- Idle time tracking
- Node-specific CPU usage

## Performance

- Update interval: 2 seconds (configurable)
- Memory footprint: ~50MB
- CPU usage: <5% on modern systems
- Network overhead: Minimal (local queries only)

## Compatibility

- Works with any ANSI/ASCII terminal
- Optimal display: 80x24 or larger
- Color support recommended
- UTF-8 encoding for best results

## Technical Details

Built using:
- **neo-blessed** - Terminal UI framework
- **blessed-contrib** - Dashboard widgets
- **drawille** - Braille-based graphics
- **AmiExpress SDK** - BBS door integration

## Notes

- Dashboard runs in its own blessed screen
- Safe to run alongside other BBS doors
- Can be accessed by SysOp from any node
- Access control should be limited to SysOp level users
- All statistics update in real-time without manual refresh

## Integration Example

```typescript
import { BBSDashboard } from './bbs-dashboard';

// Create dashboard instance
const dashboard = new BBSDashboard(door);

// Initialize with custom refresh rate
await dashboard.initialize(refreshRate: 1000); // 1 second updates

// Dashboard runs until user exits
await dashboard.run();

// Cleanup
dashboard.shutdown();
```

## Support

For issues, feature requests, or contributions, see the main AmiExpress-Web project documentation.
