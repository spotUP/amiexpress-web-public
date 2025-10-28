# Scripts Directory

This directory contains all operational scripts for the AmiExpress-Web project.

## Available Scripts

### Development Scripts

#### `start-dev.sh`
**Full-featured development startup script**
- Starts both backend and frontend servers
- Checks prerequisites (Node.js, npm, SQLite)
- Cleans up existing processes
- Creates necessary environment files
- Installs dependencies
- Provides detailed status output
- Opens browser automatically
- Saves PIDs for stop script

**Usage:**
```bash
./Scripts/start-dev.sh
```

**Features:**
- ✓ Comprehensive error checking
- ✓ Automatic port cleanup
- ✓ Health checks
- ✓ Colored output
- ✓ Progress indicators
- ✓ Automatic browser launch

---

#### `start-backend.sh`
**Standalone backend startup**
- Starts only the backend server on port 3001
- Kills any existing processes on port 3001
- Verifies successful startup

**Usage:**
```bash
./Scripts/start-backend.sh
```

---

#### `start-frontend.sh`
**Standalone frontend startup**
- Starts only the frontend server on port 5173
- Kills any existing processes on port 5173
- Verifies successful startup

**Usage:**
```bash
./Scripts/start-frontend.sh
```

---

#### `start-all.sh`
**Simple combined startup**
- Starts both backend and frontend
- Uses start-backend.sh and start-frontend.sh
- Minimal output, quick startup

**Usage:**
```bash
./Scripts/start-all.sh
```

---

#### `stop-dev.sh`
**Stop development servers (graceful)**
- Stops servers using saved PID files
- Falls back to port-based cleanup
- Removes PID files after stopping

**Usage:**
```bash
./Scripts/stop-dev.sh
```

---

#### `stop-all.sh`
**Force stop all servers**
- Kills all processes on ports 3001 and 5173
- Uses kill -9 for immediate termination
- Simple and effective

**Usage:**
```bash
./Scripts/stop-all.sh
```

---

### Conference Management

#### `standardize-conferences.sh`
**Standardize conference directory structures**
- Creates missing subdirectories in Conf1-Conf14
- Adds standard files (Menu.txt, upload/download messages)
- Sets up file areas (Dir0, Dir1, Dir2)
- Idempotent (safe to run multiple times)

**Usage:**
```bash
./Scripts/standardize-conferences.sh
```

**Creates in each conference:**
- Bulletins/, MsgBase/, Hold/
- Upload/, PartUpload/, LCFiles/
- Dir0/, Dir1/, Dir2/
- Menu.txt, downloadmsg.txt, uploadmsg.txt, NDIRS

---

### Deployment Scripts

#### `push-and-deploy.sh`
**Push to GitHub and trigger Render deployment**
- Pushes changes to GitHub
- Automatically triggers Render deployment (if on main branch)
- Handles deployment script execution

**Usage:**
```bash
./Scripts/push-and-deploy.sh [git push arguments]
```

**Examples:**
```bash
./Scripts/push-and-deploy.sh
./Scripts/push-and-deploy.sh origin main
./Scripts/push-and-deploy.sh --force
```

---

## Quick Reference

| Task | Command |
|------|---------|
| Start development environment | `./Scripts/start-dev.sh` |
| Start backend only | `./Scripts/start-backend.sh` |
| Start frontend only | `./Scripts/start-frontend.sh` |
| Start both (simple) | `./Scripts/start-all.sh` |
| Stop development servers | `./Scripts/stop-dev.sh` |
| Force stop all servers | `./Scripts/stop-all.sh` |
| Standardize conferences | `./Scripts/standardize-conferences.sh` |
| Push and deploy | `./Scripts/push-and-deploy.sh` |

---

## Notes

### Port Usage
- **Backend:** 3001
- **Frontend:** 5173 (or 5174 if 5173 is occupied)

### Log Files
When using `start-dev.sh`, logs are written to:
- `logs/backend.log`
- `logs/frontend.log`

### PID Files
The start-dev.sh script saves process IDs to:
- `.backend.pid`
- `.frontend.pid`

These files are located in the project root and are used by stop-dev.sh for graceful shutdown.

### Script Location
All scripts must be run from the project root or using their full path:
```bash
# From project root:
./Scripts/start-dev.sh

# From anywhere:
/path/to/project/Scripts/start-dev.sh
```

The scripts automatically detect the project root and adjust paths accordingly.

---

## Subdirectories

### `deployment/`
Contains deployment-related scripts (e.g., deploy-render.sh)

---

## Making Scripts Executable

If scripts aren't executable, run:
```bash
chmod +x Scripts/*.sh
```

---

## Troubleshooting

### Port Already in Use
If you get "port in use" errors:
```bash
# Kill processes manually
lsof -ti:3001 | xargs kill -9   # Backend
lsof -ti:5173 | xargs kill -9   # Frontend

# Or use the stop script
./Scripts/stop-all.sh
```

### Scripts Not Found
Make sure you're in the project root:
```bash
cd /path/to/amiexpress-web
./Scripts/start-dev.sh
```

### Permission Denied
Make scripts executable:
```bash
chmod +x Scripts/*.sh
```

---

## Development Workflow

**Recommended workflow:**

1. **Start development environment:**
   ```bash
   ./Scripts/start-dev.sh
   ```

2. **Development work...**

3. **Stop when done:**
   ```bash
   ./Scripts/stop-dev.sh
   ```

4. **Push and deploy:**
   ```bash
   ./Scripts/push-and-deploy.sh
   ```

---

## Script Organization

Scripts are organized by purpose:
- **Development**: Local development server management
- **Conference**: BBS conference structure management
- **Deployment**: Production deployment automation

---

**Last Updated:** 2025-10-28
