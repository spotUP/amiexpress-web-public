import React, { useCallback } from 'react';
import { Box, Text, useStdout } from 'ink';
import { parseHotkeys, dispatchKey } from '../hooks/useHotkeyClick.js';
import { useMouse, type MouseClick } from '../hooks/useMouse.js';
import { pageById } from '../pages/registry.js';

const RIGHT_HINT = '[?]help  [q]quit';

interface Props {
  activePageId: string;
}

export function Footer({ activePageId }: Props) {
  const { stdout } = useStdout();
  const termHeight = stdout?.rows ?? 24;
  const termWidth  = stdout?.columns ?? 80;
  // Footer is the bottom 3 rows: top border, content, bottom border.
  const FOOTER_ROW = termHeight - 1;

  const page = pageById(activePageId);
  const leftHint = page?.footerHint ?? '';

  const onMouse = useCallback((e: MouseClick) => {
    if (e.button !== 0 || e.row !== FOOTER_ROW) return;
    // Left hint starts at col 3 (border + paddingX=1).
    for (const r of parseHotkeys(leftHint, 3)) {
      if (e.col >= r.from && e.col <= r.to) { dispatchKey(r.key); return; }
    }
    // Right hint is right-justified by space-between.
    const rightStart = termWidth - 1 - 1 - RIGHT_HINT.length + 1;
    for (const r of parseHotkeys(RIGHT_HINT, rightStart)) {
      if (e.col >= r.from && e.col <= r.to) { dispatchKey(r.key); return; }
    }
  }, [FOOTER_ROW, leftHint, termWidth]);
  useMouse(onMouse);

  return (
    <Box borderStyle="single" borderColor="cyan" paddingX={1} justifyContent="space-between">
      <Text dimColor>{leftHint}</Text>
      <Text dimColor>{RIGHT_HINT}</Text>
    </Box>
  );
}
