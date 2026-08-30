import { useEffect, useState, useRef } from 'react';
import { MessageSquare, Clock, User, Hash, Terminal } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { OperatorChatTerminal } from '../components/OperatorChatTerminal';

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
  { label: 'Hold on', message: 'Hold on, I\'ll be right with you...' },
  { label: 'On my way', message: 'On my way!' },
  { label: 'Wrapping up', message: 'Wrapping up another task, just a moment...' },
  { label: 'Checking', message: 'Let me check on that...' },
];

export function OperatorChatPage() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [pendingPages, setPendingPages] = useState<PageRequest[]>([]);
  const [activeChat, setActiveChat] = useState<PageRequest | null>(null);
  /**
   * The socket handlers below are registered once, so reading `activeChat`
   * inside them saw its value at mount - null - for the life of the page.
   * A chat the caller ended stayed on screen, and typing status from the
   * caller never arrived. The ref is what those handlers read.
   */
  const activeChatRef = useRef<PageRequest | null>(null);
  activeChatRef.current = activeChat;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [userTypingBuffer, setUserTypingBuffer] = useState('');
  const [useTerminalMode, setUseTerminalMode] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Initialize Socket.IO connection
  useEffect(() => {
    // Get auth token from URL query params (for Discord links) or localStorage (for logged-in admins)
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    const storageToken = localStorage.getItem('authToken');
    const token = urlToken || storageToken;

    if (!token) {
      console.error('[Operator Chat] No auth token available');
      return;
    }

    // If token came from URL, store it for this session
    if (urlToken) {
      console.log('[Operator Chat] Using token from URL for authentication');
      // Don't persist to localStorage - only use for this session
    } else {
      console.log('[Operator Chat] Using stored auth token');
    }

    // Use same-origin backend by default; allow override via env for deployments
    const socketUrl =
      import.meta.env.VITE_SOCKET_URL ||
      (typeof window !== 'undefined' ? window.location.origin : undefined);

    const socketInstance = io(socketUrl || 'http://localhost:3001', {
      transports: ['websocket'],
      reconnection: true,
      secure: socketUrl?.startsWith('https'),
      auth: {
        token
      },
      // Without this the backend treats an admin browser as a caller and
      // hands it a real BBS node plus the welcome sequence, so every visit
      // to this page occupied a node and showed as a phantom user in node
      // status. The operator chat handlers register on their own connection
      // listener, so they still attach.
      query: { adminOnly: 'true' }
    });

    socketInstance.on('connect', () => {
      console.log('[Operator Chat] Connected to server, socket ID:', socketInstance.id);
      setConnectionError(null); // Clear any previous error
      // Request pending pages
      socketInstance.emit('operator:get-pending-pages');
      console.log('[Operator Chat] Requested pending pages');
    });

    socketInstance.on('connect_error', (error) => {
      console.error('[Operator Chat] Connection error:', error.message);
      setConnectionError(error.message);
      // If session expired, clear token and redirect to login
      if (error.message.includes('Session expired') || error.message.includes('expired')) {
        console.log('[Operator Chat] Session expired, clearing token');
        localStorage.removeItem('authToken');
      }
    });

    socketInstance.on('error', (error) => {
      console.error('[Operator Chat] Socket error:', error);
    });

    socketInstance.on('disconnect', (reason) => {
      console.log('[Operator Chat] Disconnected:', reason);
    });

    socketInstance.on('operator:page', (page: PageRequest) => {
      console.log('[Operator Chat] New page request received:', page);
      setPendingPages(prev => {
        console.log('[Operator Chat] Adding page to pending list, current count:', prev.length);
        return [...prev, page];
      });

      // Play notification sound
      const audio = new Audio('/notification.mp3');
      audio.play().catch((err) => console.log('Audio play failed:', err));

      // Vibrate if supported
      if ('vibrate' in navigator) {
        navigator.vibrate([200, 100, 200]);
      }
    });

    socketInstance.on('operator:pending-pages', (pages: PageRequest[]) => {
      console.log('[Operator Chat] Pending pages received:', pages.length, 'pages');
      console.log('[Operator Chat] Pages data:', pages);
      setPendingPages(pages);
    });

    socketInstance.on('operator:error', (data: { message: string }) => {
      console.error('[Operator Chat] Server error:', data.message);
    });

    socketInstance.on('operator:message', (message: ChatMessage) => {
      console.log('[Operator Chat] New message:', message);
      setMessages(prev => [...prev, message]);
    });

    socketInstance.on('operator:message-history', (data: { pageId: string; messages: ChatMessage[] }) => {
      console.log('[Operator Chat] Message history received:', data.messages.length, 'messages');
      setMessages(data.messages);
    });

    socketInstance.on('operator:typing-status', ({ pageId, senderType, isTyping: typing }: { pageId: string; senderType: string; isTyping: boolean }) => {
      if (activeChatRef.current?.id === pageId && senderType === 'user') {
        setIsTyping(typing);
      }
    });

    // Real-time user typing (char-by-char like livechat)
    socketInstance.on('operator:user-typing', ({ pageId, buffer }: { pageId: string; buffer: string }) => {
      if (activeChatRef.current?.id === pageId) {
        setUserTypingBuffer(buffer);
      }
    });

    socketInstance.on('operator:chat-ended', ({ pageId }: { pageId: string }) => {
      console.log('[Operator Chat] Chat ended:', pageId);
      if (activeChatRef.current?.id === pageId) {
        setActiveChat(null);
        setMessages([]);
      }
      setPendingPages(prev => prev.filter(p => p.id !== pageId));
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-focus input when chat becomes active
  useEffect(() => {
    if (activeChat && !useTerminalMode) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [activeChat, useTerminalMode]);

  const handleAcceptPage = (page: PageRequest) => {
    if (!socket) return;

    socket.emit('operator:accept-page', {
      pageId: page.id,
      sysopId: 'sysop', // TODO: Get from auth context
      sysopHandle: 'Sysop',
      sysopSessionId: socket.id,
    });

    setActiveChat(page);
    setPendingPages(prev => prev.filter(p => p.id !== page.id));
  };

  const handleSendMessage = (messageText?: string) => {
    if (!socket || !activeChat) return;

    const message = messageText || inputMessage.trim();
    if (!message) return;

    socket.emit('operator:send-message', {
      pageId: activeChat.id,
      message,
      nodeId: activeChat.nodeId,
    });

    setInputMessage('');
    inputRef.current?.focus();
  };

  const handleQuickReply = (reply: string) => {
    handleSendMessage(reply);
  };

  const handleEndChat = () => {
    if (!socket || !activeChat) return;

    socket.emit('operator:end-chat', {
      pageId: activeChat.id,
    });

    setActiveChat(null);
    setMessages([]);
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs}s`;
  };

  return (
    <div className="h-screen flex flex-col bg-bbs-bg">
      {/* Header */}
      <div className="bg-bbs-surface border-b border-bbs-border px-4 py-3">
        <h1 className="text-2xl font-bold text-accent flex items-center gap-2">
          <MessageSquare className="w-6 h-6" />
          Operator Chat
        </h1>
        <p className="text-sm text-bbs-muted mt-1">
          {pendingPages.length} pending page{pendingPages.length !== 1 ? 's' : ''}
          {activeChat && ' - In active chat'}
        </p>
      </div>

      {/* Connection Error Banner */}
      {connectionError && (
        <div className="bg-status-danger/50 border-b border-status-danger px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-status-danger font-semibold">Connection Error:</span>
              <span className="text-status-danger">{connectionError}</span>
            </div>
            {connectionError.includes('expired') && (
              <a
                href="/login"
                className="px-3 py-1 bg-status-danger hover:bg-status-danger/90 text-content-inverse rounded text-sm"
              >
                Log In Again
              </a>
            )}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Active Chat */}
        {activeChat ? (
          <div className="flex-1 flex flex-col">
            {/* Chat Header - Sticky caller info */}
            <div className="bg-bbs-surface border-b border-bbs-border px-4 py-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-accent" />
                      <span className="font-bold text-bbs-text">{activeChat.userHandle}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-bbs-muted">
                      <Hash className="w-3 h-3" />
                      <span>Node {activeChat.nodeId}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-bbs-muted">
                      <Clock className="w-3 h-3" />
                      <span>{formatDuration(activeChat.timeOnline)}</span>
                    </div>
                  </div>
                  <div className="text-sm text-bbs-muted">
                    {activeChat.conferenceName} | Last: {activeChat.lastCommand}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setUseTerminalMode(!useTerminalMode)}
                    className={`px-3 py-1 rounded text-sm flex items-center gap-1 ${
                      useTerminalMode
                        ? 'bg-bbs-accent text-content-inverse'
                        : 'bg-bbs-surface border border-bbs-border text-bbs-muted hover:border-bbs-accent'
                    }`}
                  >
                    <Terminal className="w-4 h-4" />
                    Terminal
                  </button>
                  <button
                    onClick={handleEndChat}
                    className="px-3 py-1 bg-status-danger hover:bg-status-danger/90 text-content-inverse rounded text-sm"
                  >
                    End Chat
                  </button>
                </div>
              </div>
            </div>

            {/* Terminal Mode */}
            {useTerminalMode ? (
              <div className="flex-1 p-4 bg-surface-0">
                <OperatorChatTerminal
                  messages={messages}
                  userHandle={activeChat.userHandle}
                  userTypingBuffer={userTypingBuffer}
                  onSendMessage={(message) => handleSendMessage(message)}
                  onEndChat={handleEndChat}
                  onKeystroke={(keystroke) => {
                    // Send real-time keystroke to BBS user (like livechat char-by-char)
                    if (socket && activeChat) {
                      socket.emit('operator:keystroke', {
                        pageId: activeChat.id,
                        keystroke
                      });
                    }
                  }}
                />
              </div>
            ) : (
              <>
                {/* Classic Messages Mode */}
                <div className="flex-1 overflow-y-auto p-4 bg-surface-0">
                  <div className="space-y-1" style={{ fontFamily: '"mOsOul", "Courier New", monospace' }}>
                    {messages.map((msg) => (
                      <div key={msg.id} className="text-sm">
                        <span className={msg.senderType === 'sysop' ? 'text-status-info' : 'text-status-warn'}>
                          [{formatTime(msg.timestamp)}]
                        </span>
                        {' '}
                        <span className={msg.senderType === 'sysop' ? 'text-status-ok' : 'text-status-info'}>
                          {msg.senderHandle}:
                        </span>
                        {' '}
                        <span className="text-content-primary whitespace-pre-wrap break-words">
                          {msg.message}
                        </span>
                      </div>
                    ))}
                    {(isTyping || userTypingBuffer) && (
                      <div className="text-content-muted text-xs">
                        <span className="italic">{activeChat.userHandle} is typing: </span>
                        <span className="text-status-warn">{userTypingBuffer}</span>
                        <span className="animate-pulse">|</span>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </div>

                {/* Input Area */}
                <div className="border-t border-bbs-border bg-bbs-surface p-4">
                  {/* Quick Replies */}
                  <div className="flex flex-wrap gap-2 mb-3">
                    {QUICK_REPLIES.map((reply) => (
                      <button
                        key={reply.label}
                        onClick={() => handleQuickReply(reply.message)}
                        className="px-3 py-2 bg-bbs-accent/20 hover:bg-bbs-accent/30 text-accent rounded text-sm"
                      >
                        {reply.label}
                      </button>
                    ))}
                  </div>

                  {/* Input */}
                  <div className="flex gap-2">
                    <input
                      ref={inputRef}
                      type="text"
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      placeholder="Type your message..."
                      className="flex-1 px-4 py-3 bg-bbs-bg border border-bbs-border text-bbs-text rounded focus:outline-none focus:border-bbs-accent"
                      autoFocus
                    />
                    <button
                      onClick={() => handleSendMessage()}
                      disabled={!inputMessage.trim()}
                      className="px-6 py-3 bg-bbs-accent hover:bg-bbs-accent/80 text-content-inverse rounded disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      Send
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          /* Pending Pages List */
          <div className="flex-1 p-6">
            {pendingPages.length === 0 ? (
              <div className="text-center text-bbs-muted mt-12">
                <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg">No pending pages</p>
                <p className="text-sm mt-2">You'll be notified when a user pages you</p>
              </div>
            ) : (
              <div className="space-y-4">
                <h2 className="text-xl font-bold text-bbs-text mb-4">Pending Page Requests</h2>
                {pendingPages.map((page) => (
                  <div
                    key={page.id}
                    className="bg-bbs-surface border border-bbs-border rounded-lg p-4 hover:border-bbs-accent transition-colors"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                          <span className="font-bold text-lg text-bbs-text">{page.userHandle}</span>
                          <span className="text-sm text-bbs-muted">Node {page.nodeId}</span>
                        </div>
                        <div className="text-sm text-bbs-muted">
                          {page.conferenceName} | Online: {formatDuration(page.timeOnline)}
                        </div>
                        <div className="text-xs text-bbs-muted mt-1">
                          Last command: {page.lastCommand} | {formatTime(page.createdAt)}
                        </div>
                      </div>
                      <button
                        onClick={() => handleAcceptPage(page)}
                        className="px-4 py-2 bg-bbs-accent hover:bg-bbs-accent/80 text-content-inverse rounded"
                      >
                        Accept
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
