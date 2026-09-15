/**
 * QuickNew's config, as a list of editable templates.
 *
 * The door prints these templates verbatim with `@` placeholders substituted,
 * so they ARE the screen - which is why the sysop asked for them in the ANSI
 * editor ("add the config templates to the web admin ui and make them editable
 * in the ansi editor", 2026-09-15).
 *
 * The file is not the `[Section_END]` shape the rest of the art plumbing reads.
 * It is, in order:
 *
 *     line 1   colour prefix for an ordinary file in the listing
 *     line 2   colour prefix for one marked `D`
 *     line 3   display mode, as a DIGIT MINUS '1' (so "2" means mode 1)
 *     line 4   form feed
 *     then, repeating: header template, stats template, `#`, directory path
 *
 * The number of blocks is whatever the sysop configured, so the sections have
 * to be DISCOVERED from the file rather than listed in a manifest - one
 * manifest entry expands into two editable templates per conference area.
 *
 * Bytes are latin1 throughout: these lines carry ESC sequences and high-bit
 * characters, and a UTF-8 round trip would destroy them.
 */

/** One area's pair of templates, with the directory they describe. */
export interface QuickNewBlock {
  /** 0-based position in the file, which is the section name's number. */
  index: number;
  /** `BBS:Conf2/Dir1` - what the block is FOR, and what the label shows. */
  dirPath: string;
  /** The `Last @D Days Files in >> ... <<` line. */
  header: string;
  /** The `Yesterdays Statistics ...` line. */
  stats: string;
}

/** Which of a block's two lines a section refers to. */
export type QuickNewTemplate = 'header' | 'stats';

const PREAMBLE_LINES = 4;

/**
 * The blocks in a QuickNew config.
 *
 * A malformed tail is IGNORED rather than thrown on: this file is hand-edited
 * on real boards, and a half-written block at the end must not stop the sysop
 * editing the nine that are fine.
 */
export function parseQuickNewBlocks(text: string): QuickNewBlock[] {
  const lines = text.split('\n').map(l => l.replace(/\r$/, ''));
  const blocks: QuickNewBlock[] = [];

  let i = PREAMBLE_LINES;
  let index = 0;
  while (i + 3 <= lines.length) {
    const header = lines[i];
    const stats = lines[i + 1];
    const marker = lines[i + 2];
    const dirPath = lines[i + 3] ?? '';
    // `#` is what separates a block's templates from its directory.
    if (marker.trim() !== '#') break;
    blocks.push({ index, dirPath: dirPath.trim(), header, stats });
    i += 4;
    index += 1;
  }

  return blocks;
}

/** `block0.header` - the section name the art API exposes. */
export function quickNewSectionName(index: number, which: QuickNewTemplate): string {
  return `block${index}.${which}`;
}

/** The inverse, or null when the name is not one of ours. */
export function parseQuickNewSectionName(
  section: string
): { index: number; which: QuickNewTemplate } | null {
  const m = /^block(\d+)\.(header|stats)$/.exec(section);
  if (!m) return null;
  return { index: Number(m[1]), which: m[2] as QuickNewTemplate };
}

/** What the Studio card says: the area, then which of its two lines. */
export function quickNewSectionLabel(block: QuickNewBlock, which: QuickNewTemplate): string {
  const where = block.dirPath || `area ${block.index + 1}`;
  return which === 'header' ? `${where} - heading` : `${where} - statistics line`;
}

/**
 * Put one template back, leaving every other byte of the file alone.
 *
 * Line-for-line replacement rather than a rewrite of the whole file: the
 * preamble carries a form feed and two colour prefixes that nothing here
 * understands, and a config is the sysop's to keep.
 */
export function replaceQuickNewTemplate(
  text: string,
  index: number,
  which: QuickNewTemplate,
  replacement: string
): string {
  const blocks = parseQuickNewBlocks(text);
  const block = blocks.find(b => b.index === index);
  if (!block) throw new Error(`QuickNew config has no block ${index}`);

  // A template is ONE line; a newline in the replacement would shift every
  // block after it and silently re-point the areas.
  const flat = replacement.replace(/\r?\n/g, ' ');

  const lines = text.split('\n');
  const at = PREAMBLE_LINES + index * 4 + (which === 'header' ? 0 : 1);
  const hadCr = lines[at].endsWith('\r');
  lines[at] = hadCr ? `${flat}\r` : flat;
  return lines.join('\n');
}
