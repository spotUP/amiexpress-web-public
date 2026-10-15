# BBS Event Emission API - Door Developer Guide

## Overview

The AmiExpress BBS provides a powerful event emission system that allows TypeScript doors to broadcast custom events to:
- **LiveChat**: Users in the LiveChat door will see real-time notifications of door activities
- **Webhooks**: External integrations can receive BBS event notifications

This enables doors to create a more social, interactive experience by sharing significant actions with the BBS community.

---

## Quick Start

### Basic Event Emission

```typescript
import { DoorContext } from '@amiexpress/bbs-door-sdk';

// In your door's onStart handler
door.onStart(async (ctx: DoorContext) => {
  // Emit a simple event
  if (ctx.bbs?.emitCustomEvent) {
    ctx.bbs.emitCustomEvent(
      'game_started',                    // Event type
      'Started a new game of Chess',     // Display message
      { gameName: 'Chess', difficulty: 'Hard' }  // Optional data
    );
  }
});
```

### How It Works

1. Your door calls `ctx.bbs.emitCustomEvent()`
2. The BBS broadcasts the event via Socket.IO to all connected clients
3. LiveChat receives the event on the `bbs:event` channel
4. LiveChat formats and displays the event in the chat log
5. Webhooks (if configured) receive the event notification

---

## API Reference

### `ctx.bbs.emitCustomEvent(eventType, message, data?)`

Emits a custom door event that will be broadcast to LiveChat and webhooks.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `eventType` | `string` | Yes | Type identifier for the event (e.g., 'project_created', 'task_completed') |
| `message` | `string` | Yes | Human-readable message displayed in LiveChat |
| `data` | `Record<string, any>` | No | Additional structured data included with the event |

**Example:**
```typescript
ctx.bbs.emitCustomEvent(
  'achievement_unlocked',
  'Unlocked achievement "Speed Demon" (+100 pts)',
  {
    achievementId: 'speed-demon',
    achievementName: 'Speed Demon',
    points: 100,
    totalPoints: 1250
  }
);
```

---

## Event Types and Color Coding

LiveChat automatically color-codes events based on the `eventType` string:

| Pattern | Color | Use Case |
|---------|-------|----------|
| Contains `create`, `add`, `new` | Green | Creation events |
| Contains `delete`, `remove` | Red | Deletion events |
| Contains `complete`, `done`, `finish` | Blue | Completion events |
| Contains `achievement`, `unlock` | Yellow | Achievement events |
| Contains `update`, `edit`, `move` | Cyan | Modification events |
| Other | White | General events |

**Examples:**
```typescript
// Green - Creation
ctx.bbs.emitCustomEvent('project_created', 'Created new demo project');

// Red - Deletion
ctx.bbs.emitCustomEvent('project_deleted', 'Deleted project "Old Demo"');

// Blue - Completion
ctx.bbs.emitCustomEvent('task_completed', 'Completed task "Fix bug" (+10 pts)');

// Yellow - Achievement
ctx.bbs.emitCustomEvent('achievement_unlocked', 'Unlocked "First Blood"');

// Cyan - Update
ctx.bbs.emitCustomEvent('task_moved', 'Moved task from TODO to IN PROGRESS');
```

---

## Complete Examples

### Example 1: Project Management Door (WHIP)

```typescript
// When user creates a new project
await dataManager.addProject(project);

if (ctx.bbs?.emitCustomEvent) {
  ctx.bbs.emitCustomEvent(
    'project_created',
    `Created new ${project.type} project "${project.name}"`,
    {
      projectType: project.type,
      projectId: project.id,
      status: project.status
    }
  );
}
```

### Example 2: Task Completion with Achievement

```typescript
// When user completes a task
task.status = 'done';
await dataManager.updateTask(task);

// Award points
userData.points += task.points;
await dataManager.updateUser(userData);

// Emit task completion event
if (ctx.bbs?.emitCustomEvent) {
  ctx.bbs.emitCustomEvent(
    'task_completed',
    `Completed task "${task.title}" (+${task.points} pts)`,
    {
      taskId: task.id,
      points: task.points,
      totalPoints: userData.points,
      level: userData.level
    }
  );
}

// Check for achievements
const newAchievements = await achievementManager.check(userData);

// Emit achievement unlock events
for (const achievement of newAchievements) {
  if (ctx.bbs?.emitCustomEvent) {
    ctx.bbs.emitCustomEvent(
      'achievement_unlocked',
      `Unlocked achievement "${achievement.name}" (+${achievement.points} pts)`,
      {
        achievementId: achievement.id,
        achievementName: achievement.name,
        points: achievement.points,
        totalPoints: userData.points
      }
    );
  }
}
```

### Example 3: Game Events

```typescript
// Game started
ctx.bbs.emitCustomEvent(
  'game_started',
  `Started a new game of ${gameName}`,
  { gameName, players: 2, mode: 'competitive' }
);

// Game ended
ctx.bbs.emitCustomEvent(
  'game_finished',
  `${winner} won the game! Score: ${score}`,
  { winner, loser, score, duration: gameTime }
);

// High score
ctx.bbs.emitCustomEvent(
  'highscore_achieved',
  `New high score: ${score} points!`,
  { gameName, score, previousHighScore }
);
```

### Example 4: Social Events

```typescript
// User joined room
ctx.bbs.emitCustomEvent(
  'user_joined_room',
  `${username} joined the lounge`,
  { roomId, roomName, userCount: users.length }
);

// User sent gift
ctx.bbs.emitCustomEvent(
  'gift_sent',
  `${sender} sent ${receiver} a virtual coffee!`,
  { sender, receiver, giftType: 'coffee' }
);
```

---

## LiveChat Display Format

Events appear in LiveChat with the following format:

```
[HH:MM] [DoorName] Username: Message
```

**Example output in LiveChat:**
```
[14:32] [WHIP] sysop: Created new demo project "Revision 2025"
[14:33] [WHIP] sysop: Created new code task "Raymarcher" (15 pts) in "Revision 2025"
[14:45] [WHIP] sysop: Completed task "Raymarcher" (+15 pts) in "Revision 2025"
[14:45] [WHIP] sysop: Unlocked achievement "First Release" (+10 pts)
```

---

## Best Practices

### 1. Use Descriptive Event Types

✅ **Good:**
```typescript
ctx.bbs.emitCustomEvent('project_created', 'Created new demo project');
ctx.bbs.emitCustomEvent('task_completed', 'Completed coding task');
ctx.bbs.emitCustomEvent('achievement_unlocked', 'Unlocked achievement');
```

❌ **Bad:**
```typescript
ctx.bbs.emitCustomEvent('event', 'Something happened');
ctx.bbs.emitCustomEvent('action', 'User did thing');
```

### 2. Write Clear Messages

Messages should be understandable without context.

✅ **Good:**
```typescript
'Completed task "Fix login bug" (+10 pts) in project "BBS v2.0"'
'Unlocked achievement "Speed Demon" (+100 pts)'
```

❌ **Bad:**
```typescript
'Task done'  // What task? What project?
'Achievement'  // Which one? How many points?
```

### 3. Include Useful Data

The `data` parameter should include information that:
- Could be used by webhooks for automation
- Provides context for debugging
- Enables future analytics

```typescript
ctx.bbs.emitCustomEvent(
  'task_completed',
  'Completed task "Raymarcher" (+15 pts)',
  {
    projectId: project.id,
    projectName: project.name,
    taskId: task.id,
    taskCategory: task.category,  // 'code', 'gfx', 'music'
    points: task.points,
    totalPoints: userData.points,
    level: userData.level  // 'lamer', 'scener', 'elite', 'legend'
  }
);
```

### 4. Don't Spam Events

Only emit events for significant actions that users care about.

✅ **Emit events for:**
- Creating/deleting major items (projects, games, rooms)
- Completing tasks or achieving milestones
- Unlocking achievements
- Major state changes (game started, tournament winner)

❌ **Don't emit events for:**
- Navigation (user opened menu, closed dialog)
- Minor UI interactions (scrolled list, clicked button)
- Frequent updates (score changed by 1 point every second)

### 5. Check for BBS API Availability

Always check if the BBS API is available before emitting:

```typescript
if (ctx.bbs?.emitCustomEvent) {
  ctx.bbs.emitCustomEvent(...);
}
```

This ensures your door works even if the BBS API isn't present (e.g., during testing).

---

## Event Data Structure

When an event is emitted, the BBS wraps it with metadata:

```typescript
{
  type: 'custom_door_event',
  username: 'sysop',         // Automatically added from session
  nodeId: 1,                  // Automatically added from session
  timestamp: 1234567890,      // Automatically added (Date.now())
  data: {
    doorName: 'WHIP',         // Automatically added from session
    eventType: 'task_completed',  // Your eventType parameter
    message: 'Completed task...',  // Your message parameter
    // ... your custom data fields ...
    projectId: 'abc123',
    points: 15,
    totalPoints: 125
  }
}
```

---

## Testing Events

### 1. Test in LiveChat

1. Start the BBS servers: `./dev/scripts/start-servers.sh`
2. Open two browser windows to `http://localhost:3001`
3. Window 1: Log in and run the LiveChat door (`CHAT` command)
4. Window 2: Log in and run your door (e.g., `WHIP` command)
5. Perform actions in your door (Window 2)
6. Watch for events appearing in LiveChat (Window 1)

### 2. Test with Browser Console

Open browser dev tools and monitor the Socket.IO events:

```javascript
// In browser console
io().on('bbs:event', (event) => {
  console.log('BBS Event:', event);
});
```

### 3. Test Event Formatting

You can test how your events will look in LiveChat:

```typescript
// In your door code (temporary testing)
const testEvents = [
  { type: 'project_created', message: 'Created new demo project "Test"' },
  { type: 'task_completed', message: 'Completed task "Fix bug" (+10 pts)' },
  { type: 'achievement_unlocked', message: 'Unlocked "First Blood" (+50 pts)' }
];

for (const event of testEvents) {
  ctx.bbs?.emitCustomEvent(event.type, event.message);
  await sleep(1000);  // 1 second delay to see each event
}
```

---

## WHIP Door Event Reference

The WHIP door emits the following events:

| Event Type | Trigger | Example Message |
|------------|---------|-----------------|
| `project_created` | User creates new project | `Created new demo project "Revision 2025"` |
| `project_updated` | User edits project | `Updated project "Revision 2025"` |
| `project_deleted` | User deletes project | `Deleted project "Old Demo"` |
| `task_created` | User creates new task | `Created new code task "Raymarcher" (15 pts) in "Revision 2025"` |
| `task_updated` | User edits task | `Updated task "Raymarcher" in "Revision 2025"` |
| `task_deleted` | User deletes task | `Deleted task "Fix bug" from project "BBS v2.0"` |
| `task_moved` | User moves task to different column | `Moved task "Raymarcher" from TODO to IN PROGRESS` |
| `task_completed` | User completes task (moved to DONE) | `Completed task "Raymarcher" (+15 pts) in "Revision 2025"` |
| `achievement_unlocked` | User unlocks achievement | `Unlocked achievement "First Release" (+10 pts)` |

---

## Troubleshooting

### Events Not Appearing in LiveChat

1. **Check if LiveChat is listening:**
   - LiveChat automatically listens to `bbs:event` on startup
   - No configuration needed

2. **Check if BBS API is available:**
   ```typescript
   console.log('BBS API available:', !!ctx.bbs);
   console.log('emitCustomEvent available:', typeof ctx.bbs?.emitCustomEvent);
   ```

3. **Check server logs:**
   - Look for `[BBSEventEmitter]` messages in backend logs
   - Verify events are being emitted

4. **Check Socket.IO connection:**
   - LiveChat must be connected to Socket.IO
   - Check browser console for Socket.IO errors

### Events Not Formatted Correctly

1. **Check event type naming:**
   - Use underscore_case: `task_completed`
   - Include action words: `created`, `deleted`, `completed`, `unlocked`

2. **Check message clarity:**
   - Include enough context (project name, task name, points)
   - Use double quotes for names: `"Project Name"`

3. **Verify color coding:**
   - Event type must contain specific keywords for colors
   - See "Event Types and Color Coding" section above

---

## See Also

- [TYPESCRIPT_DOOR_GUIDE.md](./TYPESCRIPT_DOOR_GUIDE.md) - TypeScript door development
- [NEO_BLESSED_QUICK_START.md](./NEO_BLESSED_QUICK_START.md) - UI development
- `web/backend/src/services/bbs-event-emitter.ts` - Event emitter source
- `Doors/livechat/handlers/bbs-event.handler.ts` - LiveChat event handler
- `Doors/whip/` - WHIP door source (complete example)
