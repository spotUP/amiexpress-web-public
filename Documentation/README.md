# AmiExpress-Web Documentation

## Quick Navigation

Choose your role to find relevant documentation:

- **[Users](#for-users)** - Using the BBS
- **[Sysops](#for-sysops)** - Running the BBS
- **[Developers](#for-developers)** - Contributing code
- **[Door Developers](#for-door-developers)** - Creating doors
- **[Reference](#quick-reference)** - Quick lookups

---

## For Users

**New to AmiExpress? Start here:**

📖 **[User Guide](1-Users/USER_GUIDE.md)** - Complete guide to using the BBS
- Getting started
- Login & authentication
- Reading and posting messages
- File uploads/downloads
- Conference management
- Using doors
- Chat and communication
- Customization options
- Keyboard shortcuts

---

## For Sysops

**Running an AmiExpress BBS:**

### Getting Started
🚀 **[Installation Guide](2-Sysops/INSTALLATION.md)** - Set up your BBS
📝 **[Configuration Guide](2-Sysops/CONFIGURATION.md)** - Configure your system

### Operations
⚙️ **[Administration Guide](2-Sysops/ADMINISTRATION.md)** - Day-to-day management
🌐 **[Deployment Guide](2-Sysops/DEPLOYMENT.md)** - Production deployment
🔧 **[Troubleshooting Guide](2-Sysops/TROUBLESHOOTING.md)** - Common issues

---

## For Developers

**Contributing to AmiExpress-Web:**

### Core Development
🏗️ **[Getting Started](3-Developers/GETTING_STARTED.md)** - Development setup
📐 **[Architecture](3-Developers/ARCHITECTURE.md)** - System design
💾 **[Database](3-Developers/DATABASE.md)** - Database schema and rules
🧪 **[Testing](3-Developers/TESTING.md)** - Testing with Puppeteer

### APIs
🔌 **[API Reference](3-Developers/API_REFERENCE.md)** - Backend API
🤝 **[Contributing](3-Developers/CONTRIBUTING.md)** - Contribution guidelines

---

## For Door Developers

**Creating doors for AmiExpress:**

### Door Development
🚪 **[Door Development Guide](4-Door-Developers/DOOR_DEVELOPMENT.md)** - Complete door guide
⚙️ **[Amiga Emulation](4-Door-Developers/AMIGA_EMULATION.md)** - Emulation details
📚 **[AEDoor API](4-Door-Developers/AEDOOR_API.md)** - AEDoor.library reference
📚 **[DOS Library API](4-Door-Developers/DOS_LIBRARY_API.md)** - dos.library reference
💡 **[Examples](4-Door-Developers/EXAMPLES.md)** - Example doors

---

## Quick Reference

**Fast lookups:**

📋 **[Command Reference](5-Reference/COMMAND_REFERENCE.md)** - All BBS commands
⌨️ **[Hotkeys](5-Reference/HOTKEYS.md)** - Keyboard shortcuts
🎨 **[MCI Codes](5-Reference/MCI_CODES.md)** - MCI code reference
📄 **[Screen Files](5-Reference/SCREEN_FILES.md)** - Screen file format
📁 **[File Structure](5-Reference/FILE_STRUCTURE.md)** - Project organization

---

## Progress & Status

**For Claude and developers tracking progress:**

📊 **[Current Status](6-Progress/CURRENT_STATUS.md)** - Implementation status
🎯 **[Milestones](6-Progress/MILESTONES.md)** - Major achievements
⚠️ **[Known Issues](6-Progress/KNOWN_ISSUES.md)** - Known bugs and workarounds

**Session Logs:** [6-Progress/archive/](6-Progress/archive/)

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
└── 6-Progress/       # Status tracking + archived logs
```

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

**Last Updated**: 2025-11-01
**Documentation Version**: 2.0 (Reorganized Structure)
