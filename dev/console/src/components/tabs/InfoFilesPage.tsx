import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { getInfoFiles, getInfoFile, updateInfoFile, toggleTooltypeComment, type InfoFileEntry, type InfoTooltype } from '../../api/client.js';
import { useRowClick } from '../../hooks/useRowClick.js';

const ITEMS_START_ROW = 7;

type Mode = 'list' | 'edit' | 'field-edit';

export function InfoFilesPage() {
  const [files, setFiles] = useState<InfoFileEntry[]>([]);
  const [selectedFileIdx, setSelectedFileIdx] = useState(0);
  const [selectedFile, setSelectedFile] = useState<InfoFileEntry | null>(null);
  const [tooltypes, setTooltypes] = useState<InfoTooltype[]>([]);
  const [selectedFieldIdx, setSelectedFieldIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('list');
  const [editValue, setEditValue] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getInfoFiles();
      setFiles(data);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const loadFile = useCallback(async (file: InfoFileEntry) => {
    try {
      const data = await getInfoFile(file.path);
      if (data) {
        setSelectedFile(file);
        setTooltypes(data.tooltypes ?? []);
        setSelectedFieldIdx(0);
        setMode('edit');
      }
    } catch (e: unknown) {
      setStatus(e instanceof Error ? e.message : 'Failed to load file');
    }
  }, []);

  // Allow click to select a file
  useRowClick(files.length, ITEMS_START_ROW, idx => {
    loadFile(files[idx]);
    setSelectedFileIdx(idx);
  }, mode === 'list');

  useInput((input, key) => {
    if (mode === 'field-edit') {
      if (key.escape) {
        setMode('edit');
        return;
      }
      if (key.return) {
        const field = tooltypes[selectedFieldIdx];
        if (field) {
          const updated = [...tooltypes];
          updated[selectedFieldIdx] = { ...field, value: editValue };
          setTooltypes(updated);
        }
        setMode('edit');
        return;
      }
      if (key.backspace || key.delete) {
        setEditValue(v => v.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setEditValue(v => v + input);
      }
      return;
    }

    if (mode === 'edit') {
      if (key.escape) {
        setMode('list');
        setSelectedFile(null);
        setTooltypes([]);
        return;
      }
      if (key.upArrow) {
        setSelectedFieldIdx(i => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow) {
        setSelectedFieldIdx(i => Math.min(tooltypes.length - 1, i + 1));
        return;
      }
      if (input === 'e') {
        const field = tooltypes[selectedFieldIdx];
        if (field) {
          setEditValue(field.value ?? '');
          setMode('field-edit');
        }
        return;
      }
      if (input === 't') {
        const field = tooltypes[selectedFieldIdx];
        if (field && selectedFile) {
          setSaving(true);
          toggleTooltypeComment(selectedFile.path, field.key)
            .then(() => {
              setStatus('Toggled');
              loadFile(selectedFile);
            })
            .catch((e: Error) => setStatus(`Error: ${e.message}`))
            .finally(() => setSaving(false));
        }
        return;
      }
      if (input === 's' && selectedFile && !saving) {
        setSaving(true);
        updateInfoFile(selectedFile.path, tooltypes)
          .then(() => {
            setStatus('Saved');
            loadFile(selectedFile);
          })
          .catch((e: Error) => setStatus(`Error: ${e.message}`))
          .finally(() => setSaving(false));
        return;
      }
      return;
    }

    if (mode === 'list') {
      if (key.upArrow) {
        setSelectedFileIdx(i => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow) {
        setSelectedFileIdx(i => Math.min(files.length - 1, i + 1));
        return;
      }
      if (key.return) {
        loadFile(files[selectedFileIdx]);
        return;
      }
    }
  });

  if (loading && files.length === 0) return <Box><Text color="yellow"><Spinner type="dots" /></Text><Text> Loading info files...</Text></Box>;
  if (error) return <Text color="red">Error: {error}</Text>;

  if (mode === 'list') {
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold color="cyan">INFO FILES</Text>
          <Text dimColor>  ({files.length} files)</Text>
        </Box>
        {files.length === 0 ? (
          <Text dimColor>No .info files found.</Text>
        ) : (
          files.map((f, i) => (
            <Box key={f.path}>
              <Text color={i === selectedFileIdx ? 'cyan' : 'white'} bold={i === selectedFileIdx}>
                {i === selectedFileIdx ? '▶ ' : '  '}
                {f.name || f.path}
              </Text>
            </Box>
          ))
        )}
        <Box marginTop={2}>
          <Text dimColor>[↑↓] select  [enter] edit  [q] quit</Text>
        </Box>
      </Box>
    );
  }

  if (mode === 'edit') {
    const field = tooltypes[selectedFieldIdx];
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold color="cyan">INFO FILE: {selectedFile?.name || selectedFile?.path}</Text>
          <Text dimColor>  ({tooltypes.length} tooltypes)</Text>
        </Box>

        {tooltypes.length === 0 ? (
          <Text dimColor>No tooltypes.</Text>
        ) : (
          tooltypes.map((f, i) => (
            <Box key={f.key}>
              <Text color={i === selectedFieldIdx ? 'cyan' : 'white'} bold={i === selectedFieldIdx}>
                {i === selectedFieldIdx ? '▶ ' : '  '}
                {f.commented ? ';' : ' '}
                {f.key.padEnd(20)}
                {' = '}
              </Text>
              <Text color={f.commented ? 'gray' : 'white'}>
                {f.value ?? ''}
              </Text>
            </Box>
          ))
        )}

        {saving && (
          <Box marginTop={1}>
            <Text color="yellow"><Spinner type="dots" /></Text>
            <Text> Saving...</Text>
          </Box>
        )}

        {status && <Box marginTop={1}><Text color="green">{status}</Text></Box>}

        <Box marginTop={2}>
          <Text dimColor>[↑↓] select  [e]dit value  [t]oggle comment  [s]ave  [esc] back</Text>
        </Box>
      </Box>
    );
  }

  if (mode === 'field-edit') {
    const currentField = tooltypes[selectedFieldIdx];
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold color="cyan">EDIT: {currentField?.key}</Text>
        </Box>

        <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1} marginBottom={2}>
          <Text color="cyan">Value ({currentField?.key}):</Text>
          <Box>
            <Text>{'> '}</Text>
            <Text>{editValue}█</Text>
          </Box>
        </Box>

        <Text dimColor>[enter] commit  [esc] cancel</Text>
      </Box>
    );
  }

  return <Text>Unknown mode</Text>;
}
