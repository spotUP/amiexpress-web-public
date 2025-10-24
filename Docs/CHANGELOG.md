# AmiExpress-Web Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2025-10-24] - Webhook Interface Improvements & Performance Optimization

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
