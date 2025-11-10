import { useState, useRef, useEffect } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import {
  XTermTerminal,
  CodeEditor,
  BuildStatusEnhanced,
  ScreenshotCapture,
  SessionRecorder,
  ReleaseArchive,
  DoorInfo,
  Header,
  DoorListEnhanced,
  Settings,
  EnhancedGameWizard,
  ToastContainer,
  ConnectionBanner,
  KeyboardOverlay,
  CRTEffect,
  CommandPalette,
  StatusBar,
  QuickActions,
  SuccessCelebration,
  GradientMesh,
  OnboardingTour,
  HapticFeedback,
  ThemeSelector,
  EnhancedLoader,
  TerminalTabs,
  CodeMinimap,
  PerformanceProfiler,
  GitIntegration,
  AIPromptPanel,
  CodeDiffViewer,
} from './components';
import { useWebSocket, useLocalStorage, useKeyboardShortcuts } from './hooks';
import { useToast } from './hooks/useToast';
import { useSoundEffects } from './components/ui/SoundEffects';
import { SessionRecorder as Recorder } from './utils/sessionRecording';
import {
  AppSettings,
  DoorListItem,
  DoorMetadata,
  DoorFile,
  BuildStatus as BuildStatusType,
  ArchiveOptions,
  WebSocketMessage,
  ConnectionStatus,
  SessionEvent,
} from './types';
import { ChevronLeft, ChevronRight, Play, Hammer, Keyboard, Wand2, Camera, Save, Sparkles, Layout, Monitor, Code2, Columns } from 'lucide-react';
import type { CommandItem } from './components/ui/CommandPalette';

const defaultSettings: AppSettings = {
  theme: 'dark',
  editorTheme: 'vs-dark',
  terminalFontSize: 14,
  editorFontSize: 14,
  autoScroll: true,
  showLineNumbers: true,
  enableKeyboardShortcuts: true,
  playbackSpeed: 1.0,
};

function App() {
  // Toast notifications
  const toast = useToast();

  // Sound effects
  const soundEffects = useSoundEffects();

  // State management
  const [settings, setSettings] = useLocalStorage<AppSettings>('sdk-preview-settings', defaultSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [showGameWizard, setShowGameWizard] = useState(false);
  const [showKeyboardOverlay, setShowKeyboardOverlay] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showSuccessCelebration, setShowSuccessCelebration] = useState(false);
  const [celebrationMessage, setCelebrationMessage] = useState('Success!');
  const [enableCRT, setEnableCRT] = useState(false);
  const [doorsLoading, setDoorsLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    connected: false,
    reconnecting: false,
    error: null,
    lastConnected: null,
  });

  // NEW: Additional UI state
  const [showThemeSelector, setShowThemeSelector] = useState(false);
  const [showPerformanceProfiler, setShowPerformanceProfiler] = useState(false);
  const [terminalTabs, setTerminalTabs] = useState([
    { id: '1', name: 'Terminal 1', active: true }
  ]);
  const [activeTerminalTab, setActiveTerminalTab] = useState('1');

  // Hot reload state
  const [hotReloadEnabled, setHotReloadEnabled] = useLocalStorage('sdk-hot-reload-enabled', true);
  const [hotReloadDelay, setHotReloadDelay] = useLocalStorage('sdk-hot-reload-delay', 2000);
  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null);

  // New UX features state
  const [showOnboarding, setShowOnboarding] = useLocalStorage('sdk-preview-onboarding-complete', false);
  const [hapticTrigger, setHapticTrigger] = useState(false);
  const [enableSoundEffects, setEnableSoundEffects] = useLocalStorage('sdk-preview-sound-effects', true);
  const [showGradientMesh, setShowGradientMesh] = useLocalStorage('sdk-preview-gradient-mesh', true);

  // Door management
  const [doors, setDoors] = useState<DoorListItem[]>([]);
  const [selectedDoor, setSelectedDoor] = useState<DoorListItem | null>(null);
  const [doorMetadata, setDoorMetadata] = useState<DoorMetadata | null>(null);
  const [doorFiles, setDoorFiles] = useState<DoorFile[]>([]);
  const [currentFile, setCurrentFile] = useState<DoorFile | null>(null);

  // Terminal state
  const [terminalOutput, setTerminalOutput] = useState<string[]>([
    '\x1b[36m╔══════════════════════════════════════════════════════════════════════════════╗\x1b[0m',
    '\x1b[36m║                                                                              ║\x1b[0m',
    '\x1b[36m║                    \x1b[37mAmiExpress SDK - Door Preview System\x1b[36m                       ║\x1b[0m',
    '\x1b[36m║                                                                              ║\x1b[0m',
    '\x1b[36m╚══════════════════════════════════════════════════════════════════════════════╝\x1b[0m',
    '',
    '\x1b[32mWelcome to the AmiExpress SDK Preview!\x1b[0m',
    '',
    'Select a door from the sidebar to begin development.',
    'Use keyboard shortcuts for quick actions (Ctrl+, for settings).',
    '',
  ]);
  const terminalRef = useRef<HTMLDivElement>(null);

  // Client door state
  const [activeClientDoorSession, setActiveClientDoorSession] = useState<string | null>(null);

  // Build state
  const [buildStatus, setBuildStatus] = useState<BuildStatusType>({
    building: false,
    success: false,
    errors: [],
    warnings: [],
    lastBuild: 0,
    duration: 0,
  });

  // Session recording
  const [recorder] = useState(() => new Recorder());

  // UI state
  const [showLeftSidebar, setShowLeftSidebar] = useState(true);
  const [showRightSidebar, setShowRightSidebar] = useState(true);
  const [rightSidebarTab, setRightSidebarTab] = useState<'code' | 'build' | 'info' | 'release' | 'git'>('info');

  // View mode state
  type ViewMode = 'split' | 'terminal-only' | 'code-only';
  const [viewMode, setViewMode] = useLocalStorage<ViewMode>('sdk-view-mode', 'split');

  // Diff viewer state
  const [showDiffViewer, setShowDiffViewer] = useState(false);
  const [diffData, setDiffData] = useState<{
    original: string;
    suggested: string;
    filePath: string;
    explanation?: string;
  } | null>(null);

  // Favorites management
  const [_favorites, setFavorites] = useLocalStorage<string[]>('sdk-preview-favorites', []);

  // Sound effects helper
  useEffect(() => {
    soundEffects.setEnabled(enableSoundEffects);
  }, [enableSoundEffects, soundEffects]);

  // Trigger haptic feedback
  const triggerHaptic = () => {
    setHapticTrigger(true);
    setTimeout(() => setHapticTrigger(false), 100);
  };

  // Load doors list via HTTP
  const loadDoors = async () => {
    setDoorsLoading(true);
    try {
      const response = await fetch('/api/doors');
      if (response.ok) {
        const doorsData = await response.json();
        setDoors(doorsData);
        if (doorsData.length > 0) {
          toast.success(`Loaded ${doorsData.length} door${doorsData.length !== 1 ? 's' : ''}`);
          soundEffects.click();
        }
      } else {
        toast.error('Failed to load doors', response.statusText);
        soundEffects.error();
        console.error('Failed to load doors:', response.statusText);
      }
    } catch (error) {
      toast.error('Error loading doors', error instanceof Error ? error.message : 'Unknown error');
      soundEffects.error();
      console.error('Error loading doors:', error);
    } finally {
      setDoorsLoading(false);
    }
  };

  // WebSocket connection
  const { status: wsStatus, send: wsSend, ws: wsRef } = useWebSocket({
    url: `ws://${window.location.hostname}:${window.location.port || 8080}`,
    onMessage: handleWebSocketMessage,
    onConnect: () => {
      setConnectionStatus({
        connected: true,
        reconnecting: false,
        error: null,
        lastConnected: Date.now(),
      });
      // Request door list on connect
      loadDoors();
    },
    onDisconnect: () => {
      setConnectionStatus((prev) => ({ ...prev, connected: false }));
    },
    maxReconnectAttempts: 10,
  });

  // Update connection status from WebSocket hook
  useEffect(() => {
    setConnectionStatus(wsStatus);
  }, [wsStatus]);

  // Handle WebSocket messages
  function handleWebSocketMessage(message: WebSocketMessage) {
    switch (message.type) {
      case 'output':
        setTerminalOutput((prev) => [...prev, message.data]);
        recorder.addEvent('output', message.data, message.data);
        break;

      case 'debug':
        // Debug logs from the server
        setTerminalOutput((prev) => [...prev, message.data]);
        recorder.addEvent('debug', message.data, message.data);
        break;

      case 'doorList':
        setDoors(message.data);
        break;

      case 'doorMetadata':
        setDoorMetadata(message.data);
        break;

      case 'fileContent':
        // Handle both file tree updates and single file content updates
        if (message.data.files) {
          setDoorFiles(message.data.files);
        }
        if (message.data.currentFile) {
          setCurrentFile(message.data.currentFile);
        }
        // Handle single file content (from loadFile)
        if (message.data.path && message.data.content !== undefined) {
          setCurrentFile((prev) => prev ? { ...prev, content: message.data.content } : null);
        }
        break;

      case 'buildStatus':
        setBuildStatus(message.data);
        if (!message.data.building && message.data.lastBuild > 0) {
          if (message.data.errors.length === 0) {
            toast.success('Build succeeded!', `Completed in ${message.data.duration}ms`);
            // Trigger success celebration, sound, and haptic!
            setCelebrationMessage('Build Successful!');
            setShowSuccessCelebration(true);
            soundEffects.buildComplete();
            triggerHaptic();
          } else {
            toast.error('Build failed', `${message.data.errors.length} error${message.data.errors.length !== 1 ? 's' : ''} found`);
            soundEffects.error();
          }
        }
        break;

      case 'error':
        setTerminalOutput((prev) => [...prev, `\x1b[31mError: ${message.data}\x1b[0m`]);
        soundEffects.error();
        break;

      case 'door-server-message':
        // Server sent a message to the door - dispatch as DOM event
        if (message.sessionId) {
          const event = new CustomEvent('bbs:door:message', {
            detail: {
              sessionId: message.sessionId,
              message: message.data,
            },
          });
          window.dispatchEvent(event);
        }
        break;

      case 'client-door-bundle':
        // Client door: execute bundled code in browser
        setTerminalOutput((prev) => [
          ...prev,
          `\x1b[36m[CLIENT DOOR] Received bundle for ${message.doorId} (${message.code.length} bytes)\x1b[0m`,
          `\x1b[32m[CLIENT DOOR] Executing in browser with Web Audio API...\x1b[0m`,
          '',
        ]);
        try {
          // Set up window.__BBS__ for the door to use
          // This provides a Socket.IO-compatible interface wrapping the WebSocket
          const sessionId = `client-door-${message.doorId}-${Date.now()}`;

          // Create a Socket.IO-like wrapper around the WebSocket
          const socketIOWrapper = {
            emit: (event: string, data: any) => {
              // Handle door:client:message events (output from ClientDoor)
              if (event === 'door:client:message' && data.message) {
                const msg = data.message;
                // Handle OUTPUT messages - display in terminal
                if (msg.type === 'output') {
                  setTerminalOutput((prev) => [...prev, msg.data.text || msg.data]);
                }
                // Could handle other message types here
              }

              // Also send to server if needed
              if (wsRef.current) {
                wsSend({
                  type: 'door-message',
                  sessionId,
                  event,
                  data,
                });
              }
            },
            on: (event: string, handler: (data: any) => void) => {
              // Store event handlers for this session
              if (!window.__BBS_HANDLERS__) {
                window.__BBS_HANDLERS__ = {};
              }
              if (!window.__BBS_HANDLERS__[sessionId]) {
                window.__BBS_HANDLERS__[sessionId] = {};
              }
              window.__BBS_HANDLERS__[sessionId][event] = handler;
            },
          };

          // Set up global __BBS__ object for the door
          (window as any).__BBS__ = {
            socket: socketIOWrapper,
            sessionId,
          };

          // Execute the bundled code
          // The code will detect window.__BBS__ and use it for communication
          eval(message.code);

          // Set active client door session
          setActiveClientDoorSession(sessionId);

          // Send CONNECT message to initialize the door
          // This simulates the server sending user info to the door
          setTimeout(() => {
            const connectEvent = new CustomEvent('bbs:door:message', {
              detail: {
                sessionId,
                message: {
                  type: 'connect',
                  user: {
                    id: 1,
                    username: 'PreviewUser',
                    secLevel: 255,
                  },
                },
              },
            });
            window.dispatchEvent(connectEvent);
          }, 100);

          soundEffects.notification();
        } catch (err: any) {
          setTerminalOutput((prev) => [
            ...prev,
            `\x1b[31m[CLIENT DOOR] Execution error: ${err.message}\x1b[0m`,
          ]);
          soundEffects.error();
        }
        break;
    }
  }

  // Handle door selection
  const handleDoorSelect = (door: DoorListItem) => {
    setSelectedDoor(door);
    wsSend({ type: 'input', data: `selectDoor:${door.id}` });

    // Update last opened
    setDoors((prev) =>
      prev.map((d) =>
        d.id === door.id ? { ...d, lastOpened: Date.now() } : d
      )
    );
  };

  // Handle favorite toggle
  const handleToggleFavorite = (doorId: string) => {
    setDoors((prev) =>
      prev.map((d) =>
        d.id === doorId ? { ...d, favorite: !d.favorite } : d
      )
    );

    setFavorites((prev) => {
      if (prev.includes(doorId)) {
        return prev.filter((id) => id !== doorId);
      } else {
        return [...prev, doorId];
      }
    });
  };

  // Handle terminal input
  const handleTerminalInput = (input: string) => {
    // If a client door is active, send input directly to it
    if (activeClientDoorSession) {
      const inputEvent = new CustomEvent('bbs:door:message', {
        detail: {
          sessionId: activeClientDoorSession,
          message: {
            type: 'input',
            data: { key: input },
          },
        },
      });
      window.dispatchEvent(inputEvent);
    } else {
      // Normal terminal input
      setTerminalOutput((prev) => [...prev, `$ ${input}`]);
      wsSend({ type: 'input', data: input });
    }
  };

  // Handle file selection in code editor
  const handleFileSelect = (file: DoorFile) => {
    setCurrentFile(file);
    wsSend({ type: 'input', data: `loadFile:${file.path}` });
  };

  // Handle file changes in code editor
  const handleFileChange = (file: DoorFile, content: string) => {
    const updatedFile = { ...file, content };
    setCurrentFile(updatedFile);
    wsSend({ type: 'input', data: `saveFile:${file.path}:${content}` });

    // Hot reload: auto-build and run after delay
    if (hotReloadEnabled && selectedDoor) {
      // Clear existing timer
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current);
      }

      // Set new timer
      autoSaveTimer.current = setTimeout(() => {
        // Auto-build
        setBuildStatus((prev) => ({ ...prev, building: true }));
        wsSend({ type: 'input', data: `buildDoor:${selectedDoor.id}` });
        toast.info('Hot reload...', 'Auto-building changes', { duration: 2000 });
        soundEffects.notification();
      }, hotReloadDelay);
    }
  };

  // Handle build error click
  const handleBuildErrorClick = (error: any) => {
    // Find and open the file with the error
    const file = doorFiles.find((f) => f.path.includes(error.file));
    if (file) {
      setCurrentFile(file);
      setRightSidebarTab('code');
    }
  };

  // Handle archive creation
  const handleCreateArchive = async (options: ArchiveOptions) => {
    if (!selectedDoor) {
      toast.error('No door selected', 'Please select a door first');
      return;
    }

    try {
      toast.info('Creating archive...', 'Packaging your door');

      const response = await fetch(`/api/doors/${selectedDoor.id}/release`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(options),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create archive');
      }

      const { filename, size } = await response.json();

      toast.success('Archive created!', `${filename} (${(size / 1024).toFixed(1)} KB)`);

      // Trigger download
      const downloadUrl = `/downloads/${filename}`;
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      toast.success('Download started', filename);
    } catch (error) {
      console.error('Failed to create archive:', error);
      toast.error('Archive creation failed', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  // Handle AI code application
  const handleApplyCode = (code: string, filePath: string) => {
    const file = doorFiles.find((f) => f.path === filePath);
    if (file) {
      handleFileChange(file, code);
      toast.success('Code applied!', `Updated ${filePath}`);
      soundEffects.success();
      triggerHaptic();
    } else {
      toast.error('File not found', filePath);
    }
  };

  // Handle AI diff view
  const handleShowDiff = (original: string, suggested: string, filePath: string, explanation?: string) => {
    setDiffData({
      original,
      suggested,
      filePath,
      explanation,
    });
    setShowDiffViewer(true);
  };

  // Handle playback event
  const handlePlaybackEvent = (event: SessionEvent) => {
    if (event.type === 'output' && event.ansiData) {
      setTerminalOutput((prev) => [...prev, event.ansiData!]);
    }
  };

  // Handle theme toggle
  const handleThemeToggle = () => {
    setSettings((prev) => ({
      ...prev,
      theme: prev.theme === 'dark' ? 'light' : 'dark',
      editorTheme: prev.theme === 'dark' ? 'vs-light' : 'vs-dark',
    }));
  };

  // Handle run door
  const handleRunDoor = () => {
    if (selectedDoor) {
      wsSend({ type: 'input', data: `runDoor:${selectedDoor.id}` });
      setTerminalOutput((prev) => [
        ...prev,
        '',
        `\x1b[36m--- Running ${selectedDoor.name} ---\x1b[0m`,
        '',
      ]);
      soundEffects.click();
      triggerHaptic();
    }
  };

  // Handle build door
  const handleBuildDoor = () => {
    if (selectedDoor) {
      setBuildStatus((prev) => ({ ...prev, building: true }));
      wsSend({ type: 'input', data: `buildDoor:${selectedDoor.id}` });
      toast.info('Building door...', `Compiling ${selectedDoor.name}`);
      soundEffects.notification();
    }
  };

  // Command Palette commands
  const commandPaletteCommands: CommandItem[] = [
    {
      id: 'run-door',
      label: 'Run Door',
      description: 'Execute the selected door',
      icon: <Play className="w-4 h-4" />,
      shortcut: 'Ctrl+Enter',
      category: 'Development',
      action: handleRunDoor,
    },
    {
      id: 'build-door',
      label: 'Build Door',
      description: 'Compile the selected door',
      icon: <Hammer className="w-4 h-4" />,
      shortcut: 'Ctrl+B',
      category: 'Development',
      action: handleBuildDoor,
    },
    {
      id: 'create-game',
      label: 'Create New Game',
      description: 'AI-powered game generation',
      icon: <Wand2 className="w-4 h-4" />,
      category: 'Creation',
      action: () => setShowGameWizard(true),
    },
    {
      id: 'settings',
      label: 'Open Settings',
      description: 'Configure preferences',
      shortcut: 'Ctrl+,',
      category: 'General',
      action: () => setShowSettings(true),
    },
    {
      id: 'keyboard-shortcuts',
      label: 'Show Keyboard Shortcuts',
      description: 'View all available shortcuts',
      icon: <Keyboard className="w-4 h-4" />,
      shortcut: '?',
      category: 'General',
      action: () => setShowKeyboardOverlay(true),
    },
    {
      id: 'toggle-crt',
      label: 'Toggle CRT Effect',
      description: 'Enable/disable retro terminal effect',
      category: 'Appearance',
      action: () => setEnableCRT(!enableCRT),
    },
    {
      id: 'toggle-theme',
      label: 'Toggle Theme',
      description: 'Switch between light and dark mode',
      shortcut: 'Ctrl+Shift+T',
      category: 'Appearance',
      action: handleThemeToggle,
    },
    {
      id: 'toggle-gradient-mesh',
      label: 'Toggle Gradient Mesh',
      description: 'Enable/disable animated background gradient',
      icon: <Sparkles className="w-4 h-4" />,
      category: 'Appearance',
      action: () => setShowGradientMesh(!showGradientMesh),
    },
    {
      id: 'toggle-sound-effects',
      label: 'Toggle Sound Effects',
      description: 'Enable/disable UI sound effects',
      category: 'Appearance',
      action: () => setEnableSoundEffects(!enableSoundEffects),
    },
    {
      id: 'restart-onboarding',
      label: 'Restart Onboarding Tour',
      description: 'Show the onboarding tour again',
      category: 'General',
      action: () => setShowOnboarding(false),
    },
    {
      id: 'open-theme-selector',
      label: 'Open Theme Selector',
      description: 'Choose from 8 preset themes',
      category: 'Appearance',
      action: () => setShowThemeSelector(true),
    },
    {
      id: 'toggle-performance-profiler',
      label: 'Toggle Performance Profiler',
      description: 'Show/hide performance metrics',
      category: 'Development',
      action: () => setShowPerformanceProfiler(!showPerformanceProfiler),
    },
    {
      id: 'toggle-hot-reload',
      label: 'Toggle Hot Reload',
      description: 'Enable/disable automatic rebuild on code changes',
      category: 'Development',
      action: () => {
        setHotReloadEnabled(!hotReloadEnabled);
        toast.info(
          hotReloadEnabled ? 'Hot reload disabled' : 'Hot reload enabled',
          hotReloadEnabled ? 'Manual build required' : 'Auto-builds on code changes'
        );
      },
    },
    {
      id: 'view-mode-split',
      label: 'Split View',
      description: 'Show terminal and code side-by-side',
      icon: <Columns className="w-4 h-4" />,
      shortcut: 'Ctrl+1',
      category: 'View',
      action: () => {
        setViewMode('split');
        setShowRightSidebar(true);
        toast.info('Split View', 'Terminal and code side-by-side');
        soundEffects.click();
      },
    },
    {
      id: 'view-mode-terminal',
      label: 'Terminal Only',
      description: 'Focus on terminal output',
      icon: <Monitor className="w-4 h-4" />,
      shortcut: 'Ctrl+2',
      category: 'View',
      action: () => {
        setViewMode('terminal-only');
        setShowRightSidebar(false);
        toast.info('Terminal Only', 'Maximized terminal view');
        soundEffects.click();
      },
    },
    {
      id: 'view-mode-code',
      label: 'Code Only',
      description: 'Focus on code editor',
      icon: <Code2 className="w-4 h-4" />,
      shortcut: 'Ctrl+3',
      category: 'View',
      action: () => {
        setViewMode('code-only');
        setShowRightSidebar(true);
        toast.info('Code Only', 'Maximized code editor');
        soundEffects.click();
      },
    },
  ];

  // Keyboard shortcuts
  const allShortcuts = [
    {
      key: 'k',
      ctrl: true,
      action: () => setShowCommandPalette(true),
      description: 'Open command palette',
      category: 'General',
    },
    {
      key: 's',
      ctrl: true,
      action: () => {
        if (terminalRef.current) {
          // Screenshot handled by component
        }
      },
      description: 'Take screenshot',
      category: 'Media',
    },
    {
      key: 'r',
      ctrl: true,
      action: () => {
        if (recorder.isRecording()) {
          recorder.stopRecording();
        } else if (selectedDoor) {
          recorder.startRecording(selectedDoor.name);
        }
      },
      description: 'Toggle recording',
      category: 'Media',
    },
    {
      key: 'b',
      ctrl: true,
      action: handleBuildDoor,
      description: 'Build door',
      category: 'Development',
    },
    {
      key: 'Enter',
      ctrl: true,
      action: handleRunDoor,
      description: 'Run door',
      category: 'Development',
    },
    {
      key: 't',
      ctrl: true,
      shift: true,
      action: handleThemeToggle,
      description: 'Toggle theme',
      category: 'Appearance',
    },
    {
      key: ',',
      ctrl: true,
      action: () => setShowSettings(true),
      description: 'Open settings',
      category: 'General',
    },
    {
      key: '?',
      action: () => setShowKeyboardOverlay((prev) => !prev),
      description: 'Show keyboard shortcuts',
      category: 'General',
    },
    {
      key: '1',
      ctrl: true,
      action: () => {
        setViewMode('split');
        setShowRightSidebar(true);
      },
      description: 'Split view mode',
      category: 'View',
    },
    {
      key: '2',
      ctrl: true,
      action: () => {
        setViewMode('terminal-only');
        setShowRightSidebar(false);
      },
      description: 'Terminal only mode',
      category: 'View',
    },
    {
      key: '3',
      ctrl: true,
      action: () => {
        setViewMode('code-only');
        setShowRightSidebar(true);
      },
      description: 'Code only mode',
      category: 'View',
    },
  ];

  useKeyboardShortcuts(
    allShortcuts.map(({ category, ...rest }) => rest),
    settings.enableKeyboardShortcuts
  );

  // Apply theme to body
  useEffect(() => {
    document.body.className = settings.theme === 'dark' ? 'dark bg-[#1E1E1E]' : 'light bg-white';
  }, [settings.theme]);

  // Onboarding tour steps
  const onboardingSteps = [
    {
      id: 'welcome',
      title: 'Welcome to AmiExpress SDK!',
      description: 'Let\'s take a quick tour of the interface. This will help you get started quickly.',
      position: 'center' as const,
    },
    {
      id: 'door-list',
      title: 'Door List',
      description: 'Browse and manage your BBS doors here. Click on a door to select it for editing or running.',
      target: '[data-tour="door-list"]',
      position: 'right' as const,
    },
    {
      id: 'terminal',
      title: 'Terminal Output',
      description: 'View door output and interact with your BBS doors here. This is where you\'ll see everything running.',
      target: '[data-tour="terminal"]',
      position: 'top' as const,
    },
    {
      id: 'code-editor',
      title: 'Code Editor',
      description: 'Edit your door\'s source code directly in the browser with syntax highlighting and autocompletion.',
      target: '[data-tour="code-editor"]',
      position: 'left' as const,
    },
    {
      id: 'command-palette',
      title: 'Command Palette',
      description: 'Press Ctrl+K to open the command palette and quickly access any action or setting.',
      position: 'center' as const,
    },
    {
      id: 'quick-actions',
      title: 'Quick Actions',
      description: 'Use the floating action button to quickly create games, run doors, build projects, and capture screenshots.',
      target: '[data-tour="quick-actions"]',
      position: 'left' as const,
    },
  ];

  return (
    <div className="h-screen flex flex-col bg-[#1E1E1E] text-white overflow-hidden">
      {/* Gradient Mesh Background */}
      {showGradientMesh && <GradientMesh variant="dark" animated={true} />}

      {/* Header with slide-down animation */}
      <div className="animate-slideDown">
        <Header
          theme={settings.theme}
          onThemeToggle={handleThemeToggle}
          connectionStatus={connectionStatus}
          onSettingsClick={() => setShowSettings(true)}
        />
      </div>

      {/* Main content area with fade-in animation */}
      <div className="flex-1 flex overflow-hidden animate-fadeIn">
        <PanelGroup direction="horizontal">
          {/* Left sidebar - Door list with slide-in animation */}
          {showLeftSidebar && (
            <>
              <Panel defaultSize={20} minSize={15} maxSize={30}>
                <div className="animate-slideInLeft h-full" data-tour="door-list">
                  {doorsLoading ? (
                    <div className="flex items-center justify-center h-full bg-[#252526]">
                      <EnhancedLoader
                        type="orbital"
                        size="lg"
                        message="Loading doors..."
                      />
                    </div>
                  ) : (
                    <DoorListEnhanced
                      doors={doors}
                      selectedDoor={selectedDoor}
                      onDoorSelect={handleDoorSelect}
                      onToggleFavorite={handleToggleFavorite}
                      onCreateNewGame={() => setShowGameWizard(true)}
                      onBuildDoor={handleBuildDoor}
                      onRunDoor={handleRunDoor}
                      loading={doorsLoading}
                    />
                  )}
                </div>
              </Panel>
              <PanelResizeHandle className="w-1 bg-gray-700 hover:bg-blue-600 transition-all duration-300 hover:w-2 cursor-col-resize" />
            </>
          )}

          {/* Center - Terminal and AI Prompt */}
          <Panel defaultSize={viewMode === 'terminal-only' ? 100 : viewMode === 'code-only' ? 0 : 50} minSize={viewMode === 'code-only' ? 0 : 30}>
            <PanelGroup direction="vertical">
              {/* Terminal Section */}
              <Panel defaultSize={70} minSize={50}>
                <div className="flex flex-col h-full">
                  {/* Terminal Tabs */}
                  <TerminalTabs
                    tabs={terminalTabs}
                    activeTab={activeTerminalTab}
                    onTabChange={setActiveTerminalTab}
                    onTabCreate={() => {
                      const newId = (terminalTabs.length + 1).toString();
                      setTerminalTabs([...terminalTabs, { id: newId, name: `Terminal ${newId}`, active: false }]);
                      setActiveTerminalTab(newId);
                      soundEffects.click();
                    }}
                    onTabClose={(id) => {
                      if (terminalTabs.length > 1) {
                        setTerminalTabs(terminalTabs.filter(t => t.id !== id));
                        if (activeTerminalTab === id) {
                          setActiveTerminalTab(terminalTabs[0].id);
                        }
                        soundEffects.click();
                      }
                    }}
                    onTabRename={(id, newName) => {
                      setTerminalTabs(terminalTabs.map(t => t.id === id ? { ...t, name: newName } : t));
                    }}
                  />

                  {/* Terminal toolbar */}
                  <div className="bg-[#252526] border-b border-gray-700 px-4 py-2 flex items-center gap-2 shadow-lg">
                    {!showLeftSidebar && (
                      <button
                        onClick={() => setShowLeftSidebar(true)}
                        className="p-1 hover:bg-gray-700 rounded transition-all duration-200 hover:scale-110 active:scale-95"
                        title="Show sidebar"
                      >
                        <ChevronRight className="w-4 h-4 transition-transform" />
                      </button>
                    )}
                    {showLeftSidebar && (
                      <button
                        onClick={() => setShowLeftSidebar(false)}
                        className="p-1 hover:bg-gray-700 rounded transition-all duration-200 hover:scale-110 active:scale-95"
                        title="Hide sidebar"
                      >
                        <ChevronLeft className="w-4 h-4 transition-transform" />
                      </button>
                    )}

                    <div className="h-4 w-px bg-gray-700" />

                    <button
                      onClick={handleRunDoor}
                      disabled={!selectedDoor}
                      className="group flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded transition-all duration-200 hover:scale-105 active:scale-95 disabled:hover:scale-100"
                    >
                      <Play className="w-4 h-4 transition-transform group-hover:scale-110" />
                      <span className="hidden sm:inline">Run</span>
                    </button>

                    <button
                      onClick={handleBuildDoor}
                      disabled={!selectedDoor || buildStatus.building}
                      className={`group flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded transition-all duration-200 hover:scale-105 active:scale-95 disabled:hover:scale-100 ${
                        buildStatus.building ? 'animate-pulse' : ''
                      }`}
                      title={hotReloadEnabled ? 'Manual build (Hot reload enabled)' : 'Build door'}
                    >
                      <Hammer className={`w-4 h-4 transition-transform ${buildStatus.building ? 'animate-bounce' : 'group-hover:rotate-12'}`} />
                      <span className="hidden sm:inline">{buildStatus.building ? 'Building...' : 'Build'}</span>
                      {hotReloadEnabled && (
                        <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full animate-pulse" title="Hot reload enabled" />
                      )}
                    </button>

                    <div className="ml-auto flex items-center gap-2">
                      {/* View Mode Toggle */}
                      <div className="flex items-center gap-1 px-2 py-1 bg-[#1E1E1E] rounded border border-gray-700">
                        <button
                          onClick={() => setViewMode('split')}
                          className={`p-1 rounded transition-all ${
                            viewMode === 'split' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'
                          }`}
                          title="Split View (Ctrl+1)"
                        >
                          <Columns className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => { setViewMode('terminal-only'); setShowRightSidebar(false); }}
                          className={`p-1 rounded transition-all ${
                            viewMode === 'terminal-only' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'
                          }`}
                          title="Terminal Only (Ctrl+2)"
                        >
                          <Monitor className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => { setViewMode('code-only'); setShowRightSidebar(true); }}
                          className={`p-1 rounded transition-all ${
                            viewMode === 'code-only' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'
                          }`}
                          title="Code Only (Ctrl+3)"
                        >
                          <Code2 className="w-3 h-3" />
                        </button>
                      </div>

                      <ScreenshotCapture
                        targetElement={terminalRef.current}
                        doorName={selectedDoor?.name || 'terminal'}
                      />

                      {!showRightSidebar && (
                        <button
                          onClick={() => setShowRightSidebar(true)}
                          className="p-1 hover:bg-gray-700 rounded transition-all duration-200 hover:scale-110 active:scale-95"
                          title="Show sidebar"
                        >
                          <ChevronLeft className="w-4 h-4 transition-transform" />
                        </button>
                      )}
                      {showRightSidebar && (
                        <button
                          onClick={() => setShowRightSidebar(false)}
                          className="p-1 hover:bg-gray-700 rounded transition-all duration-200 hover:scale-110 active:scale-95"
                          title="Hide sidebar"
                        >
                          <ChevronRight className="w-4 h-4 transition-transform" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Terminal with optional CRT effect */}
                  <div ref={terminalRef} className="flex-1 min-h-0 overflow-hidden" data-tour="terminal">
                    <CRTEffect enabled={enableCRT} intensity="medium">
                      <XTermTerminal
                        output={terminalOutput}
                        onInput={handleTerminalInput}
                        fontSize={settings.terminalFontSize}
                      />
                    </CRTEffect>
                  </div>

                  {/* Session recorder controls */}
                  <SessionRecorder
                    recorder={recorder}
                    doorName={selectedDoor?.name || 'door'}
                    onPlaybackEvent={handlePlaybackEvent}
                  />
                </div>
              </Panel>

              {/* Resize handle between terminal and AI prompt */}
              <PanelResizeHandle className="h-1 bg-gray-700 hover:bg-purple-600 transition-all duration-300 hover:h-2 cursor-row-resize" />

              {/* AI Prompt Panel */}
              <Panel defaultSize={30} minSize={15} maxSize={50}>
                <AIPromptPanel
                  selectedDoor={selectedDoor?.id || null}
                  currentFile={currentFile}
                  buildErrors={buildStatus.errors}
                  onApplyCode={handleApplyCode}
                  onShowDiff={handleShowDiff}
                />
              </Panel>
            </PanelGroup>
          </Panel>

          {/* Right sidebar - Code editor / Build status / Info with slide-in animation */}
          {showRightSidebar && viewMode !== 'terminal-only' && (
            <>
              <PanelResizeHandle className="w-1 bg-gray-700 hover:bg-blue-600 transition-all duration-300 hover:w-2 cursor-col-resize" />
              <Panel defaultSize={viewMode === 'code-only' ? 100 : 30} minSize={20} maxSize={viewMode === 'code-only' ? 100 : 50}>
                <div className="flex flex-col h-full bg-[#252526] animate-slideInRight">
                  {/* Tabs with smooth transitions and glow effects */}
                  <div className="flex border-b border-gray-700 bg-[#252526]">
                    <button
                      onClick={() => setRightSidebarTab('info')}
                      className={`relative flex-1 px-4 py-2 text-sm font-medium transition-all duration-200 hover:scale-105 ${
                        rightSidebarTab === 'info'
                          ? 'bg-[#1E1E1E] text-white'
                          : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                      }`}
                    >
                      Info
                      {rightSidebarTab === 'info' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 via-cyan-500 to-blue-500 animate-shimmer" />
                      )}
                    </button>
                    <button
                      onClick={() => setRightSidebarTab('code')}
                      className={`relative flex-1 px-4 py-2 text-sm font-medium transition-all duration-200 hover:scale-105 ${
                        rightSidebarTab === 'code'
                          ? 'bg-[#1E1E1E] text-white'
                          : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                      }`}
                    >
                      Code
                      {rightSidebarTab === 'code' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 via-cyan-500 to-blue-500 animate-shimmer" />
                      )}
                    </button>
                    <button
                      onClick={() => setRightSidebarTab('build')}
                      className={`relative flex-1 px-4 py-2 text-sm font-medium transition-all duration-200 hover:scale-105 ${
                        rightSidebarTab === 'build'
                          ? 'bg-[#1E1E1E] text-white'
                          : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                      }`}
                    >
                      Build
                      {rightSidebarTab === 'build' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 via-cyan-500 to-blue-500 animate-shimmer" />
                      )}
                      {buildStatus.building && (
                        <span className="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full animate-ping" />
                      )}
                    </button>
                    <button
                      onClick={() => setRightSidebarTab('release')}
                      className={`relative flex-1 px-4 py-2 text-sm font-medium transition-all duration-200 hover:scale-105 ${
                        rightSidebarTab === 'release'
                          ? 'bg-[#1E1E1E] text-white'
                          : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                      }`}
                    >
                      Release
                      {rightSidebarTab === 'release' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 via-cyan-500 to-blue-500 animate-shimmer" />
                      )}
                    </button>
                    <button
                      onClick={() => setRightSidebarTab('git')}
                      className={`relative flex-1 px-4 py-2 text-sm font-medium transition-all duration-200 hover:scale-105 ${
                        rightSidebarTab === 'git'
                          ? 'bg-[#1E1E1E] text-white'
                          : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                      }`}
                    >
                      Git
                      {rightSidebarTab === 'git' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 via-cyan-500 to-blue-500 animate-shimmer" />
                      )}
                    </button>
                  </div>

                  {/* Tab content with fade-in animations */}
                  <div className="flex-1 overflow-hidden">
                    {rightSidebarTab === 'info' && (
                      <div className="h-full overflow-y-auto p-4 animate-fadeIn">
                        <DoorInfo metadata={doorMetadata} />
                      </div>
                    )}

                    {rightSidebarTab === 'code' && (
                      <div className="h-full animate-fadeIn" data-tour="code-editor">
                        <CodeEditor
                          files={doorFiles}
                          currentFile={currentFile}
                          onFileSelect={handleFileSelect}
                          onFileChange={handleFileChange}
                          theme={settings.editorTheme}
                          fontSize={settings.editorFontSize}
                        />
                      </div>
                    )}

                    {rightSidebarTab === 'build' && (
                      <div className="h-full animate-fadeIn">
                        <BuildStatusEnhanced
                          status={buildStatus}
                          onErrorClick={handleBuildErrorClick}
                        />
                      </div>
                    )}

                    {rightSidebarTab === 'release' && (
                      <div className="h-full overflow-y-auto p-4 animate-fadeIn">
                        <ReleaseArchive
                          doorName={selectedDoor?.name || 'door'}
                          onCreateArchive={handleCreateArchive}
                        />
                      </div>
                    )}

                    {rightSidebarTab === 'git' && (
                      <div className="h-full overflow-y-auto p-4 animate-fadeIn">
                        <GitIntegration
                          doorPath={selectedDoor?.id || ''}
                          onCommit={(message) => {
                            soundEffects.success();
                            toast.success('Committed!', message);
                          }}
                          onPush={() => {
                            soundEffects.success();
                            toast.success('Pushed!', 'Changes pushed to remote');
                          }}
                          onPull={() => {
                            soundEffects.notification();
                            toast.info('Pulled!', 'Updates pulled from remote');
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </Panel>
            </>
          )}
        </PanelGroup>
      </div>

      {/* Settings modal */}
      {showSettings && (
        <Settings
          settings={settings}
          onSettingsChange={setSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Enhanced Game Wizard modal */}
      {showGameWizard && (
        <EnhancedGameWizard
          onClose={() => setShowGameWizard(false)}
          onGameCreated={(doorId) => {
            // Reload doors list, select the new door, and launch it
            loadDoors().then(() => {
              const newDoor = doors.find((d) => d.id === doorId);
              if (newDoor) {
                handleDoorSelect(newDoor);
                // Trigger celebration for game creation!
                setCelebrationMessage('🎮 Game Created!');
                setShowSuccessCelebration(true);
                // Auto-launch the newly created game after a brief delay
                setTimeout(() => {
                  handleRunDoor();
                  toast.success('Game launched!', `${newDoor.name} is now running`);
                }, 500);
              }
            });
          }}
        />
      )}

      {/* Theme Selector Modal */}
      {showThemeSelector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#252526] rounded-lg shadow-2xl p-6 max-w-2xl w-full mx-4 border border-gray-700">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-white">Select Theme</h2>
              <button
                onClick={() => setShowThemeSelector(false)}
                className="text-gray-400 hover:text-white text-3xl leading-none"
              >
                ×
              </button>
            </div>
            <ThemeSelector
              currentTheme={settings.theme}
              onThemeChange={(theme) => {
                setSettings({ ...settings, theme: theme.id });
                soundEffects.click();
                toast.success('Theme changed!', `Switched to ${theme.name}`);
                setShowThemeSelector(false);
              }}
            />
          </div>
        </div>
      )}

      {/* Performance Profiler */}
      {showPerformanceProfiler && (
        <div className="fixed top-4 right-4 z-40">
          <PerformanceProfiler
            onClose={() => setShowPerformanceProfiler(false)}
          />
        </div>
      )}

      {/* Toast notifications */}
      <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />

      {/* Connection status banner */}
      <ConnectionBanner status={connectionStatus} />

      {/* Keyboard shortcut overlay */}
      {showKeyboardOverlay && (
        <KeyboardOverlay
          shortcuts={allShortcuts}
          onClose={() => setShowKeyboardOverlay(false)}
        />
      )}

      {/* Command Palette */}
      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        commands={commandPaletteCommands}
      />

      {/* Success Celebration */}
      <SuccessCelebration
        trigger={showSuccessCelebration}
        message={celebrationMessage}
        type="build"
        onComplete={() => setShowSuccessCelebration(false)}
      />

      {/* Quick Actions Floating Button */}
      <div data-tour="quick-actions">
        <QuickActions
          position="bottom-right"
          actions={[
            {
              id: 'create',
              label: 'Create Game',
              icon: <Wand2 className="w-5 h-5" />,
              color: 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white',
              action: () => {
                setShowGameWizard(true);
                soundEffects.click();
              },
            },
            {
              id: 'run',
              label: 'Run Door',
              icon: <Play className="w-5 h-5" />,
              color: 'bg-green-600 hover:bg-green-700 text-white',
              action: handleRunDoor,
            },
            {
              id: 'build',
              label: 'Build Door',
              icon: <Hammer className="w-5 h-5" />,
              color: 'bg-blue-600 hover:bg-blue-700 text-white',
              action: handleBuildDoor,
            },
            {
              id: 'screenshot',
              label: 'Screenshot',
              icon: <Camera className="w-5 h-5" />,
              color: 'bg-gray-600 hover:bg-gray-700 text-white',
              action: () => {
                soundEffects.click();
              },
            },
          ]}
        />
      </div>

      {/* Haptic Feedback Wrapper */}
      <HapticFeedback type="pulse" trigger={hapticTrigger}>
        <div />
      </HapticFeedback>

      {/* Onboarding Tour */}
      {!showOnboarding && (
        <OnboardingTour
          steps={onboardingSteps}
          onComplete={() => {
            setShowOnboarding(true);
            soundEffects.success();
          }}
          onSkip={() => {
            setShowOnboarding(true);
            soundEffects.click();
          }}
          autoStart={true}
        />
      )}

      {/* Status Bar */}
      <StatusBar
        currentFile={currentFile?.path}
        lineCount={currentFile?.content?.split('\n').length}
        errorCount={buildStatus.errors.length}
        warningCount={buildStatus.warnings.length}
        buildTime={buildStatus.duration}
        connected={connectionStatus.connected}
      />

      {/* Code Diff Viewer */}
      {showDiffViewer && diffData && (
        <CodeDiffViewer
          original={diffData.original}
          suggested={diffData.suggested}
          filePath={diffData.filePath}
          explanation={diffData.explanation}
          onAccept={() => {
            handleApplyCode(diffData.suggested, diffData.filePath);
            setShowDiffViewer(false);
          }}
          onReject={() => {
            setShowDiffViewer(false);
            toast.info('Changes rejected', 'No modifications were made');
          }}
          onClose={() => setShowDiffViewer(false)}
        />
      )}
    </div>
  );
}

export default App;
