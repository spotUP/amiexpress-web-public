import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { useNodes } from '../../hooks/useNodes.js';
import { T } from '../../theme/blessed-theme.js';
import { useRowClick } from '../../hooks/useRowClick.js';
import { useTextEntryLock } from '../../hooks/useTextEntryLock.js';
import { kickNode, reserveNode } from '../../api/client.js';
import { ConfirmDialog } from '../shared/ConfirmDialog.js';
import type { NodeStatus } from '../../api/types.js';

const ITEMS_START_ROW = 7;

type Mode = 'list' | 'confirm-kick' | 'reserve-input';

function formatDuration(lastActivity?: string): string {
  if (!lastActivity) return '—';
  const ms = Date.now() - new Date(lastActivity).getTime();
  const m = Math.floor(ms / 60_000);
  return m < 1 ? '<1m' : `${m}m`;
}

function NodeRow({ node, selected }: { node: NodeStatus; selected: boolean }) {
  return (
    <Box>
      <Text color={selected ? undefined : T.ink} bold={selected} inverse={selected}>
        {selected ? '▶ ' : '  '}
      </Text>
      <Text color={selected ? undefined : T.ink} bold={selected} inverse={selected}>
        {`N${node.nodeId}`.padEnd(4)}
      </Text>
      <Text color={node.online ? (selected ? undefined : T.ink) : T.dim} bold={selected} inverse={selected}>
        {(node.username ?? '—').padEnd(14)}
      </Text>
      <Text dimColor={!selected} bold={selected} inverse={selected}>{(node.location ?? '—').padEnd(20)}</Text>
      <Text dimColor={!selected} bold={selected} inverse={selected}>{(node.currentActivity ?? node.state ?? '—').padEnd(20)}</Text>
      <Text dimColor={!selected} bold={selected} inverse={selected}>{formatDuration(node.lastActivity).padEnd(6)}</Text>
      <Text color={node.reservedFor ? T.warn : (selected ? undefined : T.dim)} bold={selected} inverse={selected}>
        {node.reservedFor ? `reserved: ${node.reservedFor}` : ''}
      </Text>
    </Box>
  );
}

export function NodesTab() {
  const { nodes, error } = useNodes();
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [mode, setMode] = useState<Mode>('list');
  // The node a confirm-kick or reserve-input is acting on, captured by ID at
  // the moment the mode was entered. `nodes` re-polls every 3s
  // (useNodes.ts), which can reorder or shrink the array while a dialog is
  // open — resolving the target by `nodes[selectedIdx]` at ACTION time
  // (rather than at the moment the key was pressed) could kick or reserve a
  // different node than the one the sysop was shown.
  const [targetNodeId, setTargetNodeId] = useState<number | null>(null);
  const [reserveText, setReserveText] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  // Selection spans ALL nodes, online or not: reserving an offline node for
  // an expected caller (express.e's F4 / SV_RESERVE) is the point of this
  // control, so it cannot require the node to be online. Kick still checks
  // `selected.online` below — there is nothing to disconnect otherwise.
  const selected = nodes[selectedIdx];
  // Resolved by the captured id, not the live selection, so the confirm
  // dialog and reserve prompt keep showing (and acting on) the SAME node
  // even if a re-poll changes what `selected` currently points at. Username
  // display is still read live off `nodes` (nice-to-have, not load-bearing);
  // the id itself is what every action below actually uses.
  const target = targetNodeId !== null ? nodes.find(n => n.nodeId === targetNodeId) : undefined;

  useRowClick(nodes.length, ITEMS_START_ROW, (idx) => {
    setSelectedIdx(idx);
  }, mode === 'list');

  // Locks out the global quit/help hotkeys and the sidebar's arrow-key page
  // cycling while a kick/reserve is being confirmed or a username is being
  // typed — see dev/console/src/state/text-entry-lock.ts.
  useTextEntryLock(mode !== 'list');

  useInput((input, key) => {
    if (mode === 'list') {
      if (key.upArrow) setSelectedIdx(i => Math.max(0, i - 1));
      if (key.downArrow) setSelectedIdx(i => Math.min(nodes.length - 1, i + 1));
      if (input === 'k' && selected?.online) { setTargetNodeId(selected.nodeId); setMode('confirm-kick'); }
      if (input === 'v' && selected) {
        if (selected.reservedFor) {
          // Mirrors the web admin's "Clear Reservation" button: clearing an
          // existing reservation is a toggle, not a new destructive action,
          // so it fires immediately rather than opening the text prompt.
          // Immediate (no mode change), so there is no window for the list
          // to reorder before this fires — `selected.nodeId` here is safe.
          const nodeId = selected.nodeId;
          reserveNode(nodeId)
            .then(() => setStatus(`Reservation cleared on N${nodeId}`))
            .catch((e: Error) => setStatus(`Error: ${e.message}`));
        } else {
          setTargetNodeId(selected.nodeId);
          setReserveText('');
          setStatus(null);
          setMode('reserve-input');
        }
      }
    } else if (mode === 'reserve-input') {
      if (key.escape) { setMode('list'); setReserveText(''); setTargetNodeId(null); return; }
      if (key.return) {
        const username = reserveText.trim();
        if (!username) {
          // Silently doing nothing here reads as a hang, not as "type
          // something first" — say so instead of eating the keypress.
          setStatus('Type a username to reserve, or Esc to cancel');
          return;
        }
        if (targetNodeId === null) { setMode('list'); return; }
        const nodeId = targetNodeId;
        reserveNode(nodeId, username)
          .then(() => { setStatus(`N${nodeId} reserved for ${username}`); setMode('list'); setReserveText(''); setTargetNodeId(null); })
          .catch((e: Error) => { setStatus(`Error: ${e.message}`); setMode('list'); setTargetNodeId(null); });
        return;
      }
      if (key.backspace || key.delete) setReserveText(t => t.slice(0, -1));
      else if (input && !key.ctrl && !key.meta) setReserveText(t => t + input);
    }
  });

  if (error) return <Text color={T.alert}>Error: {error}</Text>;

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color={T.accent}>
          {'  NODE'.padEnd(6)}{'USER'.padEnd(14)}{'LOCATION'.padEnd(20)}{'ACTIVITY'.padEnd(20)}{'SINCE'.padEnd(6)}{'STATUS'}
        </Text>
      </Box>

      {nodes.length === 0 ? (
        <Box>
          <Text color={T.warn}><Spinner type="dots" /></Text>
          <Text> Connecting...</Text>
        </Box>
      ) : (
        nodes.map((node, i) => (
          <NodeRow key={node.nodeId} node={node} selected={i === selectedIdx} />
        ))
      )}

      {status && (
        <Box marginTop={1}>
          <Text color={T.ok}>{status}</Text>
        </Box>
      )}

      {mode === 'confirm-kick' && targetNodeId !== null && (
        <Box marginTop={1}>
          <ConfirmDialog
            message={`Kick ${target?.username ?? `N${targetNodeId}`}?`}
            onConfirm={() => {
              const nodeId = targetNodeId;
              kickNode(nodeId)
                .then(() => setStatus(`Kicked N${nodeId}`))
                .catch((e: Error) => setStatus(`Error: ${e.message}`));
              setMode('list');
              setTargetNodeId(null);
            }}
            onCancel={() => { setMode('list'); setTargetNodeId(null); }}
          />
        </Box>
      )}

      {mode === 'reserve-input' && targetNodeId !== null && (
        <Box marginTop={1} flexDirection="column">
          <Text color={T.accent}>Reserve N{targetNodeId}{target?.username ? ` (currently ${target.username})` : ''} for username:</Text>
          <Box>
            <Text>{'> '}</Text>
            <Text>{reserveText}█</Text>
          </Box>
          <Text dimColor>[enter] reserve  [esc] cancel</Text>
        </Box>
      )}

      {mode === 'list' && (
        <Box marginTop={1}>
          <Text dimColor>
            [k]ick  [v] reserve/clear  [↑↓] select
          </Text>
        </Box>
      )}
    </Box>
  );
}
