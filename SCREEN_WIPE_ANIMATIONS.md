# Screen Wipe Animations - MCI Commands

## Overview

Added 10 amazing screen wipe animations to enhance BBS screen transitions! Each animation provides a unique visual effect when displaying screen files.

## MCI Commands

Place these codes anywhere in your screen files (`.TXT` in `Screens/` directory) to apply a wipe animation:

### ~WM - Matrix Rain
**The Matrix Effect**
- Characters scramble and cascade down like falling Matrix code
- Green cascading text effect
- Perfect for: Login screens, hacker-themed doors
- Duration: ~500ms (10 frames @ 50ms each)

```
~WM
[Your screen content here]
```

### ~WH - Horizontal Blinds
**Classic Window Blinds**
- Reveals screen in horizontal strips
- Alternating reveal pattern
- Perfect for: Menu screens, bulletin displays
- Duration: ~280ms (7 frames @ 40ms each)

```
~WH
[Your screen content here]
```

### ~WV - Vertical Blinds
**Vertical Window Blinds**
- Reveals screen in vertical strips from left/right
- Smooth column-by-column reveal
- Perfect for: Conference menus, file area displays
- Duration: ~280ms (7 frames @ 40ms each)

```
~WV
[Your screen content here]
```

### ~WS - Spiral Wipe
**Hypnotic Spiral**
- Spirals from outside edges toward center
- Creates mesmerizing circular motion
- Perfect for: Special announcements, event screens
- Duration: ~600ms (20 frames @ 30ms each)

```
~WS
[Your screen content here]
```

### ~WC - Checkerboard
**Chess Board Pattern**
- Reveals in alternating squares like a checkerboard
- Two-phase reveal (white squares, then black squares)
- Perfect for: Game doors, puzzle screens
- Duration: ~200ms (2 frames @ 100ms each)

```
~WC
[Your screen content here]
```

### ~WR - Radial/Radar Wipe
**Radar Sweep**
- Sweeps around like a radar from top center
- Smooth 360-degree rotation
- Perfect for: System status, node displays
- Duration: ~600ms (24 frames @ 25ms each)

```
~WR
[Your screen content here]
```

### ~WB - Block Wipe
**Random Block Reveal**
- Random blocks appear until screen is complete
- Unpredictable, exciting reveal
- Perfect for: Surprise screens, lottery/random events
- Duration: ~600ms (15 frames @ 40ms each)

```
~WB
[Your screen content here]
```

### ~WN - Noise Fade
**Static to Signal**
- Screen starts as static/noise and resolves to content
- Like tuning in an old TV signal
- Perfect for: Retro-themed screens, transmission effects
- Duration: ~600ms (12 frames @ 50ms each)

```
~WN
[Your screen content here]
```

### ~WT - Typewriter
**Classic Typewriter Effect**
- Types out line by line with slight delay
- Simulates old-school terminal output
- Perfect for: Story text, narrative screens
- Duration: Varies by screen height (~750ms for 25 lines)

```
~WT
[Your screen content here]
```

### ~WE - Explode
**Center Outward Burst**
- Characters explode from center outward
- Dramatic reveal effect
- Perfect for: Title screens, dramatic announcements
- Duration: ~600ms (15 frames @ 40ms each)

```
~WE
[Your screen content here]
```

### ~WX - Random Wipe
**Surprise Me!**
- Randomly selects one of the 10 wipe effects above
- Different animation every time the screen loads
- Perfect for: Any screen where variety adds excitement
- Duration: Varies (depends on randomly selected wipe)

```
~WX
[Your screen content here]
```

---

## Usage Examples

### Login Screen with Matrix Effect
File: `Screens/LOGON.TXT`
```
~WM
[0;32m
  ╔════════════════════════════════════════╗
  ║   WELCOME TO THE MATRIX BBS SYSTEM    ║
  ║        Reality is Loading...          ║
  ╚════════════════════════════════════════╝

  Username: ~N
  Security: ~SL
  Logged in ~TC times
```

### Main Menu with Horizontal Blinds
File: `Screens/MENU.TXT`
```
~WH
[1;36m
  ═══════════════════════════════════════
        MAIN MENU - Choose Wisely
  ═══════════════════════════════════════

  [M] Read Messages
  [F] File Areas
  [D] Download Files
  [DOORS] Door Games
  [G] Goodbye
```

### Random Wipe for Variety
File: `Screens/BULL.TXT`
```
~WX
[0;33m
  ╔════════════════════════════════════════╗
  ║          SYSTEM BULLETINS              ║
  ╚════════════════════════════════════════╝

  [Bulletin content here - different wipe each time!]
```

### File Area with Vertical Blinds
File: `Screens/FILES.TXT`
```
~WV
[0;37m
  ┌─────────────────────────────────────┐
  │         FILE AREA LISTING           │
  └─────────────────────────────────────┘

  [File listing content]
```

### Door Game Intro with Explode
File: `Screens/GAME_INTRO.TXT`
```
~WE
[1;31m
        ███████╗██╗  ██╗██████╗
        ██╔════╝╚██╗██╔╝██╔══██╗
        █████╗   ╚███╔╝ ██████╔╝
        ██╔══╝   ██╔██╗ ██╔═══╝
        ███████╗██╔╝ ██╗██║
        ╚══════╝╚═╝  ╚═╝╚═╝

     PREPARE FOR BATTLE!
```

---

## Technical Details

### How It Works

1. **Detection**: When a screen file is loaded, the system checks for `~W[MHVSCRBNTEX]` MCI codes
2. **Parsing**: The wipe code is extracted and removed from the content
3. **Frame Generation**: The animation utility generates a series of frames based on the wipe type
4. **Playback**: Each frame is sent to the terminal with appropriate timing
5. **Completion**: Final frame includes cursor restoration and color reset

### Performance

- **Frame Rate**: 25-60ms per frame (depending on animation)
- **Total Duration**: 200ms-750ms (depending on animation complexity)
- **Memory**: Efficient - generates frames on-the-fly
- **Compatibility**: Works with all ANSI terminals

### ANSI Parsing

The wipe system intelligently parses ANSI content:
- Preserves color codes for each character
- Maintains exact positioning
- Respects escape sequences
- Works with both foreground and background colors

### Animation Quality

Each animation:
- Uses both foreground and background colors
- Preserves original screen appearance
- Smooth frame transitions
- Professional-quality effects
- No tearing or flicker

---

## Combining with Other MCI Codes

Wipe codes work seamlessly with other MCI codes:

```
~WM
[1;36m═══ SYSTEM STATUS ═══[0m

User: ~N
Time: ~DL
Node: ~ND

~XC_WHO||
```

The wipe animation plays AFTER all MCI codes are parsed and replaced.

---

## Best Practices

### When to Use Wipes

**Good Uses**:
- Login/welcome screens (dramatic entrance)
- Main menu (professional feel)
- Special announcements (draw attention)
- Door game intros (excitement)
- Random variety (keep it fresh with ~WX)

**Avoid**:
- Message reading screens (too distracting)
- Frequently-displayed prompts (gets annoying)
- Error messages (need immediate clarity)
- Very short screens (wasted effect)

### Choosing the Right Wipe

| Screen Type | Recommended Wipe | Why |
|------------|------------------|-----|
| Login/Welcome | ~WM (Matrix) | Dramatic, memorable |
| Main Menu | ~WH (H.Blinds) | Professional, clean |
| Bulletins | ~WX (Random) | Variety each visit |
| File Areas | ~WV (V.Blinds) | Natural for lists |
| Door Games | ~WE (Explode) | Exciting, energetic |
| Status/Stats | ~WR (Radar) | Tech-themed |
| Puzzle/Games | ~WC (Checker) | Playful theme |
| Stories/Text | ~WT (Typewriter) | Narrative feel |
| Retro Screens | ~WN (Noise) | Vintage aesthetic |
| Special Events | ~WS (Spiral) | Unique, mesmerizing |

### Performance Considerations

- Wipes add 200-750ms to screen display time
- Use sparingly to avoid slowing down navigation
- ~WX provides variety without repetition fatigue
- Consider user preferences (future: toggle animations)

---

## Troubleshooting

### Wipe Doesn't Show

**Problem**: Screen displays normally without animation

**Solutions**:
1. Check MCI code spelling: `~WM` not `~Wm` or `~wm`
2. Ensure code is at start of file (before content)
3. Verify screen file is in correct directory
4. Check backend logs: `grep "wipe" logs/backend.log`

### Animation Looks Choppy

**Problem**: Frames appear jerky or slow

**Solutions**:
1. Check server load (animations need CPU)
2. Verify network latency (each frame is sent separately)
3. Consider simpler wipe (~WC, ~WH instead of ~WM)
4. Check modem emulation settings (may slow playback)

### Colors Look Wrong

**Problem**: Animation colors don't match original

**Solutions**:
1. Verify ANSI codes are properly formatted
2. Check for missing color resets (`[0m`)
3. Test with simpler color schemes first
4. Use explicit foreground/background codes

### Screen Content Missing

**Problem**: Some characters don't appear in animation

**Solutions**:
1. Check for special characters (box drawing, extended ASCII)
2. Verify line endings are CRLF (`\r\n`)
3. Test with plain text first
4. Check screen file encoding (should be UTF-8 or ASCII)

---

## Examples Gallery

### Minimal Test Screen

Create `Screens/TEST_WIPE.TXT`:
```
~WX
[1;33m
╔════════════════╗
║  TEST SCREEN   ║
╚════════════════╝

Random wipe each time!
```

Display with: `./dev/scripts/test-screen-display.sh TEST_WIPE`

### All Wipes Demo

Create `Screens/DEMO_ALL.TXT`:
```
[1;36m
═══════════════════════════════════
   SCREEN WIPE ANIMATION DEMO
═══════════════════════════════════

Try each wipe by editing this file:

~WM - Matrix Rain (falling code)
~WH - Horizontal Blinds
~WV - Vertical Blinds
~WS - Spiral (mesmerizing)
~WC - Checkerboard
~WR - Radial Sweep (radar)
~WB - Random Blocks
~WN - Noise Fade (static)
~WT - Typewriter
~WE - Explode (center out)
~WX - RANDOM (surprise!)

Change the code above and reload!
```

---

## Future Enhancements

Potential future improvements:

1. **User Preferences**
   - Toggle animations on/off per user
   - Speed adjustment (fast/normal/slow)
   - Favorite wipe selection

2. **More Animations**
   - Slide in/out (directional)
   - Dissolve/fade (opacity)
   - Curtain pull (theatrical)
   - Pixelate/depixelate

3. **Advanced Features**
   - Wipe direction parameters (~WH_DOWN, ~WH_UP)
   - Speed modifiers (~WM_FAST, ~WM_SLOW)
   - Color customization (~WM_RED, ~WM_BLUE)
   - Chain animations (~WM~WE for combo)

4. **Performance**
   - Client-side rendering (offload from server)
   - Caching wipe frames
   - Adaptive quality based on connection speed

---

## Credits

**Implementation**: Claude Code (Sonnet 4.5)
**Date**: December 16, 2025
**Inspired by**: Classic BBS ANSI animations, Matrix (1999), retro computing aesthetics

**Animation Algorithms**:
- Matrix Rain: Based on "digital rain" effect
- Blinds: Window blinds transition pattern
- Spiral: Mathematical spiral coordinate mapping
- Checkerboard: Alternating square reveal
- Radial: Polar coordinate sweep
- Blocks: Random shuffle algorithm
- Noise: Gradual static dissolution
- Typewriter: Line-by-line reveal
- Explode: Radial distance calculation

---

## See Also

- `Documentation/5-SysOps/MCI_CODES.md` - All MCI codes reference
- `web/backend/src/utils/screen-wipe.util.ts` - Implementation source
- `web/backend/src/handlers/screen.handler.ts` - Screen display logic
