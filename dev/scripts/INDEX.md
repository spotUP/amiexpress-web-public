# Scripts Quick Index

Fast reference for finding scripts.

## By Task

### Deployment
| Script | Purpose | Usage |
|--------|---------|-------|
| deploy.sh | Full deployment with validation | `./Scripts/deployment/deploy.sh` |
| deploy-production.sh | Production Render.com deployment | `./Scripts/deployment/deploy-production.sh` |
| deploy-vercel.sh | Frontend Vercel deployment | `./Scripts/deployment/deploy-vercel.sh` |
| deploy-quick.sh | Quick deploy, skip checks | `./Scripts/deployment/deploy-quick.sh` |
| deploy-status.sh | Check Render.com status | `./Scripts/deployment/deploy-status.sh` |
| deploy-logs.sh | Fetch Render.com logs | `./Scripts/deployment/deploy-logs.sh` |

### Build & Compilation
| Script | Purpose | Usage |
|--------|---------|-------|
| build-wasm.sh | Build Moira WASM emulator | `./Scripts/build/build-wasm.sh` |

### ARexx BBS Scripts

#### System Scripts
- welcome.rexx - Welcome message
- newuser.rexx - New user handler
- logout.rexx - Logout handler
- stats.rexx - Statistics
- time_of_day.rexx - Time greetings

#### User Management
- user_management.rexx - User admin
- advanced_stats.rexx - Advanced stats

#### Demos & Examples
- arg_demo.rexx - Argument parsing
- door_menu_demo.rexx - Door menus
- file_operations.rexx - File I/O
- interpret_demo.rexx - Dynamic execution
- loops_demo.rexx - Loop examples
- parse_demo.rexx - String parsing
- procedure_demo.rexx - Procedures
- select_demo.rexx - Selection
- signal_demo.rexx - Signal handling
- trace_demo.rexx - Debugging

## By Category

### deployment/ (6 scripts)
Shell scripts for deploying to production, staging, and checking status.

### arexx/ (18 scripts)
ARexx scripts for BBS automation and door development.

### build/ (1 script)
Build and compilation automation.

## Common Tasks

**Deploy everything to production:**
```bash
./Scripts/deployment/deploy-production.sh
```

**Deploy frontend only:**
```bash
./Scripts/deployment/deploy-vercel.sh
```

**Check if deployment succeeded:**
```bash
./Scripts/deployment/deploy-status.sh
```

**Rebuild WASM emulator:**
```bash
cd backend/src/amiga-emulation/cpu
../../../../Scripts/build/build-wasm.sh
```

**Test ARexx script:**
1. Copy to `backend/scripts/`
2. Run via BBS system

## File Locations

All scripts are in `~/Code/AmiExpress-Web/Scripts/`

Original locations preserved when needed:
- build-wasm.sh is copied (also in original location for build process)
- ARexx scripts moved from backend/scripts/

## See Also

- [Scripts README](README.md) - Full documentation
- [Deployment Documentation](../Docs/DEPLOYMENT.md)
- [ARexx Documentation](../Docs/AREXX_DOCUMENTATION.md)
