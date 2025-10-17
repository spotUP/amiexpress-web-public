# AmiExpress Scripts Directory

All project scripts organized by category.

## Directory Structure

```
Scripts/
├── README.md              # This file
├── deployment/            # Deployment automation scripts
├── arexx/                 # ARexx BBS scripts
└── build/                 # Build and compilation scripts
```

## Deployment Scripts

**Location:** `deployment/`

### Main Deployment Scripts
- **deploy.sh** - Main deployment script with full checks and validation
- **deploy-production.sh** - Production deployment to Render.com
- **deploy-vercel.sh** - Frontend deployment to Vercel
- **deploy-quick.sh** - Quick deployment without extensive checks
- **deploy-status.sh** - Check deployment status on Render.com
- **deploy-logs.sh** - Fetch deployment logs from Render.com

### Usage

**Standard Deployment:**
```bash
cd ~/Code/AmiExpress-Web
./Scripts/deployment/deploy.sh
```

**Production Deployment:**
```bash
./Scripts/deployment/deploy-production.sh
```

**Quick Deployment (skip tests):**
```bash
./Scripts/deployment/deploy-quick.sh
```

**Check Status:**
```bash
./Scripts/deployment/deploy-status.sh
```

## ARexx Scripts

**Location:** `arexx/`

ARexx scripts for BBS automation, door menus, and system tasks.

### System Scripts
- **welcome.rexx** - Welcome message for new users
- **newuser.rexx** - New user registration handler
- **logout.rexx** - User logout handler
- **stats.rexx** - Basic statistics display
- **time_of_day.rexx** - Time-based greetings

### Advanced Scripts
- **advanced_phase4.rexx** - Phase 4 advanced features
- **advanced_stats.rexx** - Detailed statistics
- **user_management.rexx** - User administration

### Demonstration Scripts
- **arg_demo.rexx** - Argument parsing examples
- **door_menu_demo.rexx** - Door menu creation
- **file_operations.rexx** - File I/O examples
- **interpret_demo.rexx** - Dynamic code execution
- **loops_demo.rexx** - Loop constructs
- **parse_demo.rexx** - String parsing
- **procedure_demo.rexx** - Procedure definitions
- **select_demo.rexx** - Selection statements
- **signal_demo.rexx** - Signal handling
- **trace_demo.rexx** - Debugging with trace

### Usage

ARexx scripts are executed by the BBS system:
```arexx
/* Example ARexx script */
OPTIONS RESULTS
CALL BBSOUT "Welcome to AmiExpress!"
EXIT
```

## Build Scripts

**Location:** `build/`

### Compilation Scripts
- **build-wasm.sh** - Build Moira CPU emulator to WebAssembly

### Usage

**Build WASM:**
```bash
cd ~/Code/AmiExpress-Web/backend/src/amiga-emulation/cpu
./build-wasm.sh
```

Or from Scripts directory:
```bash
cd ~/Code/AmiExpress-Web
./Scripts/build/build-wasm.sh
```

## Adding New Scripts

When creating new scripts:

1. **Choose the appropriate directory:**
   - `deployment/` - Deployment, CI/CD, release scripts
   - `arexx/` - BBS automation, door scripts
   - `build/` - Compilation, build automation
   - Create new category if needed

2. **Follow naming conventions:**
   - Use lowercase with hyphens: `my-script.sh`
   - Include extension: `.sh`, `.rexx`, `.js`
   - Be descriptive: `deploy-to-staging.sh` not `deploy2.sh`

3. **Make scripts executable:**
   ```bash
   chmod +x Scripts/deployment/my-script.sh
   ```

4. **Add documentation:**
   - Include header comment with description
   - Document parameters and usage
   - Update this README.md

5. **Example script header:**
   ```bash
   #!/bin/bash
   # deploy-staging.sh - Deploy to staging environment
   # Usage: ./deploy-staging.sh [--skip-tests]
   #
   # This script deploys the application to the staging environment
   # with optional test skipping for rapid iteration.
   ```

## Script Guidelines

### Shell Scripts (.sh)

- Use `#!/bin/bash` shebang
- Enable strict mode: `set -euo pipefail`
- Use meaningful variable names
- Quote variables: `"$variable"`
- Check for required tools
- Provide usage help with `-h` flag
- Exit with proper codes (0 = success, 1+ = error)

### ARexx Scripts (.rexx)

- Use `OPTIONS RESULTS` for return values
- Handle errors with `SIGNAL ON ERROR`
- Use meaningful procedure names
- Comment complex logic
- Follow AmiExpress BBS conventions

### Build Scripts

- Check for required dependencies
- Provide clear error messages
- Clean up temporary files
- Log build output
- Support dry-run mode when possible

## Troubleshooting

### Script Not Executable
```bash
chmod +x Scripts/category/script-name.sh
```

### Script Not Found
Ensure you're running from the correct directory or use absolute paths:
```bash
~/Code/AmiExpress-Web/Scripts/deployment/deploy.sh
```

### Permission Denied
Check file permissions and ownership:
```bash
ls -la Scripts/category/script-name.sh
```

## Related Documentation

- [Deployment Guide](../Docs/DEPLOYMENT.md)
- [ARexx Documentation](../Docs/AREXX_DOCUMENTATION.md)
- [Build Documentation](../Docs/backend/amiexpress-docs/)

## Quick Reference

| Task | Script |
|------|--------|
| Deploy to production | `./Scripts/deployment/deploy-production.sh` |
| Deploy frontend only | `./Scripts/deployment/deploy-vercel.sh` |
| Check deployment status | `./Scripts/deployment/deploy-status.sh` |
| View deployment logs | `./Scripts/deployment/deploy-logs.sh` |
| Build WASM emulator | `./Scripts/build/build-wasm.sh` |
| Test ARexx script | Copy to `backend/scripts/` then run via BBS |

