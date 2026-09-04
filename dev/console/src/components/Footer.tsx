import React, { useCallback } from 'react';
import { Box, Text, useStdout } from 'ink';
import { parseHotkeys, dispatchKey } from '../hooks/useHotkeyClick.js';
import { useMouse, type MouseClick } from '../hooks/useMouse.js';
import { pageById } from '../pages/registry.js';
import { THEME, BOX, BORDER_STYLE } from '../theme/blessed-theme.js';

const RIGHT_HINT = '[F2]restart  [?]help  [q]quit';

interface Props {
  activePageId: string;
}

export function Footer({ activePageId }: Props) {
  const { stdout } = useStdout();
  const termHeight = stdout?.rows ?? 24;
  const termWidth  = stdout?.columns ?? 80;
  const FOOTER_ROW = termHeight - 1;

  const page = pageById(activePageId);
  const leftHint = page?.footerHint ?? '';

  const onMouse = useCallback((e: MouseClick) => {
    if (e.button !== 0 || e.row !== FOOTER_ROW) return;
    for (const r of parseHotkeys(leftHint, 3)) {
      if (e.col >= r.from && e.col <= r.to) { dispatchKey(r.key); return; }
    }
    const rightStart = termWidth - 1 - 1 - RIGHT_HINT.length + 1;
    for (const r of parseHotkeys(RIGHT_HINT, rightStart)) {
      if (e.col >= r.from && e.col <= r.to) { dispatchKey(r.key); return; }
    }
  }, [FOOTER_ROW, leftHint, termWidth]);
  useMouse(onMouse);

  const topBorder = BOX.single.topLeft + BOX.single.horizontal.repeat(termWidth - 2) + BOX.single.topRight;
  const bottomBorder = BOX.single.bottomLeft + BOX.single.horizontal.repeat(termWidth - 2) + BOX.single.bottomRight;

  return (
    <Box flexDirection="column" width={termWidth}>
      <Text color={THEME.border.fg}>{topBorder}</Text>
      <Box 
        flexDirection="row" 
        justifyContent="space-between" 
        paddingX={1}
        width={termWidth}
      >
        <Text color={THEME.border.fg}>{BOX.single.vertical}</Text>
        <Box flexGrow={1}>
          <Text dimColor>{leftHint}</Text>
        </Box>
        <Text dimColor>{RIGHT_HINT}</Text>
        <Text color={THEME.border.fg}>{BOX.single.vertical}</Text>
      </Box>
      <Text color={THEME.border.fg}>{bottomBorder}</Text>
    </Box>
  );
}