/**
 * A migrated door must not creep back to literal colours.
 *
 * The theme system only works if doors ask for a ROLE rather than a hue. A
 * single `fg: 'cyan'` re-introduced into a migrated door is invisible under
 * `classic` - whose tokens ARE those names - and only shows up when
 * somebody running Quiet Phosphor finds one cyan panel among the green.
 * That is the failure this test exists to catch, because nothing else can.
 *
 * It is deliberately NOT a rule for every door. See EXEMPT below.
 */

import * as fs from 'fs';
import * as path from 'path';

const DOORS = path.resolve(__dirname, '../../../Doors');

/** Doors whose colours are CONTENT, and are meant to stay literal. */
const EXEMPT: Record<string, string> = {
  // The arcade games. A sprite is the colour the artist chose, and the HUDs
  // are arcade-authentic - Frogger's cabinet really is yellow/white/cyan.
  // Repainting them to follow a BBS theme would work against the
  // arcade-accuracy work, so the sysop chose to leave them literal.
  'card-lobby': 'arcade palette is content',
  'donkey-kong': 'arcade palette is content',
  'frogger': 'arcade palette is content',
  'galaga': 'arcade palette is content',
  'grandmaster': 'arcade palette is content',
  'joust': 'arcade palette is content',
  'pengo': 'arcade palette is content',
  'pipe-dream': 'arcade palette is content',
  'puzzle-bobble': 'arcade palette is content',
  'scrollwars': 'arcade palette is content',
  'super-qix': 'arcade palette is content',
  'whip': 'arcade palette is content',
  'zoo-keeper': 'arcade palette is content',

  // The widget showcases. Their whole subject is what blessed can draw, so
  // a showcase repainted in one hue demonstrates nothing.
  'neo-blessed-showcase': 'the colours are the demonstration',
  'header-dropdown-demo': 'the colours are the demonstration',
  'widget-shadow-demo': 'the colours are the demonstration',
};

/** Doors that have been migrated and must stay clean. */
const MIGRATED = [
  'doors-menu',
  'door-manager',
  'bug-tracker',
  'bbs-dashboard',
  'rip-browser',
  'ansi-editor',
  'sprite-editor',
  'theme-picker',
];

// Bright variants included: `lightyellow` slipped through the first pass
// of this very test, which is exactly the creep it is meant to catch.
const HUE = 'white|black|gray|grey|cyan|magenta|green|yellow|red|blue'
  + '|lightyellow|lightcyan|lightgreen|lightred|lightblue|lightgray|lightgrey';
const LITERAL = new RegExp(
  `\\b(?:fg|bg)\\s*:\\s*'(?:${HUE})'` + `|\\{/?(?:${HUE})-(?:fg|bg)\\}`
);

function sourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'dist' || entry.name === 'node_modules') continue;
      out.push(...sourceFiles(full));
    } else if (full.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** Comments describe the migration; they are not colours on screen. */
function codeLines(file: string): Array<{ line: string; n: number }> {
  const out: Array<{ line: string; n: number }> = [];
  let inBlock = false;
  fs.readFileSync(file, 'utf-8').split('\n').forEach((raw, i) => {
    const t = raw.trim();
    if (inBlock) {
      if (t.includes('*/')) inBlock = false;
      return;
    }
    if (t.startsWith('/*')) {
      if (!t.includes('*/')) inBlock = true;
      return;
    }
    if (t.startsWith('//') || t.startsWith('*')) return;
    out.push({ line: raw, n: i + 1 });
  });
  return out;
}

describe('doors that were migrated stay migrated', () => {
  for (const door of MIGRATED) {
    it(`${door} asks for roles, not colours`, () => {
      const dir = path.join(DOORS, door);
      const offenders: string[] = [];
      for (const file of sourceFiles(dir)) {
        for (const { line, n } of codeLines(file)) {
          if (LITERAL.test(line)) {
            offenders.push(`${path.relative(DOORS, file)}:${n}  ${line.trim().slice(0, 70)}`);
          }
        }
      }
      expect(offenders).toEqual([]);
    });
  }

  it('actually read the doors, rather than finding nothing', () => {
    // Every assertion above passes trivially against an empty directory.
    const counted = MIGRATED.reduce(
      (n, d) => n + sourceFiles(path.join(DOORS, d)).length,
      0
    );
    expect(counted).toBeGreaterThan(20);
  });

  it('leaves the exempt doors alone on purpose', () => {
    // Recorded so a later reader sees a DECISION rather than an oversight:
    // arcade palettes and widget showcases are content, not chrome.
    for (const [door, why] of Object.entries(EXEMPT)) {
      expect(typeof why).toBe('string');
      expect(MIGRATED).not.toContain(door);
    }
    expect(Object.keys(EXEMPT).length).toBeGreaterThan(10);
  });
});
