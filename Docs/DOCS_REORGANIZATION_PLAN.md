# Documentation Reorganization Plan

## Current Situation
- **390 markdown files** spread across project
- Mix of user docs, developer docs, session logs, and progress notes
- Difficult to find information
- Many small files covering similar topics
- Outdated session logs cluttering the structure

## New Structure

```
Documentation/
├── 1-Users/                    # End-user documentation
│   ├── USER_GUIDE.md          # Comprehensive user guide
│   ├── COMMANDS.md            # All BBS commands
│   ├── DOORS.md               # Available doors and how to use them
│   └── FAQ.md                 # Frequently asked questions
│
├── 2-Sysops/                   # System operator documentation
│   ├── INSTALLATION.md        # Installation and setup
│   ├── CONFIGURATION.md       # System configuration
│   ├── ADMINISTRATION.md      # Day-to-day administration
│   ├── DEPLOYMENT.md          # Production deployment
│   └── TROUBLESHOOTING.md     # Common issues and solutions
│
├── 3-Developers/               # Developer documentation
│   ├── GETTING_STARTED.md     # Quick start for developers
│   ├── ARCHITECTURE.md        # System architecture
│   ├── DATABASE.md            # Database schema and rules
│   ├── API_REFERENCE.md       # Backend API reference
│   ├── TESTING.md             # Testing guide
│   └── CONTRIBUTING.md        # Contribution guidelines
│
├── 4-Door-Developers/          # Door development documentation
│   ├── DOOR_DEVELOPMENT.md    # Complete door dev guide
│   ├── AMIGA_EMULATION.md     # Amiga emulation details
│   ├── AEDOOR_API.md          # AEDoor.library API reference
│   ├── DOS_LIBRARY_API.md     # dos.library API reference
│   └── EXAMPLES.md            # Example door implementations
│
├── 5-Reference/                # Quick reference materials
│   ├── COMMAND_REFERENCE.md   # All commands quick ref
│   ├── HOTKEYS.md             # Hotkey reference
│   ├── MCI_CODES.md           # MCI code reference
│   ├── SCREEN_FILES.md        # Screen file format
│   └── FILE_STRUCTURE.md      # Project file structure
│
└── 6-Progress/                 # Development progress (for Claude/devs)
    ├── CURRENT_STATUS.md      # Current implementation status
    ├── MILESTONES.md          # Major milestones achieved
    ├── KNOWN_ISSUES.md        # Known issues and workarounds
    └── archive/               # Archived session logs
        └── 2025-10-*/         # Organized by date
            └── SESSION_*.md
```

## Migration Plan

### Phase 1: Create New Structure
1. Create Documentation/ directory
2. Create subdirectories for each audience
3. Create skeleton files for each guide

### Phase 2: Merge Related Content

**Users Guide (consolidate):**
- Current: Scattered command docs
- New: Single comprehensive USER_GUIDE.md
- Include: Login, navigation, messaging, files, conferences, doors

**Sysops Guide (consolidate):**
- Merge: DEPLOYMENT*.md files → DEPLOYMENT.md
- Merge: DATABASE*.md files → Sysops/DATABASE_ADMIN.md
- Merge: Various troubleshooting → TROUBLESHOOTING.md

**Developers Guide (consolidate):**
- Merge: CODE_ARCHITECTURE.md + MODULARIZATION_REPORT.md → ARCHITECTURE.md
- Merge: DATABASE_RULES.md + schema docs → DATABASE.md
- Merge: TESTING_WITH_PUPPETEER.md + test guides → TESTING.md

**Door Developers (consolidate):**
- Merge: AMIGA_DOOR_IMPLEMENTATION_GUIDE.md + DOOR_EMULATION_REVIEW.md → DOOR_DEVELOPMENT.md
- Merge: AEDOOR_*.md files → AEDOOR_API.md
- Merge: DOS_LIBRARY_*.md files → DOS_LIBRARY_API.md
- Merge: Door analysis files → DOOR_DEVELOPMENT.md

**Reference (consolidate):**
- Merge: HOTKEY_REFERENCE.md + NAVIGATION_KEYS_REFERENCE.md → HOTKEYS.md
- Merge: MCI_CODES_IMPLEMENTATION.md + related → MCI_CODES.md
- Keep: COMMAND_REFERENCE.md (already good)

**Progress (archive):**
- Move: All SESSION_*.md → Progress/archive/YYYY-MM-DD/
- Keep: Current status in CURRENT_STATUS.md
- Keep: MILESTONES.md (major achievements)
- Keep: KNOWN_ISSUES.md (active issues)

### Phase 3: Archive Old Files

Move to `Documentation/archive/old-structure/`:
- dev/docs/* (entire old structure)
- Docs/* (after migration)
- Individual changelog files
- Breakthrough/session analysis files

### Phase 4: Update References

Update all references in:
- CLAUDE.md
- README.md
- Code comments
- MCP server

## File Consolidation Details

### USER_GUIDE.md (merge 5-10 small files)
Sections:
1. Getting Started
2. Login and Authentication
3. Main Menu Navigation
4. Reading Messages
5. Posting Messages
6. File Operations
7. Conference Management
8. Using Doors
9. Chat and Communication
10. Customization

Sources:
- Current scattered user docs
- main_menu.md
- features.md
- Any user-facing guides

### DEPLOYMENT.md (merge ~15 files)
Sections:
1. Prerequisites
2. Local Development Setup
3. Production Deployment
4. Environment Variables
5. Database Setup
6. Troubleshooting
7. Monitoring
8. Backup and Recovery

Sources:
- DEPLOYMENT_GUIDE.md
- DEPLOYMENT.md
- DEPLOYMENT_SCRIPTS.md
- DEPLOYMENT_SUCCESS.md
- DEPLOYMENT_SUMMARY.md
- DEPLOYMENT_WEBHOOKS.md
- RENDER_DEPLOYMENT.md
- Related deployment changelogs

### DOOR_DEVELOPMENT.md (merge ~30 files)
Sections:
1. Overview
2. Door Types (XIM, MCI, REXX)
3. Development Environment
4. Amiga Emulation Basics
5. File I/O
6. Message Ports
7. XIM Protocol
8. AEDoor.library Usage
9. dos.library Usage
10. Testing Doors
11. Debugging
12. Examples

Sources:
- AMIGA_DOOR_IMPLEMENTATION_GUIDE.md
- DOOR_EMULATION_REVIEW.md
- DOOR_SYSTEM_EXPLAINED.md
- DOOR_TYPES_EXPLAINED.md
- DOOR_EXECUTION_ARCHITECTURE.md
- DOOR_FILE_IO_STATUS.md
- DOOR_FILE_IO_USAGE.md
- XIM_PROTOCOL_IMPLEMENTATION.md
- XIM_DOOR_COMPLETE_FLOW.md
- All DOOR_*.md analysis files
- All SESSION_*_DOOR_*.md files

### ARCHITECTURE.md (merge ~10 files)
Sections:
1. System Overview
2. Backend Architecture
3. Frontend Architecture
4. Database Schema
5. BBS State Machine
6. Amiga Emulation Layer
7. Module Organization
8. Code Standards

Sources:
- CODE_ARCHITECTURE.md
- MODULARIZATION_REPORT.md
- DIRECTORY_STRUCTURE_ANALYSIS.md
- AMIEXPRESS_DATA_STRUCTURE.md
- Backend architecture docs

### AEDOOR_API.md (merge ~10 files)
Sections:
1. Overview
2. Function Reference (all functions)
3. Usage Examples
4. Implementation Details
5. Troubleshooting

Sources:
- AEDOOR_API_REFERENCE.md
- AEDOOR_INDEX.md
- AEDOOR_QUICK_REFERENCE.md
- AEDOOR_FUNCTION_OFFSETS.md
- AEDOOR_LIBRARY_ANALYSIS.md
- AEDOOR_IMPLEMENTATION_COMPLETE.md
- AEDOOR_VERIFICATION.md
- AEDOOR_COMPLETE.md

## Benefits

### Before
- 390 files scattered everywhere
- Duplicated content
- Hard to find information
- Mix of active docs and old session logs
- No clear organization

### After
- ~20 comprehensive guides
- Clear categorization by audience
- Easy to find information
- Session logs archived separately
- Single source of truth for each topic

### Context Savings
- Current: Multiple small files loaded
- New: One comprehensive guide per topic
- Estimated: 70% reduction in doc files
- MCP server: Fewer resources, easier to navigate

## Implementation

### Files to Keep As-Is
- CLAUDE.md (main guidelines)
- README.md (project intro)
- CRITICAL_RULES.md (if still needed)
- MCP_SERVER_SETUP.md (MCP-specific)

### Files to Merge (Priority Order)

**High Priority** (user-facing):
1. User guides → USER_GUIDE.md
2. Sysop guides → INSTALLATION.md, CONFIGURATION.md, ADMINISTRATION.md
3. Deployment guides → DEPLOYMENT.md

**Medium Priority** (developer-facing):
4. Architecture docs → ARCHITECTURE.md
5. Database docs → DATABASE.md
6. Testing docs → TESTING.md

**Medium Priority** (door developers):
7. Door development → DOOR_DEVELOPMENT.md
8. AEDoor API → AEDOOR_API.md
9. DOS Library API → DOS_LIBRARY_API.md

**Low Priority** (reference):
10. Command reference (already consolidated)
11. Hotkeys → HOTKEYS.md
12. MCI codes → MCI_CODES.md

**Archive**:
13. All SESSION_*.md → Progress/archive/
14. All BREAKTHROUGH_*.md → Progress/archive/
15. Old dev/docs → Documentation/archive/old-structure/

## Next Steps

1. Get approval for structure
2. Create directory structure
3. Start with high-priority merges
4. Archive session logs
5. Update references
6. Delete old files
7. Update MCP server
