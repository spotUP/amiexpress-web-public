# Ultimate Live BBS Sysop Dashboard - Comprehensive Implementation Prompt

## Mission Statement

Create the **definitive real-time BBS monitoring dashboard** for sysops. This isn't just a stats screen - it's a complete command center providing instant visibility into every aspect of BBS operations with live data updates, interactive controls, and stunning visualizations using the full power of neo-blessed and blessed-contrib.

**The Goal**: After implementing this dashboard, a sysop should never need to SSH into the server or run separate monitoring tools. Everything they need to manage and monitor their BBS is right here, updating in real-time, beautifully visualized.

---

## Technical Foundation

### Implementation Location
- **Create new door**: `~/Code/amiexpress-web/Doors/bbs-dashboard/`
- **Package structure**: Standard SDK door with package.json, tsconfig.json, index.ts
- **Main file**: `index.ts` - Door entry point extending SDK Door class
- **Additional modules**: Consider separate files for API client, data models, update loops

### Required Imports & Dependencies
```typescript
import { Door, getTerminalDimensions } from '@amiexpress/bbs-door-sdk';
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

import axios from 'axios'; // For API calls
import type { AxiosInstance } from 'axios';

// Individual widget imports
import { Grid } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
```

### BBS Terminal Constraints (CRITICAL)
- **Width**: ALWAYS 80 columns (fixed, non-negotiable)
- **Height**: User-configurable (use `context.user.linesPerScreen` or default 23)
- **Total rows**: User's linesPerScreen + 2 for prompts (typically 25 total)
- **Line truncation**: All content MUST truncate at 80 columns

---

## Architecture Overview

### Dashboard Structure

The dashboard uses a **Grid layout** organized into logical monitoring zones. This is NOT a multi-page carousel - it's a single comprehensive real-time view that updates every 1-2 seconds.

**Layout Grid: 24 rows × 12 columns**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ BBS SYSOP DASHBOARD                          Last Update: HH:MM:SS          │ Row 0
├─────────────────────────────────────────────────────────────────────────────┤
│           NODES (1-8)              │         SYSTEM HEALTH                  │ Rows 1-8
│  Node 1: Hacker    @ Login         │  ┌──────────────────────────┐         │
│  Node 2: Phreaker  @ Messages      │  │ CPU:    [=========   ] 45% │         │
│  Node 3: Idle                      │  │ Memory: [=======     ] 35% │         │
│  Node 4: Trader    @ Files         │  │ Disk:   [====        ] 20% │         │
│  Node 5: Elite     @ Door: PKZIP   │  │ Sockets:[===         ] 15  │         │
│  Node 6: Idle                      │  │ Uptime: 5d 12h             │         │
│  Node 7: Guest     @ Bulletins     │  └──────────────────────────┘         │
│  Node 8: Idle                      │                                        │
├────────────────────────────────────┼────────────────────────────────────────┤
│    TODAY'S STATISTICS              │    RECENT ACTIVITY STREAM              │ Rows 9-16
│                                    │                                        │
│  Calls: [===========    ] 156/200  │ 12:34:56 Hacker      Login            │
│  Users: [======         ] 45       │ 12:34:45 Phreaker    Posted Msg #1523 │
│  Messages: 234                     │ 12:34:30 Trader      Downloaded file  │
│  Uploads: 12 (156 MB)              │ 12:34:15 Elite       Door: PKZIP      │
│  Downloads: 45 (2.3 GB)            │ 12:34:00 Guest       View Bulletin #5 │
│  Doors Launched: 89                │ 12:33:45 Newbie      Logoff           │
│                                    │ 12:33:30 Sysop       Sysop Menu       │
├────────────────────────────────────┼────────────────────────────────────────┤
│  FILE TRANSFERS (LIVE)             │    CHAT ACTIVITY                       │ Rows 17-20
│                                    │                                        │
│  GAME.ZIP    ▓▓▓▓▓▓▓░░░ 65% 2.4KB/s│  Active Rooms: 2                      │
│  UTILS.LHA   ▓▓▓░░░░░░░ 30% 1.8KB/s│  * General Chat (5 users)             │
│                                    │  * Trade Zone   (3 users)             │
│                                    │  Pending Pages: 1                     │
├────────────────────────────────────┴────────────────────────────────────────┤
│  MESSAGES BY CONFERENCE (Last Hour)                                        │ Rows 21-23
│  ████████████ Main (45)   █████ Games (12)   ███ Files (8)                │
└─────────────────────────────────────────────────────────────────────────────┘
│ R:Refresh  N:Nodes  S:Stats  C:Chat  K:Kick  M:Message  Q:Quit             │ Nav bar
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Sources & API Integration

### Backend API Base URL

```typescript
// In door context, backend is typically at same host
const API_BASE = process.env.BACKEND_URL || 'http://localhost:3001';
```

### API Client Setup

```typescript
class DashboardAPIClient {
  private client: AxiosInstance;
  private token: string;

  constructor(token: string) {
    this.token = token;
    this.client = axios.create({
      baseURL: API_BASE,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      timeout: 5000
    });
  }

  // Session Management
  async getActiveSessions() {
    const response = await this.client.get('/api/sessions');
    return response.data; // Array of active sessions
  }

  async getSessionStats() {
    const response = await this.client.get('/api/sessions/stats');
    return response.data; // { count, totalLines, oldestSession }
  }

  // Daily Statistics
  async getTodayStats() {
    const response = await this.client.get('/api/stats/today');
    return response.data; // DailyStats object
  }

  // Node Status (may need custom endpoint)
  async getNodeStatus() {
    const response = await this.client.get('/api/nodes/status');
    return response.data; // Array of 8 node status objects
  }

  // Conference Stats
  async getConferenceStats(confId: number) {
    const response = await this.client.get(`/api/conferences/${confId}/stats`);
    return response.data; // { messageCount, lowestMsgNum, highestMsgNum }
  }

  // Recent Activity
  async getRecentActivity(limit: number = 50) {
    const response = await this.client.get(`/api/activity/recent?limit=${limit}`);
    return response.data; // Array of caller activity
  }

  // Chat Rooms
  async getChatRooms() {
    const response = await this.client.get('/api/chat/rooms');
    return response.data; // Array of active chat rooms
  }

  // Sysop Pages
  async getPendingPages() {
    const response = await this.client.get('/api/operator/pending-pages');
    return response.data; // Array of pending page requests
  }

  // System Health
  async getSystemHealth() {
    const response = await this.client.get('/api/health');
    return response.data; // Health check results
  }
}
```

### Real-Time Updates Strategy

**Polling-Based Approach** (recommended for door environment):

```typescript
class DashboardUpdateManager {
  private intervals: Map<string, NodeJS.Timeout> = new Map();

  startPolling(updateFunctions: Map<string, () => Promise<void>>) {
    updateFunctions.forEach((updateFn, name) => {
      // Different update rates for different data
      const interval = this.getUpdateInterval(name);
      const timerId = setInterval(updateFn, interval);
      this.intervals.set(name, timerId);
    });
  }

  stopPolling() {
    this.intervals.forEach((timerId) => clearInterval(timerId));
    this.intervals.clear();
  }

  private getUpdateInterval(dataType: string): number {
    const intervals: Record<string, number> = {
      'nodeStatus': 1000,      // 1 second - critical
      'activeUsers': 2000,     // 2 seconds - high priority
      'systemHealth': 5000,    // 5 seconds - moderate
      'dailyStats': 10000,     // 10 seconds - low priority
      'activityStream': 3000,  // 3 seconds - high priority
      'chatActivity': 4000,    // 4 seconds - moderate
      'fileTransfers': 2000,   // 2 seconds - high priority
      'conferenceStats': 15000 // 15 seconds - low priority
    };
    return intervals[dataType] || 5000;
  }
}
```

---

## Widget Implementation Guide

### ZONE 1: Title Bar (Row 0)

**Purpose**: Display dashboard title and last update timestamp

**Widget**: `blessed.box`

```typescript
const titleBar = blessed.box({
  top: 0,
  left: 0,
  width: '100%',
  height: 1,
  content: '',
  align: 'center',
  style: {
    fg: 'white',
    bg: 'blue',
    bold: true
  }
});

// Update function
function updateTitleBar() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString();
  titleBar.setContent(`BBS SYSOP DASHBOARD                          Last Update: ${timeStr}`);
}
```

---

### ZONE 2: Node Status Grid (Rows 1-8, Cols 0-6)

**Purpose**: Real-time display of all 8 nodes showing user, location, and current activity

**Widget**: `contrib.Table` or custom `blessed.box` with structured text

**Data Structure**:
```typescript
interface NodeStatus {
  nodeId: number;          // 0-7
  status: number;          // ENV_* status code
  handle: string;          // Username or 'Idle'
  location: string;        // User location
  misc1: string;           // Current activity detail
  misc2: number;           // Chat availability
  baud: number;            // Connection speed
  timestamp: number;       // Last update
}

const ENV_STATUS_NAMES: Record<number, string> = {
  0: 'Idle',
  1: 'Downloading',
  2: 'Uploading',
  3: 'Door',
  4: 'Mail',
  5: 'Stats',
  6: 'Account',
  7: 'Zoom',
  8: 'Files',
  9: 'Bulletins',
  10: 'Viewing',
  11: 'Message',
  12: 'Logoff',
  13: 'Sysop',
  14: 'Shell',
  15: 'Transfer',
  16: 'Upload',
  17: 'Chat',
  18: 'Chat Request',
  // ... etc
};
```

**Implementation**:
```typescript
const nodeStatusBox = blessed.box({
  top: 1,
  left: 0,
  width: '50%',
  height: 8,
  label: ' NODES (1-8) ',
  border: {
    type: 'line'
  },
  style: {
    fg: 'white',
    border: { fg: 'cyan' }
  },
  tags: true,
  scrollable: false
});

function updateNodeStatus(nodes: NodeStatus[]) {
  let content = '';
  for (let i = 0; i < 8; i++) {
    const node = nodes[i];
    const num = i + 1;

    if (!node || node.status === 0) {
      // Idle node
      content += `  {cyan-fg}Node ${num}:{/cyan-fg} {gray-fg}Idle{/gray-fg}\n`;
    } else {
      // Active node
      const statusName = ENV_STATUS_NAMES[node.status] || 'Unknown';
      const activity = node.misc1 || statusName;
      const userColor = node.status === 13 ? 'red-fg' : 'green-fg'; // Sysop = red

      content += `  {cyan-fg}Node ${num}:{/cyan-fg} {${userColor}}${node.handle.substring(0, 12).padEnd(12)}{/${userColor}} @ ${activity}\n`;
    }
  }

  nodeStatusBox.setContent(content);
}
```

**Alternative - Contrib Table**:
```typescript
const nodeTable = grid.set(1, 0, 8, 6, contrib.Table, {
  label: 'NODES (1-8)',
  keys: false,
  fg: 'white',
  selectedFg: 'white',
  selectedBg: 'blue',
  interactive: false,
  columnSpacing: 2,
  columnWidth: [6, 14, 18]
});

function updateNodeTable(nodes: NodeStatus[]) {
  const data = nodes.map((node, i) => {
    if (!node || node.status === 0) {
      return [`Node ${i+1}`, 'Idle', ''];
    }
    const statusName = ENV_STATUS_NAMES[node.status] || 'Unknown';
    const activity = node.misc1 || statusName;
    return [`Node ${i+1}`, node.handle, activity];
  });

  nodeTable.setData({
    headers: ['Node', 'User', 'Activity'],
    data: data
  });
}
```

---

### ZONE 3: System Health (Rows 1-8, Cols 6-12)

**Purpose**: Display system performance metrics with visual gauges

**Widget**: `contrib.Gauge` for each metric

```typescript
const cpuGauge = grid.set(1, 6, 2, 3, contrib.Gauge, {
  label: 'CPU Usage',
  stroke: 'green',
  fill: 'white',
  showLabel: true
});

const memoryGauge = grid.set(3, 6, 2, 3, contrib.Gauge, {
  label: 'Memory',
  stroke: 'cyan',
  fill: 'white',
  showLabel: true
});

const diskGauge = grid.set(5, 6, 2, 3, contrib.Gauge, {
  label: 'Disk Usage',
  stroke: 'yellow',
  fill: 'white',
  showLabel: true
});

// Uptime display
const uptimeBox = blessed.box({
  top: 7,
  left: '50%',
  width: '50%',
  height: 2,
  content: '',
  align: 'center',
  tags: true,
  style: {
    fg: 'white'
  }
});

function updateSystemHealth(health: HealthData) {
  // CPU gauge (percentage)
  cpuGauge.setPercent(health.cpu || 0);

  // Memory gauge (percentage)
  const memPercent = (health.memory.used / health.memory.total) * 100;
  memoryGauge.setPercent(memPercent);

  // Disk gauge (percentage)
  const diskPercent = ((health.disk.total - health.disk.free) / health.disk.total) * 100;
  diskGauge.setPercent(diskPercent);

  // Uptime
  const uptimeStr = formatUptime(health.uptime);
  uptimeBox.setContent(`{bold}Uptime:{/bold} ${uptimeStr}\n{bold}Sockets:{/bold} ${health.activeConnections}`);
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${mins}m`;
}
```

**Health Data Structure**:
```typescript
interface HealthData {
  cpu: number;              // CPU usage percentage
  memory: {
    used: number;           // Bytes used
    total: number;          // Total bytes
  };
  disk: {
    used: number;           // Bytes used
    free: number;           // Bytes free
    total: number;          // Total bytes
  };
  uptime: number;           // Seconds
  activeConnections: number;
  database: {
    connected: boolean;
    responseTime: number;   // ms
  };
}
```

---

### ZONE 4: Today's Statistics (Rows 9-16, Cols 0-6)

**Purpose**: Display current day statistics with visual progress bars

**Widget**: Custom `blessed.box` with progress bars

```typescript
const statsBox = blessed.box({
  top: 9,
  left: 0,
  width: '50%',
  height: 8,
  label: " TODAY'S STATISTICS ",
  border: {
    type: 'line'
  },
  style: {
    fg: 'white',
    border: { fg: 'green' }
  },
  tags: true,
  scrollable: false
});

interface DailyStats {
  date: string;
  totalCalls: number;
  uniqueUsers: number;
  totalLogins: number;
  totalMessages: number;
  totalUploads: number;
  totalDownloads: number;
  totalDoorLaunches: number;
  uploadBytes?: number;
  downloadBytes?: number;
}

function updateDailyStats(stats: DailyStats) {
  const maxCalls = 200;  // Expected max calls per day
  const callsPercent = Math.min((stats.totalCalls / maxCalls) * 100, 100);
  const callsBar = createProgressBar(callsPercent, 20);

  const content = `
  {bold}Calls:{/bold}     ${callsBar} ${stats.totalCalls}/${maxCalls}
  {bold}Users:{/bold}     ${stats.uniqueUsers}
  {bold}Messages:{/bold}  ${stats.totalMessages}
  {bold}Uploads:{/bold}   ${stats.totalUploads} (${formatBytes(stats.uploadBytes || 0)})
  {bold}Downloads:{/bold} ${stats.totalDownloads} (${formatBytes(stats.downloadBytes || 0)})
  {bold}Doors:{/bold}     ${stats.totalDoorLaunches}
  `;

  statsBox.setContent(content);
}

function createProgressBar(percent: number, width: number): string {
  const filled = Math.floor((percent / 100) * width);
  const empty = width - filled;
  return `[{green-fg}${'='.repeat(filled)}{/green-fg}${' '.repeat(empty)}]`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
```

**Enhanced Version with Sparklines**:
```typescript
// Add sparkline for calls over time
const callsSparkline = grid.set(11, 0, 2, 6, contrib.Sparkline, {
  label: 'Calls (Last 24 Hours)',
  tags: true,
  style: {
    fg: 'green',
    border: { fg: 'green' }
  }
});

// Maintain hourly call data
const hourlyCallData: number[] = new Array(24).fill(0);

function updateCallsSparkline() {
  callsSparkline.setData(['Calls'], [hourlyCallData]);
}
```

---

### ZONE 5: Recent Activity Stream (Rows 9-16, Cols 6-12)

**Purpose**: Live scrolling log of all BBS activity

**Widget**: `contrib.Log`

```typescript
const activityLog = grid.set(9, 6, 8, 6, contrib.Log, {
  label: 'RECENT ACTIVITY STREAM',
  fg: 'cyan',
  selectedFg: 'black',
  selectedBg: 'cyan',
  style: {
    border: { fg: 'cyan' }
  },
  bufferLength: 100  // Keep last 100 entries
});

interface ActivityEntry {
  timestamp: Date;
  username: string;
  action: string;
  details: string;
  nodeId?: number;
}

function updateActivityStream(activities: ActivityEntry[]) {
  // Add newest activities to top
  activities.slice().reverse().forEach(activity => {
    const timeStr = activity.timestamp.toLocaleTimeString();
    const entry = `${timeStr} ${activity.username.padEnd(12)} ${activity.action}`;
    activityLog.log(entry);
  });
}

// Real-time activity update (called when new activity arrives)
function addActivity(activity: ActivityEntry) {
  const timeStr = activity.timestamp.toLocaleTimeString();
  const entry = `${timeStr} ${activity.username.padEnd(12)} ${activity.action}`;
  activityLog.log(entry);
  screen.render();
}
```

**Activity Color Coding** (optional):
```typescript
function formatActivity(activity: ActivityEntry): string {
  const timeStr = activity.timestamp.toLocaleTimeString();
  const user = activity.username.padEnd(12);

  // Color code by action type
  let color = 'white';
  if (activity.action.includes('Login')) color = 'green';
  if (activity.action.includes('Logoff')) color = 'red';
  if (activity.action.includes('Message')) color = 'cyan';
  if (activity.action.includes('Download')) color = 'yellow';
  if (activity.action.includes('Upload')) color = 'magenta';
  if (activity.action.includes('Door')) color = 'blue';

  return `${timeStr} {${color}-fg}${user}{/${color}-fg} ${activity.action}`;
}
```

---

### ZONE 6: File Transfers (Live) (Rows 17-20, Cols 0-6)

**Purpose**: Show active file uploads/downloads with progress bars

**Widget**: Custom `blessed.box` with live progress bars

```typescript
const transfersBox = blessed.box({
  top: 17,
  left: 0,
  width: '50%',
  height: 4,
  label: ' FILE TRANSFERS (LIVE) ',
  border: {
    type: 'line'
  },
  style: {
    fg: 'white',
    border: { fg: 'yellow' }
  },
  tags: true,
  scrollable: false
});

interface ActiveTransfer {
  filename: string;
  type: 'upload' | 'download';
  progress: number;      // 0-100
  bytesTransferred: number;
  totalBytes: number;
  speed: number;         // bytes/sec
  username: string;
  nodeId: number;
}

function updateFileTransfers(transfers: ActiveTransfer[]) {
  if (transfers.length === 0) {
    transfersBox.setContent('\n  {gray-fg}No active transfers{/gray-fg}');
    return;
  }

  let content = '';
  transfers.slice(0, 2).forEach(transfer => { // Show max 2 transfers
    const filename = transfer.filename.padEnd(12);
    const progressBar = createVisualProgressBar(transfer.progress, 10);
    const percent = transfer.progress.toFixed(0).padStart(3);
    const speedStr = formatSpeed(transfer.speed);
    const typeIcon = transfer.type === 'upload' ? '↑' : '↓';

    content += `  ${typeIcon} ${filename} ${progressBar} ${percent}% ${speedStr}\n`;
  });

  transfersBox.setContent(content);
}

function createVisualProgressBar(percent: number, width: number): string {
  const filled = Math.floor((percent / 100) * width);
  const empty = width - filled;
  return `{green-fg}${'▓'.repeat(filled)}{/green-fg}{gray-fg}${'░'.repeat(empty)}{/gray-fg}`;
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${bytesPerSec}B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)}KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(2)}MB/s`;
}
```

**Socket.IO Integration** (if available):
```typescript
// Listen for transfer events
socket.on('transfer:progress', (data: any) => {
  // Update transfer in activeTransfers array
  const transfer = activeTransfers.find(t => t.filename === data.filename);
  if (transfer) {
    transfer.progress = data.progress;
    transfer.bytesTransferred = data.bytesTransferred;
    transfer.speed = data.speed;
    updateFileTransfers(activeTransfers);
    screen.render();
  }
});

socket.on('transfer:complete', (data: any) => {
  // Remove transfer from activeTransfers
  activeTransfers = activeTransfers.filter(t => t.filename !== data.filename);
  updateFileTransfers(activeTransfers);
  screen.render();
});
```

---

### ZONE 7: Chat Activity (Rows 17-20, Cols 6-12)

**Purpose**: Show active chat rooms and pending sysop pages

**Widget**: `blessed.box` with formatted list

```typescript
const chatBox = blessed.box({
  top: 17,
  left: '50%',
  width: '50%',
  height: 4,
  label: ' CHAT ACTIVITY ',
  border: {
    type: 'line'
  },
  style: {
    fg: 'white',
    border: { fg: 'magenta' }
  },
  tags: true,
  scrollable: false
});

interface ChatRoom {
  roomId: string;
  name: string;
  participants: string[];
  topic?: string;
  isPublic: boolean;
}

interface PageRequest {
  pageId: string;
  userId: string;
  username: string;
  requestedAt: Date;
  status: 'pending' | 'active' | 'responded';
}

function updateChatActivity(rooms: ChatRoom[], pages: PageRequest[]) {
  const activeRooms = rooms.filter(r => r.participants.length > 0);
  const pendingPages = pages.filter(p => p.status === 'pending');

  let content = `\n  {bold}Active Rooms:{/bold} ${activeRooms.length}\n`;

  activeRooms.slice(0, 2).forEach(room => {
    const userCount = room.participants.length;
    content += `  {cyan-fg}*{/cyan-fg} ${room.name.padEnd(16)} (${userCount} users)\n`;
  });

  if (pendingPages.length > 0) {
    content += `\n  {red-fg}{bold}Pending Pages: ${pendingPages.length}{/bold}{/red-fg}`;
  }

  chatBox.setContent(content);
}
```

**Enhanced with Blinking Alert**:
```typescript
let alertBlink = false;

function updateChatActivityWithAlert(rooms: ChatRoom[], pages: PageRequest[]) {
  const pendingPages = pages.filter(p => p.status === 'pending');

  // ... existing content generation ...

  if (pendingPages.length > 0) {
    // Blink label when pages pending
    chatBox.setLabel(alertBlink ? ' {red-bg} CHAT ACTIVITY {/red-bg} ' : ' CHAT ACTIVITY ');
    alertBlink = !alertBlink;
  } else {
    chatBox.setLabel(' CHAT ACTIVITY ');
  }
}
```

---

### ZONE 8: Messages by Conference (Rows 21-23, Cols 0-12)

**Purpose**: Visualize message distribution across conferences

**Widget**: `contrib.StackedBar` or custom bar chart

```typescript
const conferenceChart = grid.set(21, 0, 3, 12, contrib.StackedBar, {
  label: 'MESSAGES BY CONFERENCE (Last Hour)',
  barWidth: 8,
  barSpacing: 10,
  xOffset: 0,
  maxHeight: 9,
  style: {
    border: { fg: 'white' }
  }
});

interface ConferenceStats {
  confId: number;
  name: string;
  messageCount: number;
  recentMessages: number;  // Last hour
}

function updateConferenceChart(conferences: ConferenceStats[]) {
  // Sort by recent message count
  const sorted = conferences
    .filter(c => c.recentMessages > 0)
    .sort((a, b) => b.recentMessages - a.recentMessages)
    .slice(0, 6); // Show top 6 conferences

  const confNames = sorted.map(c => c.name.substring(0, 10));
  const messageCounts = sorted.map(c => c.recentMessages);

  conferenceChart.setData({
    barCategory: confNames,
    stackedCategory: ['Messages'],
    data: messageCounts.map(count => [count])
  });
}
```

**Alternative: Horizontal Bar Chart** (text-based):
```typescript
function createTextBarChart(conferences: ConferenceStats[]): string {
  const sorted = conferences
    .filter(c => c.recentMessages > 0)
    .sort((a, b) => b.recentMessages - a.recentMessages)
    .slice(0, 5);

  const maxMessages = Math.max(...sorted.map(c => c.recentMessages), 1);
  const barWidth = 60;

  let chart = '';
  sorted.forEach(conf => {
    const barLen = Math.floor((conf.recentMessages / maxMessages) * barWidth);
    const bar = '█'.repeat(barLen);
    const name = conf.name.padEnd(15);
    const count = `(${conf.recentMessages})`;
    chart += `  ${name} {cyan-fg}${bar}{/cyan-fg} ${count}\n`;
  });

  return chart;
}
```

---

### ZONE 9: Navigation Bar (Bottom, Always Visible)

**Purpose**: Show available keyboard shortcuts

**Widget**: `blessed.box` (fixed at bottom)

```typescript
const navBar = blessed.box({
  bottom: 0,
  left: 0,
  width: '100%',
  height: 1,
  content: ' R:Refresh  N:Nodes  S:Stats  C:Chat  K:Kick  M:Message  Q:Quit',
  align: 'left',
  style: {
    fg: 'black',
    bg: 'white',
    bold: true
  }
});
```

---

## Keyboard Shortcuts & Interactivity

### Global Key Bindings

```typescript
class DashboardKeyHandler {
  constructor(private screen: blessed.Widgets.Screen, private dashboard: DashboardDoor) {
    this.setupKeyBindings();
  }

  private setupKeyBindings() {
    // Refresh - Force immediate update of all data
    this.screen.key(['r', 'R'], () => {
      this.dashboard.refreshAllData();
      this.screen.render();
    });

    // Nodes - Focus on node status, allow node details view
    this.screen.key(['n', 'N'], () => {
      this.dashboard.showNodeDetails();
    });

    // Stats - Show detailed statistics overlay
    this.screen.key(['s', 'S'], () => {
      this.dashboard.showStatsOverlay();
    });

    // Chat - Show chat rooms overlay
    this.screen.key(['c', 'C'], () => {
      this.dashboard.showChatOverlay();
    });

    // Kick - Kick user from node
    this.screen.key(['k', 'K'], () => {
      this.dashboard.showKickUserPrompt();
    });

    // Message - Send system message to all users
    this.screen.key(['m', 'M'], () => {
      this.dashboard.showBroadcastMessagePrompt();
    });

    // Help - Show help overlay
    this.screen.key(['h', 'H', '?'], () => {
      this.dashboard.showHelpOverlay();
    });

    // Quit
    this.screen.key(['q', 'Q', 'escape'], () => {
      this.dashboard.cleanup();
    });
  }
}
```

---

### Interactive Features

#### Node Details Overlay

```typescript
function showNodeDetails() {
  const overlay = blessed.box({
    parent: screen,
    top: 'center',
    left: 'center',
    width: '80%',
    height: '80%',
    border: {
      type: 'line'
    },
    style: {
      fg: 'white',
      bg: 'black',
      border: { fg: 'cyan' }
    },
    label: ' NODE DETAILS ',
    tags: true,
    scrollable: true,
    keys: true,
    vi: true,
    mouse: true
  });

  // Populate with detailed node information
  const nodeId = 0; // Selected node
  apiClient.getSessionDetails(nodeId).then(session => {
    let content = `
{bold}Node ${nodeId + 1} - ${session.username}{/bold}

{cyan-fg}Connection:{/cyan-fg}
  Started: ${new Date(session.startTime).toLocaleString()}
  Duration: ${formatDuration(Date.now() - session.startTime)}
  Baud Rate: ${session.baud || 'N/A'}

{cyan-fg}Activity:{/cyan-fg}
  Current Location: ${session.location}
  Total Output: ${session.lineCount} lines
  Last Activity: ${formatDuration(Date.now() - session.lastActivity)} ago

{cyan-fg}Session Log (last 50 lines):{/cyan-fg}
${session.log.slice(-50).join('\n')}
    `;
    overlay.setContent(content);
    screen.render();
  });

  overlay.key(['escape', 'q'], () => {
    overlay.destroy();
    screen.render();
  });

  overlay.focus();
  screen.render();
}
```

#### Stats Overlay (Detailed Statistics)

```typescript
function showStatsOverlay() {
  const overlay = blessed.box({
    parent: screen,
    top: 'center',
    left: 'center',
    width: '90%',
    height: '90%',
    border: {
      type: 'line'
    },
    style: {
      fg: 'white',
      bg: 'black',
      border: { fg: 'green' }
    },
    label: ' DETAILED STATISTICS ',
    tags: true,
    scrollable: true,
    keys: true,
    vi: true,
    mouse: true
  });

  Promise.all([
    apiClient.getTodayStats(),
    apiClient.getStatsForRange(getDateDaysAgo(7), getTodayDate())
  ]).then(([today, week]) => {
    const content = generateStatsReport(today, week);
    overlay.setContent(content);
    screen.render();
  });

  overlay.key(['escape', 'q'], () => {
    overlay.destroy();
    screen.render();
  });

  overlay.focus();
  screen.render();
}

function generateStatsReport(today: DailyStats, weekData: DailyStats[]): string {
  const weekTotals = weekData.reduce((acc, day) => ({
    calls: acc.calls + day.totalCalls,
    messages: acc.messages + day.totalMessages,
    uploads: acc.uploads + day.totalUploads,
    downloads: acc.downloads + day.totalDownloads,
    doors: acc.doors + day.totalDoorLaunches
  }), { calls: 0, messages: 0, uploads: 0, downloads: 0, doors: 0 });

  return `
{bold}{cyan-fg}TODAY'S STATISTICS{/cyan-fg}{/bold}
─────────────────────────────────────────────────────
  Calls:         ${today.totalCalls}
  Unique Users:  ${today.uniqueUsers}
  Messages:      ${today.totalMessages}
  Uploads:       ${today.totalUploads}
  Downloads:     ${today.totalDownloads}
  Doors:         ${today.totalDoorLaunches}

{bold}{cyan-fg}7-DAY SUMMARY{/cyan-fg}{/bold}
─────────────────────────────────────────────────────
  Total Calls:   ${weekTotals.calls}
  Total Msgs:    ${weekTotals.messages}
  Total ULs:     ${weekTotals.uploads}
  Total DLs:     ${weekTotals.downloads}
  Total Doors:   ${weekTotals.doors}
  Avg Calls/Day: ${(weekTotals.calls / 7).toFixed(1)}

{bold}{cyan-fg}DAILY BREAKDOWN{/cyan-fg}{/bold}
─────────────────────────────────────────────────────
  Date         Calls  Messages  UL/DL
${weekData.map(day =>
  `  ${day.date}  ${String(day.totalCalls).padStart(5)}  ${String(day.totalMessages).padStart(8)}  ${day.totalUploads}/${day.totalDownloads}`
).join('\n')}
  `;
}
```

#### Kick User Prompt

```typescript
function showKickUserPrompt() {
  const prompt = blessed.prompt({
    parent: screen,
    top: 'center',
    left: 'center',
    width: 50,
    height: 10,
    border: {
      type: 'line'
    },
    style: {
      fg: 'white',
      bg: 'red',
      border: { fg: 'red' }
    },
    label: ' KICK USER ',
    tags: true
  });

  prompt.input('Enter node number to kick (1-8):', '', async (err, value) => {
    if (err || !value) return;

    const nodeId = parseInt(value) - 1;
    if (nodeId < 0 || nodeId > 7) {
      showMessage('Invalid node number');
      return;
    }

    // Confirm
    const confirm = await showConfirm(`Kick user on Node ${nodeId + 1}?`);
    if (confirm) {
      try {
        await apiClient.kickUser(nodeId);
        showMessage(`User on Node ${nodeId + 1} has been kicked`);
      } catch (error) {
        showMessage(`Error: ${error.message}`);
      }
    }
  });
}
```

#### Broadcast Message Prompt

```typescript
function showBroadcastMessagePrompt() {
  const form = blessed.form({
    parent: screen,
    top: 'center',
    left: 'center',
    width: 60,
    height: 12,
    border: {
      type: 'line'
    },
    style: {
      fg: 'white',
      bg: 'blue',
      border: { fg: 'cyan' }
    },
    label: ' BROADCAST MESSAGE ',
    tags: true
  });

  const textbox = blessed.textarea({
    parent: form,
    top: 1,
    left: 2,
    width: '90%',
    height: 6,
    inputOnFocus: true,
    border: {
      type: 'line'
    },
    style: {
      fg: 'white',
      border: { fg: 'white' }
    }
  });

  const submitBtn = blessed.button({
    parent: form,
    bottom: 1,
    left: 10,
    shrink: true,
    padding: {
      left: 2,
      right: 2
    },
    content: 'Send',
    style: {
      fg: 'black',
      bg: 'green',
      focus: {
        bg: 'white'
      }
    }
  });

  const cancelBtn = blessed.button({
    parent: form,
    bottom: 1,
    right: 10,
    shrink: true,
    padding: {
      left: 2,
      right: 2
    },
    content: 'Cancel',
    style: {
      fg: 'black',
      bg: 'red',
      focus: {
        bg: 'white'
      }
    }
  });

  submitBtn.on('press', async () => {
    const message = textbox.getValue();
    if (!message.trim()) {
      showMessage('Message cannot be empty');
      return;
    }

    try {
      await apiClient.broadcastMessage(message);
      showMessage('Message sent to all users');
      form.destroy();
      screen.render();
    } catch (error) {
      showMessage(`Error: ${error.message}`);
    }
  });

  cancelBtn.on('press', () => {
    form.destroy();
    screen.render();
  });

  textbox.focus();
  screen.render();
}
```

---

## Main Dashboard Class Structure

```typescript
export default class LiveDashboardDoor extends Door {
  private screen!: blessed.Widgets.Screen;
  private grid!: any;
  private apiClient!: DashboardAPIClient;
  private updateManager!: DashboardUpdateManager;
  private keyHandler!: DashboardKeyHandler;

  // Widget references
  private titleBar!: blessed.Widgets.BoxElement;
  private nodeStatusBox!: blessed.Widgets.BoxElement;
  private cpuGauge!: any;
  private memoryGauge!: any;
  private diskGauge!: any;
  private statsBox!: blessed.Widgets.BoxElement;
  private activityLog!: any;
  private transfersBox!: blessed.Widgets.BoxElement;
  private chatBox!: blessed.Widgets.BoxElement;
  private conferenceChart!: any;
  private navBar!: blessed.Widgets.BoxElement;

  // Data state
  private nodeStatus: NodeStatus[] = [];
  private systemHealth: HealthData | null = null;
  private dailyStats: DailyStats | null = null;
  private recentActivity: ActivityEntry[] = [];
  private activeTransfers: ActiveTransfer[] = [];
  private chatRooms: ChatRoom[] = [];
  private pendingPages: PageRequest[] = [];
  private conferenceStats: ConferenceStats[] = [];

  async onStart() {
    // Get BBS terminal dimensions
    const dims = getTerminalDimensions(this.context);

    // Create screen with BBS constraints
    this.screen = blessed.screen({
      height: dims.height,
      output: (data: string) => this.context.output.write(data),
      fullUnicode: true,
      smartCSR: true,
      title: 'BBS Live Dashboard',
    });

    // Initialize API client
    this.apiClient = new DashboardAPIClient(this.context.token);

    // Create grid layout (24 rows × 12 cols)
    this.grid = new Grid({
      screen: this.screen,
      rows: 24,
      cols: 12
    });

    // Create all widgets
    this.createWidgets();

    // Setup keyboard shortcuts
    this.keyHandler = new DashboardKeyHandler(this.screen, this);

    // Initialize update manager
    this.setupUpdateLoops();

    // Load initial data
    await this.refreshAllData();

    // Render initial screen
    this.screen.render();

    // Wait for exit
    await this.waitForExit();
  }

  private createWidgets() {
    // Title bar
    this.titleBar = blessed.box({
      top: 0,
      left: 0,
      width: '100%',
      height: 1,
      content: '',
      align: 'center',
      style: {
        fg: 'white',
        bg: 'blue',
        bold: true
      }
    });
    this.screen.append(this.titleBar);

    // Node status (rows 1-8, cols 0-6)
    this.nodeStatusBox = this.grid.set(1, 0, 8, 6, blessed.box, {
      label: ' NODES (1-8) ',
      border: {
        type: 'line'
      },
      style: {
        fg: 'white',
        border: { fg: 'cyan' }
      },
      tags: true
    });

    // System health gauges (rows 1-8, cols 6-12)
    this.cpuGauge = this.grid.set(1, 6, 2, 3, contrib.Gauge, {
      label: 'CPU Usage',
      stroke: 'green',
      fill: 'white',
      showLabel: true
    });

    this.memoryGauge = this.grid.set(3, 6, 2, 3, contrib.Gauge, {
      label: 'Memory',
      stroke: 'cyan',
      fill: 'white',
      showLabel: true
    });

    this.diskGauge = this.grid.set(5, 6, 2, 3, contrib.Gauge, {
      label: 'Disk Usage',
      stroke: 'yellow',
      fill: 'white',
      showLabel: true
    });

    // ... create remaining widgets following zone specifications above ...

    // Navigation bar
    this.navBar = blessed.box({
      bottom: 0,
      left: 0,
      width: '100%',
      height: 1,
      content: ' R:Refresh  N:Nodes  S:Stats  C:Chat  K:Kick  M:Message  Q:Quit',
      align: 'left',
      style: {
        fg: 'black',
        bg: 'white',
        bold: true
      }
    });
    this.screen.append(this.navBar);
  }

  private setupUpdateLoops() {
    const updateFunctions = new Map<string, () => Promise<void>>([
      ['nodeStatus', async () => {
        this.nodeStatus = await this.apiClient.getNodeStatus();
        this.updateNodeStatus(this.nodeStatus);
        this.screen.render();
      }],
      ['systemHealth', async () => {
        this.systemHealth = await this.apiClient.getSystemHealth();
        this.updateSystemHealth(this.systemHealth);
        this.screen.render();
      }],
      ['dailyStats', async () => {
        this.dailyStats = await this.apiClient.getTodayStats();
        this.updateDailyStats(this.dailyStats);
        this.screen.render();
      }],
      ['activityStream', async () => {
        const activities = await this.apiClient.getRecentActivity(20);
        // Only add new activities
        const newActivities = activities.filter(a =>
          !this.recentActivity.some(existing =>
            existing.timestamp === a.timestamp && existing.username === a.username
          )
        );
        this.recentActivity = activities;
        newActivities.forEach(a => this.addActivity(a));
      }],
      ['chatActivity', async () => {
        this.chatRooms = await this.apiClient.getChatRooms();
        this.pendingPages = await this.apiClient.getPendingPages();
        this.updateChatActivity(this.chatRooms, this.pendingPages);
        this.screen.render();
      }],
      // ... more update functions ...
    ]);

    this.updateManager = new DashboardUpdateManager();
    this.updateManager.startPolling(updateFunctions);
  }

  async refreshAllData() {
    // Force refresh of all data sources
    try {
      const [nodes, health, stats, activity, rooms, pages] = await Promise.all([
        this.apiClient.getNodeStatus(),
        this.apiClient.getSystemHealth(),
        this.apiClient.getTodayStats(),
        this.apiClient.getRecentActivity(50),
        this.apiClient.getChatRooms(),
        this.apiClient.getPendingPages()
      ]);

      this.nodeStatus = nodes;
      this.systemHealth = health;
      this.dailyStats = stats;
      this.recentActivity = activity;
      this.chatRooms = rooms;
      this.pendingPages = pages;

      // Update all widgets
      this.updateNodeStatus(this.nodeStatus);
      this.updateSystemHealth(this.systemHealth);
      this.updateDailyStats(this.dailyStats);
      activity.forEach(a => this.addActivity(a));
      this.updateChatActivity(this.chatRooms, this.pendingPages);

      // Update title bar timestamp
      this.updateTitleBar();

      this.screen.render();
    } catch (error) {
      this.showError(`Failed to refresh data: ${error.message}`);
    }
  }

  private updateTitleBar() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString();
    this.titleBar.setContent(`BBS SYSOP DASHBOARD                          Last Update: ${timeStr}`);
  }

  private updateNodeStatus(nodes: NodeStatus[]) {
    // Implementation from Zone 2 above
  }

  private updateSystemHealth(health: HealthData) {
    // Implementation from Zone 3 above
  }

  private updateDailyStats(stats: DailyStats) {
    // Implementation from Zone 4 above
  }

  private addActivity(activity: ActivityEntry) {
    // Implementation from Zone 5 above
  }

  private updateChatActivity(rooms: ChatRoom[], pages: PageRequest[]) {
    // Implementation from Zone 7 above
  }

  // Interactive methods
  showNodeDetails() { /* Implementation from Interactive Features above */ }
  showStatsOverlay() { /* Implementation from Interactive Features above */ }
  showChatOverlay() { /* Implementation from Interactive Features above */ }
  showKickUserPrompt() { /* Implementation from Interactive Features above */ }
  showBroadcastMessagePrompt() { /* Implementation from Interactive Features above */ }
  showHelpOverlay() { /* Implementation from Interactive Features above */ }

  private showError(message: string) {
    blessed.message({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: 'shrink',
      height: 'shrink',
      border: {
        type: 'line'
      },
      style: {
        fg: 'white',
        bg: 'red',
        border: { fg: 'red' }
      },
      content: `\n ${message} \n`,
      tags: true
    });
    this.screen.render();
  }

  private async waitForExit(): Promise<void> {
    return new Promise((resolve) => {
      this.screen.on('destroy', resolve);
    });
  }

  private cleanup() {
    // Stop all update loops
    if (this.updateManager) {
      this.updateManager.stopPolling();
    }

    // Destroy screen
    if (this.screen) {
      this.screen.destroy();
    }
  }

  async onClose() {
    this.cleanup();
  }

  async onError(error: Error) {
    this.cleanup();
    this.context.output.writeLine(`\nError in dashboard: ${error.message}`);
  }
}
```

---

## Additional Features & Enhancements

### 1. Sound/Visual Alerts

```typescript
class AlertManager {
  private alertQueue: Alert[] = [];

  // Flash screen border on critical events
  flashAlert(color: string, duration: number = 500) {
    // Change border colors briefly
  }

  // Show temporary notification
  showNotification(message: string, type: 'info' | 'warning' | 'error') {
    const notif = blessed.box({
      parent: screen,
      top: 2,
      right: 2,
      width: 40,
      height: 3,
      content: message,
      style: {
        fg: 'white',
        bg: type === 'error' ? 'red' : type === 'warning' ? 'yellow' : 'blue'
      },
      tags: true
    });

    setTimeout(() => {
      notif.destroy();
      screen.render();
    }, 3000);
  }
}
```

### 2. Historical Data Charts

```typescript
// Add sparklines for historical trends
const hourlyCallsChart = grid.set(13, 0, 3, 6, contrib.Line, {
  label: 'Calls (Last 24 Hours)',
  showLegend: false,
  style: {
    line: 'cyan',
    border: { fg: 'cyan' }
  },
  xLabelPadding: 3,
  xPadding: 5
});

// Maintain rolling 24-hour data
const hourlyData: number[] = new Array(24).fill(0);

function updateHourlyChart() {
  hourlyCallsChart.setData([{
    title: 'Calls',
    x: Array.from({ length: 24 }, (_, i) => `${i}:00`),
    y: hourlyData,
    style: { line: 'cyan' }
  }]);
}
```

### 3. Export/Logging Features

```typescript
async exportDashboardData(format: 'json' | 'csv') {
  const snapshot = {
    timestamp: new Date().toISOString(),
    nodes: this.nodeStatus,
    health: this.systemHealth,
    stats: this.dailyStats,
    activity: this.recentActivity
  };

  if (format === 'json') {
    const json = JSON.stringify(snapshot, null, 2);
    await fs.promises.writeFile(`dashboard-${Date.now()}.json`, json);
  } else {
    // Convert to CSV
    const csv = convertToCSV(snapshot);
    await fs.promises.writeFile(`dashboard-${Date.now()}.csv`, csv);
  }
}
```

### 4. Filtering & Search

```typescript
// Filter activity stream
function filterActivity(searchTerm: string) {
  const filtered = recentActivity.filter(a =>
    a.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.action.toLowerCase().includes(searchTerm.toLowerCase())
  );

  activityLog.clearItems();
  filtered.forEach(a => addActivity(a));
  screen.render();
}
```

### 5. Customizable Update Intervals

```typescript
function showSettingsOverlay() {
  // Let sysop configure update intervals
  const form = blessed.form({
    parent: screen,
    top: 'center',
    left: 'center',
    width: 60,
    height: 20,
    border: { type: 'line' },
    label: ' DASHBOARD SETTINGS ',
    tags: true
  });

  // Add textboxes for each update interval
  // Save to preferences
}
```

---

## Performance Optimization

### 1. Throttle Screen Renders

```typescript
class RenderThrottler {
  private renderTimeout: NodeJS.Timeout | null = null;
  private pendingRender = false;

  requestRender(screen: blessed.Widgets.Screen) {
    if (this.renderTimeout) {
      this.pendingRender = true;
      return;
    }

    screen.render();

    this.renderTimeout = setTimeout(() => {
      this.renderTimeout = null;
      if (this.pendingRender) {
        this.pendingRender = false;
        this.requestRender(screen);
      }
    }, 100); // Max 10 FPS
  }
}
```

### 2. Lazy Data Loading

```typescript
// Only load detailed data when overlay is opened
async showNodeDetails(nodeId: number) {
  // Show loading indicator
  const loading = showLoadingIndicator();

  // Fetch detailed data
  const details = await apiClient.getNodeDetails(nodeId);

  loading.destroy();
  // Show details overlay
}
```

### 3. Data Caching

```typescript
class DataCache {
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private ttl = 5000; // 5 seconds

  get(key: string): any | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    if (Date.now() - cached.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  set(key: string, data: any) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }
}
```

---

## Testing & Debugging

### Mock Data Generation

```typescript
function generateMockData(): {
  nodes: NodeStatus[];
  health: HealthData;
  stats: DailyStats;
  activity: ActivityEntry[];
} {
  return {
    nodes: Array.from({ length: 8 }, (_, i) => ({
      nodeId: i,
      status: Math.random() > 0.5 ? 3 : 0,
      handle: `User${i+1}`,
      location: 'Files',
      misc1: 'GAME.ZIP',
      misc2: 1,
      baud: 9600,
      timestamp: Date.now()
    })),
    health: {
      cpu: Math.random() * 100,
      memory: {
        used: Math.random() * 1024 * 1024 * 1024,
        total: 4 * 1024 * 1024 * 1024
      },
      disk: {
        used: Math.random() * 100 * 1024 * 1024 * 1024,
        free: 400 * 1024 * 1024 * 1024,
        total: 500 * 1024 * 1024 * 1024
      },
      uptime: Math.random() * 86400 * 7,
      activeConnections: Math.floor(Math.random() * 20)
    },
    stats: {
      date: new Date().toISOString().split('T')[0],
      totalCalls: Math.floor(Math.random() * 200),
      uniqueUsers: Math.floor(Math.random() * 50),
      totalLogins: Math.floor(Math.random() * 300),
      totalMessages: Math.floor(Math.random() * 500),
      totalUploads: Math.floor(Math.random() * 20),
      totalDownloads: Math.floor(Math.random() * 100),
      totalDoorLaunches: Math.floor(Math.random() * 150)
    },
    activity: Array.from({ length: 50 }, (_, i) => ({
      timestamp: new Date(Date.now() - i * 60000),
      username: ['Hacker', 'Phreaker', 'Trader', 'Elite', 'Guest'][Math.floor(Math.random() * 5)],
      action: ['Login', 'Posted Message', 'Downloaded File', 'Started Door', 'Logoff'][Math.floor(Math.random() * 5)],
      details: '',
      nodeId: Math.floor(Math.random() * 8)
    }))
  };
}
```

### Development Mode

```typescript
// Enable mock data in development
const DEV_MODE = process.env.NODE_ENV === 'development';

if (DEV_MODE) {
  // Use mock data instead of API calls
  this.apiClient.getNodeStatus = async () => generateMockData().nodes;
  this.apiClient.getSystemHealth = async () => generateMockData().health;
  // ... etc
}
```

---

## Package Configuration

### package.json

```json
{
  "name": "@amiexpress/bbs-dashboard",
  "version": "1.0.0",
  "description": "Ultimate live BBS sysop monitoring dashboard with real-time data visualization",
  "main": "index.ts",
  "scripts": {
    "build": "tsc",
    "dev": "ts-node index.ts",
    "watch": "tsc --watch",
    "test": "jest"
  },
  "keywords": [
    "bbs",
    "dashboard",
    "monitoring",
    "sysop",
    "real-time",
    "neo-blessed",
    "blessed-contrib"
  ],
  "author": "AmiExpress",
  "license": "MIT",
  "dependencies": {
    "@amiexpress/bbs-door-sdk": "file:../..",
    "axios": "^1.6.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/blessed": "^0.1.0",
    "typescript": "^5.0.0",
    "ts-node": "^10.9.0"
  },
  "door": {
    "name": "BBS Dashboard",
    "command": "DASHBOARD",
    "description": "Live sysop monitoring dashboard with real-time statistics",
    "author": "AmiExpress",
    "version": "1.0.0",
    "minSecLevel": 255,
    "category": "Sysop",
    "requiresAuth": true
  }
}
```

### tsconfig.json

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./",
    "module": "commonjs",
    "target": "ES2020",
    "lib": ["ES2020"],
    "esModuleInterop": true,
    "skipLibCheck": true,
    "strict": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

---

## Deployment & Installation

### Door .info File

Create `DASHBOARD.info` for BBS registration:

```
NAME=BBS Dashboard
COMMAND=DASHBOARD
DESCRIPTION=Live sysop monitoring dashboard
CATEGORY=Sysop
MIN_SEC_LEVEL=255
EXECUTABLE=node
ARGS=dist/index.js
WORKING_DIR=/path/to/Doors/bbs-dashboard
```

### Environment Variables

Create `.env` file:

```env
BACKEND_URL=http://localhost:3001
API_TIMEOUT=5000
UPDATE_INTERVAL_NODES=1000
UPDATE_INTERVAL_HEALTH=5000
UPDATE_INTERVAL_STATS=10000
DEV_MODE=false
```

---

## Success Criteria

This dashboard is successful when a sysop can:

1. ✅ See ALL active users and their current activities in real-time
2. ✅ Monitor system performance (CPU, memory, disk) with visual gauges
3. ✅ Track today's statistics (calls, messages, transfers) with progress indicators
4. ✅ View live activity stream of all BBS events as they happen
5. ✅ Monitor file transfers in progress with speed and percentage
6. ✅ See active chat rooms and pending sysop pages immediately
7. ✅ Visualize message distribution across conferences
8. ✅ Kick problematic users with a single keypress
9. ✅ Send system-wide messages instantly
10. ✅ Access detailed node information on demand
11. ✅ Never need to SSH into the server for routine monitoring
12. ✅ Have confidence that their BBS is healthy and active

**The dashboard should feel like a real-time command center** - responsive, informative, and empowering.

---

## Implementation Timeline

**Phase 1: Core Layout & Widgets** (Day 1-2)
- Grid setup
- All 8 zones created
- Static mock data displayed

**Phase 2: API Integration** (Day 3-4)
- API client implementation
- Real data fetching
- Error handling

**Phase 3: Real-Time Updates** (Day 5-6)
- Update loops
- Polling strategy
- Performance optimization

**Phase 4: Interactivity** (Day 7-8)
- Keyboard shortcuts
- Overlays (node details, stats, chat)
- Sysop controls (kick, message)

**Phase 5: Polish & Testing** (Day 9-10)
- Visual refinements
- Alert system
- Documentation
- Production testing

---

## Final Notes

**Remember:**
- BBS width is ALWAYS 80 columns - design everything to fit
- Update intervals should be configurable
- Error handling is critical - don't crash on API failures
- Visual feedback for every user action
- Performance matters - throttle renders, cache data
- Sysop security - verify permissions for all actions
- Graceful degradation if data sources are unavailable

**This is the crown jewel of BBS administration tools.** Make it spectacular! 🚀
