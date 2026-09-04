// ToggleSwitch and InlineEdit for Ink-based TUI
// Uses Ink's useInput pattern for keyboard interaction
import React from 'react';
import { Box, Text, useInput } from 'ink';
import { T } from '../../theme/blessed-theme.js';

interface ToggleSwitchProps {
  value: boolean;
  onChange?: (value: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export function ToggleSwitch({ value, onChange, label, disabled }: ToggleSwitchProps) {
  return (
    <Box flexDirection="row" gap={1}>
      <Box flexDirection="row" borderStyle="single" borderColor={value ? T.ok : T.dim}>
        <Text color={value ? T.ok : T.dim} bold={value} inverse={value} dimColor={disabled}>
          {value ? ' ON ' : ' OFF '}
        </Text>
      </Box>
      {label && <Text color={T.dim}>{label}</Text>}
    </Box>
  );
}

// InlineEdit — click/hover to edit text fields inline
interface InlineEditProps {
  value: string;
  onSave: (value: string) => void;
  label?: string;
  width?: number;
  editing?: boolean;
  onStartEdit?: () => void;
  onCancel?: () => void;
}

export function InlineEdit({ value, onSave, label, width = 20, editing = false, onStartEdit, onCancel }: InlineEditProps) {
  const [editValue, setEditValue] = React.useState(value);

  React.useEffect(() => {
    if (editing) setEditValue(value);
  }, [editing, value]);

  useInput((input, key) => {
    if (!editing) return;
    if (key.escape) { onCancel?.(); return; }
    if (key.return) { onSave(editValue); return; }
    if (key.backspace || key.delete) { setEditValue(v => v.slice(0, -1)); return; }
    if (input && !key.ctrl && !key.meta) { setEditValue(v => v + input); }
  });

  if (!editing) {
    return (
      <Box flexDirection="row" gap={1}>
        {label && <Text color={T.dim}>{label}</Text>}
        {onStartEdit ? (
          <Text color={T.accent} underline>{value || '—'}</Text>
        ) : (
          <Text color={T.ink}>{value || '—'}</Text>
        )}
      </Box>
    );
  }

  return (
    <Box flexDirection="row" gap={1}>
      {label && <Text color={T.dim}>{label}</Text>}
      <Text color={T.accent}>{editValue.padEnd(width).slice(0, width)}</Text>
      <Text color={T.accent} bold>_</Text>
    </Box>
  );
}

// SwitchableRow — labeled toggle row
interface SwitchableRowProps {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  secondary?: string;
}

export function SwitchableRow({ label, value, onChange, secondary }: SwitchableRowProps) {
  return (
    <Box flexDirection="row" gap={2} alignItems="center">
      <Box flexDirection="row" borderStyle="single" borderColor={value ? T.ok : T.dim}>
        <Text color={value ? T.ok : T.dim} bold={value} inverse={value}>
          {value ? ' ON ' : ' OFF '}
        </Text>
      </Box>
      <Text color={T.ink}>{label}</Text>
      {secondary && <Text color={T.dim}>{secondary}</Text>}
    </Box>
  );
}