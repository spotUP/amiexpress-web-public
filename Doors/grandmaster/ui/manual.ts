/**
 * Player Manual - GRANDMASTER Tetris
 *
 * Comprehensive guide with colored illustrations
 * Displayed in DocModal widget
 */

import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { DocModal } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

/**
 * Get the complete player manual content with colored illustrations
 */
export function getManualContent(): string {
  return `
${getHeader()}

${getPieceGuide()}

${getControlsSection()}

${getGamepadSection()}

${getGameModesSection()}

${getGradingSection()}

${getSectionTimingSection()}

${getMedalsSection()}

${getAdvancedSection()}

${getSettingsSection()}

${getTipsSection()}
`;
}

function getHeader(): string {
  return `{bold}{yellow-fg}============================================================{/yellow-fg}
                    GRANDMASTER PLAYER MANUAL
{yellow-fg}============================================================{/yellow-fg}{/bold}

Welcome to GRANDMASTER, a TGM3-inspired competitive Tetris game
running on AmiExpress BBS.

This manual covers all game mechanics, controls, and strategies
you need to achieve the legendary Grand Master grade.`;
}

function getPieceGuide(): string {
  return `
{bold}{cyan-fg}[ TETROMINO PIECES ]{/cyan-fg}{/bold}

Each piece has a unique shape and standard color:

{cyan-fg}  ████████{/cyan-fg}        {bold}I-Piece (Cyan){/bold}
                    Best for Tetrises (4-line clears)
                    Longest piece - use for deep wells

{yellow-fg}  ████{/yellow-fg}            {bold}O-Piece (Yellow){/bold}
{yellow-fg}  ████{/yellow-fg}            Square shape - no rotation needed
                    Good for flat stacking

{magenta-fg}  ██████{/magenta-fg}          {bold}T-Piece (Magenta){/bold}
{magenta-fg}    ██{/magenta-fg}            Versatile - enables T-Spins!
                    Key piece for advanced play

{green-fg}    ████{/green-fg}          {bold}S-Piece (Green){/bold}
{green-fg}  ████{/green-fg}            S-shape zigzag - pairs with Z

{red-fg}  ████{/red-fg}            {bold}Z-Piece (Red){/bold}
{red-fg}    ████{/red-fg}          Z-shape zigzag - mirror of S

{blue-fg}  ██{/blue-fg}              {bold}J-Piece (Blue){/bold}
{blue-fg}  ██████{/blue-fg}          L-shape with left hook

{lightyellow-fg}      ██{/lightyellow-fg}          {bold}L-Piece (Orange){/bold}
{lightyellow-fg}  ██████{/lightyellow-fg}          L-shape with right hook - mirror of J`;
}

function getControlsSection(): string {
  return `
{bold}{cyan-fg}[ KEYBOARD CONTROLS (Defaults) ]{/cyan-fg}{/bold}

These are the default bindings. Rebind anything in Settings.

{bold}Movement:{/bold}
  {yellow-fg}Left / A{/yellow-fg}           Move piece left
  {yellow-fg}Right / D{/yellow-fg}          Move piece right
  {yellow-fg}Down / S{/yellow-fg}           Soft drop (faster fall)
  {yellow-fg}Up / Enter{/yellow-fg}         Hard drop (instant placement)

{bold}Rotation:{/bold}
  {green-fg}Z / Ctrl{/green-fg}             Rotate counter-clockwise
  {green-fg}X / PgUp{/green-fg}             Rotate clockwise
  {green-fg}Space{/green-fg}                Rotate 180 degrees

{bold}Other:{/bold}
  {cyan-fg}C / Shift{/cyan-fg}             Hold piece (swap with held piece)
  {cyan-fg}P{/cyan-fg}                    Pause / unpause game

{bold}Advanced:{/bold}
  {white-fg}IRS (Initial Rotation System){/white-fg}
    Hold a rotation key while a piece spawns to pre-rotate it.
    Essential at high speed - rotate before the piece appears!

  {white-fg}IHS (Initial Hold System){/white-fg}
    Hold C/Shift while a piece spawns to immediately hold it.
    Lets you cycle pieces without losing a frame.

{bold}Menu Navigation:{/bold}
  Arrow Keys to move, Enter to select, Escape / Q to go back.`;
}

function getGamepadSection(): string {
  return `
{bold}{cyan-fg}[ GAMEPAD / JOYPAD CONTROLS ]{/cyan-fg}{/bold}

Gamepad is fully supported. Default Standard layout:

{bold}Movement:{/bold}
  {yellow-fg}D-Pad / Left Stick{/yellow-fg}   Move and soft drop
  {yellow-fg}D-Pad Up / A Button{/yellow-fg}  Hard drop

{bold}Rotation:{/bold}
  {green-fg}B Button / R1{/green-fg}        Rotate clockwise
  {green-fg}X Button / L1{/green-fg}        Rotate counter-clockwise
  {green-fg}Y Button{/green-fg}             Rotate 180 degrees

{bold}Other:{/bold}
  {cyan-fg}L2 / Select{/cyan-fg}           Hold piece
  {cyan-fg}Start{/cyan-fg}                Pause game

{bold}Menu Navigation:{/bold}
  D-Pad / Left Stick to navigate, A / Start to select,
  B / Select to go back.

{bold}Binding your gamepad:{/bold}
  Go to Settings -> Bind Joypad to run the binding wizard.
  Press a button for each action in sequence.
  Or use Settings -> Joypad Preset to apply a ready-made layout
  (Standard or Arcade Stick / Fighting game layout).`;
}

function getGameModesSection(): string {
  return `
{bold}{cyan-fg}[ GAME MODES ]{/cyan-fg}{/bold}

{bold}{cyan-fg}MASTER MODE{/cyan-fg}{/bold}
  The classic TGM3 experience. Progress through levels 0-1300+
  with increasing speed. Earn grades based on performance.
  Goal: Achieve the Grand Master (GM) grade!

{bold}{red-fg}DEATH MODE{/red-fg}{/bold}
  20G gravity from the START — pieces fall instantly.
  Shirase-style extreme challenge for experts only.
  Requires mastery of piece finesse and IRS/IHS.

{bold}{green-fg}SPRINT 40L{/green-fg}{/bold}
  Clear 40 lines as fast as possible.
  Pure speed test — no grades, just time.
  World-class times are under 40 seconds!

{bold}{yellow-fg}MARATHON{/yellow-fg}{/bold}
  Endless survival mode with increasing speed.
  How long can you last? Great for warm-up and practice.

{bold}{white-fg}TRAINING{/white-fg}{/bold}
  Practice mode with adjustable settings.
  No pressure — experiment with techniques freely.

{bold}{magenta-fg}CPU BATTLE{/magenta-fg}{/bold}
  Battle against AI opponents of varying difficulty.
  Send garbage lines by clearing multiple lines.
  First to top out loses!

{bold}{blue-fg}VERSUS{/blue-fg}{/bold}
  Online multiplayer against other BBS users.
  Real-time competitive matches — climb the rankings!

{bold}{cyan-fg}TETRINET{/cyan-fg}{/bold}
  Classic TetriNET multiplayer with special blocks.
  Connect to TetriNET servers or play on the BBS.
  Special blocks add chaos and strategy!`;
}

function getGradingSection(): string {
  return `
{bold}{cyan-fg}[ GRADING SYSTEM ]{/cyan-fg}{/bold}

Grades are earned through efficient play in Master Mode.
Grade points are awarded on every line clear and decay
over time as you place pieces without clearing lines.

{bold}Grade Progression (lowest to highest):{/bold}
  {gray-fg}9 -> 8 -> 7 -> 6 -> 5 -> 4 -> 3 -> 2 -> 1{/gray-fg}
  {yellow-fg}S1 -> S2 -> S3 -> S4 -> S5 -> S6 -> S7 -> S8 -> S9{/yellow-fg}
  {yellow-fg}S10 -> S11 -> S12 -> S13{/yellow-fg}
  {cyan-fg}m1 -> m2 -> m3 -> m4 -> m5 -> m6 -> m7 -> m8 -> m9{/cyan-fg}
  {green-fg}M -> MK -> MV -> MO{/green-fg}
  {bold}{magenta-fg}GM (Grand Master) -> GMM (Grandmaster Master){/magenta-fg}{/bold}

{bold}Points by Line Clear:{/bold}
  Single:  {white-fg}10 pts{/white-fg}   Double:  {white-fg}20 pts{/white-fg}
  Triple:  {white-fg}40 pts{/white-fg}   Tetris:  {yellow-fg}50 pts{/yellow-fg}  <- Maximum!

{bold}Combo Multipliers:{/bold}
  Consecutive clears build a multiplier:
  {cyan-fg}1x -> 1.2x -> 1.4x ... up to 3.0x{/cyan-fg}

{bold}GM Requirements (all must be met):{/bold}
  {green-fg}[1]{/green-fg} Reach Level 300 before 4:15
  {green-fg}[2]{/green-fg} Reach Level 500 before 7:30
  {green-fg}[3]{/green-fg} Reach Level 700 before 11:30
  {green-fg}[4]{/green-fg} Finish the game at M grade or higher

  All four time gates must be cleared in the same run.
  Failing any gate locks you out of GM for that attempt.`;
}

function getSectionTimingSection(): string {
  return `
{bold}{cyan-fg}[ SECTION TIMING ]{/cyan-fg}{/bold}

Every 100 levels is a "section". Your time per section
determines COOL or REGRET:

{bold}{green-fg}COOL!{/green-fg}{/bold} - Fast section — bonus points, ST medal progress.
{bold}{red-fg}REGRET{/red-fg}{/bold} - Slow section — no bonus, warns you to speed up.

{bold}Section Time Targets (approximate for COOL):{/bold}
  Section 0  (Lv   0-99):  ~52 seconds
  Section 1  (Lv 100-199): ~48 seconds
  Section 2  (Lv 200-299): ~46 seconds
  Section 3  (Lv 300-399): ~44 seconds
  Section 4  (Lv 400-499): ~36 seconds
  Section 5+ (Lv 500+):    increasingly tight

{bold}Key Speed Thresholds:{/bold}
  {yellow-fg}Level 500+{/yellow-fg}  Lock delay shortens, ARE reduces
  {red-fg}Level 900+{/red-fg}  {bold}20G GRAVITY{/bold} — pieces fall to the bottom instantly!

  At 20G, horizontal movement still works before the piece
  locks. Use rotation to slide pieces sideways (wall kicks).`;
}

function getMedalsSection(): string {
  return `
{bold}{cyan-fg}[ MEDAL SYSTEM ]{/cyan-fg}{/bold}

Medals reward exceptional performance within a run.
Tiers: {yellow-fg}Bronze{/yellow-fg} -> {white-fg}Silver{/white-fg} -> {lightyellow-fg}Gold{/lightyellow-fg} -> {cyan-fg}Platinum{/cyan-fg}

{bold}{yellow-fg}AC - All Clear{/yellow-fg}{/bold}
  Clear the entire board (Perfect Clear).
  Thresholds: 1 / 2 / 3 / 5 perfect clears

{bold}{green-fg}ST - Section Time{/green-fg}{/bold}
  Earn COOL ratings on consecutive sections.
  Thresholds: 1 / 3 / 5 / 7 COOL sections

{bold}{magenta-fg}SK - Skill{/magenta-fg}{/bold}
  Tetrises and T-Spins count here.
  Thresholds: 5 / 15 / 30 / 50 skill clears

{bold}{red-fg}RE - Recover{/red-fg}{/bold}
  Survive danger (stack above row 18) back to safety.
  Thresholds: 1 / 2 / 3 / 5 recoveries

{bold}{blue-fg}CO - Combo{/blue-fg}{/bold}
  Maximum combo chain in one run.
  Thresholds: 4 / 6 / 8 / 12 consecutive clears`;
}

function getAdvancedSection(): string {
  return `
{bold}{cyan-fg}[ ADVANCED TECHNIQUES ]{/cyan-fg}{/bold}

{bold}{yellow-fg}T-Spin{/yellow-fg}{/bold}
  Rotate the T-piece into a tight 3-corner gap.
  Awards bonus grade points and contributes to SK medal.
  Mini T-Spins (1 corner) give partial credit.
  {magenta-fg}    ██{/magenta-fg}
  {magenta-fg}  ████{/magenta-fg}  <- Rotate into the gap for a T-Spin!

{bold}{yellow-fg}Lock Delay Reset{/yellow-fg}{/bold}
  Moving or rotating a grounded piece resets its lock timer.
  Limits: {red-fg}15 move resets{/red-fg} and {red-fg}8 rotation resets{/red-fg} per piece.
  Use resets to maneuver at high speed without topping out.

{bold}{yellow-fg}Wall Kicks (SRS){/yellow-fg}{/bold}
  When rotation is blocked, the piece tries offset positions.
  Enables rotations that appear impossible.
  Essential for T-Spins and tight 20G placements.

{bold}{yellow-fg}DAS / ARR Tuning{/yellow-fg}{/bold}
  DAS (Delayed Auto-Shift): time before held key repeats.
  ARR (Auto-Repeat Rate): speed of repeat movement.
  Tune both in Settings to match your play style.
  Competitive players often use ARR=0 (instant repeat).

{bold}{yellow-fg}20G Stacking{/yellow-fg}{/bold}
  At level 900+, pieces fall to the bottom instantly.
  Keep your stack flat — height differences block movement.
  Use IRS to rotate before spawn, use wall kicks to slide.
  Master the "floating" technique: rotate to gain a frame.

{bold}{yellow-fg}Finesse{/yellow-fg}{/bold}
  Every piece has a minimum number of inputs to place it.
  Perfect finesse = fewest keypresses = maximum speed.
  The game tracks your finesse rate in the results screen.

{bold}{yellow-fg}Back-to-Back (B2B){/yellow-fg}{/bold}
  Consecutive Tetrises or T-Spins build a B2B chain.
  Each B2B clear awards bonus grade points.
  Breaking the chain (single/double without T-Spin) resets it.`;
}

function getSettingsSection(): string {
  return `
{bold}{cyan-fg}[ SETTINGS ]{/cyan-fg}{/bold}

Access Settings from the main menu.

{bold}Gameplay:{/bold}
  Rotation System  SRS (standard) / ARS (TGM-style) / NRS / BARS
  DAS / ARR        Tune auto-shift timing (ms)
  Lock Delay       Time before a grounded piece locks (ms)
  Ghost Piece      Show/hide the ghost piece preview
  Preview Count    How many next pieces to display (0-5)

{bold}Audio:{/bold}
  Music Volume / SFX Volume   0-100%

{bold}Visual:{/bold}
  Block Glow / Glow Intensity, Clear Style, Float Text, B2B Glow,
  Connected Blocks, Animation Intensity

{bold}Key Bindings:{/bold}
  {yellow-fg}Bind Keys{/yellow-fg}      Step-through wizard — press a key for each action.
                 Enter=skip, Escape=done.
  {yellow-fg}Key Preset{/yellow-fg}    Pick a ready-made layout:
                 TGM Classic / WASD / Modern (Jstris)
  {yellow-fg}Clear Keys{/yellow-fg}    Wipe all key bindings

{bold}Joypad Bindings:{/bold}
  {yellow-fg}Bind Joypad{/yellow-fg}   Step-through wizard — press a button for each action.
                 Enter=skip, Escape=done. Supports buttons, D-pad,
                 analog sticks (0.85 threshold).
  {yellow-fg}Joypad Preset{/yellow-fg} Pick a ready-made layout:
                 Standard / Arcade Stick (Fighting game)
  {yellow-fg}Clear Joypad{/yellow-fg}  Reset to built-in defaults`;
}

function getTipsSection(): string {
  return `
{bold}{cyan-fg}[ TIPS FOR SUCCESS ]{/cyan-fg}{/bold}

{bold}1. Stack Flat{/bold}
   Keep your stack as level as possible.
   A flat stack gives you more placement options.

{bold}2. Reserve a Column for I-Pieces{/bold}
   Keep one column open for vertical I-pieces (Tetrises).
   Consistent Tetrises build grade points fast.

{bold}3. Learn IRS Early{/bold}
   Pre-rotating pieces on spawn is essential above level 500.
   Hold your rotation key as the previous piece locks.

{bold}4. Don't Panic at 20G{/bold}
   When gravity hits 20G, slow down your thinking.
   One wrong move is manageable — panicking causes stacks.

{bold}5. Use Hold Wisely{/bold}
   Save I-pieces for Tetris opportunities.
   Swap out S/Z pieces that don't fit the current stack.

{bold}6. Watch Your Section Times{/bold}
   COOL sections contribute to GM requirements.
   If you're consistently getting REGRET, increase your pace.

{bold}7. Tune Your DAS/ARR{/bold}
   Fast ARR dramatically speeds up horizontal movement.
   Try ARR=0 with a DAS of 100-133ms for competitive play.

{bold}8. Play Master Mode Often{/bold}
   The grading system rewards consistency over brilliance.
   Regular runs build muscle memory better than occasional
   marathon sessions.

{bold}{yellow-fg}============================================================{/yellow-fg}
                    Good luck, future GRANDMASTER!
{yellow-fg}============================================================{/yellow-fg}{/bold}

Press {cyan-fg}ESC{/cyan-fg} or {cyan-fg}Q{/cyan-fg} to close this manual.`;
}

/**
 * Show the manual in a DocModal
 */
export function showManual(screen: Screen, onClose?: () => void): DocModal {
  screen.program.enableMouse();

  const modal = new DocModal({
    parent: screen,
    title: 'GRANDMASTER Manual',
    header: 'HELP',
    content: getManualContent(),
    headerStyle: { fg: 'cyan', bg: 'black' },
    contentStyle: { fg: 'white', bg: 'black' },
    footerStyle: { fg: 'black', bg: 'cyan' },
    onClose,
  });

  modal.display();
  return modal;
}
