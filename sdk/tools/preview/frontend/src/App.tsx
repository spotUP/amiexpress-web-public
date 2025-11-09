import { useState, useRef, useEffect } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import {
  Terminal,
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
} from './components';
import { useWebSocket, useLocalStorage, useKeyboardShortcuts } from './hooks';
import { useToast } from './hooks/useToast';
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
import { ChevronLeft, ChevronRight, Play, Hammer, Keyboard } from 'lucide-react';

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

  // State management
  const [settings, setSettings] = useLocalStorage<AppSettings>('sdk-preview-settings', defaultSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [showGameWizard, setShowGameWizard] = useState(false);
  const [showKeyboardOverlay, setShowKeyboardOverlay] = useState(false);
  const [doorsLoading, setDoorsLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    connected: false,
    reconnecting: false,
    error: null,
    lastConnected: null,
  });

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
    '\x1b[36m║                    \x1b[37mAmiExpress SDK - Door Preview System\x1b[36m                    ║\x1b[0m',
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
  const [rightSidebarTab, setRightSidebarTab] = useState<'code' | 'build' | 'info' | 'release'>('info');

  // Favorites management
  const [_favorites, setFavorites] = useLocalStorage<string[]>('sdk-preview-favorites', []);

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
        }
      } else {
        toast.error('Failed to load doors', response.statusText);
        console.error('Failed to load doors:', response.statusText);
      }
    } catch (error) {
      toast.error('Error loading doors', error instanceof Error ? error.message : 'Unknown error');
      console.error('Error loading doors:', error);
    } finally {
      setDoorsLoading(false);
    }
  };

  // WebSocket connection
  const { status: wsStatus, send: wsSend } = useWebSocket({
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
          } else {
            toast.error('Build failed', `${message.data.errors.length} error${message.data.errors.length !== 1 ? 's' : ''} found`);
          }
        }
        break;

      case 'error':
        setTerminalOutput((prev) => [...prev, `\x1b[31mError: ${message.data}\x1b[0m`]);
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
    setTerminalOutput((prev) => [...prev, `$ ${input}`]);
    wsSend({ type: 'input', data: input });
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
    wsSend({ type: 'input', data: `createArchive:${JSON.stringify(options)}` });
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
    }
  };

  // Handle build door
  const handleBuildDoor = () => {
    if (selectedDoor) {
      setBuildStatus((prev) => ({ ...prev, building: true }));
      wsSend({ type: 'input', data: `buildDoor:${selectedDoor.id}` });
      toast.info('Building door...', `Compiling ${selectedDoor.name}`);
    }
  };

  // Keyboard shortcuts
  const allShortcuts = [
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
  ];

  useKeyboardShortcuts(
    allShortcuts.map(({ category, ...rest }) => rest),
    settings.enableKeyboardShortcuts
  );

  // Apply theme to body
  useEffect(() => {
    document.body.className = settings.theme === 'dark' ? 'dark bg-[#1E1E1E]' : 'light bg-white';
  }, [settings.theme]);

  return (
    <div className="h-screen flex flex-col bg-[#1E1E1E] text-white">
      {/* Header */}
      <Header
        theme={settings.theme}
        onThemeToggle={handleThemeToggle}
        connectionStatus={connectionStatus}
        onSettingsClick={() => setShowSettings(true)}
      />

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        <PanelGroup direction="horizontal">
          {/* Left sidebar - Door list */}
          {showLeftSidebar && (
            <>
              <Panel defaultSize={20} minSize={15} maxSize={30}>
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
              </Panel>
              <PanelResizeHandle className="w-1 bg-gray-700 hover:bg-blue-600 transition-colors" />
            </>
          )}

          {/* Center - Terminal */}
          <Panel defaultSize={50} minSize={30}>
            <div className="flex flex-col h-full">
              {/* Terminal toolbar */}
              <div className="bg-[#252526] border-b border-gray-700 px-4 py-2 flex items-center gap-2">
                {!showLeftSidebar && (
                  <button
                    onClick={() => setShowLeftSidebar(true)}
                    className="p-1 hover:bg-gray-700 rounded transition-colors"
                    title="Show sidebar"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}
                {showLeftSidebar && (
                  <button
                    onClick={() => setShowLeftSidebar(false)}
                    className="p-1 hover:bg-gray-700 rounded transition-colors"
                    title="Hide sidebar"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                )}

                <div className="h-4 w-px bg-gray-700" />

                <button
                  onClick={handleRunDoor}
                  disabled={!selectedDoor}
                  className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded transition-colors"
                >
                  <Play className="w-4 h-4" />
                  <span className="hidden sm:inline">Run</span>
                </button>

                <button
                  onClick={handleBuildDoor}
                  disabled={!selectedDoor || buildStatus.building}
                  className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded transition-colors"
                >
                  <Hammer className="w-4 h-4" />
                  <span className="hidden sm:inline">Build</span>
                </button>

                <div className="ml-auto flex items-center gap-2">
                  <ScreenshotCapture
                    targetElement={terminalRef.current}
                    doorName={selectedDoor?.name || 'terminal'}
                  />

                  {!showRightSidebar && (
                    <button
                      onClick={() => setShowRightSidebar(true)}
                      className="p-1 hover:bg-gray-700 rounded transition-colors"
                      title="Show sidebar"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                  )}
                  {showRightSidebar && (
                    <button
                      onClick={() => setShowRightSidebar(false)}
                      className="p-1 hover:bg-gray-700 rounded transition-colors"
                      title="Hide sidebar"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Terminal */}
              <div ref={terminalRef} className="flex-1">
                <Terminal
                  output={terminalOutput}
                  onInput={handleTerminalInput}
                  autoScroll={settings.autoScroll}
                  fontSize={settings.terminalFontSize}
                  recorder={recorder}
                />
              </div>

              {/* Session recorder controls */}
              <SessionRecorder
                recorder={recorder}
                doorName={selectedDoor?.name || 'door'}
                onPlaybackEvent={handlePlaybackEvent}
              />
            </div>
          </Panel>

          {/* Right sidebar - Code editor / Build status / Info */}
          {showRightSidebar && (
            <>
              <PanelResizeHandle className="w-1 bg-gray-700 hover:bg-blue-600 transition-colors" />
              <Panel defaultSize={30} minSize={20} maxSize={50}>
                <div className="flex flex-col h-full bg-[#252526]">
                  {/* Tabs */}
                  <div className="flex border-b border-gray-700">
                    <button
                      onClick={() => setRightSidebarTab('info')}
                      className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                        rightSidebarTab === 'info'
                          ? 'bg-[#1E1E1E] text-white border-b-2 border-blue-600'
                          : 'text-gray-400 hover:text-white hover:bg-gray-700'
                      }`}
                    >
                      Info
                    </button>
                    <button
                      onClick={() => setRightSidebarTab('code')}
                      className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                        rightSidebarTab === 'code'
                          ? 'bg-[#1E1E1E] text-white border-b-2 border-blue-600'
                          : 'text-gray-400 hover:text-white hover:bg-gray-700'
                      }`}
                    >
                      Code
                    </button>
                    <button
                      onClick={() => setRightSidebarTab('build')}
                      className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                        rightSidebarTab === 'build'
                          ? 'bg-[#1E1E1E] text-white border-b-2 border-blue-600'
                          : 'text-gray-400 hover:text-white hover:bg-gray-700'
                      }`}
                    >
                      Build
                    </button>
                    <button
                      onClick={() => setRightSidebarTab('release')}
                      className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                        rightSidebarTab === 'release'
                          ? 'bg-[#1E1E1E] text-white border-b-2 border-blue-600'
                          : 'text-gray-400 hover:text-white hover:bg-gray-700'
                      }`}
                    >
                      Release
                    </button>
                  </div>

                  {/* Tab content */}
                  <div className="flex-1 overflow-hidden">
                    {rightSidebarTab === 'info' && (
                      <div className="h-full overflow-y-auto p-4">
                        <DoorInfo metadata={doorMetadata} />
                      </div>
                    )}

                    {rightSidebarTab === 'code' && (
                      <CodeEditor
                        files={doorFiles}
                        currentFile={currentFile}
                        onFileSelect={handleFileSelect}
                        onFileChange={handleFileChange}
                        theme={settings.editorTheme}
                        fontSize={settings.editorFontSize}
                      />
                    )}

                    {rightSidebarTab === 'build' && (
                      <BuildStatusEnhanced
                        status={buildStatus}
                        onErrorClick={handleBuildErrorClick}
                      />
                    )}

                    {rightSidebarTab === 'release' && (
                      <div className="h-full overflow-y-auto p-4">
                        <ReleaseArchive
                          doorName={selectedDoor?.name || 'door'}
                          onCreateArchive={handleCreateArchive}
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
    </div>
  );
}

export default App;
