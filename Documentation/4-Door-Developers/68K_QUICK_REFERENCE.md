# 68K Door Emulation - Quick Reference

**Fast answers for common 68K door tasks**

## Testing a 68K Door

```bash
# Basic test
BBS_DATA_DIR=/path/to/bbs AEDOOR_ROM=kickstart \
npx tsx web/backend/src/scripts/run-amiga-door.ts \
Doors/YourDoor/YourDoor 1

# With arguments
BBS_DATA_DIR=/path/to/bbs AEDOOR_ROM=kickstart \
npx tsx web/backend/src/scripts/run-amiga-door.ts \
Doors/YourDoor/YourDoor 1 arg1 arg2 arg3

# With stdout redirect
BBS_DATA_DIR=/path/to/bbs AEDOOR_ROM=kickstart \
AEDOOR_STDOUT=/tmp/output.txt \
npx tsx web/backend/src/scripts/run-amiga-door.ts \
Doors/YourDoor/YourDoor 1

# With higher loop limit
BBS_DATA_DIR=/path/to/bbs AEDOOR_ROM=kickstart \
AEDOOR_LOOP_LIMIT=1000000 \
npx tsx web/backend/src/scripts/run-amiga-door.ts \
Doors/YourDoor/YourDoor 1

# With verbose logging
BBS_DATA_DIR=/path/to/bbs AEDOOR_ROM=kickstart \
AEDOOR_DEBUG_LEVEL=verbose DOOR_TRACE_REGS=1 \
npx tsx web/backend/src/scripts/run-amiga-door.ts \
Doors/YourDoor/YourDoor 1 2>&1 | tee /tmp/debug.log
```

## Adding to Batch Files

Edit `batch0` through `batch6` (or `batch000`):

```bash
# Simple door
doors:yourdoor/yourdoor

# With arguments
doors:yourdoor/yourdoor arg1 arg2

# With output redirection
doors:yourdoor/yourdoor >bbs:screens/output.txt

# Complex example (QuickNew)
doors:quicknew/quicknew doors:quicknew/quicknew.config1 7 >bbs:screens/quicknew.txt

# With multiple arguments (MultiTop)
doors:multitop/mtop doors:multitop/designs/mtopulbytes1.dsg bbs:bulletins/bull1.txt ignoresysop userdata bbs:user.data
```

## Amiga Path Assigns

| Assign | Maps To | Example |
|--------|---------|---------|
| BBS: | Root BBS directory | BBS:Conf1/Dir1 |
| Doors: | Doors directory | Doors:WHO/who |
| PROGDIR: | Door's own directory | PROGDIR:config.txt |
| Node1: | Node 1 directory | Node1:CallersLog |
| Screens: | Screens directory | Screens:MENU.TXT |
| Bulletins: | Bulletins directory | Bulletins/bull1.txt |
| S: | S directory | S:startup-sequence |

**Important**: In batch files, use Amiga-style paths (with colons). The batch scheduler will resolve them to system paths automatically.

## Common Issues

### Door Says "File Not Found"

**Problem**: Trying to open a file that doesn't exist or path is wrong.

**Solutions**:
1. Use absolute paths in test commands: `/full/path/to/file`
2. In batch files, use Amiga assigns: `doors:door/file`
3. Check PROGDIR: is set correctly
4. Verify file exists: `ls /path/to/file`

### Door Hangs/Times Out

**Problem**: Door stuck in infinite loop or waiting for input.

**Solutions**:
1. Check if it's an XIM door (needs user input)
2. Increase loop limit: `AEDOOR_LOOP_LIMIT=2000000`
3. Check logs for repeated PC addresses
4. Disassemble the loop: `r2 -q -c "e asm.arch=m68k; s 0xADDR; pd 20" doorfile`

### Door Crashes

**Problem**: Missing library function or memory error.

**Solutions**:
1. Check logs for "INTERCEPTED" messages
2. Look for ERROR messages about unimplemented functions
3. Report missing function - it may need to be implemented

### Path Doubling

**Problem**: Paths like `/Doors/WHO/Doors/WHO/file` appear in logs.

**Cause**: Using Amiga-style paths when absolute path expected, or vice versa.

**Solution**:
- In batch files: Use `doors:who/file`
- In test commands: Use `/full/path/to/file`
- Never mix them

## Environment Variables Reference

| Variable | Default | Purpose |
|----------|---------|---------|
| BBS_DATA_DIR | (required) | Root BBS directory |
| AEDOOR_ROM | (required) | Set to `kickstart` |
| AEDOOR_STDOUT | (none) | Redirect stdout to file |
| AEDOOR_LOOP_LIMIT | 500000 | Max CPU iterations before timeout |
| AEDOOR_DISABLE_GUARD | false | Disable loop guard entirely |
| AEDOOR_DEBUG_LEVEL | normal | minimal/normal/verbose/comprehensive |
| DOOR_TRACE_REGS | 0 | Log registers (1=enabled) |
| DOOR_TRACE_INTERVAL | 500 | Log every N instructions |

## Log Files

| File | Content |
|------|---------|
| logs/door-68k.log | All door execution logs |
| logs/backend.log | BBS server logs |
| /tmp/door-trace-*.log | Trace logs (if enabled) |

## Checking Logs

```bash
# Watch door execution in real-time
tail -f logs/door-68k.log

# Search for errors
grep ERROR logs/door-68k.log

# Find which library calls were made
grep "INTERCEPTED" logs/door-68k.log

# See file operations
grep "FileManager" logs/door-68k.log

# Check specific door's last run
grep "door=QuickNew" logs/door-68k.log | tail -50
```

## Debugging Steps

1. **Enable verbose logging**:
   ```bash
   export AEDOOR_DEBUG_LEVEL=verbose
   export DOOR_TRACE_REGS=1
   ```

2. **Run the door**:
   ```bash
   npx tsx web/backend/src/scripts/run-amiga-door.ts Doors/YourDoor/door 1 2>&1 | tee debug.log
   ```

3. **Check for errors**:
   ```bash
   grep -i error debug.log
   ```

4. **Find where it stops**:
   ```bash
   grep "Total iterations" debug.log
   tail -50 debug.log
   ```

5. **Disassemble problem area** (if PC stuck at same address):
   ```bash
   r2 -q -c "e asm.arch=m68k; e asm.bits=32; s 0xADDR; pd 20" Doors/YourDoor/door
   ```

## Performance Tips

- Most doors complete in <1 second
- Batch doors processing large files may take 5-10 seconds
- If door takes >30 seconds, it's likely stuck
- Watch iteration count - if approaching 500K, increase limit

## When to Port vs Emulate

**Use Emulation (68K door) when**:
- Binary already exists and works
- No source code available
- Quick deployment needed

**Port to TypeScript when**:
- Source code available
- Performance critical
- Needs deep BBS integration
- Want modern debugging

See `DOOR_DEVELOPMENT.md` for TypeScript porting guide.

## Support

- Check logs: `logs/door-68k.log`
- Read docs: `Documentation/4-Door-Developers/`
- Test script: `dev/scripts/test-all-68k-doors.sh`
- MCP tools: `mcp__amiexpress-docs__search_express_source`

## Quick Wins

**Want to add a simple 68K door?**

1. Copy door binary to `Doors/YourDoor/`
2. Test it: `BBS_DATA_DIR=$PWD AEDOOR_ROM=kickstart npx tsx web/backend/src/scripts/run-amiga-door.ts Doors/YourDoor/door 1`
3. If it works, add to batch file: `doors:yourdoor/door`
4. Done!

Most well-behaved Amiga BBS doors will "just work" with no modifications needed.
