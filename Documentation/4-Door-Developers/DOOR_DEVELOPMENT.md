# Door Development Guide

AmiExpress-Web supports multiple types of doors. Choose the guide that matches your needs:

## ⚠️ CRITICAL: SDK Doors MUST Be Built

**IF YOU'RE DEVELOPING SDK DOORS (in `sdk/doors/`), READ THIS FIRST:**

SDK doors are TypeScript projects that compile to JavaScript. **You MUST build them before changes are visible:**

```bash
# ALWAYS build after making changes
cd sdk/doors/{doorname}
npm run build
```

**Why this matters:**
- Source code: `sdk/doors/{doorname}/src/` ← You edit here
- Built output: `sdk/doors/{doorname}/dist/` ← BBS loads from here
- **If you don't build, you'll see old code**

**Quick fix if door looks wrong:**
```bash
cd sdk/doors/livechat  # or your door name
npm run build
```

**Automatic building:**
- `./dev/scripts/start-servers.sh` now auto-builds all SDK doors
- First start takes ~30-60 seconds (builds all doors)
- Use watch mode for development: `npm run build:watch`

**See CLAUDE.md for complete details** - This is documented there to prevent future issues.

---

## TypeScript Doors (Recommended)

**[TYPESCRIPT_DOOR_GUIDE.md](TYPESCRIPT_DOOR_GUIDE.md)** - Complete guide for modern TypeScript doors

TypeScript doors are the recommended approach for new development:
- Full Node.js API access
- Native TypeScript/JavaScript execution
- Mouse and keyboard input support
- Easy debugging and hot-reload
- Access to npm packages

**Required:** TypeScript doors must include a `.info` file in `Commands/BBSCmd/`. The BBS registers doors at startup by scanning BBSCMD entries.

**Release packaging:** Use `npm run pack` from your door repo root. The packer creates a minimal archive with
`Commands/BBSCmd/` + `Doors/<door>/` (no SDK bundled).

## 68K Amiga Doors (Legacy)

**[68K_DOOR_DEVELOPMENT.md](68K_DOOR_DEVELOPMENT.md)** - Guide for legacy Amiga binary doors

68K doors run original Amiga binaries through the MOIRA 68000 CPU emulator:
- Run unmodified Amiga door binaries
- XIM/SIM protocol support
- AEDoor library emulation
- Requires understanding of Amiga internals

## Python Doors

**[PYTHON_DOOR_DEVELOPMENT.md](PYTHON_DOOR_DEVELOPMENT.md)** - Guide for Python doors

Python doors provide an alternative scripting approach:
- Python runtime execution
- Similar API to TypeScript doors
- Good for quick prototyping

## Batch Files and Amiga Utilities (NOT Doors)

**IMPORTANT DISTINCTION:** Not all Amiga executables in the BBS are doors!

Some utilities like **MultiTop (mtop)**, **Bulls**, **QuickNew**, etc. are standalone Amiga executables that:
- Are **NOT** doors - they don't interact with online users
- Must be run from **batch files** (batch0, batch1, etc.) with proper arguments
- Execute in an AmigaDOS environment, not through the BBS command interface
- Generate output files (bulletins, statistics) that are later displayed to users

### Batch Files

Batch files (`batch0` through `batch6` in the BBS root) contain AmigaDOS commands that run at specific events:
- `batch0` - Runs at system startup/nightly maintenance
- `batch1-6` - Run at various events (logoff, etc.)

**Example batch file content:**
```
doors:multitop/mtop doors:multitop/designs/MTopULBytes1.dsg bbs:bulletins/bull5.txt bbs:user.data UKEYS bbs:user.keys
doors:quicknew/quicknew doors:quicknew/quicknew.config1 7 >bbs:screens/quicknew.txt
```

### Key Points

1. **Never clear batch files** - They contain user-configured commands
2. **Don't add ARGS to .info files** for these utilities - args come from batch files
3. **These utilities read/write BBS data files** - They need correct paths to user.data, bulletins, etc.
4. **They run offline** - Not during user sessions, but at maintenance events

### Common Utilities (Not Doors)

| Utility | Purpose | Typical Location |
|---------|---------|------------------|
| MultiTop (mtop) | Generate top uploaders/downloaders bulletins | doors:multitop/ |
| Bulls | Bulletin management | doors:EmP_Tools/ |
| QuickNew | New files listing | doors:quicknew/ |
| ByteKiller | Log management | doors:bytekiller/ |

## Additional Resources

- **[DOOR_MANAGER.md](DOOR_MANAGER.md)** - BBS door management and installation
- **[AEDOOR_API.md](AEDOOR_API.md)** - AEDoor library reference (68K)
- **[DOS_LIBRARY_API.md](DOS_LIBRARY_API.md)** - AmigaDOS library reference (68K)
- **[EXAMPLES.md](EXAMPLES.md)** - Door code examples

## Quick Comparison

| Feature | TypeScript | 68K | Python |
|---------|------------|-----|--------|
| Recommended | Yes | Legacy | Alternative |
| Mouse Support | Yes | No | Yes |
| Hot Reload | Yes | No | Yes |
| Debugging | Easy | Hard | Easy |
| npm Packages | Yes | No | pip |
| Performance | Fast | Emulated | Fast |
