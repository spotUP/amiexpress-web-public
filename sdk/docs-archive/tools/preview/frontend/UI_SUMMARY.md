# AmiExpress SDK Preview - Modern React UI

## Overview

A complete, professional React-based UI for the AmiExpress SDK Preview system with 3,260+ lines of TypeScript code across 23 files. This modern development tool provides a comprehensive environment for creating, testing, and releasing BBS doors.

## Architecture

### Project Structure

```
src/
├── types/           - TypeScript type definitions
├── hooks/           - Custom React hooks
├── utils/           - Utility functions
├── components/      - React UI components
├── App.tsx          - Main application component
├── main.tsx         - Entry point
└── index.css        - Global styles
```

## Files Created

### 1. Type Definitions (`/types/index.ts`)

**Purpose**: Central type definitions for the entire application

**Key Types**:
- `DoorMetadata` - Door package information
- `DoorFile` - File tree structure
- `BuildError` & `BuildStatus` - Build system types
- `SessionEvent` & `SessionRecording` - Session recording types
- `AppSettings` - Application configuration
- `WebSocketMessage` - WebSocket message protocol
- `ConnectionStatus` - Connection state management
- `DoorListItem` - Door list items
- `ArchiveOptions` - Release archive configuration
- `KeyboardShortcut` - Keyboard shortcut definitions

### 2. Custom Hooks

#### `/hooks/useWebSocket.ts`
**Purpose**: WebSocket connection management with auto-reconnect

**Features**:
- Automatic reconnection with exponential backoff
- Type-safe message handling
- Connection status tracking
- Error recovery
- Configurable reconnect attempts and intervals

#### `/hooks/useLocalStorage.ts`
**Purpose**: Persistent state management in localStorage

**Features**:
- Type-safe localStorage access
- Automatic JSON serialization
- Error handling
- Support for multiple keys
- React state synchronization

#### `/hooks/useKeyboardShortcuts.ts`
**Purpose**: Global keyboard shortcut handling

**Features**:
- Modifier key support (Ctrl, Shift, Alt)
- Preventable default behavior
- Enable/disable toggle
- Pre-defined shortcut definitions

**Default Shortcuts**:
- `Ctrl+S` - Take screenshot
- `Ctrl+R` - Start/stop recording
- `Ctrl+Shift+S` - Save file
- `Ctrl+B` - Build door
- `Ctrl+Shift+T` - Toggle theme
- `Ctrl+\`` - Toggle debug console
- `Ctrl+F` - Search files
- `Ctrl+,` - Open settings

### 3. Utility Functions

#### `/utils/ansi.ts`
**Purpose**: ANSI escape code handling for terminal output

**Features**:
- Convert ANSI to HTML with styling
- Strip ANSI codes from text
- Parse ANSI into styled segments
- Support for colors, bold, italic, underline
- Custom color palette

#### `/utils/screenshot.ts`
**Purpose**: Terminal screenshot capture using html2canvas

**Features**:
- High-DPI capture (2x scale)
- PNG/JPG format support
- Automatic download
- Preview generation
- Timestamped filenames

#### `/utils/sessionRecording.ts`
**Purpose**: Session recording and playback system

**Classes**:
- `SessionRecorder` - Records terminal sessions with timestamps
- `PlaybackController` - Plays back recorded sessions with speed control

**Features**:
- Event-based recording (input/output)
- Export to JSON or plain text
- Import from JSON
- Playback speed control (0.5x, 1x, 2x, 4x)
- Seek to timestamp
- Timeline navigation

#### `/utils/format.ts`
**Purpose**: Formatting utilities

**Functions**:
- `formatBytes()` - Human-readable file sizes
- `formatTimestamp()` - Localized timestamps
- `formatDuration()` - ms to human-readable duration
- `formatRelativeTime()` - Relative time ("2 hours ago")
- `truncate()` - String truncation with ellipsis
- `formatVersion()` - Version string formatting

### 4. UI Components

#### `/components/Terminal.tsx`
**Purpose**: ANSI-capable terminal with input/output

**Features**:
- Full ANSI color support
- Command history (up/down arrows)
- Auto-scroll with manual override
- Keyboard input handling
- Session recording integration
- Configurable font size
- Click-to-focus

#### `/components/CodeEditor.tsx`
**Purpose**: Monaco-based code editor with file browser

**Features**:
- Monaco Editor integration (VS Code engine)
- File tree navigation
- Syntax highlighting (TypeScript, JavaScript, JSON, Markdown, CSS, HTML)
- Read-only mode
- Live editing
- Folder expand/collapse
- File icons and selection state

#### `/components/BuildStatus.tsx`
**Purpose**: TypeScript build status and error display

**Features**:
- Real-time build status
- Error and warning display
- Clickable errors to jump to code
- Build duration and timestamp
- Color-coded severity (error/warning/info)
- Animated building indicator

#### `/components/ScreenshotCapture.tsx`
**Purpose**: Terminal screenshot capture with preview

**Features**:
- Capture button with keyboard shortcut
- Preview modal before download
- Download with custom filename
- Metadata in filename (door name, timestamp)
- Loading state

#### `/components/SessionRecorder.tsx`
**Purpose**: Session recording controls and playback UI

**Features**:
- Record/stop controls
- Playback with play/pause/stop
- Speed controls (0.5x, 1x, 2x, 4x)
- Timeline scrubber
- Export to JSON or text
- Import recordings
- Event count and duration display

#### `/components/ReleaseArchive.tsx`
**Purpose**: Create release archives for door distribution

**Features**:
- Format selection (.zip or .lha)
- Include/exclude options (source, assets, docs)
- Doorman compatibility mode
- Loading state during creation
- Preview of archive contents

#### `/components/DoorInfo.tsx`
**Purpose**: Display door metadata and statistics

**Features**:
- Package details (name, version, author, description)
- File statistics (count, total size)
- Last modified timestamp
- Dependencies list
- Entry point display
- Build status indicator
- Door type badge (TypeScript/JavaScript/Amiga)

#### `/components/Header.tsx`
**Purpose**: Application header with controls

**Features**:
- Logo and branding
- Theme toggle (dark/light)
- Connection status indicator
- Settings button
- Responsive design

#### `/components/DoorList.tsx`
**Purpose**: Sidebar door browser with search and filters

**Features**:
- Search by name, description, or author
- Filter tabs (All, Favorites, Recent)
- Thumbnail support
- Favorite toggle (star icon)
- Last opened timestamp
- Door metadata display
- Selection state

#### `/components/Settings.tsx`
**Purpose**: Settings modal for app configuration

**Features**:
- Theme selection (dark/light)
- Editor theme (vs-dark/vs-light)
- Font size sliders (terminal and editor)
- Auto-scroll toggle
- Line numbers toggle
- Keyboard shortcuts toggle
- Playback speed presets
- Keyboard shortcuts reference

### 5. Main Application (`/App.tsx`)

**Purpose**: Main application component with layout orchestration

**Features**:
- Resizable panel layout using `react-resizable-panels`
- Three-panel design: doors list, terminal, sidebar
- Collapsible sidebars
- Tab-based right sidebar (Info, Code, Build, Release)
- WebSocket integration
- State management for all features
- Keyboard shortcut handling
- Theme management
- Connection status tracking
- Door selection and management
- Build status monitoring
- Session recording control

**Layout Structure**:
```
┌─────────────────────────────────────────────────────────────┐
│ Header (Theme, Connection, Settings)                        │
├──────────┬────────────────────────────┬─────────────────────┤
│          │                            │                     │
│  Door    │  Terminal                  │  Sidebar            │
│  List    │  + Output                  │  ├─ Info            │
│          │  + Input                   │  ├─ Code Editor     │
│  Search  │                            │  ├─ Build Status    │
│  Filter  │  Toolbar:                  │  └─ Release         │
│          │  - Run/Build buttons       │                     │
│          │  - Screenshot              │                     │
│          │                            │                     │
├──────────┴────────────────────────────┴─────────────────────┤
│ Session Recorder Controls                                   │
│ (Record, Play, Speed, Export)                               │
└─────────────────────────────────────────────────────────────┘
```

### 6. Styling (`/index.css`)

**Purpose**: Global styles and theme definitions

**Features**:
- Tailwind CSS integration
- Dark and light mode support
- Custom scrollbar styling
- Smooth transitions
- Monaco Editor customization
- Range input styling
- Checkbox styling
- Animation keyframes
- Print styles
- Accessibility focus styles

## Technology Stack

### Core
- React 18.2
- TypeScript 5.3
- Vite 5.0

### UI Libraries
- Tailwind CSS 3.3
- react-resizable-panels 1.0.9
- lucide-react 0.294 (icons)
- @radix-ui/react-* (UI primitives)

### Specialized
- @monaco-editor/react 4.6 (code editor)
- ansi-to-html 0.7.2 (terminal ANSI rendering)
- html2canvas 1.4.1 (screenshots)

## Key Features Summary

### 1. Dark/Light Mode
- Persistent theme storage
- Smooth transitions
- Synchronized editor theme
- System-wide color scheme

### 2. Responsive Layout
- Resizable panels
- Collapsible sidebars
- Mobile-friendly breakpoints
- Touch support

### 3. Terminal
- Full ANSI color support
- Command history
- Auto-scroll with override
- Session recording
- Screenshot capture

### 4. Code Editor
- VS Code-like experience
- File tree navigation
- Multi-language syntax highlighting
- Live editing
- Read-only mode

### 5. Build System
- Real-time status
- Error/warning display
- Click-to-navigate errors
- Build metrics

### 6. Session Recording
- Record all terminal I/O
- Export to JSON or text
- Playback with speed control
- Timeline navigation
- Import/export

### 7. Screenshot System
- High-quality captures
- Preview before download
- Custom filenames
- Keyboard shortcut

### 8. Release Archives
- Multiple formats (.zip, .lha)
- Doorman compatibility
- Selective file inclusion
- Metadata generation

### 9. Keyboard Shortcuts
- Global shortcut system
- Configurable shortcuts
- Visual reference in settings
- Enable/disable toggle

### 10. Door Management
- Search and filter
- Favorites system
- Recent doors
- Metadata display

## File Statistics

- **Total Files**: 23
- **Total Lines**: 3,260+ lines of TypeScript/TSX
- **Components**: 10
- **Hooks**: 3
- **Utilities**: 4
- **Type Definitions**: 15+ interfaces

## Usage

### Starting the Application

```bash
cd /home/user/amiexpress-web/sdk/tools/preview/frontend
npm install
npm run dev
```

### Building for Production

```bash
npm run build
```

### Features to Implement on Backend

The UI expects these WebSocket message types:

1. **doorList** - List of available doors
2. **doorMetadata** - Selected door metadata
3. **fileContent** - Door file tree and content
4. **buildStatus** - Build results and errors
5. **output** - Terminal output
6. **error** - Error messages

### WebSocket Message Protocol

```typescript
// Client → Server
{
  type: 'input',
  data: 'command or action',
  timestamp: Date.now()
}

// Server → Client
{
  type: 'output' | 'doorList' | 'doorMetadata' | 'buildStatus' | 'error',
  data: any,
  timestamp: Date.now()
}
```

## Design Principles

1. **Professional**: Modern UI that looks like a professional development tool
2. **Responsive**: Works on desktop, tablet, and mobile
3. **Accessible**: Keyboard navigation, focus management, ARIA labels
4. **Performant**: Optimized rendering, lazy loading, efficient state updates
5. **Type-Safe**: Full TypeScript coverage with strict typing
6. **Extensible**: Modular architecture for easy feature additions

## Future Enhancements

- Performance metrics display (FPS, memory)
- Collaborative editing
- Git integration
- Diff viewer
- Test runner integration
- Door marketplace browser
- AI code assistant
- Debugger integration

## Color Scheme

### Dark Mode (Default)
- Background: `#1E1E1E`
- Panel: `#252526`
- Border: `#3E3E42`
- Text: `#CCCCCC`
- Accent: `#3B82F6` (blue)

### Light Mode
- Background: `#FFFFFF`
- Panel: `#F3F4F6`
- Border: `#E5E7EB`
- Text: `#1F2937`
- Accent: `#3B82F6` (blue)

## Icons

Using Lucide React icon set for consistency:
- Modern, clean design
- Consistent sizing
- Customizable colors
- Tree-shakeable

## Accessibility

- Keyboard navigation support
- Focus indicators
- ARIA labels
- Screen reader support
- High contrast mode compatible
- Configurable font sizes

---

**Created**: November 8, 2025
**Version**: 1.0.0
**License**: MIT
**Author**: AmiExpress Development Team
