# BBS Dashboard - Real API Integration

## Overview

The BBS Dashboard has been upgraded from using mock/demo data to fetching real-time statistics from the BBS system. It now supports three API endpoints with automatic fallback to demo data if the APIs are not yet implemented.

## API Endpoints Required

### 1. `bbs.getStats()` - BBS Statistics

**Expected Return:**
```typescript
{
  totalUsers: number;      // Total registered users
  activeUsers: number;     // Currently online users
  totalMessages: number;   // Total messages in all conferences
  totalFiles: number;      // Total files in all areas
  totalCalls: number;      // Total system calls/logins
  systemUptime: number;    // System uptime in seconds
}
```

**Fallback Behavior:**
- Uses `ctx.user` data if available
- Returns default values (0 or 1) if API unavailable

**Usage:**
- Called on dashboard startup
- Refreshed every 3 seconds

---

### 2. `bbs.getNodeStatus()` - Multi-Node Status

**Expected Return:**
```typescript
[
  {
    id: number;          // Node ID (1-4)
    nodeId: number;      // Alternative field name
    user: string;        // Username or empty string
    username: string;    // Alternative field name
    status: string;      // "Active" | "Idle" | "Offline"
    location: string;    // Current activity
    activity: string;    // Alternative field name
  },
  // ... more nodes
]
```

**Fallback Behavior:**
- Returns single entry with current user's node
- Shows current user as "Active" in "Dashboard"

**Mapping:**
- Accepts flexible field names (id/nodeId, user/username, location/activity)
- Status defaults to "Idle" if not provided
- Location defaults to "Unknown" if not provided

---

### 3. `bbs.getSystemStats()` - System Resources

**Expected Return:**
```typescript
{
  cpuUsage: number;     // CPU usage percentage (0-100)
  memoryUsage: number;  // Memory usage percentage (0-100)
  diskUsage: number;    // Disk usage percentage (0-100)
}
```

**Fallback Behavior:**
- Returns randomized demo values:
  - CPU: 20-60%
  - Memory: 50-80%
  - Disk: 67%

**Usage:**
- Called on every render (every 3 seconds)
- Can be CPU-intensive, consider caching

---

## Implementation Status

### ✅ Completed Changes

1. **Removed Hardcoded Data**
   - Initial stats now start at 0
   - All mock data replaced with API calls

2. **Added Three Fetch Methods**
   - `fetchBBSStats()` - Gets user/message/file counts
   - `fetchNodeStatus()` - Gets multi-node information
   - `fetchSystemStats()` - Gets CPU/memory/disk usage

3. **Graceful Degradation**
   - All methods have try-catch error handling
   - Falls back to sensible defaults if APIs unavailable
   - Uses `as any` type assertions for optional APIs

4. **Async Rendering**
   - `renderDashboard()` is now async
   - Properly awaited in startup and refresh intervals
   - Non-blocking in resize handler (with error catching)

### 🔧 Backend Integration Required

To enable real data, the backend needs to implement these methods on the `BBSApi` object:

**Location:** `web/backend/src/services/bbs-api.ts` (or equivalent)

```typescript
class BBSApi {
  async getStats(): Promise<BBSStats> {
    // Fetch from database:
    // - Count users from users table
    // - Count active sessions
    // - Count messages from message_base
    // - Count files from file database
    // - Get total calls from call log
    // - Calculate uptime from process.uptime()

    return {
      totalUsers: await db.countUsers(),
      activeUsers: sessions.getActiveCount(),
      totalMessages: await db.countMessages(),
      totalFiles: await db.countFiles(),
      totalCalls: await db.countCalls(),
      systemUptime: process.uptime()
    };
  }

  async getNodeStatus(): Promise<NodeInfo[]> {
    // Fetch from active sessions:
    // - Get all node sessions
    // - Map to node info format

    return sessions.getAllNodes().map(session => ({
      id: session.nodeId,
      user: session.user?.username || '',
      status: session.isActive ? 'Active' : 'Idle',
      location: session.currentActivity || 'Unknown'
    }));
  }

  async getSystemStats(): Promise<SystemStats> {
    // Fetch from OS:
    // - CPU usage via os.loadavg() or process.cpuUsage()
    // - Memory usage via os.totalmem() / os.freemem()
    // - Disk usage via filesystem stats

    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    return {
      cpuUsage: calculateCPUPercentage(),
      memoryUsage: Math.round(((totalMem - freeMem) / totalMem) * 100),
      diskUsage: await getDiskUsage()
    };
  }
}
```

---

## Testing

### With Mock Data (Current)
```bash
cd ~/Code/AmiExpress/amiexpress-web/Doors/bbs-dashboard
npm run build
# Dashboard will use fallback values and current user info
```

### With Real APIs (After Backend Implementation)
```typescript
// In backend, expose methods on DoorContext:
door.onStart(async (ctx: DoorContext) => {
  // ctx.bbs.getStats() should be available
  // ctx.bbs.getNodeStatus() should be available
  // ctx.bbs.getSystemStats() should be available
});
```

---

## Refresh Behavior

**Auto-Refresh Interval:** 3 seconds

**What Refreshes:**
- BBS Stats (users, messages, files, calls)
- Node Status (all nodes)
- System Stats (CPU, memory, disk)
- System Uptime (incremented locally)

**Performance Considerations:**
- All fetches are async and non-blocking
- Errors are silently caught to prevent crashes
- Resize handler doesn't await render to prevent lag
- Stats validation prevents unbounded growth

---

## Migration Notes

**Breaking Changes:** None - graceful fallback ensures compatibility

**API Contract:**
- All API methods are optional
- Type checking via `typeof === 'function'` before calling
- All responses validated before use
- Flexible field name mapping (id/nodeId, user/username, etc.)

**Backward Compatibility:**
- Works without any backend changes (uses fallback data)
- Can implement APIs incrementally (one at a time)
- Partial API support is fine (e.g., only getStats implemented)

---

## Future Enhancements

1. **Caching:** Cache system stats for 1-2 seconds to reduce CPU overhead
2. **WebSocket:** Real-time updates instead of polling
3. **Historical Data:** Graphs showing trends over time
4. **Alerts:** Highlight critical resource usage (>90% CPU/memory)
5. **Customization:** User-configurable refresh intervals
6. **More Metrics:** Network I/O, door activity, file transfers

---

## Files Modified

- `index.ts` - Added API integration methods and async rendering
- `API_INTEGRATION.md` - This documentation file

**Build Status:** ✅ Compiles successfully with TypeScript strict mode
