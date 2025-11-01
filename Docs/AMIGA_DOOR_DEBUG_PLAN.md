# Amiga Door Output Debugging Plan
## 2025-10-31

### Problem
User reports: **"no door has echoed any text to the bbs yet"**

This refers to Amiga executable doors (XIM, AIM, SIM types) not producing visible output in the terminal when executed.

### Understanding the System

**Door Types**:
1. **MCI Doors** (TYPE=MCI): Display text with MCI codes - these work ✅
2. **XIM Doors** (TYPE=XIM): Amiga executables using XIM protocol - NOT WORKING ❌
3. **AIM Doors** (TYPE=AIM): Amiga executables using AEDoor.library - NOT WORKING ❌
4. **SIM Doors** (TYPE=SIM): Standard Amiga executables - NOT WORKING ❌

**Output Flow for Amiga Doors**:
```
Amiga Door Executable (68k code)
  ↓
XIM Protocol Call (e.g., XIM_PRINT)
  ↓
XIMProtocol.ts:handleXimCommand()
  ↓
socket.emit('ansi-output', text)
  ↓
Frontend (Socket.IO listener)
  ↓
xterm.js Terminal Display
```

### Debugging Steps

#### Step 1: Verify Backend is Emitting Output

**Add logging to XIMProtocol.ts**:

```typescript
// In XIMProtocol.ts - every socket.emit call
socket.emit('ansi-output', text);
console.log('🔊 [XIM OUTPUT]', text.substring(0, 100)); // Log first 100 chars
```

**Add logging to AmigaDoorSession.ts**:

```typescript
// When door starts
console.log('🚪 [DOOR START]', doorPath);

// When XIM protocol is initialized
console.log('✅ [XIM INIT] Protocol ready');

// When door exits
console.log('🛑 [DOOR EXIT] Exit code:', exitCode);
```

#### Step 2: Test with Simplest Door

**Bulls Door** (`/reference-boardBBS/Doors/emp_tools/Bulls`):
- Simple bulletin reader
- XIM type door
- Should output text immediately
- Good test case for basic output

**How to test**:
1. Copy Bulls door: `cp -r /path/to/reference-boardBBS/Doors/emp_tools/Bulls /path/to/our/Doors/EmP_Tools/`
2. Copy B.info: `cp /path/to/reference-boardBBS/Commands/BBSCmd/B.info /path/to/our/Commands/BBSCmd/`
3. Restart backend
4. Test: Login, type `B`, press Enter
5. Watch backend logs: `tail -f /tmp/backend.log`

#### Step 3: Verify Frontend Receives Output

**Add logging to frontend** (if not already present):

```javascript
socket.on('ansi-output', (data) => {
  console.log('📥 [FRONTEND] Received output:', data.substring(0, 100));
  terminal.write(data);
});
```

**Check browser console**:
1. Open browser dev tools (F12)
2. Go to Console tab
3. Execute door
4. Look for `📥 [FRONTEND] Received output:` messages

#### Step 4: Check Door Initialization

**Verify AEDoorInitPort() is called**:

```typescript
// In AEDoorLibrary.ts
aedoor_InitPort(a0Ptr: number): number {
  console.log('🔧 [AEDOOR] InitPort called - initializing XIM protocol');
  // ... existing code
}
```

**What to look for**:
- Does door call InitPort?
- Does InitPort successfully create XIM protocol?
- Are there any errors during initialization?

#### Step 5: Monitor CPU Execution

**Check if door is stuck in loop**:

```typescript
// In MoiraEmulator.ts
execute(): void {
  this.instructionCount++;

  if (this.instructionCount % 10000 === 0) {
    console.log(`🔄 [CPU] ${this.instructionCount} instructions, PC=${this.getPC().toString(16)}`);
  }

  // ... existing code
}
```

**What to look for**:
- Is PC stuck at same address?
- Is door in infinite loop?
- Is door waiting for input before outputting?

### Expected Behavior

**When Bulls door runs successfully**:
1. Backend logs show:
   - `🚪 [DOOR START] /path/to/Bulls`
   - `🔧 [AEDOOR] InitPort called`
   - `✅ [XIM INIT] Protocol ready`
   - `🔊 [XIM OUTPUT] Bulls bulletin text...`
   - `🛑 [DOOR EXIT] Exit code: 0`

2. Frontend console shows:
   - `📥 [FRONTEND] Received output: Bulls bulletin text...`

3. Terminal displays:
   - Bulletin list or bulletin content

### Common Failure Points

**Issue 1: Door doesn't call InitPort**
- Symptom: No `🔧 [AEDOOR] InitPort called` in logs
- Cause: Door expects different initialization
- Solution: Check if door uses DOS.library instead

**Issue 2: XIM commands not processed**
- Symptom: InitPort called but no output
- Cause: XIM protocol not handling commands
- Solution: Add logging to XIMProtocol.ts:handleXimCommand()

**Issue 3: Output emitted but frontend doesn't receive**
- Symptom: `🔊 [XIM OUTPUT]` in logs but no `📥 [FRONTEND]`
- Cause: Socket.IO connection issue or wrong socket
- Solution: Verify socket is correct instance

**Issue 4: Frontend receives but doesn't display**
- Symptom: `📥 [FRONTEND]` in console but nothing on screen
- Cause: Terminal state issue or ANSI parsing error
- Solution: Check xterm.js state and ANSI codes

**Issue 5: Door stuck in I/O loop**
- Symptom: CPU executing but no output
- Cause: Door waiting for XIM response that never comes
- Solution: Check XIM protocol implementation for missing commands

### Test Script

Create `test-bulls-door.js`:

```javascript
const puppeteer = require('puppeteer');

async function testBullsDoor() {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  // Enable console logging
  page.on('console', msg => console.log('🖥️ [BROWSER]', msg.text()));

  await page.goto('http://localhost:5173');
  await new Promise(r => setTimeout(r, 1500));

  // Login
  await page.keyboard.type('A\\r'); // ANSI
  await new Promise(r => setTimeout(r, 750));
  await page.keyboard.type('sysop\\r');
  await new Promise(r => setTimeout(r, 750));
  await page.keyboard.type('sysop\\r');
  await new Promise(r => setTimeout(r, 2000));

  // Execute Bulls door
  console.log('🧪 Testing Bulls door (B command)...');
  await page.keyboard.type('B\\r');
  await new Promise(r => setTimeout(r, 5000));

  // Check terminal content
  const terminalText = await page.evaluate(() => {
    return document.querySelector('.xterm-rows')?.textContent || '';
  });

  console.log('📋 Terminal output:', terminalText.substring(0, 200));

  // Keep browser open
  await new Promise(r => setTimeout(r, 60000));
}

testBullsDoor();
```

### Success Criteria

Door output is working when:
1. ✅ Backend logs show XIM output emissions
2. ✅ Frontend console shows received output
3. ✅ Terminal displays door text correctly
4. ✅ User can interact with door (input works)
5. ✅ Door exits cleanly and returns to menu

### Files to Modify

| File | Changes Needed |
|------|----------------|
| `XIMProtocol.ts` | Add output logging to all emit calls |
| `AmigaDoorSession.ts` | Add door lifecycle logging |
| `AEDoorLibrary.ts` | Add InitPort logging |
| `MoiraEmulator.ts` | Add execution monitoring (optional) |
| Frontend socket handler | Add received output logging |

### Timeline

1. **Phase 1** (30 min): Add all logging
2. **Phase 2** (15 min): Copy Bulls door and test
3. **Phase 3** (30 min): Analyze logs and identify failure point
4. **Phase 4** (varies): Fix identified issue
5. **Phase 5** (15 min): Verify fix with multiple doors

### Next Action

**Immediate next step**: Add comprehensive logging to XIMProtocol.ts and AmigaDoorSession.ts, then test with Bulls door.
