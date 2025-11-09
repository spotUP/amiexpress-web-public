# Amiga BBS Fonts

This directory should contain TrueType (.ttf) versions of classic Amiga BBS fonts.

## Required Font Files

The following fonts are referenced in the frontend CSS (`src/index.css`):

1. `mOsOul_v1.0.ttf` - mO'sOul font by Desoto/Mo'Soul
2. `MicroKnight_v1.0.ttf` - MicroKnight Amiga font
3. `MicroKnightPlus_v1.0.ttf` - MicroKnight Plus variant
4. `P0T-NOoDLE_v1.0.ttf` - P0T-NOoDLE font by Leo 'Nudel' Davidson
5. `Topaz_a500_v1.0.ttf` - Topaz font (Amiga 500)
6. `Topaz_a1200_v1.0.ttf` - Topaz font (Amiga 1200)
7. `TopazPlus_a500_v1.0.ttf` - Topaz Plus (Amiga 500)
8. `TopazPlus_a1200_v1.0.ttf` - Topaz Plus (Amiga 1200)

## Source Fonts

Amiga bitmap font sources (.F16 format) are available in:
`/Docs/moebius/app/fonts/amiga/`

## How to Obtain TTF Versions

### Option 1: Convert from .F16 to .TTF
Use an Amiga font converter tool to convert the .F16 files to TrueType format.

### Option 2: Download Pre-converted Fonts
These classic Amiga fonts are available from various sources:
- **Topaz fonts**: Search for "Topaz Amiga font TTF"
- **mO'sOul**: Part of the Amiga BBS font collection
- **P0T-NOoDLE**: Classic BBS font, widely available

### Option 3: Use Web-safe Alternatives
If fonts are not available, the system will fall back to:
- Primary fallback: `"Courier New"`
- Final fallback: Generic `monospace`

## Installation

1. Obtain or convert the .ttf font files
2. Place them in this directory (`web/frontend/public/fonts/`)
3. Ensure filenames match those listed above
4. Rebuild the frontend: `npm run build`

## Notes

- Fonts are loaded via CSS `@font-face` declarations in `src/index.css`
- The `font-display: swap` strategy ensures text remains visible during font loading
- Missing fonts will trigger 404 errors in the browser console but won't break functionality
- The terminal will use fallback fonts if custom fonts are unavailable
