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

export type FanOutChoice = 'this-file' | 'all-copies' | 'share-then-write';

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

  if (targets.length < 2) return options;

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
