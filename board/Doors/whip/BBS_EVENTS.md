# WHIP Door - BBS Event Emission

This document lists all BBS events emitted by the WHIP door for LiveChat and webhook integrations.

## Events Overview

The WHIP door emits 9 different event types covering project management, task management, and achievements.

---

## Project Events

### `project_created`

**Trigger:** User creates a new project

**Example Message:**
```
Created new demo project "Revision 2025"
```

**Data Fields:**
```typescript
{
  projectType: 'demo',        // demo, intro, musicdisk, graphics, music, code, tools
  projectId: 'uuid',
  status: 'planning'          // planning, active, released
}
```

**LiveChat Display:**
```
[14:32] [WHIP] sysop: Created new demo project "Revision 2025"
```

---

### `project_updated`

**Trigger:** User edits an existing project

**Example Message:**
```
Updated project "Revision 2025"
```

**Data Fields:**
```typescript
{
  projectType: 'demo',
  projectId: 'uuid',
  status: 'active'
}
```

---

### `project_deleted`

**Trigger:** User deletes a project

**Example Message:**
```
Deleted project "Old Demo"
```

**Data Fields:**
```typescript
{
  projectType: 'demo',
  projectId: 'uuid'
}
```

**LiveChat Display:**
```
[14:35] [WHIP] sysop: Deleted project "Old Demo"
```

---

## Task Events

### `task_created`

**Trigger:** User creates a new task

**Example Message:**
```
Created new code task "Raymarcher" (15 pts) in "Revision 2025"
```

**Data Fields:**
```typescript
{
  projectId: 'uuid',
  projectName: 'Revision 2025',
  taskId: 'uuid',
  taskCategory: 'code',       // code, music, gfx, design, effects, engine, 3d
  taskPriority: 'elite',      // lamer, scener, elite, legend
  points: 15
}
```

**LiveChat Display:**
```
[14:33] [WHIP] sysop: Created new code task "Raymarcher" (15 pts) in "Revision 2025"
```

---

### `task_updated`

**Trigger:** User edits an existing task

**Example Message:**
```
Updated task "Raymarcher" in "Revision 2025"
```

**Data Fields:**
```typescript
{
  projectId: 'uuid',
  projectName: 'Revision 2025',
  taskId: 'uuid',
  taskCategory: 'code'
}
```

---

### `task_deleted`

**Trigger:** User deletes a task

**Example Message:**
```
Deleted task "Old Feature" from project "BBS v2.0"
```

**Data Fields:**
```typescript
{
  projectId: 'uuid',
  projectName: 'BBS v2.0',
  taskId: 'uuid',
  taskCategory: 'code'
}
```

---

### `task_moved`

**Trigger:** User moves task to a different kanban column (not to DONE)

**Example Message:**
```
Moved task "Raymarcher" from TODO to IN PROGRESS
```

**Data Fields:**
```typescript
{
  projectId: 'uuid',
  projectName: 'Revision 2025',
  taskId: 'uuid',
  fromStatus: 'todo',         // todo, in-progress, testing, done
  toStatus: 'in-progress'
}
```

**LiveChat Display:**
```
[14:40] [WHIP] sysop: Moved task "Raymarcher" from TODO to IN PROGRESS
```

---

### `task_completed`

**Trigger:** User moves task to DONE column (task completion)

**Example Message:**
```
Completed task "Raymarcher" (+15 pts) in "Revision 2025"
```

**Data Fields:**
```typescript
{
  projectId: 'uuid',
  projectName: 'Revision 2025',
  taskId: 'uuid',
  taskCategory: 'code',
  points: 15,                 // Points awarded for this task
  totalPoints: 125,           // User's total points after award
  level: 'scener'             // User's level after award (lamer, scener, elite, legend)
}
```

**LiveChat Display:**
```
[14:45] [WHIP] sysop: Completed task "Raymarcher" (+15 pts) in "Revision 2025"
```

---

## Achievement Events

### `achievement_unlocked`

**Trigger:** User unlocks an achievement (usually after task completion)

**Example Message:**
```
Unlocked achievement "First Release" (+10 pts)
```

**Data Fields:**
```typescript
{
  achievementId: 'first-release',
  achievementName: 'First Release',
  points: 10,                 // Points awarded for achievement
  category: 'tasks',          // tasks, projects, parties, social, special
  totalPoints: 135            // User's total points after award
}
```

**LiveChat Display:**
```
[14:45] [WHIP] sysop: Unlocked achievement "First Release" (+10 pts)
```

---

## Event Flow Examples

### Example 1: Creating a Project and First Task

```
[14:30] [WHIP] sysop: Created new demo project "Revision 2025"
[14:31] [WHIP] sysop: Created new code task "Raymarcher" (15 pts) in "Revision 2025"
```

### Example 2: Completing First Task (Triggers Achievement)

```
[14:45] [WHIP] sysop: Completed task "Raymarcher" (+15 pts) in "Revision 2025"
[14:45] [WHIP] sysop: Unlocked achievement "First Release" (+10 pts)
```

### Example 3: Task Workflow Through Kanban

```
[15:00] [WHIP] sysop: Created new gfx task "Spaceship Sprite" (10 pts) in "Revision 2025"
[15:05] [WHIP] sysop: Moved task "Spaceship Sprite" from TODO to IN PROGRESS
[15:30] [WHIP] sysop: Moved task "Spaceship Sprite" from IN PROGRESS to TESTING
[15:35] [WHIP] sysop: Completed task "Spaceship Sprite" (+10 pts) in "Revision 2025"
```

### Example 4: Multiple Achievements

```
[16:00] [WHIP] sysop: Completed task "Final Polish" (+5 pts) in "Revision 2025"
[16:00] [WHIP] sysop: Unlocked achievement "Productive" (+100 pts)
[16:00] [WHIP] sysop: Unlocked achievement "Swiss Army Knife" (+100 pts)
```

---

## Event Color Coding in LiveChat

| Event Type | Color | Reason |
|------------|-------|--------|
| `project_created` | Green | Contains "created" |
| `project_updated` | Cyan | Contains "updated" |
| `project_deleted` | Red | Contains "deleted" |
| `task_created` | Green | Contains "created" |
| `task_updated` | Cyan | Contains "updated" |
| `task_deleted` | Red | Contains "deleted" |
| `task_moved` | Cyan | Contains "moved" |
| `task_completed` | Blue | Contains "completed" |
| `achievement_unlocked` | Yellow | Contains "unlocked" |

---

## Testing Event Emission

### 1. Enable Debug Logging (Optional)

In `app.ts`, you can add console logging before emitting events:

```typescript
console.log('[WHIP Event]', eventType, message);
ctx.bbs?.emitCustomEvent(eventType, message, data);
```

### 2. Test with Two Browser Windows

1. **Window 1 (LiveChat):**
   - Log in as any user
   - Run `CHAT` command
   - Watch for WHIP events appearing in chat log

2. **Window 2 (WHIP):**
   - Log in as any user
   - Run `WHIP` command
   - Create project → See event in Window 1
   - Create task → See event in Window 1
   - Complete task → See 2 events (completion + achievement)

### 3. Check Backend Logs

Server logs will show:
```
[BBSEventEmitter] Emitted custom_door_event: sysop (node 1)
```

---

## Webhook Integration (Future)

When webhooks are configured, each event will be sent as a POST request:

```json
{
  "type": "custom_door_event",
  "username": "sysop",
  "nodeId": 1,
  "timestamp": 1234567890,
  "data": {
    "doorName": "WHIP",
    "eventType": "task_completed",
    "message": "Completed task \"Raymarcher\" (+15 pts) in \"Revision 2025\"",
    "projectId": "abc123",
    "projectName": "Revision 2025",
    "taskId": "xyz789",
    "taskCategory": "code",
    "points": 15,
    "totalPoints": 125,
    "level": "scener"
  }
}
```

This allows external services to:
- Track project progress
- Award badges on external platforms
- Send Discord/Slack notifications
- Update project management tools
- Trigger CI/CD pipelines
- Generate analytics reports

---

## See Also

- [BBS_EVENT_EMISSION_GUIDE.md](../../Documentation/4-Door-Developers/BBS_EVENT_EMISSION_GUIDE.md) - Complete event emission guide
- [AUDIT_FIXES.md](./AUDIT_FIXES.md) - Full audit of WHIP door implementation
- `ui/project-list.ts` - Project event emission code
- `ui/kanban-board.ts` - Task event emission code
