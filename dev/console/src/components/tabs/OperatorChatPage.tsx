import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { getSocket } from '../../api/socket.js';
import { useRowClick } from '../../hooks/useRowClick.js';

const ITEMS_START_ROW = 9;

interface PageRequest {
  id: string;
  userId: string;
  userHandle: string;
  nodeId: number;
  conferenceId: number;
  conferenceName: string;
  timeOnline: number;
  lastCommand: string;
  status: 'pending' | 'accepted' | 'ended' | 'timeout' | 'rejected';
  createdAt: number;
}

interface ChatMessage {
  id: string;
  pageId: string;
  senderId: string;
  senderHandle: string;
  senderType: 'user' | 'sysop';
  message: string;
  timestamp: number;
  nodeId: number;
}

const QUICK_REPLIES = [
  'Hold on',
  'On my way',
  'Wrapping up',
  'Checking',
];

const QUICK_REPLY_TEXT: Record<string, string> = {
  'Hold on': "Hold on, I'll be right with you...",
  'On my way': "On my way!",
  'Wrapping up': "Wrapping up another task, just a moment...",
  'Checking': "Let me check on that...",
};

type Mode = 'list' | 'chat';

export function OperatorChatPage() {
  const [pages, setPages] = useState<PageRequest[]>([]);
  const [active, setActive] = useState<PageRequest | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [mode, setMode] = useState<Mode>('list');
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<ReturnType<typeof getSocket> | null>(null);

  // Wire socket events
  useEffect(() => {
    const sock = getSocket();
    socketRef.current = sock;

    sock.emit('operator:get-pending-pages');

    const onPage = (page: PageRequest) => {
      setPages(prev => [page, ...prev.filter(p => p.id !== page.id)]);
    };
    const onPending = (list: PageRequest[]) => {
      setPages(list);
    };
    const onError = (data: { message: string }) => setError(data?.message ?? 'socket error');
    const onMessage = (msg: ChatMessage) => {
      setMessages(prev => [...prev, msg]);
    };
    const onMessageHistory = (data: { pageId: string; messages: ChatMessage[] }) => {
      setMessages(data.messages ?? []);
    };
    const onChatEnded = ({ pageId }: { pageId: string }) => {
      if (active?.id === pageId) { setMode('list'); setActive(null); setMessages([]); }
      setPages(prev => prev.map(p => p.id === pageId ? { ...p, status: 'ended' } : p));
    };

    sock.on('operator:page', onPage);
    sock.on('operator:pending-pages', onPending);
    sock.on('operator:error', onError);
    sock.on('operator:message', onMessage);
    sock.on('operator:message-history', onMessageHistory);
    sock.on('operator:chat-ended', onChatEnded);

    return () => {
      sock.off('operator:page', onPage);
      sock.off('operator:pending-pages', onPending);
      sock.off('operator:error', onError);
      sock.off('operator:message', onMessage);
      sock.off('operator:message-history', onMessageHistory);
      sock.off('operator:chat-ended', onChatEnded);
    };
  }, [active]);

  const acceptPage = useCallback((page: PageRequest) => {
    socketRef.current?.emit('operator:accept-page', { pageId: page.id });
    setActive(page);
    setMessages([]);
    setMode('chat');
  }, []);

  const sendMessage = useCallback((text: string) => {
    if (!active || !text.trim()) return;
    socketRef.current?.emit('operator:send-message', {
      pageId: active.id,
      message: text,
    });
    setDraft('');
  }, [active]);

  const endChat = useCallback(() => {
    if (!active) return;
    socketRef.current?.emit('operator:end-chat', { pageId: active.id });
    setMode('list');
    setActive(null);
    setMessages([]);
  }, [active]);

  // Click a page row to accept and enter chat
  useRowClick(pages.length, ITEMS_START_ROW, (idx) => {
    const p = pages[idx];
    if (p && p.status === 'pending') acceptPage(p);
  }, mode === 'list');

  useInput((input, key) => {
    if (mode === 'list') {
      if (key.upArrow) setSelectedIdx(i => Math.max(0, i - 1));
      if (key.downArrow) setSelectedIdx(i => Math.min(pages.length - 1, i + 1));
      if (key.return && pages[selectedIdx]?.status === 'pending') acceptPage(pages[selectedIdx]!);
      return;
    }
    // chat mode
    if (key.escape) { endChat(); return; }
    if (key.return) { sendMessage(draft); return; }
    if (key.backspace || key.delete) { setDraft(d => d.slice(0, -1)); return; }
    // Quick reply hotkeys 1-4
    const n = parseInt(input);
    if (n >= 1 && n <= QUICK_REPLIES.length) {
      const text = QUICK_REPLY_TEXT[QUICK_REPLIES[n - 1]!];
      if (text) sendMessage(text);
      return;
    }
    if (input && !key.ctrl && !key.meta) setDraft(d => d + input);
  });

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">Operator Chat error: {error}</Text>
        <Text dimColor>Reconnecting...</Text>
      </Box>
    );
  }

  if (mode === 'chat' && active) {
    const last = messages.slice(-15);
    return (
      <Box flexDirection="column">
        <Box marginBottom={1} flexDirection="column">
          <Text bold color="cyan">CHAT — {active.userHandle} (N{active.nodeId})</Text>
          <Text dimColor>conf: {active.conferenceName} · {messages.length} messages · [esc] end</Text>
        </Box>

        {last.length === 0 && (
          <Box>
            <Text color="yellow"><Spinner type="dots" /></Text>
            <Text dimColor> Waiting for messages...</Text>
          </Box>
        )}
        {last.map(m => (
          <Box key={m.id}>
            <Text color={m.senderType === 'sysop' ? 'cyan' : 'green'} bold>
              {m.senderType === 'sysop' ? 'sysop' : m.senderHandle}:
            </Text>
            <Text> {m.message}</Text>
          </Box>
        ))}

        <Box marginTop={1} flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1}>
          <Box>
            <Text>{'> '}</Text>
            <Text>{draft}█</Text>
          </Box>
          <Text dimColor>
            [enter] send  [esc] end  Quick: {QUICK_REPLIES.map((r, i) => `[${i + 1}]${r}`).join('  ')}
          </Text>
        </Box>
      </Box>
    );
  }

  // List mode
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">OPERATOR CHAT</Text>
        <Text dimColor>  ({pages.length} pages, click or [enter] to accept)</Text>
      </Box>

      <Box marginBottom={1}>
        <Text bold color="cyan">{'  USER'.padEnd(18)}{'NODE'.padEnd(7)}{'CONF'.padEnd(20)}{'STATUS'.padEnd(12)}{'WAITED'}</Text>
      </Box>

      {pages.length === 0 && (
        <Text dimColor>No pages waiting.</Text>
      )}

      {pages.slice(0, 18).map((p, i) => {
        const ageSec = Math.floor((Date.now() - p.createdAt) / 1000);
        return (
          <Box key={p.id}>
            <Text color={i === selectedIdx ? 'cyan' : p.status === 'pending' ? 'yellow' : 'gray'} bold={i === selectedIdx}>
              {i === selectedIdx ? '▶ ' : '  '}
              {(p.userHandle ?? '—').slice(0, 16).padEnd(18)}
              {String(p.nodeId ?? '?').padEnd(7)}
              {(p.conferenceName ?? '—').slice(0, 18).padEnd(20)}
              {p.status.padEnd(12)}
              {ageSec < 60 ? `${ageSec}s` : `${Math.floor(ageSec / 60)}m`}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
