# Python Door Support (Saved for Future Integration)

## Source
Extracted from branch: `add-python-doors-support` (Nov 7, 2025)

## Files
- `PYTHON_DOOR_DEVELOPMENT.md` - Developer documentation
- `PythonDoorSession.ts` - Python door session manager (283 lines)
- `test-hello.py` - Example Python door

## Integration Required
To integrate this into main, you need to modify:

1. **web/backend/src/amiga-emulation/doorHandler.ts**
   - Add Python door type detection
   - Import PythonDoorSession
   
2. **web/backend/src/doors/DoorManager.ts**
   - Add Python door handling logic
   - Detect .py files
   
3. **web/backend/src/handlers/door.handler.ts**
   - Add Python door execution path
   - Set environment variables for Python doors

## Why Not Merged Yet
- Merge conflicts with current main (3 files)
- Current session has unstaged changes
- Better to integrate cleanly in a dedicated session

## Benefits
- Allows running Python doors alongside TypeScript SDK and 68K emulation
- Provides DOOR.SYS drop file support
- Environment variable passing to Python scripts
- ANSI terminal support

## Decision
Saved for future integration when main is in a clean state.
