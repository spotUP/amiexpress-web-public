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
