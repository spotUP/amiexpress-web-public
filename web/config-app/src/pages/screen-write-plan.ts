/**
 * What a replace should touch.
 *
 * A screen exists once per node, so replacing "the LOGON screen" means
 * replacing forty files - and sometimes it means replacing one, because a node
 * is deliberately different. Neither can be the silent default: the fan-out is
 * a choice the sysop makes per upload, with the target count in front of them.
 *
 * When every copy is already identical there is a better answer than writing
 * the same bytes forty times, and it is express.e's own: point the nodes at
 * one directory with the SCREENS tooltype and write once. That is suggested,
 * never forced.
 */

import type { ScreenIndexShape } from './screen-index-view';

export type FanOutChoice =
  | 'this-file'
  | 'same-content'
  | 'all-copies'
  | 'share-then-write';

export interface FanOutOption {
  choice: FanOutChoice;
  label: string;
  targets: string[];
  suggested: boolean;
}

export function fanOutOptions(
  index: ScreenIndexShape,
  screen: string,
  openPath: string,
): FanOutOption[] {
  const entry = index.screens.find(s => s.screen === screen);
  const resolved = (entry?.resolutions ?? [])
    .map(r => r.file)
    .filter((f): f is string => !!f);

  // The file the sysop opened leads, whatever order the index holds.
  const targets = [openPath, ...resolved.filter(f => f !== openPath)];

  const options: FanOutOption[] = [
    { choice: 'this-file', label: 'this file only', targets: [openPath], suggested: false },
  ];

  /*
   * Every file that is byte-identical to this one, wherever it lives.
   *
   * This board is 1,155 screen files of which 34 are unique: `guestlogon.txt`
   * exists 80 times in one version, `logoff.txt` 93 times in five. Editing one
   * copy at a time is what produced the five - somebody fixed a few nodes and
   * the rest drifted - so the identical set is the honest default: writing it
   * changes nothing that was not already the same bytes.
   *
   * Not limited to this screen NAME's resolutions, because the copies are
   * spread across `Node<n>/`, `Node<n>/Screens/` and `Conf<n>/Screens/`, and
   * the index knows them by content rather than by which screen resolves to
   * them.
   */
  const openFile = index.files[openPath];
  const identical = openFile
    ? Object.values(index.files)
      .filter(f => f.sha256 === openFile.sha256 && f.relPath !== openPath)
      .map(f => f.relPath)
      .sort((a, b) => a.localeCompare(b))
    : [];

  if (identical.length) {
    options.push({
      choice: 'same-content',
      label: `all ${identical.length + 1} copies that are identical to this one`,
      targets: [openPath, ...identical],
      // Suggested only when there is nothing better. Sharing is better when it
      // applies: it makes the NEXT edit one file instead of eighty, which is
      // the actual fix for a board that is 97% clones.
      suggested: false,
    });
  }

  if (targets.length < 2) {
    // Nothing to share and no sibling to overwrite, so the safe bulk is the
    // best answer available.
    const sameContent = options.find(o => o.choice === 'same-content');
    if (sameContent) sameContent.suggested = true;
    return options;
  }

  const hashes = new Set(
    targets.map(t => index.files[t]?.sha256).filter((h): h is string => !!h),
  );
  const allIdentical = hashes.size === 1;

  options.push({
    choice: 'all-copies',
    label: `all ${targets.length} nodes that have ${screen}`,
    targets,
    suggested: !allIdentical,
  });

  options.push({
    choice: 'share-then-write',
    label: 'share from one directory, then write once',
    targets,
    suggested: allIdentical,
  });

  return options;
}
