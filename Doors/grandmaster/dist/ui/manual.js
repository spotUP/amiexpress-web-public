"use strict";
/**
 * Player Manual - GRANDMASTER Tetris
 *
 * Comprehensive guide with colored illustrations
 * Displayed in DocModal widget
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getManualContent = getManualContent;
exports.showManual = showManual;
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
/**
 * Get the complete player manual content with colored illustrations
 */
function getManualContent() {
    return `
${getHeader()}

${getPieceGuide()}

${getControlsSection()}

${getGameModesSection()}

${getGradingSection()}

${getSectionTimingSection()}

${getMedalsSection()}

${getTechniquesSection()}

${getTipsSection()}
`;
}
/**
 * Header section
 */
function getHeader() {
    return `{bold}{yellow-fg}============================================================{/yellow-fg}
                    GRANDMASTER PLAYER MANUAL
{yellow-fg}============================================================{/yellow-fg}{/bold}

Welcome to GRANDMASTER, a TGM3-inspired competitive Tetris game!

This manual covers all game mechanics, controls, and strategies
you need to achieve the legendary Grand Master grade.`;
}
/**
 * Tetromino piece guide with colored block illustrations
 */
function getPieceGuide() {
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
{green-fg}  ████{/green-fg}            S-shape zigzag
                    Pairs well with Z-piece

{red-fg}  ████{/red-fg}            {bold}Z-Piece (Red){/bold}
{red-fg}    ████{/red-fg}          Z-shape zigzag
                    Mirror of S-piece

{blue-fg}  ██{/blue-fg}              {bold}J-Piece (Blue){/bold}
{blue-fg}  ██████{/blue-fg}          L-shape with left hook
                    Good for corners

{lightyellow-fg}      ██{/lightyellow-fg}          {bold}L-Piece (Orange){/bold}
{lightyellow-fg}  ██████{/lightyellow-fg}          L-shape with right hook
                    Mirror of J-piece`;
}
/**
 * Controls section
 */
function getControlsSection() {
    return `
{bold}{cyan-fg}[ CONTROLS ]{/cyan-fg}{/bold}

{bold}Movement:{/bold}
  {yellow-fg}<-  ->{/yellow-fg}  Left/Right Arrow    Move piece horizontally
  {yellow-fg}  v  {/yellow-fg}   Down Arrow          Soft drop (faster fall)
  {yellow-fg}Space{/yellow-fg}   Spacebar            Hard drop (instant drop)

{bold}Rotation:{/bold}
  {green-fg}  Z  {/green-fg}   Z Key               Rotate counter-clockwise
  {green-fg}  X  {/green-fg}   X Key               Rotate clockwise
  {green-fg}  Up {/green-fg}   Up Arrow            Rotate clockwise (alt)

{bold}Other:{/bold}
  {cyan-fg}  C  {/cyan-fg}   C Key               Hold piece
  {cyan-fg} Esc {/cyan-fg}   Escape              Pause game
  {red-fg}  Q  {/red-fg}   Q Key               Quit to menu

{bold}Navigation:{/bold}
  In menus, use Arrow Keys to navigate and Enter to select.`;
}
/**
 * Game modes section
 */
function getGameModesSection() {
    return `
{bold}{cyan-fg}[ GAME MODES ]{/cyan-fg}{/bold}

{bold}{cyan-fg}MASTER MODE{/cyan-fg}{/bold}
  The classic TGM3 experience. Progress through levels 0-1300+
  with increasing speed. Earn grades based on performance.
  Goal: Achieve the Grand Master (GM) grade!

{bold}{red-fg}DEATH MODE{/red-fg}{/bold}
  20G gravity from the START! Pieces fall instantly.
  Shirase-style extreme challenge for experts only.
  Requires mastery of piece finesse and IRS/IHS.

{bold}{green-fg}SPRINT 40L{/green-fg}{/bold}
  Clear 40 lines as fast as possible.
  Pure speed test - no grades, just time.
  World-class times are under 40 seconds!

{bold}{yellow-fg}MARATHON{/yellow-fg}{/bold}
  Endless survival mode with no level cap.
  How long can you survive as speed increases?
  Great for practice and high scores.

{bold}{magenta-fg}CPU BATTLE{/magenta-fg}{/bold}
  Battle against AI opponents of varying difficulty.
  Send garbage lines by clearing multiple lines.
  First to top out loses!

{bold}{blue-fg}VERSUS{/blue-fg}{/bold}
  Online multiplayer against other BBS users.
  Real-time competitive matches.
  Climb the rankings!`;
}
/**
 * Grading system section
 */
function getGradingSection() {
    return `
{bold}{cyan-fg}[ GRADING SYSTEM ]{/cyan-fg}{/bold}

Grades are earned through efficient play. The grading system
awards points based on line clears and combos:

{bold}Grade Progression (lowest to highest):{/bold}
  {gray-fg}9 -> 8 -> 7 -> 6 -> 5 -> 4 -> 3 -> 2 -> 1{/gray-fg}
  {yellow-fg}S1 -> S2 -> S3 -> S4 -> S5 -> S6 -> S7 -> S8 -> S9{/yellow-fg}
  {cyan-fg}m1 -> m2 -> m3 -> m4 -> m5 -> m6 -> m7 -> m8 -> m9{/cyan-fg}
  {green-fg}M -> MK -> MV -> MO -> MM{/green-fg}
  {bold}{magenta-fg}GM (Grand Master){/magenta-fg}{/bold}

{bold}Point Values by Line Clear:{/bold}
  Single:  {white-fg}10 pts{/white-fg}  (1 line)
  Double:  {white-fg}20 pts{/white-fg}  (2 lines)
  Triple:  {white-fg}40 pts{/white-fg}  (3 lines)
  Tetris:  {yellow-fg}50 pts{/yellow-fg}  (4 lines) - Maximum efficiency!

{bold}Combo Multipliers:{/bold}
  Consecutive clears multiply your points:
  {cyan-fg}1x -> 1.2x -> 1.4x -> 1.6x -> 1.8x -> 2.0x{/cyan-fg} ...up to {yellow-fg}3.0x{/yellow-fg}

{bold}GM Requirements:{/bold}
  {green-fg}[x]{/green-fg} Reach Level 300 in under 4:15
  {green-fg}[x]{/green-fg} Reach Level 500 in under 7:30
  {green-fg}[x]{/green-fg} Reach Level 700 in under 11:30
  {green-fg}[x]{/green-fg} Complete game with M grade or higher`;
}
/**
 * Section timing section
 */
function getSectionTimingSection() {
    return `
{bold}{cyan-fg}[ SECTION TIMING ]{/cyan-fg}{/bold}

Every 100 levels is a "section". Your section time determines
whether you get COOL or REGRET:

{bold}{green-fg}COOL{/green-fg}{/bold} - Fast section completion!
  Awards bonus points and contributes to ST medal.
  Target times vary by section (earlier = more time allowed).

{bold}{red-fg}REGRET{/red-fg}{/bold} - Slow section completion
  No bonus, may hurt grade progression.
  Indicates need to improve speed/efficiency.

{bold}Section Time Targets (for COOL):{/bold}
  Section 0 (Lv 0-99):   ~52 seconds
  Section 1 (Lv 100-199): ~48 seconds
  Section 2 (Lv 200-299): ~46 seconds
  Section 3 (Lv 300-399): ~44 seconds
  Section 4 (Lv 400-499): ~36 seconds
  Section 5+ varies by difficulty

{bold}Speed Changes:{/bold}
  Level 500+: Lock delay decreases, ARE shortens
  Level 900+: {red-fg}20G GRAVITY{/red-fg} - Pieces fall instantly!`;
}
/**
 * Medals section
 */
function getMedalsSection() {
    return `
{bold}{cyan-fg}[ MEDAL SYSTEM ]{/cyan-fg}{/bold}

Earn medals for exceptional performance in various categories.
Each medal has 4 tiers: {yellow-fg}Bronze{/yellow-fg} -> {white-fg}Silver{/white-fg} -> {lightyellow-fg}Gold{/lightyellow-fg} -> {cyan-fg}Platinum{/cyan-fg}

{bold}{yellow-fg}AC - All Clear{/yellow-fg}{/bold}
  Clear the entire board (Perfect Clear).
  Very rare and impressive achievement!
  Thresholds: 1 / 2 / 3 / 5 perfect clears

{bold}{green-fg}ST - Section Time{/green-fg}{/bold}
  Earn COOL ratings on sections.
  Shows consistent fast play.
  Thresholds: 1 / 3 / 5 / 7 COOL sections

{bold}{magenta-fg}SK - Skill{/magenta-fg}{/bold}
  Tetrises and T-Spins count here.
  Rewards efficient line clearing.
  Thresholds: 5 / 15 / 30 / 50 skill clears

{bold}{red-fg}RE - Recover{/red-fg}{/bold}
  Survive from danger (row 18+) back to safety.
  Shows composure under pressure.
  Thresholds: 1 / 2 / 3 / 5 recoveries

{bold}{blue-fg}CO - Combo{/blue-fg}{/bold}
  Maximum combo chain achieved.
  Consecutive line clears without dropping.
  Thresholds: 4 / 6 / 8 / 12 combo`;
}
/**
 * Advanced techniques section
 */
function getTechniquesSection() {
    return `
{bold}{cyan-fg}[ ADVANCED TECHNIQUES ]{/cyan-fg}{/bold}

{bold}{yellow-fg}T-Spin{/yellow-fg}{/bold}
  Rotate the T-piece into a tight space.
  Awards bonus points and contributes to SK medal.
  {magenta-fg}    ██{/magenta-fg}
  {magenta-fg}  ████{/magenta-fg}  <- Tuck and rotate into gaps!

{bold}{yellow-fg}Lock Delay Reset{/yellow-fg}{/bold}
  Moving or rotating resets the lock timer.
  Use this to "float" pieces longer at 20G.
  Limits: 15 moves, 8 rotations per piece.

{bold}{yellow-fg}Wall Kicks{/yellow-fg}{/bold}
  Pieces can "kick" off walls/floor when rotating.
  Enables rotations that seem impossible.
  Essential for T-Spins and 20G play.

{bold}{yellow-fg}DAS (Delayed Auto Shift){/yellow-fg}{/bold}
  Hold left/right to charge DAS, then rapid movement.
  Master this for fast horizontal placement.

{bold}{yellow-fg}Finesse{/yellow-fg}{/bold}
  Minimum moves to place each piece.
  Good finesse = faster play + fewer errors.
  Practice optimal piece placements!

{bold}{yellow-fg}20G Stacking{/yellow-fg}{/bold}
  At 20G, pieces fall instantly.
  Use rotation to move horizontally.
  Keep stack flat to maximize mobility.`;
}
/**
 * Tips section
 */
function getTipsSection() {
    return `
{bold}{cyan-fg}[ TIPS FOR SUCCESS ]{/cyan-fg}{/bold}

{bold}1. Stack Flat{/bold}
   Keep your stack as level as possible.
   A flat stack gives you more placement options.

{bold}2. Reserve Right Column{/bold}
   Keep the rightmost column empty for I-pieces.
   This enables frequent Tetrises for maximum points.

{bold}3. Don't Panic at 20G{/bold}
   When gravity hits 20G, stay calm.
   Use rotation to slide pieces horizontally.

{bold}4. Use Hold Wisely{/bold}
   Save I-pieces for Tetris opportunities.
   Swap out awkward pieces to maintain flow.

{bold}5. Learn Piece Previews{/bold}
   Look ahead at the next pieces.
   Plan your placements 2-3 pieces in advance.

{bold}6. Practice Lock Delay{/bold}
   At high speeds, master the lock delay reset.
   Move/rotate to buy time for positioning.

{bold}7. Aim for Combos{/bold}
   Consecutive clears multiply your points.
   Build up combos for faster grade advancement.

{bold}{yellow-fg}============================================================{/yellow-fg}
                    Good luck, future GRANDMASTER!
{yellow-fg}============================================================{/yellow-fg}{/bold}

Press {cyan-fg}ESC{/cyan-fg}, {cyan-fg}Q{/cyan-fg}, or {cyan-fg}F1{/cyan-fg} to close this manual.`;
}
/**
 * Show the manual in a DocModal
 */
function showManual(screen, onClose) {
    // Enable mouse control for manual scrolling
    screen.program.enableMouse();
    const modal = new blessed_1.DocModal({
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
//# sourceMappingURL=manual.js.map