import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { listBatches, getBatch, saveBatch, validateBatch } from '../../api/client.js';
import { ConfirmDialog } from '../shared/ConfirmDialog.js';

const ITEMS_START_ROW = 7;

type State = 'list' | 'view' | 'edit' | 'confirm-delete';

export function BatchEditorPage() {
  const [state, setState] = useState<State>('list');
  const [batchNames, setBatchNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  // List state
  const [selectedIdx, setSelectedIdx] = useState(0);

  // View/Edit state
  const [currentBatch, setCurrentBatch] = useState<{ name: string; content: string } | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [editLineIdx, setEditLineIdx] = useState(0);
  const [editValue, setEditValue] = useState('');

  const loadBatches = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listBatches();
      setBatchNames(res.batches ?? []);
      setSelectedIdx(0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load batches');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  const loadBatch = async (name: string) => {
    try {
      const res = await getBatch(name);
      setCurrentBatch(res);
      setLines(res.content.split('\n'));
      setEditLineIdx(0);
      setState('view');
      setStatus(null);
    } catch (e: unknown) {
      setStatus(`Error: ${e instanceof Error ? e.message : 'Failed to load'}`);
    }
  };

  const handleSave = async () => {
    if (!currentBatch) return;
    try {
      await saveBatch(currentBatch.name, lines.join('\n'));
      setStatus('Saved');
      setState('view');
    } catch (e: unknown) {
      setStatus(`Error: ${e instanceof Error ? e.message : 'Failed to save'}`);
    }
  };

  const handleValidate = async () => {
    if (!currentBatch) return;
    try {
      const res = await validateBatch(currentBatch.name, lines.join('\n'));
      if (res.valid) {
        setStatus('Valid syntax');
      } else {
        setStatus(`Invalid: ${(res.errors ?? []).join(', ')}`);
      }
    } catch (e: unknown) {
      setStatus(`Error: ${e instanceof Error ? e.message : 'Validation failed'}`);
    }
  };

  useInput((input, key) => {
    if (state === 'list') {
      if (key.upArrow) setSelectedIdx(i => Math.max(0, i - 1));
      if (key.downArrow) setSelectedIdx(i => Math.min(batchNames.length - 1, i + 1));
      if (key.return) {
        const name = batchNames[selectedIdx];
        if (name) loadBatch(name);
      }
    } else if (state === 'view') {
      if (key.escape) { setState('list'); setCurrentBatch(null); return; }
      if (input === 'e') { setEditValue(lines[editLineIdx] ?? ''); setState('edit'); return; }
      if (key.upArrow) setEditLineIdx(i => Math.max(0, i - 1));
      if (key.downArrow) setEditLineIdx(i => Math.min(lines.length - 1, i + 1));
    } else if (state === 'edit') {
      if (key.escape) { setState('view'); setEditValue(''); return; }
      if (key.return) {
        const newLines = [...lines];
        newLines[editLineIdx] = editValue;
        setLines(newLines);
        if (currentBatch) setCurrentBatch({ ...currentBatch, content: newLines.join('\n') });
        setState('view');
        return;
      }
      if (key.backspace || key.delete) { setEditValue(v => v.slice(0, -1)); return; }
      if (input && !key.ctrl && !key.meta) setEditValue(v => v + input);
    } else if (state === 'confirm-delete') {
      return;
    }

    if (state === 'view' && input === 's') handleSave();
    if (state === 'view' && input === 'v') handleValidate();
    if (state === 'view' && input === 'a') {
      const newLines = [...lines, ''];
      setLines(newLines);
      setEditLineIdx(newLines.length - 1);
    }
    if (state === 'view' && input === 'd') setState('confirm-delete');
  });

  const handleDeleteConfirm = () => {
    const newLines = lines.filter((_, i) => i !== editLineIdx);
    setLines(newLines);
    setEditLineIdx(Math.min(editLineIdx, newLines.length - 1));
    setState('view');
  };

  if (loading) return <Box><Text color="yellow"><Spinner type="dots" /></Text><Text> Loading batches...</Text></Box>;

  if (state === 'list') {
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold color="cyan">BATCH FILES</Text>
          <Text dimColor>  ({batchNames.length})</Text>
        </Box>

        {error && (
          <Box marginBottom={1}>
            <Text color="red">Error: {error}</Text>
          </Box>
        )}

        {batchNames.length === 0 ? (
          <Text dimColor>No batches found</Text>
        ) : (
          batchNames.map((name, i) => (
            <Box key={name}>
              <Text color={i === selectedIdx ? 'cyan' : 'white'} bold={i === selectedIdx}>
                {i === selectedIdx ? '▶ ' : '  '}
                {name}
              </Text>
            </Box>
          ))
        )}

        <Box marginTop={1}>
          <Text dimColor>[enter] load  [↑↓] scroll</Text>
        </Box>
      </Box>
    );
  }

  if (state === 'confirm-delete') {
    return (
      <ConfirmDialog
        message={`Delete line ${editLineIdx + 1}?`}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setState('view')}
      />
    );
  }

  const isEditing = state === 'edit';
  const pageSize = 15;
  const pageStart = Math.floor(editLineIdx / pageSize) * pageSize;
  const visibleLines = lines.slice(pageStart, pageStart + pageSize);

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">{currentBatch?.name}</Text>
        <Text dimColor>  ({lines.length} lines)</Text>
      </Box>

      {status && (
        <Box marginBottom={1}>
          <Text color={status.includes('Error') ? 'red' : 'green'}>{status}</Text>
        </Box>
      )}

      {visibleLines.map((line, idx) => {
        const globalIdx = pageStart + idx;
        const isSel = globalIdx === editLineIdx;
        const lineNum = String(globalIdx + 1).padStart(2, '0');
        return (
          <Box key={`line-${globalIdx}`}>
            <Text color={isSel ? 'cyan' : 'white'} bold={isSel}>
              {isSel && isEditing ? '▶ ' : '  '}
              {lineNum}:
            </Text>
            <Text color={isSel && isEditing ? 'yellow' : 'white'}>
              {isEditing && isSel ? editValue : line}
            </Text>
          </Box>
        );
      })}

      {isEditing && (
        <Box marginTop={1} borderStyle="round" borderColor="yellow" padding={1} width={50}>
          <Text dimColor>[enter] commit  [esc] cancel  [backspace] delete</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>
          {isEditing ? '[enter] commit  [esc] cancel' : '[e]dit  [a]ppend  [d]elete  [s]ave  [v]alidate  [esc] back'}
        </Text>
      </Box>
    </Box>
  );
}
