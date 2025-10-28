# Documentation Index

Quick reference for finding specific documentation.

## By Topic

### Getting Started
- [README](README.md) - Documentation overview
- [Master Plan](MASTER_PLAN.md) - Project roadmap
- [Project Status](PROJECT_STATUS.md) - Current status
- [Installation](backend/amiexpress-docs/installation.md) - Installation guide

### Amiga Systems
- [Amiga Emulation](amiga-emulation/README.md) - Emulation system
- [Amiga Door Research](AMIGA_DOOR_RESEARCH.md) - Door execution research
- [Amiga Phase 1 POC](AMIGA_PHASE1_POC.md) - Proof of concept
- [AmigaGuide Support](AMIGAGUIDE_SUPPORT.md) - Documentation viewer

### Door System
- [Door Manager](doors/DOOR_MANAGER_README.md) - Door management
- [Door Manager Integration](DOOR_MANAGER_INTEGRATION.md) - System integration
- [Door Upload Testing](DOOR_UPLOAD_TEST_GUIDE.md) - Testing guide

### Features
- [Internode Chat Plan](INTERNODE_CHAT_PLAN.md) - Chat system design
- [Internode Chat Complete](INTERNODE_CHAT_COMPLETE.md) - Implementation summary
- [ARexx Documentation](AREXX_DOCUMENTATION.md) - ARexx scripting

### Technical
- [Implementation Guide](backend/amiexpress-docs/IMPLEMENTATION_GUIDE.md) - Backend implementation
- [Command Reference](backend/amiexpress-docs/COMMAND_REFERENCE.md) - BBS commands
- [Feature Matrix](backend/amiexpress-docs/FEATURE_MATRIX.md) - Feature comparison
- [Database Fixes](DATABASE_FIX_DOCUMENTATION.md) - Database documentation

### Operations
- [Deployment](DEPLOYMENT.md) - Deployment guide
- [Deployment Scripts](DEPLOYMENT_SCRIPTS.md) - Automation scripts
- [Stability Improvements](STABILITY_IMPROVEMENTS.md) - System stability
- [Security Fixes](SECURITY_FIXES.md) - Security updates

## By Type

### Markdown Files (.md)
All documentation is in Markdown format for easy reading and version control.

### Directory Structure
```
Docs/
├── README.md                          # Main documentation index
├── INDEX.md                           # This file - quick reference
├── MASTER_PLAN.md                     # Project roadmap
├── PROJECT_STATUS.md                  # Current status
├── amiga-emulation/                   # Amiga emulation docs
│   ├── README.md
│   ├── QUICKSTART.md
│   ├── IMPLEMENTATION_NOTES.md
│   └── ... (10 files)
├── backend/                           # Backend documentation
│   └── amiexpress-docs/
│       ├── README.md
│       ├── IMPLEMENTATION_GUIDE.md
│       └── ... (11 files)
├── doors/                             # Door system docs
│   └── DOOR_MANAGER_README.md
└── AmiExpressDocs/                    # Original docs archive

Total: 59 markdown files
```

## Recent Documentation

### Latest Updates (October 2025)
- Door Manager Integration
- Amiga Phase 1 POC
- Door Upload Testing Guide
- Stability Improvements
- AmigaGuide Support

### Completed Features
- Internode Chat (Complete)
- bcrypt Migration (Complete)
- Deployment Automation (Complete)
- Security Fixes (Complete)

## Search Tips

1. Use your IDE's search (Cmd/Ctrl+Shift+F) to search across all docs
2. Key terms to search for:
   - "TODO" - pending tasks
   - "IMPORTANT" - critical information
   - "FIXME" - known issues
   - "NOTE" - important notes
   - "WARNING" - warnings and cautions

## Contributing

When adding documentation:
1. Place in appropriate subdirectory
2. Update this INDEX.md
3. Update README.md
4. Follow naming convention: UPPERCASE_WITH_UNDERSCORES.md
5. Include clear headers and TOC for long documents
