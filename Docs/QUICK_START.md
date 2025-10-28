# AmiExpress-Web Quick Start Guide

**After reorganization - Updated paths for all scripts and directories**

---

## 🚀 Start Development

```bash
# Start both backend and frontend (recommended)
./dev/scripts/start-dev.sh

# Or start individually:
./dev/scripts/start-backend.sh  # Backend only (port 3001)
./dev/scripts/start-frontend.sh # Frontend only (port 5173)
```

---

## 🛑 Stop Development

```bash
# Graceful stop
./dev/scripts/stop-dev.sh

# Force stop all servers
./dev/scripts/stop-all.sh
```

---

## 📁 New Directory Structure

### Traditional BBS Directories (Root Level)
- Access/, Commands/, Conf1-14/, Doors/, HELP/, Languages/, Libs/
- **Screens/** (NEW) - Display screens and ANSI art
- Node0-6/, Protocols/, Storage/, SysopStats/, Utils/, Zoom/

### Modern Components
- **web/** - Modern web application
  - `web/backend/` - Backend server
  - `web/frontend/` - Frontend application
  
- **dev/** - Development resources
  - `dev/docs/` - All documentation
  - `dev/scripts/` - All operational scripts
  - `dev/tools/` - Development tools
  - `dev/archive/` - Archived code

---

## 📚 Documentation

- **[dev/docs/REORGANIZATION_COMPLETE.md](dev/docs/REORGANIZATION_COMPLETE.md)** - Complete reorganization summary
- **[dev/docs/DIRECTORY_STRUCTURE_ANALYSIS.md](dev/docs/DIRECTORY_STRUCTURE_ANALYSIS.md)** - Structure comparison
- **[dev/docs/README.md](dev/docs/README.md)** - Documentation index
- **[dev/scripts/README.md](dev/scripts/README.md)** - Scripts documentation

---

## 🔧 Common Tasks

### Deploy to Production
```bash
./dev/scripts/push-and-deploy.sh
```

### Standardize Conferences
```bash
./dev/scripts/standardize-conferences.sh
```

### Access Logs
```bash
tail -f logs/backend.log
tail -f logs/frontend.log
```

---

## ⚠️ Important Changes

1. **Scripts moved**: Root scripts → `dev/scripts/`
2. **Docs moved**: `Docs/` → `dev/docs/`
3. **Web apps moved**: `backend/` → `web/backend/`, `frontend/` → `web/frontend/`
4. **New directory**: `Screens/` matches authentic AmiExpress structure

---

## 📝 Notes

- Backend runs on http://localhost:3001
- Frontend runs on http://localhost:5173
- Default login: sysop / sysop
- All scripts work from project root

---

For detailed information, see [dev/docs/REORGANIZATION_COMPLETE.md](dev/docs/REORGANIZATION_COMPLETE.md)