# AmiExpress Web - Modern BBS Implementation

A modern web-based implementation of the classic AmiExpress BBS (Bulletin Board System) software, originally developed for the Amiga platform. This project brings traditional BBS functionality to the web with conferences, file areas, doors, and real-time ANSI terminal interface.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm
- Modern web browser

### Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/spotlesscoder/amiexpress-web.git
   cd amiexpress-web
   ```

2. **Install dependencies:**
   ```bash
   npm install
   cd amiexpress-web && npm install
   cd ../backend && npm install
   cd ..
   ```

3. **Start development servers:**
   ```bash
   npm run dev
   ```

   This will start both frontend (http://localhost:5173) and backend (http://localhost:3001) servers with hot reload enabled.

### Alternative Commands

```bash
# Start both servers (recommended)
npm run dev

# Start individual servers
npm run dev:frontend    # Frontend only (Vite)
npm run dev:backend     # Backend only (Node.js)

# Kill running dev servers
npm run kill-dev
```

## 🎯 Current Status

### ✅ **Fully Implemented Features**

#### **Authentic BBS User Journey** (1:1 Recreation of AmiExpress)
- **Login Flow**: Bulletin display → Conference scan → Main menu (mirroring `processLoggedOnUser` substates)
- **State Management**: Proper BBS state machine (`STATE_AWAIT` → `STATE_LOGON` → `STATE_LOGGEDON`)
- **Command System**: Single-letter commands (R, A, J, F, O, G, ?, etc.) matching `internalCommandX` functions

#### **Core BBS Systems**
- **Conference System**: Join conferences and message bases (references `joinConf`, `confScan`)
- **Bulletin Display**: System bulletins (`SCREEN_BULL`) and node bulletins (`SCREEN_NODE_BULL`)
- **Dynamic Prompts**: Menu prompts showing current conference and time remaining (`displayMenuPrompt`)
- **Real-time Communication**: Socket.io for live BBS interaction

#### **Enhanced Message System** (Based on AmiExpress v5.6.0)
- **Private Messaging**: Send private messages to specific users (`E` command)
- **Message Threading**: Reply to messages with parent-child relationships
- **Message Filtering**: Private messages only visible to sender/recipient
- **Rich Message Display**: Shows private indicators, reply indicators, and timestamps

#### **Advanced File Areas** (1:1 with AmiExpress DIR structure)
- **Conference-Specific Areas**: File areas organized by conference (like AmiExpress DIR1, DIR2, etc.)
- **File Status Display**: Upload/download statistics per conference (`FS` command)
- **New Files Scanning**: Find files since last login or specific date (`N` command)
- **Directory Navigation**: Interactive file area selection with parameters
- **FILE_ID.DIZ Support**: Automatic description extraction from archive metadata

#### **User Management & Monitoring**
- **Online Users Display**: Real-time list of active users with idle times (`O` command)
- **Session Tracking**: Activity monitoring and time remaining display
- **Multi-User Support**: Concurrent sessions with proper isolation

#### **Technical Features**
- **Hot Reload**: Both frontend (Vite) and backend (tsx) support live reloading
- **Concurrent Development**: Run frontend and backend simultaneously
- **Process Management**: Automatic cleanup of running dev servers

### 🎮 **How to Use**

1. **Open** http://localhost:5173 in your browser
2. **Login** with any username/password (currently accepts all logins)
3. **Experience the authentic flow**:
   - View system bulletins
   - See conference scan results
   - Join the General conference automatically
   - Use single-letter commands in the main menu

#### **Available Commands**
- `R` - Read Messages (shows private indicators and threading)
- `A` - Post Public Message
- `E` - Post Private Message (enhanced from AmiExpress)
- `J` - Join Conference
- `JM` - Join Message Base
- `F` - File Areas (with DIR selection)
- `FR` - File Areas Reverse
- `FS` - File Status (per-conference statistics)
- `N` - New Files Since Date
- `O` - Online Users (real-time with idle times)
- `T` - System Time & Uptime
- `G` - Goodbye (Logout)
- `?` - Help/Command List

### 📋 **Development Roadmap**

#### **High Priority**
- [ ] Message reading and posting system
- [ ] File upload/download with FILE_ID.DIZ support
- [ ] User account persistence (currently in-memory only)
- [ ] Conference/message base data storage

#### **Medium Priority**
- [ ] Door game integration
- [ ] Private messaging system
- [ ] User statistics and profiles
- [ ] Tagwall system

#### **Future Enhancements**
- [ ] Full door game support
- [ ] Enhanced file area management
- [ ] User time limits and session management
- [ ] Sysop tools and administration interface
- [ ] Protocol support (ZModem, FTP, etc.)

## 🛠 **Technology Stack**

- **Frontend**: React 19, TypeScript, Vite, xterm.js, Socket.io client
- **Backend**: Node.js, Express, Socket.io, TypeScript
- **Database**: File-based storage (JSON/text files) - no external DB required
- **Real-time**: Socket.io with WebSocket support
- **Development**: Concurrent dev servers with hot reload

## 📚 **Project Structure**

- **AmiExpress/**: Original Amiga E source code for reference
- **amiexpress-web/**: Modern React web interface
- **backend/**: Node.js server with BBS logic
- **doors/**: Collection of BBS door games and utilities

## 🤝 **Contributing**

The project is in active development. Current focus is on completing core BBS functionality while maintaining 1:1 compatibility with the original AmiExpress user experience.

## 📄 **License**

ISC License - see LICENSE files in respective directories.

---

*Built with ❤️ for preserving classic BBS culture in the modern web era*