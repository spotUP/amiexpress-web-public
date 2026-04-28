import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { useNodes } from '../../hooks/useNodes.js';
import { kickNode, chatNode } from '../../api/client.js';
import { ConfirmDialog } from '../shared/ConfirmDialog.js';
import type { NodeStatus } from '../../api/types.js';

type Mode = 'list' | 'confirm-kick' | 'chat-input';

function formatDuration(lastActivity?: string): string {
  if (!lastActivity) return '—';
  const ms = Date.now() - new Date(lastActivity).getTime();
  const m = Math.floor(ms / 60_000);
  return m < 1 ? '<1m' : `${m}m`;
}

function NodeRow({ node, selected }: { node: NodeStatus; selected: boolean }) {
  return (
    <Box>
      <Text color={selected ? 'cyan' : 'white'} bold={selected}>
        {selected ? '▶ ' : '  '}
      </Text>
      <Text color={selected ? 'cyan' : 'white'} bold={selected}>
        {`N${node.nodeId}`.padEnd(4)}
      </Text>
      <Text color={node.online ? 'white' : 'gray'}>
        {(node.username ?? '—').padEnd(14)}
      </Text>
      <Text dimColor>{(node.location ?? '—').padEnd(20)}</Text>
      <Text dimColor>{(node.currentActivity ?? node.state ?? '—').padEnd(20)}</Text>
      <Text dimColor>{formatDuration(node.lastActivity)}</Text>
    </Box>
  );
}

export function NodesTab() {
  const { nodes, error } = useNodes();
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [mode, setMode] = useState<Mode>('list');
  const [chatText, setChatText] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const onlineNodes = nodes.filter(n => n.online);
  const selected = onlineNodes[selectedIdx];

  useInput((input, key) => {
    if (mode === 'list') {
      if (key.upArrow) setSelectedIdx(i => Math.max(0, i - 1));
      if (key.downArrow) setSelectedIdx(i => Math.min(onlineNodes.length - 1, i + 1));
      if (input === 'k' && selected) setMode('confirm-kick');
      if (input === 'c' && selected) { setChatText(''); setMode('chat-input'); }
    } else if (mode === 'chat-input') {
      if (key.escape) { setMode('list'); setChatText(''); }
      if (key.return && chatText && selected) {
        chatNode(selected.nodeId, chatText)
          .then(() => { setStatus(`Sent to N${selected.nodeId}`); setMode('list'); setChatText(''); })
          .catch((e: Error) => { setStatus(`Error: ${e.message}`); setMode('list'); });
      }
      if (key.backspace || key.delete) setChatText(t => t.slice(0, -1));
      else if (input && !key.ctrl && !key.meta) setChatText(t => t + input);
    }
  });

  if (error) return <Text color="red">Error: {error}</Text>;

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">
          {'  NODE'.padEnd(6)}{'USER'.padEnd(14)}{'LOCATION'.padEnd(20)}{'ACTIVITY'.padEnd(20)}{'SINCE'}
        </Text>
      </Box>

      {nodes.length === 0 ? (
        <Box>
          <Text color="yellow"><Spinner type="dots" /></Text>
          <Text> Connecting...</Text>
        </Box>
      ) : (
        nodes.map((node, i) => (
          <NodeRow key={node.nodeId} node={node} selected={i === selectedIdx} />
        ))
      )}

      {status && (
        <Box marginTop={1}>
          <Text color="green">{status}</Text>
        </Box>
      )}

      {mode === 'confirm-kick' && selected && (
        <Box marginTop={1}>
          <ConfirmDialog
            message={`Kick ${selected.username ?? `N${selected.nodeId}`}?`}
            onConfirm={() => {
              kickNode(selected.nodeId)
                .then(() => setStatus(`Kicked N${selected.nodeId}`))
                .catch((e: Error) => setStatus(`Error: ${e.message}`));
              setMode('list');
            }}
            onCancel={() => setMode('list')}
          />
        </Box>
      )}

      {mode === 'chat-input' && selected && (
        <Box marginTop={1} flexDirection="column">
          <Text color="cyan">Chat to N{selected.nodeId} ({selected.username}):</Text>
          <Box>
            <Text>{'> '}</Text>
            <Text>{chatText}█</Text>
          </Box>
          <Text dimColor>[enter] send  [esc] cancel</Text>
        </Box>
      )}
    </Box>
  );
}
