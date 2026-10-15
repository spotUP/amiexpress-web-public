# Amiga ROM Files

This directory contains ROM files required to run native 68k Amiga doors via the MOIRA emulator.

## Recommended: AROS ROM (Open-Source, Included)

**AROS ROM files are included in this repository:**
- `aros-rom.bin` (256 KB)
- `aros-ext.bin` (256 KB)

AROS is an open-source operating system designed to be compatible with AmigaOS 3.1. These ROM files are free, legal, and work well with most Amiga doors.

**License:** AROS Public License (APL)
**Website:** https://aros.sourceforge.io/

The system will automatically use AROS ROM if available.

## Alternative: Kickstart ROM (Commercial, Better Compatibility)

For maximum compatibility with Amiga doors, you can optionally use the original Kickstart 3.1 ROM:

```
Kickstart v3.1 rev 40.63 (1993)(Commodore)(A500-A600-A2000).rom
```

**File Details:**
- Size: 512 KB (524,288 bytes)
- MD5: `82a21c1890cae844b3df741f2762d48d`
- Version: Kickstart 3.1 (40.63)
- Systems: A500, A600, A2000

**Where to Obtain:**

The Kickstart ROM is copyrighted by Cloanto/Hyperion Entertainment. You can obtain it legally through:

1. **Amiga Forever**: https://www.amigaforever.com/
   - Commercial package with legal Kickstart ROMs
   - Supports Amiga preservation efforts

2. **If you own original Amiga hardware:**
   - You can extract the ROM from your own Amiga
   - Various tools exist for ROM extraction

**Installation:**
1. Obtain the Kickstart 3.1 ROM file legally
2. Rename it exactly to: `Kickstart v3.1 rev 40.63 (1993)(Commodore)(A500-A600-A2000).rom`
3. Place it in this directory (`web/backend/data/amiga-roms/`)
4. Restart the backend server

The system will prefer the real Kickstart ROM if both are present.

## ROM Loading Priority

The system tries ROMs in this order:
1. **AROS ROM** (aros-rom.bin + aros-ext.bin) - Free, open-source
2. **Kickstart ROM** (Kickstart v3.1 rev 40.63...) - Commercial, better compatibility

## Verification

After starting the server, check the backend logs:

**Using AROS ROM:**
```
[ROM] Loading AROS ROM (open-source) from: <path>
[ROM] Loaded AROS ROM: 524288 bytes (512KB)
[ROM]   - aros-rom.bin: 262144 bytes
[ROM]   - aros-ext.bin: 262144 bytes
[ROM] AROS ROM loaded successfully
```

**Using Kickstart ROM:**
```
[ROM] AROS ROM not found, trying Kickstart ROM...
[ROM] Loading Kickstart ROM from: <path>
[ROM] Loaded 524288 bytes (512KB)
[ROM] Kickstart 3.1 loaded successfully
```

## Without Any ROM

If no ROM file is present, you can still use:
- TypeScript doors (in `doors/` directory)
- Python doors (`.py` files)
- ARexx doors (`.rexx` files)

Only native Amiga 68k doors (XIM, AIM, etc.) require ROM files.
