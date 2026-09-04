import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { getInfoFiles } from '../../api/client.js';
import { T, BlessedBox, BlessedText, BlessedSpinner } from '../../theme/blessed-theme.js';
import type { InfoFileEntry } from '../../api/client.js';

const MAX_DISPLAY = 20;

export function ScreenFilesPage() {
  const [files, setFiles] = useState<InfoFileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const data = await getInfoFiles();
      setFiles(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useInput((input, key) => {
    if (key.upArrow) setSelectedIdx(i => Math.max(0, i - 1));
    if (key.downArrow) setSelectedIdx(i => Math.min(files.length - 1, i + 1));
    if (input === 'r') load();
  });

  if (loading) {
    return <Box><BlessedSpinner/><Text> Loading screen files...</Text></Box>;
  }

  if (error) {
    return <BlessedText variant="alert">Error: {error}</BlessedText>;
  }

  const displayFiles = files.slice(0, MAX_DISPLAY);
  const selected = files[selectedIdx];

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" gap={2} marginBottom={1}>
        <BlessedText variant="accent" bold>SCREEN FILES</BlessedText>
        <BlessedText variant="dim">({files.length} files)</BlessedText>
      </Box>

      <BlessedBox style="line" padding={1} flexDirection="column">
        {displayFiles.map((f, i) => (
          <Box key={f.path} flexDirection="row">
            <Text
              color={i === selectedIdx ? T.accent : T.ink}
              bold={i === selectedIdx}
              inverse={i === selectedIdx}
            >
              {i === selectedIdx ? '> ' : '  '}
              {f.name ?? f.path.split('/').pop() ?? f.path}
            </Text>
          </Box>
        ))}
        {files.length > MAX_DISPLAY && (
          <BlessedText variant="dim">... and {files.length - MAX_DISPLAY} more</BlessedText>
        )}
      </BlessedBox>

      {selected && (
        <BlessedBox style="line" padding={1} marginTop={1} flexDirection="column">
          <BlessedText variant="accent" bold>{selected.name ?? selected.path}</BlessedText>
          <BlessedText variant="dim">Path: {selected.path}</BlessedText>
          {selected.tooltypes && selected.tooltypes.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              <BlessedText variant="accent" bold>Tooltypes:</BlessedText>
              {selected.tooltypes.slice(0, 10).map((tt, i) => (
                <Box key={i} flexDirection="row">
                  <Text color={tt.commented ? T.dim : T.ink}>
                    {tt.commented ? '; ' : '  '}{tt.key}={tt.value ?? ''}
                  </Text>
                </Box>
              ))}
              {selected.tooltypes.length > 10 && (
                <BlessedText variant="dim">... and {selected.tooltypes.length - 10} more</BlessedText>
              )}
            </Box>
          )}
        </BlessedBox>
      )}

      <Box flexDirection="row" gap={1} marginTop={1}>
        <BlessedText variant="dim">[↑↓] Scroll  [r] Refresh</BlessedText>
      </Box>
    </Box>
  );
}