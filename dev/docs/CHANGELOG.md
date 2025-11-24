# AmiExpress-Web Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2025-10-24] - Evening - BBS Webhooks & Database Integrity Improvements

### Added
- **Production webhook system fully working**
  - BBS events now trigger Discord/Slack webhooks
  - Auto-initialization of webhook from BBS_WEBHOOK_URL environment variable
  - Supports all 17 webhook triggers (login, logout, new messages, file uploads, etc.)
- **Database UNIQUE constraints** to prevent duplicate data
  - Added to `conferences(name)`
  - Added to `message_bases(name, conferenceid)`
  - Added to `file_areas(name, conferenceid)`
  - Added to `file_entries(filename, areaid)`
  - Added to `node_sessions(nodeid)`
  - Added to `webhooks(name)`
  - Added to `bulletins(filename, conferenceid)`
- **Database cleanup functions**
  - `cleanupDuplicateFileAreas()` - Removes duplicate file areas
  - `cleanupDuplicateMessageBases()` - Removes duplicate message bases
  - Cleanup runs automatically during initialization
- **Database helper methods**
  - `getConferenceById()` - Get single conference by ID
  - `getMessageBaseById()` - Get single message base by ID
- **UNIQUE constraint guidance** added to CLAUDE.md
  - Documentation of all tables with UNIQUE constraints
  - Rules for identifying natural unique keys
  - History lesson about the 650 duplicate file areas incident

### Changed
- **Deployment webhooks now use jq for JSON encoding**
  - Properly escapes newlines, quotes, and special characters
  - Prevents "invalid JSON" errors from Discord/Slack APIs
  - HTTP 204 success responses confirmed
- **Webhook service improvements**
  - Better error handling and logging
  - Supports both Discord and Slack formats
  - Automatically detects webhook type from URL

### Fixed
- **Production database had 655 file areas instead of 5**
  - Each of 5 default file areas was duplicated 131 times
  - Cleanup function removed 650 duplicates
  - UNIQUE constraints prevent future duplicates
- **Message posting webhooks not working**
  - Missing `getConferenceById()` and `getMessageBaseById()` methods
  - Added these methods to database.ts
  - Webhooks now fire correctly for all BBS events
- **Duplicate SYSOP COMMANDS menu**
  - Was displayed twice (in screen.handler.ts and command.handler.ts)
  - Removed duplicate from command.handler.ts
  - Now displays only once in main menu
- **Deployment script Render CLI authentication issues**
  - Token expiration caused silent failures
  - Added debug logging to track webhook sends
  - Script now requires `render login` and `render workspace set`
- **Frontend deployment exceeding 100MB limit**
  - Added `reference-board`, `old/`, and `Scripts/` to `.vercelignore`
  - Reduced deployment size significantly

### Technical Details
- **Webhook flow**: BBS event → `webhookService.sendWebhook()` → Database query for matching webhooks → HTTP POST to Discord/Slack
- **Database migrations**: Added migrations 4-10 for UNIQUE constraints
- **Root cause analysis**: Without UNIQUE constraints, multiple backend restarts or initialization race conditions created duplicates
- **Prevention**: Database-level constraints enforce uniqueness regardless of application code

## [2025-10-24] - Morning - Webhook Interface Improvements & Performance Optimization

### Added
- **Arrow-key navigation** for webhook management interface
  - Use ↑↓ arrows to navigate menu options
  - Press Enter to select, Q/ESC to quit
  - Visual highlighting with reverse video on selected items
  - Hotkey support maintained (first letter shortcuts)
- **New MenuUtil utility** (`backend/src/utils/menu.util.ts`)
  - Reusable arrow-key navigable menu system
  - Can be used for future menu interfaces
- **Webhook list selection menu**
  - Visual ON/OFF status indicators
  - Arrow selection of webhooks
  - Shows webhook type and trigger count
- **Webhook actions menu**
  - Quick Enable/Disable toggle
  - Test webhook functionality
  - Delete webhook option
  - Detailed webhook information display
- **Default webhook configuration**
  - Created "BBS Discord Notifications" webhook
  - All 17 triggers enabled by default
  - Connected to Discord webhook from .env.local

### Changed
- **Password verification performance** - 4x faster logins
  - Reduced bcrypt salt rounds from 12 to 10
  - Maintains industry-standard security
  - Consistent across new user registration
- **Webhook interface completely rewritten**
  - Replaced text-only interface with arrow navigation
  - More intuitive and user-friendly
  - Better visual feedback

### Fixed
- **Duplicate SYSOP COMMANDS menu** display
  - Removed duplicate from command.handler.ts
  - Now displays only once in main menu
- **Missing axios dependency** for webhook service
  - Added to backend package.json

### Technical Details
**Backend Changes:**
- `backend/src/database.ts:2328` - Reduced salt rounds (12 → 10)
- `backend/src/handlers/webhook-commands.handler.ts` - Complete rewrite with MenuUtil
- `backend/src/handlers/command.handler.ts` - Added webhook menu routing
- `backend/src/utils/menu.util.ts` - New menu utility class
- Added axios dependency (v1.7.7)

**Files Added:**
- `backend/src/utils/menu.util.ts` - Arrow-navigable menu system

**Commits:**
- `88d0cdd` - perf: Optimize password verification (bcrypt 12→10 rounds)
- `2e02fac` - feat: Improve webhook interface with arrow-key navigation

### Deployment
- Backend: Render.com (srv-d3naaffdiees73eebd0g)
- Frontend: Vercel (bbs.uprough.net)
- Deployment: 2025-10-24 19:00 UTC

### Migration Notes
- No database migrations required
- Webhook table already exists from previous deployment
- Default webhook created with all triggers enabled

### Performance Impact
- Login times: ~4x faster due to reduced bcrypt rounds
- No other performance changes

---

## Earlier Changes

(Document previous deployments below)
