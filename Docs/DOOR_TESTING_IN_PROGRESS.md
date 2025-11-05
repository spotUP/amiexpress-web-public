# Door Testing In Progress - 2025-11-01

## Status: Running Comprehensive Tests

**Test Script:** `test-all-doors.js`
**Doors to Test:** 51
**Estimated Duration:** ~5 minutes
**Progress:** In progress...

---

## What's Being Tested

For each of the 51 door directories, the script will:

1. **Find Executable** - Locate the door binary
2. **Launch Door** - Attempt to run via BBS command
3. **Monitor Behavior** - Watch for 5 seconds
4. **Check Logs** - Analyze backend logs for:
   - Door launch confirmation
   - File I/O operations
   - Device usage (PROGDIR:, Doors:, BBS:)
   - Crash indicators
   - Error messages
5. **Document Status** - Record outcome and notes

---

## Status Categories

Doors will be classified as:

### Working
- `running` - Door launched and ran without errors
- `terminated` - Door completed normally

### Crashes
- `crash-stack` - Stack misalignment (emulator bug)
- `crash-invalid-pc` - Invalid PC (emulator bug)
- `crash-unmapped` - PC in unmapped memory (emulator bug)

### Not Found
- `no-executable` - No binary found in directory
- `not-found` - Command not recognized by BBS
- `no-launch` - Door didn't start

### Error
- `error` - Test script error

---

## What We'll Learn

From this test, we'll know:

1. **Which doors actually work** - Can be tested for file I/O
2. **Which doors crash** - Due to emulator bugs
3. **Which doors use file I/O** - Check for PROGDIR:, Doors:, BBS: usage
4. **What to work on next** - Prioritize based on working doors

---

## Expected Outcomes

Based on previous tests:
- **Most doors will crash** - Due to emulator stack bugs
- **Some may not launch** - Command mapping issues
- **A few may work** - These are our testing candidates

---

## Next Steps After Testing

Once complete, we'll have a detailed report showing:
- Door-by-door status
- Error type breakdown
- File I/O usage patterns
- Recommendations for what to work on

This will guide our next development priorities:
- Fix emulator issues?
- Focus on working doors?
- Improve door command mapping?
- Add missing features?

---

**Status:** Test running...
**Check:** `tail -f /tmp/backend.log` to watch live
**Report:** Will be generated as `DOOR_TEST_REPORT_2025-11-01.md`
