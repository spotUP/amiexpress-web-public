/**
 * Turning what /api/info-editor/files sends into what the tree shows.
 *
 * The page used to map the response like this:
 *
 *   path: file.path || file,
 *   name: file.name || file.split('/').pop() || file,
 *
 * which describes a shape the server has never sent. It sends objects -
 * `{ path, relativePath, basename, type }` - with no `name` and no `size`, so
 * `file.name` was undefined and `.split()` was called on the object itself.
 *
 * That never threw, because the endpoint replied in an envelope the page could
 * not read and the list was always empty, so the map never ran. Fixing the
 * envelope let the data through and the page crashed on the first file:
 * "P.split is not a function". Two faults of the same kind, stacked, the
 * second one hidden by the first.
 *
 * `path` here is the path RELATIVE to the BBS root, because that is what
 * /api/info-editor/file expects and what the categories are matched against.
 * The absolute path the server also sends is of no use to a browser.
 */

export interface InfoFileItem {
  /** Relative to the BBS root - what the editor endpoint takes. */
  path: string;
  name: string;
  category: string;
}

/** What the server sends for each file. */
export interface InfoFileResponse {
  path?: string;
  relativePath?: string;
  basename?: string;
  type?: string;
}

/**
 * Which section of the tree a file belongs under.
 *
 * Matched against the RELATIVE path: an absolute one starts with the
 * container's /app/data/bbs and never matches any of these, so every file
 * landed in "System".
 */
export function categorizeInfoFile(relativePath: string): string {
  const p = relativePath ?? '';
  if (p.startsWith('Commands/')) return 'Commands';
  if (p.startsWith('doors/') || p.startsWith('Doors/')) return 'Doors';
  if (p.startsWith('Protocols')) return 'Protocols';
  if (p.startsWith('Languages')) return 'Languages';
  if (p.startsWith('batch')) return 'Batch Processing';
  if (p.startsWith('FCheck')) return 'File Management';
  if (p.startsWith('bbsConfig')) return 'BBS Configuration';
  if (p.startsWith('ConfConfig')) return 'Conferences';
  if (p.startsWith('AmiXnet')) return 'AmiXnet Network';
  if (p.includes('Node')) return 'Nodes';
  if (p.includes('Conf')) return 'Conferences';
  return 'System';
}

/** The list the tree renders, from the list the server sent. */
export function toInfoFileItems(files: unknown): InfoFileItem[] {
  if (!Array.isArray(files)) return [];

  const items: InfoFileItem[] = [];
  for (const raw of files) {
    // A string entry is tolerated so an older server, or a hand-built
    // fixture, does not take the page down.
    if (typeof raw === 'string') {
      items.push({
        path: raw,
        name: raw.split('/').pop() || raw,
        category: categorizeInfoFile(raw),
      });
      continue;
    }
    if (!raw || typeof raw !== 'object') continue;

    const file = raw as InfoFileResponse;
    const relative = file.relativePath ?? file.path;
    if (!relative) continue;

    items.push({
      path: relative,
      name: file.basename ?? relative.split('/').pop() ?? relative,
      category: categorizeInfoFile(relative),
    });
  }
  return items;
}

/**
 * Every category the board has, from the WHOLE list.
 *
 * Derived from the filtered list, this collapsed to the one category already
 * chosen the moment a chip was clicked: there was no way to switch from
 * Commands to Doors without going back to All first, and typing in the search
 * box made the chips disappear as the matches narrowed. The chips describe the
 * board, not the current view.
 */
export function infoFileCategories(items: InfoFileItem[]): string[] {
  return ['All', ...Array.from(new Set(items.map(item => item.category))).sort()];
}

/**
 * The files a search term and a chip leave showing.
 *
 * The term is matched against the PATH as well as the name, which is what
 * makes the page usable on a board with forty nodes. Every node holds the same
 * fifteen files - Modem.info, Serial.info, Work.info - so 441 of this board's
 * 1111 icons are in the Nodes category under a few names repeated forty times.
 * Matching the name alone, "Node40" found nothing at all, because no file is
 * called that; matching the path, it narrows the category to one node.
 */
export function filterInfoFiles(
  items: InfoFileItem[],
  searchTerm: string,
  category: string,
): InfoFileItem[] {
  const term = searchTerm.trim().toLowerCase();

  return items.filter(item => {
    if (category !== 'All' && item.category !== category) return false;
    if (!term) return true;
    return item.name.toLowerCase().includes(term)
      || item.path.toLowerCase().includes(term);
  });
}

/** The filtered files under their category headings, for rendering. */
export function groupInfoFilesByCategory(
  items: InfoFileItem[],
): Record<string, InfoFileItem[]> {
  const grouped: Record<string, InfoFileItem[]> = {};
  for (const item of items) {
    (grouped[item.category] ??= []).push(item);
  }
  return grouped;
}
