# Amiga Kickstart ROM

This directory should contain the Amiga Kickstart ROM file required to run native 68k Amiga doors.

## Required File

Place the following ROM file in this directory:

```
Kickstart v3.1 rev 40.63 (1993)(Commodore)(A500-A600-A2000).rom
```

**File Details:**
- Size: 512 KB (524,288 bytes)
- MD5: `82a21c1890cae844b3df741f2762d48d`
- Version: Kickstart 3.1 (40.63)
- Systems: A500, A600, A2000

## Where to Obtain

The Kickstart ROM is copyrighted by Cloanto/Hyperion Entertainment. You can obtain it legally through:

1. **Amiga Forever** (Recommended): https://www.amigaforever.com/
   - Commercial package with legal Kickstart ROMs
   - Supports Amiga preservation efforts

2. **If you own original Amiga hardware:**
   - You can extract the ROM from your own Amiga
   - Various tools exist for ROM extraction

## Installation

1. Obtain the Kickstart 3.1 ROM file legally
2. Rename it exactly to: `Kickstart v3.1 rev 40.63 (1993)(Commodore)(A500-A600-A2000).rom`
3. Place it in this directory (`web/backend/data/amiga-roms/`)
4. Restart the backend server

## Verification

After placing the ROM file, you should see this message in the backend logs when starting a 68k door:

```
[ROM] Loading Kickstart ROM from: <path>
[ROM] Loaded 524288 bytes (512KB)
[ROM] Kickstart 3.1 loaded successfully
```

## Without the ROM

If you don't have the ROM file, you can still use:
- TypeScript doors (in `doors/` directory)
- Python doors (`.py` files)
- ARexx doors (`.rexx` files)

Only native Amiga 68k doors (XIM, AIM, etc.) require the Kickstart ROM.
