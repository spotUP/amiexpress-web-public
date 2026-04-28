import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import {
  getNodes,
  getSystemConfig,
  startNode, exitNode, reserveNode, sysopLoginNode, setQuietMode,
} from '../../api/client.js';
import { useMouse, type MouseClick } from '../../hooks/useMouse.js';
import { useRowClick } from '../../hooks/useRowClick.js';
import { ConfirmDialog } from '../shared/ConfirmDialog.js';
import type { SystemConfig, NodeStatus } from '../../api/types.js';

type Panel = 'nodes' | 'config';
type NodeAction = 'start' | 'exit' | 'reserve' | 'sysop';

// Panel switcher row (top of tab content area).
const SWITCHER_ROW = 8;
// Nodes-panel item rows: switcher (8) + spacer (9) + sub-header (10) + spacer (11) → items at 12+.
const NODES_ITEMS_START_ROW = 12;

export function SystemTab() {
  const [panel, setPanel] = useState<Panel>('nodes');
  const [nodes, setNodes] = useState<NodeStatus[]>([]);
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [pendingAction, setPendingAction] = useState<NodeAction | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [quietMode, setQuietModeState] = useState(false);

  useEffect(() => {
    Promise.all([getNodes(), getSystemConfig()])
      .then(([n, c]) => { setNodes(n); setConfig(c ?? null); })
      .catch((e: Error) => setStatus(`Error: ${e.message}`))
      .finally(() => setLoading(false));

    const id = setInterval(() => {
      getNodes().then(setNodes).catch(() => {});
    }, 5_000);
    return () => clearInterval(id);
  }, []);

  const selected = nodes[selectedIdx];

  // Click on the panel switcher row to switch panels. The labels render as
  // "[n] Nodes", "[c] Config", separated by gap=3, starting at col 1.
  // Approximate ranges: cols 1-9 = Nodes, cols 13-22 = Config.
  const onSwitcherClick = useCallback((e: MouseClick) => {
    if (e.button !== 0 || e.row !== SWITCHER_ROW || pendingAction) return;
    if (e.col >= 1 && e.col <= 9) setPanel('nodes');
    else if (e.col >= 13 && e.col <= 22) setPanel('config');
  }, [pendingAction]);
  useMouse(onSwitcherClick);

  // Click a node row in the nodes panel to select it.
  useRowClick(nodes.length, NODES_ITEMS_START_ROW, setSelectedIdx, panel === 'nodes' && !pendingAction);

  useInput((input, key) => {
    if (pendingAction) return;

    if (input === 'n') setPanel('nodes');
    if (input === 'c') setPanel('config');

    if (panel === 'nodes') {
      if (key.upArrow) setSelectedIdx(i => Math.max(0, i - 1));
      if (key.downArrow) setSelectedIdx(i => Math.min(nodes.length - 1, i + 1));
      if (input === 's') setPendingAction('start');
      if (input === 'x') setPendingAction('exit');
      if (input === 'v') setPendingAction('reserve');
      if (input === 'o') setPendingAction('sysop');
      if (input === 'Q') {
        setActionLoading(true);
        setQuietMode(!quietMode)
          .then(() => { setQuietModeState(q => !q); setStatus(`Quiet mode ${!quietMode ? 'ON' : 'OFF'}`); })
          .catch((e: Error) => setStatus(`Error: ${e.message}`))
          .finally(() => setActionLoading(false));
      }
    }
  });

  function doNodeAction(action: NodeAction) {
    if (!selected) return;
    const nodeId = selected.nodeId;
    const fns: Record<NodeAction, (id: number) => Promise<unknown>> = {
      start: startNode,
      exit: exitNode,
      reserve: reserveNode,
      sysop: sysopLoginNode,
    };
    const labels: Record<NodeAction, string> = {
      start: 'started', exit: 'exited', reserve: 'reserved', sysop: 'sysop login sent',
    };
    setActionLoading(true);
    fns[action](nodeId)
      .then(() => setStatus(`N${nodeId} ${labels[action]}`))
      .catch((e: Error) => setStatus(`Error: ${e.message}`))
      .finally(() => setActionLoading(false));
    setPendingAction(null);
  }

  if (loading) return <Box><Text color="yellow"><Spinner type="dots" /></Text><Text> Loading...</Text></Box>;

  return (
    <Box flexDirection="column">
      {/* Panel switcher */}
      <Box marginBottom={1} gap={3}>
        <Text color={panel === 'nodes' ? 'cyan' : 'white'} bold={panel === 'nodes'} underline={panel === 'nodes'}>[n] Nodes</Text>
        <Text color={panel === 'config' ? 'cyan' : 'white'} bold={panel === 'config'} underline={panel === 'config'}>[c] Config</Text>
        <Text dimColor>  Quiet mode: </Text>
        <Text color={quietMode ? 'yellow' : 'green'}>{quietMode ? 'ON' : 'OFF'}</Text>
        <Text dimColor>  [Q] toggle</Text>
      </Box>

      {panel === 'nodes' && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold color="cyan">{'  NODE'.padEnd(7)}{'USER'.padEnd(16)}{'STATE'.padEnd(20)}{'ACTIVITY'}</Text>
          </Box>
          {nodes.map((n, i) => (
            <Box key={n.nodeId}>
              <Text color={i === selectedIdx ? 'cyan' : n.online ? 'white' : 'gray'} bold={i === selectedIdx}>
                {i === selectedIdx ? '▶ ' : '  '}
                {`N${n.nodeId}`.padEnd(5)}
                {(n.username ?? '—').padEnd(16)}
                {(n.state ?? 'idle').padEnd(20)}
                {n.currentActivity ?? '—'}
              </Text>
            </Box>
          ))}
          <Box marginTop={1}>
            <Text dimColor>[s]tart  [x]exit  [v]reserve  [o]sysop-login</Text>
          </Box>
        </Box>
      )}

      {panel === 'config' && config && (
        <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1}>
          <Text bold color="cyan">System Configuration</Text>
          {[
            ['BBS Name', config.bbs_name],
            ['Sysop', config.sysop_name],
            ['Max Nodes', String(config.max_nodes)],
            ['New User SL', String(config.new_user_sec_level)],
            ['Telnet Port', String(config.telnet_port)],
            ['SSH Port', String(config.ssh_port ?? '—')],
          ].map(([label, val]) => (
            <Box key={label}>
              <Text dimColor>{label!.padEnd(16)}</Text>
              <Text color="white">{val}</Text>
            </Box>
          ))}
        </Box>
      )}

      {actionLoading && (
        <Box marginTop={1}>
          <Text color="yellow"><Spinner type="dots" /></Text>
          <Text> Executing...</Text>
        </Box>
      )}

      {status && <Box marginTop={1}><Text color="green">{status}</Text></Box>}

      {pendingAction && selected && (
        <Box marginTop={1}>
          <ConfirmDialog
            message={`${pendingAction} node N${selected.nodeId}${selected.username ? ` (${selected.username})` : ''}?`}
            onConfirm={() => doNodeAction(pendingAction)}
            onCancel={() => setPendingAction(null)}
          />
        </Box>
      )}
    </Box>
  );
}
