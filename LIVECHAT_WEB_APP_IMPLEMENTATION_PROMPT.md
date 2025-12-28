# LiveChat Web App - Standalone Responsive Chat Interface
## Implementation Prompt v1.0

---

## Executive Summary

Create a **standalone web page** at `/chat` that provides direct access to the LiveChat door, independent of the full BBS terminal experience. This page is designed **mobile-first** with a responsive terminal that adapts to any screen size, breaking free from the traditional 80x25 BBS constraints. It should use the same code as the livechat door if possible, if not, make a copy and adapt it

**Key Differentiators from BBS LiveChat:**
- **Responsive terminal** - Dynamically calculates rows/columns based on viewport
- **Mobile-first design** - Optimized for phone usage as primary device
- **Direct chat access** - Login directly to chat without BBS menu navigation
- **Always-connected** - Designed for persistent background connection
- **PWA-ready** - Installable on home screen with push notifications
- **LOGIN PROMPT** - That let's the user log in with his bbs credentials
- **PERSISTAN LOGIN** - Log in once, stay logged in until user manually logs off, persist during browser sessions, logged in forever until manually logged out
**CRITICAL: The BBS LiveChat door MUST remain 80x25** - this web app is a separate interface.

---

## MANDATORY: Design Principles

### 1. Mobile-First Approach

**THIS IS NON-NEGOTIABLE.** Design for 320px width first, then progressively enhance.

```
Mobile (320px - 767px)    → PRIMARY design target
Tablet (768px - 1023px)   → Enhanced layout
Desktop (1024px - 1439px) → Multi-column potential
Large (1440px+)           → Maximum space utilization
```

### 2. Terminal Responsive Sizing

**Calculate optimal rows/columns based on viewport:**

```typescript
interface TerminalDimensions {
  cols: number;  // Calculated from width
  rows: number;  // Calculated from height
  fontSize: number;  // Scaled for device
}

function calculateTerminalSize(
  viewportWidth: number,
  viewportHeight: number,
  safeAreaInsets: SafeAreaInsets
): TerminalDimensions {
  // Account for safe areas (notches, home indicators)
  const usableWidth = viewportWidth - safeAreaInsets.left - safeAreaInsets.right;
  const usableHeight = viewportHeight - safeAreaInsets.top - safeAreaInsets.bottom;

  // Reserve space for UI chrome (header, input area)
  const headerHeight = 48;  // Fixed header
  const inputHeight = 56;   // Input area with padding
  const terminalHeight = usableHeight - headerHeight - inputHeight;

  // Calculate font size based on width (mobile-first)
  let fontSize: number;
  if (viewportWidth < 375) {
    fontSize = 12;  // Small phones
  } else if (viewportWidth < 768) {
    fontSize = 14;  // Standard phones
  } else if (viewportWidth < 1024) {
    fontSize = 16;  // Tablets
  } else {
    fontSize = 18;  // Desktop
  }

  // Calculate character dimensions (monospace)
  const charWidth = fontSize * 0.6;   // Approximate
  const charHeight = fontSize * 1.2;  // Line height

  // Calculate cols/rows
  const cols = Math.floor(usableWidth / charWidth);
  const rows = Math.floor(terminalHeight / charHeight);

  // Enforce minimums
  return {
    cols: Math.max(cols, 40),   // Minimum 40 columns
    rows: Math.max(rows, 10),   // Minimum 10 rows
    fontSize
  };
}
```

### 3. Touch-Friendly Design

**Thumb Zone Optimization:**
```
┌─────────────────────┐
│   Hard to Reach     │  ← Top area: Status only
├─────────────────────┤
│                     │
│   Easy to Reach     │  ← Center: Chat messages
│                     │
├─────────────────────┤
│  Natural Thumb Zone │  ← Bottom: Input, actions
└─────────────────────┘
```

**Minimum Touch Targets:**
- Buttons: 44x44px minimum
- List items: 48px height minimum
- Spacing between targets: 8px minimum

---

## Part 1: Architecture

### 1.1 Route Structure

```
/chat                    → Main chat interface
/chat/login             → Login page (if not authenticated)
/chat/channel/:id       → Deep link to specific channel
/chat/dm/:username      → Deep link to DM with user
```

### 1.2 Component Hierarchy

```
ChatApp.tsx
├── ChatHeader.tsx           // Fixed top bar
│   ├── MenuButton           // Hamburger menu (mobile)
│   ├── ChannelName          // Current channel display
│   ├── UserCount            // Online users indicator
│   └── SettingsButton       // Settings access
├── ChatSidebar.tsx          // Off-canvas on mobile, visible on desktop
│   ├── ChannelList          // Public channels
│   ├── DMList               // Direct messages
│   └── UserStatus           // Your presence controls
├── ChatTerminal.tsx         // Responsive xterm.js wrapper
│   ├── TerminalView         // xterm.js instance
│   └── TypingIndicators     // Who's typing overlay
├── ChatInput.tsx            // Bottom input area
│   ├── InputField           // Text input
│   ├── SendButton           // Send message
│   └── EmojiButton          // Emoji picker (optional)
└── ChatLogin.tsx            // Login form (when unauthenticated)
```

### 1.3 State Management

```typescript
interface ChatAppState {
  // Authentication
  isAuthenticated: boolean;
  user: ChatUser | null;
  token: string | null;

  // Connection
  isConnected: boolean;
  reconnecting: boolean;

  // UI State
  sidebarOpen: boolean;
  currentChannel: string;
  terminalDimensions: TerminalDimensions;

  // Chat State
  channels: Channel[];
  messages: Map<string, Message[]>;
  typingUsers: Map<string, TypingUser>;
  unreadCounts: Map<string, number>;
}

interface ChatUser {
  id: number;
  username: string;
  secLevel: number;
  nodeId?: number;
}
```

---

## Part 2: Mobile-First UI Design

### 2.1 Layout Breakpoints

```scss
// Mobile (default)
.chat-app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh; // Dynamic viewport height (accounts for mobile browser chrome)
}

// Tablet (768px+)
@media (min-width: 768px) {
  .chat-app {
    flex-direction: row;
  }
  .chat-sidebar {
    width: 280px;
    position: relative; // No longer off-canvas
  }
}

// Desktop (1024px+)
@media (min-width: 1024px) {
  .chat-sidebar {
    width: 320px;
  }
  .chat-terminal {
    font-size: 16px;
  }
}

// Large Desktop (1440px+)
@media (min-width: 1440px) {
  .chat-app {
    max-width: 1600px;
    margin: 0 auto;
  }
  .chat-sidebar {
    width: 360px;
  }
}
```

### 2.2 Mobile Layout (Portrait)

```
┌────────────────────────────┐
│ ☰  #general      👤 23    │ ← Header (48px)
├────────────────────────────┤
│                            │
│  [10:23] Sysop: Welcome!   │
│  [10:24] Alice: Hey all    │
│  [10:25] Bob: Morning!     │
│                            │
│  Alice: I think we sho|    │ ← Typing indicator
│                            │
├────────────────────────────┤
│  Type a message...    ➤   │ ← Input (56px + safe area)
└────────────────────────────┘
```

### 2.3 Mobile Layout (Landscape)

```
┌──────────────────────────────────────────────────┐
│ ☰  #general                            👤 23    │
├──────────────────────────────────────────────────┤
│  [10:23] Sysop: Welcome everyone to the BBS!     │
│  [10:24] Alice: Hey there! How's it going?       │
│  [10:25] Bob: Great! Just uploaded a new game    │
│  Alice: I think we should try th|                │
├──────────────────────────────────────────────────┤
│  Type a message...                          ➤   │
└──────────────────────────────────────────────────┘
```

### 2.4 Tablet Layout

```
┌─────────────────────────────────────────────────────────┐
│ LiveChat           #general - Welcome!        👤 23    │
├──────────────┬──────────────────────────────────────────┤
│  CHANNELS    │  [10:23] Sysop: Welcome everyone!       │
│              │  [10:24] Alice: Hey there!              │
│  # general   │  [10:25] Bob: Great! Just uploaded      │
│  # random    │                                         │
│  # help      │  Alice: I think we sho|                 │
│              │                                         │
│  DMs         ├──────────────────────────────────────────┤
│  @ Alice     │  Type a message...                  ➤   │
│  @ Bob       │                                         │
└──────────────┴──────────────────────────────────────────┘
```

### 2.5 Desktop Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│  LiveChat v2.0        #general - Welcome to the BBS!          👤 23     │
├────────────────┬─────────────────────────────────────────────────────────┤
│                │                                                         │
│   CHANNELS     │  --> Alice has logged in (Node 3)                      │
│                │  [10:23] Sysop: Welcome everyone to the BBS!           │
│   Public       │  [10:24] Alice: Hey there! How's everyone doing?       │
│   # general    │  [10:25] Bob: Great! Just uploaded a new game to       │
│   # random     │          the Games area. Check it out!                 │
│   # help       │  [10:26] Charlie: @Bob Nice! What game?                │
│                │  [10:27] Bob: It's a puzzle game I ported from Amiga   │
│   Private      │                                                         │
│   # team       │  Alice: I think we should try th|                      │
│                │  Bob: That sounds gre|                                  │
│   DMs          │                                                         │
│   @ Alice (3)  ├─────────────────────────────────────────────────────────┤
│   @ Bob        │  > Type a message...                              ➤    │
│   @ Charlie    │                                                         │
│                │                                                         │
│   [●] Online   │  Tab:Channels │ Enter:Send │ /:Commands │ Esc:Menu     │
└────────────────┴─────────────────────────────────────────────────────────┘
```

---

## Part 3: Safe Area Handling

### 3.1 Viewport Configuration

```html
<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no"
>
```

### 3.2 CSS Safe Area Implementation

```css
:root {
  /* Safe area insets with fallbacks */
  --safe-area-top: env(safe-area-inset-top, 0px);
  --safe-area-right: env(safe-area-inset-right, 0px);
  --safe-area-bottom: env(safe-area-inset-bottom, 0px);
  --safe-area-left: env(safe-area-inset-left, 0px);
}

.chat-app {
  /* Use dvh for dynamic viewport height (accounts for mobile browser chrome) */
  height: 100dvh;

  /* Apply safe area padding */
  padding-top: var(--safe-area-top);
  padding-left: var(--safe-area-left);
  padding-right: var(--safe-area-right);
}

.chat-header {
  height: calc(48px + var(--safe-area-top));
  padding-top: var(--safe-area-top);
}

.chat-input {
  padding-bottom: calc(12px + var(--safe-area-bottom));
}

/* Landscape notch handling */
@media (orientation: landscape) {
  .chat-sidebar {
    padding-left: var(--safe-area-left);
  }
}
```

---

## Part 4: Virtual Keyboard Handling

### 4.1 VirtualKeyboard API Integration

```typescript
function useVirtualKeyboard() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    // Check for VirtualKeyboard API support (Chrome 94+)
    if ('virtualKeyboard' in navigator) {
      const vk = (navigator as any).virtualKeyboard;

      // Opt out of automatic viewport resizing
      vk.overlaysContent = true;

      const handleGeometryChange = () => {
        const { height } = vk.boundingRect;
        setKeyboardHeight(height);
        setIsKeyboardVisible(height > 0);
      };

      vk.addEventListener('geometrychange', handleGeometryChange);
      return () => vk.removeEventListener('geometrychange', handleGeometryChange);
    }

    // Fallback: Use visualViewport API
    if (window.visualViewport) {
      const handleResize = () => {
        const heightDiff = window.innerHeight - window.visualViewport!.height;
        setKeyboardHeight(Math.max(0, heightDiff));
        setIsKeyboardVisible(heightDiff > 100);
      };

      window.visualViewport.addEventListener('resize', handleResize);
      return () => window.visualViewport?.removeEventListener('resize', handleResize);
    }
  }, []);

  return { keyboardHeight, isKeyboardVisible };
}
```

### 4.2 Input Field Behavior

```typescript
const ChatInput: React.FC = () => {
  const inputRef = useRef<HTMLInputElement>(null);
  const { keyboardHeight, isKeyboardVisible } = useVirtualKeyboard();

  // Scroll input into view when keyboard appears
  useEffect(() => {
    if (isKeyboardVisible && inputRef.current) {
      // Small delay to let keyboard animation complete
      setTimeout(() => {
        inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }, 100);
    }
  }, [isKeyboardVisible]);

  return (
    <div
      className="chat-input"
      style={{
        transform: `translateY(-${keyboardHeight}px)`,
        transition: 'transform 0.2s ease-out'
      }}
    >
      <input
        ref={inputRef}
        type="text"
        placeholder="Type a message..."
        autoCapitalize="sentences"
        autoCorrect="on"
        enterKeyHint="send"
        inputMode="text"
      />
      <button type="submit" aria-label="Send message">
        <SendIcon />
      </button>
    </div>
  );
};
```

---

## Part 5: Authentication Flow

### 5.1 Direct Chat Login

```typescript
// Simplified login specifically for chat access
interface ChatLoginCredentials {
  username: string;
  password: string;
  rememberMe: boolean;
}

async function loginToChat(credentials: ChatLoginCredentials): Promise<ChatLoginResult> {
  const response = await fetch('/api/chat/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials)
  });

  const result = await response.json();

  if (result.success) {
    // Store token for persistent sessions
    if (credentials.rememberMe) {
      localStorage.setItem('chat_token', result.token);
    } else {
      sessionStorage.setItem('chat_token', result.token);
    }

    return {
      success: true,
      user: result.user,
      token: result.token
    };
  }

  return { success: false, error: result.error };
}
```

### 5.2 Token-Based Auto-Reconnect

```typescript
function useChatConnection() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const reconnectAttempts = useRef(0);

  const connect = useCallback(() => {
    const token = localStorage.getItem('chat_token') || sessionStorage.getItem('chat_token');

    if (!token) {
      // Redirect to login
      return;
    }

    const newSocket = io('/chat', {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity, // Never give up
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
    });

    newSocket.on('connect', () => {
      reconnectAttempts.current = 0;
    });

    newSocket.on('auth_error', () => {
      // Token expired or invalid - redirect to login
      localStorage.removeItem('chat_token');
      sessionStorage.removeItem('chat_token');
      window.location.href = '/chat/login';
    });

    setSocket(newSocket);
  }, []);

  return { socket, connect };
}
```

### 5.3 Login UI Component

```tsx
const ChatLogin: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = await loginToChat({ username, password, rememberMe });

    if (result.success) {
      window.location.href = '/chat';
    } else {
      setError(result.error || 'Login failed');
    }

    setLoading(false);
  };

  return (
    <div className="chat-login">
      <div className="chat-login-card">
        <h1>LiveChat</h1>
        <p>Login with your BBS account</p>

        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            required
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />

          <label className="remember-me">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={e => setRememberMe(e.target.checked)}
            />
            Remember me
          </label>

          {error && <div className="error">{error}</div>}

          <button type="submit" disabled={loading}>
            {loading ? 'Logging in...' : 'Login to Chat'}
          </button>
        </form>

        <p className="help-text">
          Don't have an account? <a href="/">Connect to BBS</a> to register.
        </p>
      </div>
    </div>
  );
};
```

---

## Part 6: Responsive Terminal Component

### 6.1 Dynamic Terminal Sizing

```typescript
const ChatTerminal: React.FC<ChatTerminalProps> = ({ channelId }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [dimensions, setDimensions] = useState<TerminalDimensions>({ cols: 80, rows: 24, fontSize: 14 });

  // Calculate dimensions based on container size
  const updateDimensions = useCallback(() => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const safeAreaInsets = getSafeAreaInsets();

    const newDimensions = calculateTerminalSize(
      rect.width,
      rect.height,
      safeAreaInsets
    );

    setDimensions(newDimensions);

    // Resize terminal if it exists
    if (terminalRef.current && fitAddonRef.current) {
      terminalRef.current.options.fontSize = newDimensions.fontSize;
      fitAddonRef.current.fit();

      // Notify backend of new dimensions
      socket.emit('chat:terminal-resize', {
        cols: terminalRef.current.cols,
        rows: terminalRef.current.rows
      });
    }
  }, []);

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current) return;

    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontFamily: '"Fira Code", "Cascadia Code", Consolas, monospace',
      fontSize: dimensions.fontSize,
      lineHeight: 1.2,
      scrollback: 2000,
      theme: {
        background: '#000000',
        foreground: '#ffffff',
        cursor: '#00ff00',
        // ... Amiga color palette
      }
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());

    terminal.open(containerRef.current);
    fitAddon.fit();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Initial dimension update
    updateDimensions();

    return () => {
      terminal.dispose();
    };
  }, []);

  // Handle resize
  useEffect(() => {
    const resizeObserver = new ResizeObserver(() => {
      updateDimensions();
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // Also listen for orientation changes
    window.addEventListener('orientationchange', updateDimensions);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('orientationchange', updateDimensions);
    };
  }, [updateDimensions]);

  return (
    <div
      ref={containerRef}
      className="chat-terminal"
      style={{ flex: 1, minHeight: 0 }}
    />
  );
};
```

### 6.2 Terminal CSS

```css
.chat-terminal {
  flex: 1;
  min-height: 0; /* Critical for flex shrinking */
  overflow: hidden;
  background: #000000;

  /* Prevent text selection during scrolling */
  -webkit-user-select: none;
  user-select: none;
}

.chat-terminal .xterm {
  height: 100%;
  padding: 8px;
}

.chat-terminal .xterm-viewport {
  /* Hide scrollbar on mobile for cleaner look */
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.chat-terminal .xterm-viewport::-webkit-scrollbar {
  display: none;
}

/* Show scrollbar on desktop */
@media (min-width: 1024px) {
  .chat-terminal .xterm-viewport {
    scrollbar-width: thin;
  }

  .chat-terminal .xterm-viewport::-webkit-scrollbar {
    display: block;
    width: 8px;
  }

  .chat-terminal .xterm-viewport::-webkit-scrollbar-thumb {
    background: #333;
    border-radius: 4px;
  }
}
```

---

## Part 7: Touch Gestures

### 7.1 Swipe Navigation

```typescript
function useSwipeGesture(
  onSwipeLeft: () => void,
  onSwipeRight: () => void,
  threshold = 50
) {
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  const handleTouchStart = (e: TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: TouchEvent) => {
    touchEndX.current = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX.current;

    if (Math.abs(diff) > threshold) {
      if (diff > 0) {
        onSwipeLeft(); // Swiped left
      } else {
        onSwipeRight(); // Swiped right
      }
    }
  };

  return { handleTouchStart, handleTouchEnd };
}

// Usage: Swipe to toggle sidebar
const ChatApp: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { handleTouchStart, handleTouchEnd } = useSwipeGesture(
    () => setSidebarOpen(false),  // Swipe left closes sidebar
    () => setSidebarOpen(true)    // Swipe right opens sidebar
  );

  return (
    <div
      className="chat-app"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* ... */}
    </div>
  );
};
```

### 7.2 Pull to Load History

```typescript
function usePullToRefresh(onRefresh: () => Promise<void>) {
  const [pulling, setPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startY = useRef(0);
  const threshold = 80;

  const handleTouchStart = (e: TouchEvent) => {
    // Only activate if at top of scroll
    const target = e.currentTarget as HTMLElement;
    if (target.scrollTop === 0) {
      startY.current = e.touches[0].clientY;
      setPulling(true);
    }
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (!pulling) return;

    const currentY = e.touches[0].clientY;
    const distance = Math.max(0, currentY - startY.current);
    setPullDistance(Math.min(distance, threshold * 1.5));
  };

  const handleTouchEnd = async () => {
    if (pullDistance >= threshold) {
      await onRefresh();
    }
    setPulling(false);
    setPullDistance(0);
  };

  return { pulling, pullDistance, handleTouchStart, handleTouchMove, handleTouchEnd };
}
```

---

## Part 8: Off-Canvas Sidebar (Mobile)

### 8.1 Sidebar Component

```tsx
const ChatSidebar: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  return (
    <>
      {/* Backdrop */}
      <div
        className={`sidebar-backdrop ${isOpen ? 'visible' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sidebar */}
      <aside className={`chat-sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h2>Channels</h2>
          <button onClick={onClose} aria-label="Close sidebar">
            <CloseIcon />
          </button>
        </div>

        <nav className="channel-list">
          <section>
            <h3>Public</h3>
            <ChannelItem name="general" unread={0} />
            <ChannelItem name="random" unread={3} />
            <ChannelItem name="help" unread={0} />
          </section>

          <section>
            <h3>Direct Messages</h3>
            <DMItem username="Alice" status="online" unread={2} />
            <DMItem username="Bob" status="away" unread={0} />
          </section>
        </nav>

        <div className="sidebar-footer">
          <UserPresenceControl />
        </div>
      </aside>
    </>
  );
};
```

### 8.2 Sidebar CSS

```css
.chat-sidebar {
  position: fixed;
  top: 0;
  left: 0;
  width: 280px;
  max-width: 80vw;
  height: 100%;
  background: #1a1a1a;
  transform: translateX(-100%);
  transition: transform 0.3s ease-out;
  z-index: 1000;

  display: flex;
  flex-direction: column;

  /* Safe area padding */
  padding-top: var(--safe-area-top);
  padding-left: var(--safe-area-left);
  padding-bottom: var(--safe-area-bottom);
}

.chat-sidebar.open {
  transform: translateX(0);
}

.sidebar-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.3s, visibility 0.3s;
  z-index: 999;
}

.sidebar-backdrop.visible {
  opacity: 1;
  visibility: visible;
}

/* Tablet and up: Sidebar always visible */
@media (min-width: 768px) {
  .chat-sidebar {
    position: relative;
    transform: none;
    z-index: auto;
  }

  .sidebar-backdrop {
    display: none;
  }
}
```

---

## Part 9: PWA Features

### 9.1 Web App Manifest

```json
{
  "name": "AmiExpress LiveChat",
  "short_name": "LiveChat",
  "description": "Real-time BBS chat with character-by-character typing",
  "start_url": "/chat",
  "display": "standalone",
  "orientation": "any",
  "background_color": "#000000",
  "theme_color": "#000000",
  "icons": [
    {
      "src": "/icons/chat-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icons/chat-512.png",
      "sizes": "512x512",
      "type": "image/png"
    },
    {
      "src": "/icons/chat-maskable.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

### 9.2 Service Worker (Basic Caching)

```typescript
// sw.ts
const CACHE_NAME = 'livechat-v1';
const STATIC_ASSETS = [
  '/chat',
  '/chat/login',
  '/assets/chat.css',
  '/assets/chat.js',
  '/fonts/FiraCode.woff2'
];

self.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener('fetch', (event: FetchEvent) => {
  // Network-first for API calls
  if (event.request.url.includes('/api/') || event.request.url.includes('/socket.io/')) {
    return;
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request);
    })
  );
});
```

---

## Part 10: Performance Optimizations

### 10.1 Code Splitting

```typescript
// Lazy load the chat app
const ChatApp = lazy(() => import('./ChatApp'));
const ChatLogin = lazy(() => import('./ChatLogin'));

const ChatRouter: React.FC = () => {
  return (
    <Suspense fallback={<ChatSkeleton />}>
      <Routes>
        <Route path="/chat/login" element={<ChatLogin />} />
        <Route path="/chat/*" element={<ChatApp />} />
      </Routes>
    </Suspense>
  );
};
```

### 10.2 Skeleton Loading

```tsx
const ChatSkeleton: React.FC = () => (
  <div className="chat-skeleton">
    <div className="skeleton-header" />
    <div className="skeleton-content">
      <div className="skeleton-message" style={{ width: '60%' }} />
      <div className="skeleton-message" style={{ width: '80%' }} />
      <div className="skeleton-message" style={{ width: '40%' }} />
    </div>
    <div className="skeleton-input" />
  </div>
);
```

### 10.3 Message Virtualization

```typescript
// Only render visible messages for performance
import { FixedSizeList as List } from 'react-window';

const MessageList: React.FC<{ messages: Message[] }> = ({ messages }) => {
  const listRef = useRef<List>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    listRef.current?.scrollToItem(messages.length - 1);
  }, [messages.length]);

  return (
    <List
      ref={listRef}
      height={window.innerHeight - 104} // Header + input
      itemCount={messages.length}
      itemSize={48}
      width="100%"
    >
      {({ index, style }) => (
        <MessageItem message={messages[index]} style={style} />
      )}
    </List>
  );
};
```

---

## Part 11: Backend API Endpoints

### 11.1 Chat Authentication Endpoint

```typescript
// POST /api/chat/login
app.post('/api/chat/login', async (req, res) => {
  const { username, password } = req.body;

  const user = await db.getUserByUsername(username);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  // Generate chat-specific token (longer expiry for mobile)
  const token = jwt.sign(
    { userId: user.id, username: user.username, scope: 'chat' },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );

  res.json({
    success: true,
    token,
    user: {
      id: user.id,
      username: user.username,
      secLevel: user.secLevel
    }
  });
});
```

### 11.2 Chat Socket.IO Namespace

```typescript
// Socket.IO namespace for chat-only connections
const chatNamespace = io.of('/chat');

chatNamespace.use(async (socket, next) => {
  const token = socket.handshake.auth.token;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.scope !== 'chat') {
      return next(new Error('Invalid token scope'));
    }
    socket.data.user = decoded;
    next();
  } catch (err) {
    socket.emit('auth_error');
    next(new Error('Authentication failed'));
  }
});

chatNamespace.on('connection', (socket) => {
  const { userId, username } = socket.data.user;

  // Join user's personal room
  socket.join(`user:${userId}`);

  // Join default channel
  socket.join('channel:general');

  // Handle chat events
  socket.on('chat:keystroke', handleKeystroke);
  socket.on('chat:send-message', handleSendMessage);
  socket.on('chat:join-channel', handleJoinChannel);
  // ... etc
});
```

---

## Part 12: File Structure

```
web/frontend/src/
├── chat/                          # Chat web app
│   ├── index.tsx                  # Entry point
│   ├── ChatApp.tsx                # Main app component
│   ├── ChatLogin.tsx              # Login page
│   ├── components/
│   │   ├── ChatHeader.tsx         # Fixed header
│   │   ├── ChatSidebar.tsx        # Channel list sidebar
│   │   ├── ChatTerminal.tsx       # Responsive terminal
│   │   ├── ChatInput.tsx          # Message input
│   │   ├── ChatSkeleton.tsx       # Loading skeleton
│   │   ├── ChannelList.tsx        # Channel navigation
│   │   ├── DMList.tsx             # DM navigation
│   │   └── UserPresence.tsx       # Status control
│   ├── hooks/
│   │   ├── useChatConnection.ts   # Socket.IO connection
│   │   ├── useVirtualKeyboard.ts  # Keyboard handling
│   │   ├── useSwipeGesture.ts     # Touch gestures
│   │   └── useTerminalSize.ts     # Responsive sizing
│   ├── services/
│   │   ├── chatAuth.ts            # Authentication
│   │   └── chatSocket.ts          # Socket events
│   ├── styles/
│   │   ├── chat.css               # Main styles
│   │   ├── mobile.css             # Mobile-specific
│   │   └── desktop.css            # Desktop-specific
│   └── utils/
│       ├── terminalSize.ts        # Size calculations
│       └── safeArea.ts            # Safe area helpers
├── manifest.json                   # PWA manifest
└── sw.ts                          # Service worker
```

---

## Part 13: Success Criteria

### Must Have (MVP)
- [ ] Responsive terminal that adapts to viewport size
- [ ] Mobile-first layout with touch-friendly UI
- [ ] Direct login with BBS credentials
- [ ] Real-time keystroke transmission (preserved from BBS)
- [ ] Channel navigation (public channels, DMs)
- [ ] Off-canvas sidebar on mobile
- [ ] Safe area handling (notches, home indicators)
- [ ] Auto-reconnect with token persistence

### Should Have
- [ ] PWA installable (manifest + service worker)
- [ ] Virtual keyboard handling with VirtualKeyboard API
- [ ] Swipe gestures for navigation
- [ ] Pull-to-refresh for message history
- [ ] Unread message badges
- [ ] Push notifications (via service worker)

### Nice to Have
- [ ] Offline message queue
- [ ] Message search
- [ ] Image/file sharing preview
- [ ] Voice message recording
- [ ] Dark/light theme toggle

### Performance Targets
- [ ] First Contentful Paint < 1.5s
- [ ] Time to Interactive < 3s
- [ ] Lighthouse Mobile Score > 90
- [ ] Works on 3G networks

---

## Part 14: Testing Checklist

### Device Testing
- [ ] iPhone SE (smallest common iOS)
- [ ] iPhone 14 Pro (notch + dynamic island)
- [ ] iPhone 14 Pro Max (large iOS)
- [ ] Pixel 7 (Android reference)
- [ ] Samsung Galaxy S23 (popular Android)
- [ ] iPad Mini (small tablet)
- [ ] iPad Pro 12.9" (large tablet)
- [ ] Desktop 1920x1080
- [ ] Desktop 2560x1440

### Orientation Testing
- [ ] Portrait mode on all devices
- [ ] Landscape mode on all devices
- [ ] Rotation during use

### Keyboard Testing
- [ ] iOS keyboard appearance/dismissal
- [ ] Android keyboard appearance/dismissal
- [ ] External Bluetooth keyboard
- [ ] Desktop keyboard shortcuts

### Network Testing
- [ ] Fast WiFi
- [ ] Slow 3G simulation
- [ ] Offline mode
- [ ] Reconnection after network loss

---

**Version**: 1.0
**Date**: December 16, 2025
**Author**: Claude Code (Opus 4.5)

**Research Sources:**
- AmiExpress Web Frontend Implementation Analysis
- Mobile-First Chat UI Best Practices 2025
- xterm.js Mobile Optimization Techniques
- VirtualKeyboard API Documentation (MDN)
- PWA Design Patterns (web.dev)
- CSS Safe Area Insets (CSS-Tricks)
