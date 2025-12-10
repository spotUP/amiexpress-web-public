# Door Development Guide

AmiExpress-Web supports multiple types of doors. Choose the guide that matches your needs:

## TypeScript Doors (Recommended)

**[TYPESCRIPT_DOOR_GUIDE.md](TYPESCRIPT_DOOR_GUIDE.md)** - Complete guide for modern TypeScript doors

TypeScript doors are the recommended approach for new development:
- Full Node.js API access
- Native TypeScript/JavaScript execution
- Mouse and keyboard input support
- Easy debugging and hot-reload
- Access to npm packages

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
