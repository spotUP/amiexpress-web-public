/**
 * The editor's shortcuts, as something a person can read.
 *
 * "this help text is chaotic and hard to read ... i dont even have all the
 * buttons on my mac m1 laptop keyboard" (sysop, 2026-09-14). It was one
 * six-line paragraph listing twenty-odd keys in the order they were
 * implemented, and several of them - Insert, Home, End, PageUp, PageDown -
 * do not exist on the keyboard he draws with.
 *
 * Data, not markup, for the same reason `editor-shortcuts.ts` is a decision
 * table: what the editor DOES and what the help SAYS have to come from one
 * place, or the help drifts into a list of keys that used to work.
 *
 * Grouped by what an artist is trying to do, and the Mac column carries the
 * keys that differ there - Option+letter types special characters on a Mac,
 * so Cmd is what the clipboard answers to.
 */

export interface HelpRow {
  /** What it does, in the artist's words. */
  what: string;
  /** The keys, already spelled for this platform. */
  keys: string;
}

export interface HelpGroup {
  title: string;
  rows: HelpRow[];
}

/**
 * `mac` changes the spelling, never the grouping - the same actions in the
 * same order, so two people on different machines can talk about "the third
 * row under Moving" and mean the same thing.
 */
export function editorHelp(mac: boolean): HelpGroup[] {
  const mod = mac ? 'Cmd' : 'Ctrl';
  return [
    {
      title: 'Tools',
      rows: [
        { what: 'Draw, Line, Box, Ellipse', keys: 'Alt+D, Alt+L, Alt+B, Alt+E' },
        { what: 'Fill, Select, Text, Pick colour', keys: 'Alt+F, Alt+S, Alt+T, Alt+P' },
        { what: 'Filled box or ellipse', keys: 'Alt+Shift+B, Alt+Shift+E' },
      ],
    },
    {
      title: 'Colours',
      rows: [
        { what: 'Foreground 0-7', keys: 'Ctrl+0 ... Ctrl+7' },
        { what: 'Background 0-7', keys: 'Alt+0 ... Alt+7' },
      ],
    },
    {
      title: 'Moving the cursor',
      rows: [
        { what: 'One cell', keys: 'Arrow keys' },
        // The laptop spelling FIRST on a Mac: it is the one he can press.
        { what: 'Start or end of the row', keys: mac ? 'Alt+Left, Alt+Right' : 'Home, End (or Alt+Left, Alt+Right)' },
        { what: 'Ten rows up or down', keys: mac ? 'Alt+Up, Alt+Down' : 'PageUp, PageDown (or Alt+Up, Alt+Down)' },
      ],
    },
    {
      title: 'Editing',
      rows: [
        { what: 'Erase the cell under the cursor', keys: mac ? 'Delete' : 'Delete or Backspace' },
        { what: 'Undo, redo', keys: `${mod}+Z, ${mod}+Shift+Z` },
        { what: 'Remove this line, everything below moves up', keys: `${mod}+K` },
        { what: 'Push a blank line in here', keys: `${mod}+Shift+K` },
        { what: 'Centre this row', keys: 'Alt+Shift+C' },
        { what: 'Insert mode - typing pushes the row right', keys: mac ? 'Alt+I' : 'Insert (or Alt+I)' },
      ],
    },
    {
      title: 'Copy and paste',
      rows: [
        { what: 'Select an area', keys: 'Alt+S, then drag' },
        { what: 'Copy, cut', keys: mac ? 'Cmd+C, Cmd+X' : 'Alt+C, Alt+X (or Ctrl+C, Ctrl+X)' },
        { what: 'Paste at the cursor - click where you want it first', keys: mac ? 'Cmd+V' : 'Alt+V (or Ctrl+V)' },
      ],
    },
  ];
}

/** Whether this browser is on a Mac, where the clipboard answers to Cmd. */
export function onAMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  const claim = `${(navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform ?? ''} `
    + `${navigator.platform ?? ''} ${navigator.userAgent ?? ''}`;
  return /mac/i.test(claim);
}
