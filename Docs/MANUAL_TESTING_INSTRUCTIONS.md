# Manual Testing Instructions - XIM Protocol Door I/O

## Current Status

The XIM protocol is working! The door successfully communicates with the BBS:

- ✅ Door sends JH_LI (line input request)
- ✅ BBS receives and parses message
- ✅ BBS replies via ReplyMsg
- ✅ Door receives reply

**Current Limitation**: We return an empty line to JH_LI requests, so the door thinks the user pressed Enter with no input and exits.

## What You'll See

When you run the GetAnswer door:

1. Door launches successfully
2. Door sends JH_LI message (requesting line input)
3. BBS logs show: "Door requesting line input"
4. BBS replies with empty line (because we haven't implemented line buffering yet)
5. Door receives empty input and likely exits

## How to Test

### Step 1: Ensure Servers are Running

```bash
cd ~/Code/amiexpress-web
./dev/scripts/start-all.sh
```

### Step 2: Connect to BBS

Open your browser and go to: `http://localhost:5173`

### Step 3: Login

- Username: `sysop`
- Password: `sysop`

### Step 4: Get Past the Screens

- Press `Enter` a few times to get past bulletins
- You should see the main menu

### Step 5: Launch the GetAnswer Door

Type: `GA` and press `Enter`

### Step 6: Check Backend Logs

Open a new terminal and run:

```bash
tail -f /tmp/backend.log | grep -E "XIMProtocol|JH_LI|Door"
```

### What to Look For

You should see output like this:

```
[XIMProtocol] Initialized
[XIMProtocol] Parsed message:
  Address: 0x83014
  Reply Port: 0xa0100
  Command: 0 (JH_LI - Login Info)
  Data: 0x0
[XIMProtocol] Discovered door reply port: 0xa0100
[XIMProtocol] Handling command: JH_LI (Login Info)
[XIMProtocol] Door requesting line input
[XIMProtocol] Returning empty line (TODO: implement line input queue)
[XIMProtocol] Sending reply to door:
  Message: 0x83014
  Data: 1
[ExecLibrary] ReplyMsg(msg=0x83014)
  Reply Port: 0xa0100
[XIMProtocol] Reply sent via ReplyMsg
```

**This proves the XIM protocol is working!**

## Expected Behavior

Currently:
- Door starts ✅
- Door requests line input ✅
- BBS replies with empty line ✅
- Door exits (because it got empty input) ✅

**This is expected** - we haven't implemented line input buffering yet.

## Next Step: Line Input Buffering

To make the door fully interactive, we need to:

1. **Buffer user input** until they press Enter
2. **Wait for line input** when JH_LI is received (don't reply immediately)
3. **Return the buffered line** to the door when Enter is pressed

This requires adding a "waiting for line input" state to XIMProtocol.

## Advanced Testing (Optional)

If you want to watch the door execution in real-time:

```bash
# Terminal 1: Watch backend logs
tail -f /tmp/backend.log | grep -E "XIMProtocol|Iteration"

# Terminal 2: Connect to BBS and run GA command
open http://localhost:5173
```

You'll see the door:
- Initialize (iterations 1-1200)
- Send JH_LI message
- Receive reply
- Continue execution (iterations up to 500k+)
- Eventually timeout and exit

## What We've Achieved

**MAJOR MILESTONE**: We've proven that:

1. Memory[0xac] fix works - door reads port address correctly
2. XIM protocol communication works - bidirectional message passing
3. ReplyMsg pattern works - door receives responses
4. Message parsing works - correct command extraction
5. Socket integration works - ready for terminal I/O

**Next Session**: Implement line input buffering for full terminal interactivity!

## Troubleshooting

### Door doesn't start

Check if door file exists:
```bash
ls -la ~/Code/amiexpress-web/Doors/GetAnswer/GetAnswer
```

### No XIM messages in logs

Check if backend is running:
```bash
lsof -ti:3001
```

If not running:
```bash
./dev/scripts/start-backend.sh
```

### Door immediately exits

This is expected! We're returning empty lines to JH_LI requests.

The door thinks the user pressed Enter with no input, so it exits.

**This is the next feature to implement.**

## Questions?

If you see different behavior than described above, copy the relevant logs and let me know!
