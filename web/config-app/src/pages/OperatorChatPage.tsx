import { useEffect, useState, useRef } from 'react';
import { MessageSquare, Send, Clock, User, Hash } from 'lucide-react';
import { io, Socket } from 'socket.io-client';

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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Initialize Socket.IO connection
  useEffect(() => {
    // Get auth token from localStorage
    const token = localStorage.getItem('authToken');

    const socketInstance = io('http://localhost:3001', {
      transports: ['websocket'],
      reconnection: true,
      auth: {
        token: token
      }
    });

    socketInstance.on('connect', () => {
      console.log('[Operator Chat] Connected to server');
      // Request pending pages
      socketInstance.emit('operator:get-pending-pages');
    });

    socketInstance.on('operator:page', (page: PageRequest) => {
      console.log('[Operator Chat] New page request:', page);
      setPendingPages(prev => [...prev, page]);

      // Play notification sound
      const audio = new Audio('/notification.mp3');
      audio.play().catch(() => console.log('Audio play failed'));

      // Vibrate if supported
      if ('vibrate' in navigator) {
        navigator.vibrate([200, 100, 200]);
      }
    });

    socketInstance.on('operator:pending-pages', (pages: PageRequest[]) => {
      console.log('[Operator Chat] Pending pages:', pages);
      setPendingPages(pages);
    });

    socketInstance.on('operator:chat-message', (message: ChatMessage) => {
      console.log('[Operator Chat] New message:', message);
      setMessages(prev => [...prev, message]);
    });

    socketInstance.on('operator:typing', ({ pageId, isTyping: typing }: { pageId: string; isTyping: boolean }) => {
      if (activeChat?.id === pageId) {
        setIsTyping(typing);
      }
    });

    socketInstance.on('operator:chat-ended', ({ pageId }: { pageId: string }) => {
      console.log('[Operator Chat] Chat ended:', pageId);
      if (activeChat?.id === pageId) {
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

    socket.emit('operator:message', {
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
        <h1 className="text-2xl font-bold text-bbs-accent flex items-center gap-2">
          <MessageSquare className="w-6 h-6" />
          Operator Chat
        </h1>
        <p className="text-sm text-bbs-muted mt-1">
          {pendingPages.length} pending page{pendingPages.length !== 1 ? 's' : ''}
          {activeChat && ' - In active chat'}
        </p>
      </div>

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
                      <User className="w-4 h-4 text-bbs-accent" />
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
                <button
                  onClick={handleEndChat}
                  className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm"
                >
                  End Chat
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 bg-black">
              <div className="space-y-1" style={{ fontFamily: '"mOsOul", "Courier New", monospace' }}>
                {messages.map((msg) => (
                  <div key={msg.id} className="text-sm">
                    <span className={msg.senderType === 'sysop' ? 'text-cyan-400' : 'text-yellow-300'}>
                      [{formatTime(msg.timestamp)}]
                    </span>
                    {' '}
                    <span className={msg.senderType === 'sysop' ? 'text-green-400' : 'text-blue-400'}>
                      {msg.senderHandle}:
                    </span>
                    {' '}
                    <span className="text-white whitespace-pre-wrap break-words">
                      {msg.message}
                    </span>
                  </div>
                ))}
                {isTyping && (
                  <div className="text-gray-500 text-xs italic">
                    {activeChat.userHandle} is typing...
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
                    className="px-3 py-2 bg-bbs-accent/20 hover:bg-bbs-accent/30 text-bbs-accent rounded text-sm"
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
                />
                <button
                  onClick={() => handleSendMessage()}
                  disabled={!inputMessage.trim()}
                  className="px-6 py-3 bg-bbs-accent hover:bg-bbs-accent/80 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  Send
                </button>
              </div>
            </div>
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
                        className="px-4 py-2 bg-bbs-accent hover:bg-bbs-accent/80 text-white rounded"
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
