/**
 * Settings preference checkboxes
 */
import blessed, { Box } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

export function createPrefCheckboxes(p: Box, l: number, r: number, g: number) {
  const muteSounds = blessed.checkbox({
    parent: p,
    top: r,
    left: l,
    text: 'Mute Sounds',
    checked: false,
    mouse: true,
    style: { fg: 'white' },
  });
  r += g;

  const showTyping = blessed.checkbox({
    parent: p,
    top: r,
    left: l,
    text: 'Show Typing Indicators',
    checked: true,
    mouse: true,
    style: { fg: 'white' },
  });
  r += g;

  const timestamps = blessed.checkbox({
    parent: p,
    top: r,
    left: l,
    text: 'Show Timestamps',
    checked: true,
    mouse: true,
    style: { fg: 'white' },
  });
  r += 2;

  return { muteSounds, showTyping, timestamps, nextRow: r };
}
