# AmiExpress-Web Documentation

## Quick Navigation

Choose your role to find relevant documentation:

- **[Users](#for-users)** - Using the BBS
- **[Sysops](#for-sysops)** - Running the BBS
- **[Developers](#for-developers)** - Contributing code
- **[Door Developers](#for-door-developers)** - Creating doors
- **[Reference](#quick-reference)** - Quick lookups
- **[Reference Sources](#reference-sources)** - Archived reference source bundles

---

## For Users

**New to AmiExpress? Start here:**

📖 **[User Guide](1-Users/USER_GUIDE.md)** - Complete guide to using the BBS (594 lines)
- Getting started
- Login & authentication
- Reading and posting messages
- File uploads/downloads
- Conference management
- Using doors
- Chat and communication
- Customization options
- Keyboard shortcuts

📥 **[Importing Data](1-Users/IMPORTING.md)** - Import from classic Amiga BBS (507 lines)

---

## For Sysops

**Running an AmiExpress BBS:**

### Getting Started
🚀 **[Quick Start Guide](2-Sysops/QUICK_START.md)** - Get running fast (632 lines)
📝 **[Installation Guide](2-Sysops/INSTALLATION.md)** - Set up your BBS
🔧 **[Configuration Guide](2-Sysops/CONFIGURATION.md)** - Configure your system

### Operations
⚙️ **[Administration Guide](2-Sysops/ADMINISTRATION.md)** - Day-to-day management
🌐 **[Deployment Guide](2-Sysops/DEPLOYMENT.md)** - Production deployment
📜 **[Deployment Scripts](2-Sysops/DEPLOYMENT_SCRIPTS.md)** - Automation scripts (743 lines)
🔗 **[Webhooks](2-Sysops/WEBHOOKS.md)** - Webhook configuration (501 lines)
🔧 **[Troubleshooting Guide](2-Sysops/TROUBLESHOOTING.md)** - Common issues

---

## For Developers

**Contributing to AmiExpress-Web:**

### Core Development
🏗️ **[Getting Started](3-Developers/GETTING_STARTED.md)** - Development setup
📐 **[Architecture](3-Developers/ARCHITECTURE.md)** - System design
💾 **[Database](3-Developers/DATABASE.md)** - Database schema and rules
🧪 **[Testing Guide](3-Developers/TESTING_GUIDE.md)** - Complete testing methodology (634 lines)

### Implementation Guides
🎯 **[AREXX Implementation](3-Developers/AREXX_IMPLEMENTATION.md)** - AREXX interpreter (629 lines)
💬 **[Multi-Node Chat](3-Developers/MULTINODE_CHAT.md)** - Chat system architecture (692 lines)
📥 **[Import/Export API](3-Developers/IMPORT_EXPORT_API.md)** - Data migration API (685 lines)
📁 **[DOS File I/O](3-Developers/DOS_FILE_IO.md)** - AmigaOS file operations (495 lines)
🔒 **[Security](3-Developers/SECURITY.md)** - Security patterns (567 lines)
📖 **[AmigaGuide Support](3-Developers/AMIGAGUIDE.md)** - AmigaGuide format (516 lines)
🌐 **[Telnet/SSH Servers](3-Developers/TELNET_SSH_SERVERS.md)** - Multi-protocol server implementation (296 lines)

### APIs
🔌 **[API Reference](3-Developers/API_REFERENCE.md)** - Backend API
🤝 **[Contributing](3-Developers/CONTRIBUTING.md)** - Contribution guidelines

### SDK Documentation
📦 **SDK docs in [archive/sdk/](3-Developers/archive/sdk/)** - Door Development Kit guides

---

## For Door Developers

**Creating doors for AmiExpress:**

### Door Development
🚪 **[Door Development Guide](4-Door-Developers/DOOR_DEVELOPMENT.md)** - Complete door guide
⚙️ **[Amiga Emulation](4-Door-Developers/AMIGA_EMULATION.md)** - Emulation details
📚 **[AEDoor API](4-Door-Developers/AEDOOR_API.md)** - AEDoor.library reference
📚 **[DOS Library API](4-Door-Developers/DOS_LIBRARY_API.md)** - dos.library reference
💡 **[Examples](4-Door-Developers/EXAMPLES.md)** - Example doors

### Technical References
🔬 **[Door Sources Analysis](4-Door-Developers/DOOR_SOURCES_ANALYSIS.md)** - Original door analysis (1069 lines)
🔍 **[Door Research](4-Door-Developers/DOOR_RESEARCH.md)** - Research findings (905 lines)
📥 **[Import/Export](4-Door-Developers/IMPORT_EXPORT.md)** - BBS data migration (780 lines)
📋 **[Ported Doors Catalog](4-Door-Developers/PORTED_DOORS_CATALOG.md)** - Available doors (729 lines)
🔧 **[Door Manager](4-Door-Developers/DOOR_MANAGER.md)** - Door management system (493 lines)
⚙️ **[Config App Design](4-Door-Developers/CONFIG_APP.md)** - Web config interface (2264 lines)

---

## Quick Reference

**Fast lookups:**

📋 **[Command Reference](5-Reference/COMMAND_REFERENCE.md)** - All BBS commands
⌨️ **[Hotkeys](5-Reference/HOTKEYS.md)** - Keyboard shortcuts
🎨 **[MCI Codes](5-Reference/MCI_CODES.md)** - MCI code reference
📄 **[Screen Files](5-Reference/SCREEN_FILES.md)** - Screen file format
📁 **[File Structure](5-Reference/FILE_STRUCTURE.md)** - Project organization
📖 **[Main Menu Documentation](5-Reference/MAIN_MENU.md)** - Classic menu system (720 lines)
🧾 **[Reference Sources](7-Reference Sources/README.md)** - External reference source bundles (petscii-bbs, UADE, etc.)

---

## Progress & Status

**For Claude and developers tracking progress:**

📊 **[Current Status](6-Progress/CURRENT_STATUS.md)** - Implementation status (~95% complete)
🚀 **[68K Door Completion Plan](6-Progress/68K_DOOR_COMPLETION_PLAN.md)** - Door emulation roadmap
⚠️ **[Known Issues](6-Progress/KNOWN_ISSUES.md)** - Known bugs and workarounds

**Session Logs:** [6-Progress/archive/](6-Progress/archive/) - Historical debug sessions, completed plans

---

## Documentation Standards

### File Organization

```
Documentation/
├── 1-Users/          # End-user guides
├── 2-Sysops/         # System operator guides
├── 3-Developers/     # Developer guides
├── 4-Door-Developers/# Door development guides
├── 5-Reference/      # Quick reference materials
├── 6-Progress/       # Status tracking + archived logs
└── 7-Reference Sources/# Reference source archives and samples
```

### AI Documentation Map

- **Summary files first**: Each numbered folder exposes a single summary doc (e.g., `1-Users/USER_GUIDE.md`, `2-Sysops/ADMINISTRATION.md`, `3-Developers/ARCHITECTURE.md`, `4-Door-Developers/DOOR_DEVELOPMENT.md`, `5-Reference/COMMAND_REFERENCE.md`, `6-Progress/CURRENT_STATUS.md`). These are your starting points for quick answers.
- **Archives for depth**: When you need the full context, dive into the `archive/` subfolder inside that same directory (e.g., `Documentation/3-Developers/archive/sdk/README.md` or `Documentation/4-Door-Developers/archive/doors/README.md`).
- **Reference sources**: All raw code references, door binaries, emulator trees, and archived manuals are under `Documentation/7-Reference Sources/`—don’t move or edit them; just reference for parity checks.
- **Testing & automation**: The `Scripts/README.md` explains where every test harness now lives (`Scripts/dev/`, `Scripts/backend/`, `Scripts/backend-dev/`, `Scripts/emulation/`, `Scripts/legacy/`). Refer to that file before running or editing tests so you stay within the consolidated structure.

### Writing Guidelines

- **Clear headings** - Use descriptive section titles
- **Examples** - Include code examples where relevant
- **Cross-references** - Link to related documentation
- **Keep updated** - Update docs when code changes
- **One source of truth** - No duplicate content

---

## Finding Information

### Search by Topic

**Account Management:**
- Users: [User Guide - Customization](1-Users/USER_GUIDE.md#customization)
- Sysops: [Administration Guide](2-Sysops/ADMINISTRATION.md)

**Messages:**
- Users: [User Guide - Reading Messages](1-Users/USER_GUIDE.md#reading-messages)
- Users: [User Guide - Posting Messages](1-Users/USER_GUIDE.md#posting-messages)

**Files:**
- Users: [User Guide - File Operations](1-Users/USER_GUIDE.md#file-operations)

**Conferences:**
- Users: [User Guide - Conference Management](1-Users/USER_GUIDE.md#conference-management)

**Doors:**
- Users: [User Guide - Using Doors](1-Users/USER_GUIDE.md#using-doors)
- Developers: [Door Development Guide](4-Door-Developers/DOOR_DEVELOPMENT.md)

**Deployment:**
- Sysops: [Deployment Guide](2-Sysops/DEPLOYMENT.md)
- Developers: [Getting Started](3-Developers/GETTING_STARTED.md)

**Database:**
- Developers: [Database Guide](3-Developers/DATABASE.md)

**Testing:**
- Developers: [Testing Guide](3-Developers/TESTING.md)

**APIs:**
- Developers: [API Reference](3-Developers/API_REFERENCE.md)
- Door Developers: [AEDoor API](4-Door-Developers/AEDOOR_API.md)
- Door Developers: [DOS Library API](4-Door-Developers/DOS_LIBRARY_API.md)

---

## Migration Notes

This documentation structure was created on 2025-11-01 to consolidate 390+ scattered markdown files into ~30 comprehensive guides.

### What Changed

**Before:**
- 390 files across multiple directories
- Duplicate content
- Unclear organization
- Mix of current docs and old session logs

**After:**
- ~30 comprehensive guides
- Organized by audience
- Single source of truth
- Session logs archived separately

### Old Documentation

Old documentation structure archived in:
- `Documentation/archive/old-structure/dev-docs/`
- `Documentation/archive/old-structure/Docs/`

### Finding Old Files

If you're looking for a specific old file, check the archive or use git history:
```bash
# Search git history for filename
git log --all --full-history -- "**/FILENAME.md"

# Search archive
find Documentation/archive -name "FILENAME.md"
```

---

## Contributing to Documentation

### Adding New Documentation

1. Determine the audience (Users/Sysops/Developers/Door-Developers)
2. Check if topic fits in existing guide
3. If new guide needed:
   - Add to appropriate directory
   - Update this README
   - Update MCP server configuration

### Updating Documentation

1. Find the guide to update
2. Edit markdown file
3. Update "Last Updated" date
4. Test any code examples
5. Commit with clear message

### Documentation Review

- Check for accuracy
- Test all code examples
- Verify links work
- Check spelling/grammar
- Ensure clarity

---

## Support

- **BBS Issues**: Check [Troubleshooting Guide](2-Sysops/TROUBLESHOOTING.md)
- **Development Questions**: See [Contributing Guide](3-Developers/CONTRIBUTING.md)
- **Door Development**: See [Door Development Guide](4-Door-Developers/DOOR_DEVELOPMENT.md)
- **General Help**: Create an issue on GitHub

---

**Last Updated**: 2025-12-28
**Documentation Version**: 2.1 (Streamlined Structure)
## Archive Pattern Update
Each numbered directory now hosts an `archive/` subfolder that preserves the detailed legacy markdown files (root-level summaries remain front-and-center). Door/emulator/source archives live under `7-Reference Sources/` so readers can focus on summaries before stepping into the deep research notes.

## Legacy Documents & Archives

- `Documentation/AmiExpressDocs` moved to `Documentation/5-Reference/archive/AmiExpressDocs/` (legacy AmiExpress docs bundle).
- `Documentation/amiga-emulation` now sits in `Documentation/4-Door-Developers/archive/amiga-emulation/` (emulation reports, debugging notes).
- `Documentation/backend/amiexpress-docs` relocated to `Documentation/3-Developers/archive/backend-amiexpress-docs/` (backend-specific AmiExpress write-ups).
- `Documentation/Amiga_SASC_v6_Manual_Volume1.html` lives under `Documentation/7-Reference Sources/Amiga_SASC/` for compiler reference.
- `Screens/BBSTITLE.TXT` moved to `Documentation/5-Reference/archive/Screens/` alongside other screen-file artifacts.
