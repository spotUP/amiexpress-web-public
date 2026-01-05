# Async File Operations Analysis

**Status:** Design document - requires express.e behavior verification
**Impact:** Potential 30-50% improvement for I/O-heavy operations
**Compatibility:** CRITICAL - Must maintain 100% express.e synchronous behavior

---

## Overview

Express.e performs all file I/O synchronously because:
1. Amiga file system is fast (direct hardware access)
2. No threading model in ARexx
3. Sequential execution model throughout

**Challenge:** Node.js async I/O is faster, BUT we must maintain exact express.e timing and behavior.

---

## Express.e Behavior Analysis

### Synchronous Patterns in Express.e

#### Pattern 1: Sequential File Reads
```rexx
/* express.e:5496-5504 - Display file */
IF (Open(fileh, filename, 'R')) THEN DO
  content = ReadLn(fileh)
  RawWrite(content)  /* Blocks until written */
  Call Close(fileh)
END
```

**Behavior:**
- File opened
- Content read (blocking)
- Output written (blocking)
- File closed
- Next operation ONLY after close completes

#### Pattern 2: File List Display
```rexx
/* express.e:20140-20200 - File listings */
DO i = 1 TO fileCount
  filename = GetFilename(i)
  size = GetFileSize(i)
  RawWrite(filename || ' ' || size || '\n')
END
```

**Behavior:**
- Files processed sequentially
- Output appears in exact order
- Each file fully processed before next

#### Pattern 3: User Input After File Display
```rexx
/* express.e:28556-28557 - Display + Pause */
IF (displayScreen(SCREEN_BULL)) THEN doPause()
```

**Behavior:**
- Screen fully loaded and displayed
- Pause prompt appears AFTER complete display
- User can't interact until display complete

---

## Where Async is SAFE (No Behavior Change)

### Safe Pattern 1: Background Preloading

**Express.e equivalent:** None (no preloading)
**Node.js benefit:** Preload next screen while user reads current

```typescript
// SAFE: Preload doesn't change when content appears
async function preloadNextScreen(screenName: string): Promise<void> {
  // Load in background, cache for when needed
  const content = await fs.promises.readFile(screenPath, 'utf8');
  fileCache.set(screenName, content);
}

// User sees current screen (synchronous)
displayScreen(socket, session, 'MENU');

// Meanwhile, preload next likely screen (async, background)
preloadNextScreen('CONF_BULL').catch(() => {/* ignore errors */});
```

**Why safe:** User experience identical - current screen still synchronous

### Safe Pattern 2: Batch File Stats

**Express.e equivalent:** Stats read sequentially
**Node.js benefit:** Read stats in parallel, display in same order

```typescript
// Express.e: Sequential stats (slow)
for (const file of files) {
  const stats = fs.statSync(file.path);  // Blocking
  file.size = stats.size;
}

// Node.js: Parallel stats (fast), same display order
const statsPromises = files.map(f => fs.promises.stat(f.path));
const stats = await Promise.all(statsPromises);

files.forEach((file, i) => {
  file.size = stats[i].size;  // Same order as express.e
});
```

**Why safe:** Files displayed in same order, just faster to gather stats

### Safe Pattern 3: Log File Writes

**Express.e equivalent:** Synchronous log writes
**Node.js benefit:** Non-blocking log writes

```typescript
// Express.e: Blocking log write
fs.writeFileSync('/logs/caller.log', entry);  // Blocks

// Node.js: Async log write (safe because logs are append-only)
fs.promises.appendFile('/logs/caller.log', entry).catch(err => {
  console.error('Log write failed:', err);
});
// Continue immediately - don't wait for log
```

**Why safe:** Logs don't affect user experience, append-only

---

## Where Async is UNSAFE (Changes Behavior)

### Unsafe Pattern 1: Sequential Display

**Problem:** Async breaks display order
```typescript
// WRONG - Display order not guaranteed
files.forEach(async file => {
  const content = await fs.promises.readFile(file.path);
  socket.emit('ansi-output', content);  // Out of order!
});
```

**Express.e expects:** Files in exact order
**Async result:** Files appear in random completion order

### Unsafe Pattern 2: File Display + Prompt

**Problem:** Prompt appears before file loaded
```typescript
// WRONG - Prompt before content
(async () => {
  const content = await fs.promises.readFile(screenPath);
  socket.emit('ansi-output', content);
})();
socket.emit('ansi-output', 'Press any key: ');  // Shows BEFORE content!
```

**Express.e expects:** Content, then prompt
**Async result:** Prompt, then content (reversed!)

### Unsafe Pattern 3: Config File Reads

**Problem:** Using stale config during async load
```typescript
// WRONG - May use old config
(async () => {
  bbsConfig = await loadBBSConfig();  // Slow
})();

// This runs BEFORE config loaded!
const userName = bbsConfig.sysopName;  // Undefined or stale!
```

**Express.e expects:** Config loaded before use
**Async result:** Undefined or stale config

---

## Safe Async Implementation Strategy

### Strategy 1: Preload + Synchronous Use

```typescript
/**
 * Preload commonly accessed files in background
 * Use synchronously when needed (from cache)
 */
class AsyncPreloader {
  private preloading = new Set<string>();

  // Preload in background (async)
  async preload(filePath: string): Promise<void> {
    if (this.preloading.has(filePath)) return;
    this.preloading.add(filePath);

    try {
      const content = await fs.promises.readFile(filePath, 'utf8');
      fileCache.set(filePath, content);
    } finally {
      this.preloading.delete(filePath);
    }
  }

  // Use synchronously (from cache or blocking read)
  getSync(filePath: string): string {
    // Try cache first (preloaded)
    if (fileCache.has(filePath)) {
      return fileCache.get(filePath);
    }

    // Fall back to sync read (express.e behavior)
    return fs.readFileSync(filePath, 'utf8');
  }
}
```

**Benefits:**
- Fast when preloaded (async benefit)
- Correct when not preloaded (express.e behavior)
- Zero behavior change

### Strategy 2: Parallel Stats, Sequential Display

```typescript
/**
 * Gather file stats in parallel, display sequentially
 */
async function getFileListingFast(files: string[]): Promise<FileInfo[]> {
  // Parallel stats (async)
  const statsPromises = files.map(f => fs.promises.stat(f));
  const stats = await Promise.all(statsPromises);

  // Build info in same order
  return files.map((file, i) => ({
    name: path.basename(file),
    size: stats[i].size,
    mtime: stats[i].mtime
  }));
}

// Display sequentially (express.e order)
function displayFileList(socket: Socket, files: FileInfo[]): void {
  files.forEach(file => {
    socket.emit('ansi-output', `${file.name} ${file.size}\r\n`);
  });
}
```

**Benefits:**
- Faster stats gathering (parallel I/O)
- Same display order (sequential output)
- Express.e behavior maintained

### Strategy 3: Background Writes

```typescript
/**
 * Write logs asynchronously (safe for append-only files)
 */
class AsyncLogger {
  async log(entry: string): Promise<void> {
    // Don't await - fire and forget
    fs.promises.appendFile(logPath, entry).catch(err => {
      console.error('Log write failed:', err);
    });
    // Return immediately - don't block
  }
}
```

**Benefits:**
- Non-blocking log writes
- No user-visible delay
- Errors logged but don't block

---

## Implementation Plan

### Phase 1: Safe Background Operations (Low Risk)

1. **Preload Screens**
   - Preload MENU after LOGON display
   - Preload CONF_BULL after MENU
   - Preload common screens at startup

2. **Async Log Writes**
   - CallersLog updates
   - SamiLog writes
   - Debug logs

3. **Parallel File Stats**
   - File listings (FL, FR commands)
   - Directory scans
   - File area displays

### Phase 2: Careful Async Reads (Medium Risk)

4. **Bulletin Preloading**
   - Preload bull1-5.txt at startup
   - Refresh on timer

5. **Door Config Preloading**
   - Preload .info files at startup
   - Refresh on changes

### Phase 3: Analysis Required (High Risk)

6. **Message Scanning**
   - Requires careful express.e behavior analysis
   - Must maintain exact scan order

7. **File Uploads**
   - Already async (Socket.IO)
   - Verify no behavior changes

---

## Express.e Verification Checklist

For EACH async operation:

1. ✅ **Output order unchanged**
   - Files appear in same sequence
   - Screens display in same order
   - Prompts appear at same time

2. ✅ **Timing unchanged**
   - Pause after display (not before)
   - Prompt after content (not before)
   - Input blocked until ready

3. ✅ **Error handling unchanged**
   - Same error messages
   - Same fallback behavior
   - Same recovery steps

4. ✅ **User experience identical**
   - No visible timing changes
   - No missing content
   - No race conditions

---

## Monitoring

```typescript
// Track async operation timing
class AsyncMonitor {
  async wrapAsync<T>(
    name: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const start = performance.now();
    try {
      return await operation();
    } finally {
      const duration = performance.now() - start;
      console.log(`[Async] ${name}: ${duration.toFixed(2)}ms`);
    }
  }
}
```

---

## Conclusion

**Async file operations CAN be used safely IF:**
- Background preloading (no behavior change)
- Parallel stats gathering (same display order)
- Async log writes (append-only, non-critical)

**Async file operations MUST NOT:**
- Change display order
- Show prompts before content
- Use config before loaded
- Break sequential processing

**Key Rule:** When in doubt, use synchronous. Express.e is synchronous throughout - async is an optimization, not a requirement.

**Recommendation:** Start with Phase 1 (preloading, logs, stats). Only proceed to Phase 2/3 after thorough express.e behavior verification.
