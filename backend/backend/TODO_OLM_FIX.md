# OLM Fix Implementation TODO

## Background
Remote branch had commit 6ff47ed with important OLM fixes that couldn't be cherry-picked due to code structure differences (our modularization).

## What Needs to Be Implemented

### 1. Add blockOLM Flag to Session
```typescript
// In BBSSession type (index.ts or types.ts)
blockOLM?: boolean;  // Blocks online messages when true
```

### 2. Implement OLM TOGGLE Command
**Location:** `backend/backend/src/handlers/preference-chat-commands.handler.ts`

**Current:** Stub implementation at line 220

**Required Changes:**
```typescript
// When params contain "TOGGLE":
if (params.toUpperCase().includes('TOGGLE')) {
  session.blockOLM = !session.blockOLM;
  const status = session.blockOLM ? 'BLOCKED' : 'ALLOWED';
  socket.emit('ansi-output', `\r\nOnline messages are now ${status}\r\n`);
  return;
}
```

### 3. Check blockOLM in OLM Command
**Before allowing OLM access:**
```typescript
if (session.blockOLM) {
  socket.emit('ansi-output', '\r\nYou have blocked online messages.\r\n');
  socket.emit('ansi-output', 'Use OLM TOGGLE to re-enable.\r\n');
  return;
}
```

## Original Fix Details
- **Commit:** 6ff47ed4e356fe7b98b7309d7c5f47e6f9b875a3
- **Date:** Sun Oct 19 23:17:56 2025 +0200
- **Behavior:** 1:1 compatibility with express.e OLM command
- **Reference:** express.e lines 25406-25470

## Status
- [ ] Add blockOLM to session type
- [ ] Implement OLM TOGGLE
- [ ] Implement OLM main command
- [ ] Check blockOLM flag before access
- [ ] Test with multiple nodes
- [ ] Verify 1:1 compatibility with express.e

## Priority
Medium - Apply when implementing full OLM system (currently stubbed)
