# Optional Enhancements - Beyond Express.e Parity
**Date:** 2026-01-04
**Status:** Suggestions only - NOT TO BE IMPLEMENTED YET
**Purpose:** Future roadmap after 100% express.e parity achieved

---

## Priority Classification

- **HIGH** - Would significantly improve user experience
- **MEDIUM** - Nice to have, improves specific workflows
- **LOW** - Minor convenience, can wait
- **FUTURE** - Long-term vision, requires significant work

---

## User Experience Enhancements

### HIGH Priority

#### 1. Message Quoting System
**Status:** Partially stubbed
**Effort:** Medium (2-3 days)
**Impact:** Major UX improvement for conversations

**Description:**
Full message quoting and threading support in message composer.

**Features:**
- `/Q` command in message entry to load parent message
- Quote previous message with `>` prefix
- Threading display showing parent/child relationships
- "Reply" option from message viewer
- Quote trimming (remove excessive quote nesting)

**Implementation Notes:**
- Database already has `parentId` field in messages table
- Message entry handler has placeholder for quote loading
- Need to implement:
  - Quote text processing (add `>` prefix, wrap)
  - Parent message lookup and loading
  - Thread view in message reader
  - Quote level limit (e.g., max 3 levels deep)

**Express.e Reference:** Not in original, but common BBS feature

---

#### 2. Enhanced File Search
**Status:** Basic search exists
**Effort:** Medium (3-4 days)
**Impact:** Major UX improvement for file discovery

**Description:**
Advanced file search with filters, sorting, and relevance ranking.

**Features:**
- Full-text search across FILE_ID.DIZ descriptions
- Filter by:
  - File size range
  - Upload date range
  - File type/extension
  - Conference/area
  - Uploader name
- Sort by:
  - Relevance (search score)
  - Upload date (newest/oldest)
  - File size (largest/smallest)
  - Download count (most/least popular)
  - Alphabetical
- Search history (last 10 searches)
- Saved searches (favorites)
- "More like this" based on selected file

**Implementation Notes:**
- SQLite FTS5 for full-text search on descriptions
- New search UI with filter form
- Search results pagination
- Caching of popular searches

**Express.e Reference:** express.e has basic filename search only

---

#### 3. Online Message System (OLM) Enhancement
**Status:** Mentioned in docs, partially implemented
**Effort:** Large (1-2 weeks)
**Impact:** Major - enables real-time user communication

**Description:**
Full inter-user messaging system for online users.

**Features:**
- Send messages to specific online users
- Broadcast to all nodes
- Message history (last 50 messages)
- "Away" status with custom message
- Message notifications (sound, visual)
- Ignore list for blocking users
- Chat rooms (group OLM)
- Emote commands (/me, /afk, /brb)
- File sharing via OLM
- Screenshot sharing

**Implementation Notes:**
- Partially implemented in `olm.handler.ts`
- Need to complete:
  - Message history persistence
  - Away status system
  - Ignore list
  - Group chat rooms
  - Notification system
- WebSocket real-time updates
- Desktop notifications for operator

**Express.e Reference:** express.e:25406-25503 (basic OLM)

---

### MEDIUM Priority

#### 4. User Avatars & Profiles
**Status:** Not implemented
**Effort:** Medium (3-5 days)
**Impact:** Medium - personalizes user experience

**Description:**
Allow users to upload avatars and customize profiles.

**Features:**
- Avatar upload (max 100KB, image formats)
- Auto-resize to 64x64, 128x128 thumbnails
- Avatar display in WHO list, message headers, user info
- Profile fields:
  - Bio/About Me (500 chars max)
  - Location (already exists, enhance display)
  - Website URL
  - Social media links
  - Interests/hobbies
  - Favorite doors/games
- Profile visibility settings (public/friends/private)
- Profile views counter
- "View Profile" command

**Implementation Notes:**
- User table already has many fields
- Add `avatar_url`, `bio`, `website`, `profile_views`
- File storage in `/var/amiexpress-web/avatars/`
- Image processing with Sharp or Jimp
- New command: `PROFILE` or `VP` (View Profile)

**Express.e Reference:** Not in original

---

#### 5. Enhanced Statistics & Leaderboards
**Status:** Basic stats exist
**Effort:** Medium (2-3 days)
**Impact:** Medium - gamification

**Description:**
Comprehensive statistics and competitive leaderboards.

**Features:**
- **Global Leaderboards:**
  - Top uploaders (KB uploaded)
  - Top downloaders (files downloaded)
  - Top message posters
  - Top door players (scores)
  - Most active users (time online)
  - Newest users
- **Personal Statistics:**
  - Activity graph (last 30 days)
  - Message posting trends
  - File transfer history
  - Door game statistics
  - Achievement badges
- **Conference Statistics:**
  - Most active conferences
  - Message volume trends
  - Active users per conference
- **System Statistics:**
  - Peak concurrent users
  - Total calls/users/messages
  - Busiest hours/days heatmap
  - Growth charts

**Implementation Notes:**
- Database queries with aggregation
- Caching for expensive queries
- New screens: `STATS.TXT`, `LEADERS.TXT`
- New commands: `STATS`, `LEADERS`, `TOP`
- Charts via ANSI art or MCI codes

**Express.e Reference:** Basic stats in express.e, enhanced here

---

#### 6. Advanced File Operations
**Status:** Basic operations work
**Effort:** Medium (3-4 days)
**Impact:** Medium - power user feature

**Description:**
Enhanced file management for power users.

**Features:**
- Batch file operations:
  - Flag multiple files for download
  - Unflag selected files
  - Download queue management
  - Reorder download queue
- File collections/playlists
- Personal file favorites
- File ratings (1-5 stars)
- File comments/reviews
- File tagging (custom tags)
- Related files suggestions
- Duplicate file detection
- Broken file reporting

**Implementation Notes:**
- Extend file flagging system
- New tables: `file_favorites`, `file_ratings`, `file_tags`, `file_reviews`
- Queue management UI
- File relationship detection (same basename, series)

**Express.e Reference:** express.e has basic file ops

---

### LOW Priority

#### 7. Parameter Editor
**Status:** Shows "not yet implemented" message
**Effort:** Low (1-2 days)
**Impact:** Low - cosmetic

**Description:**
Numbered parameter selection interface per express.e design.

**Features:**
- Display 15 parameters (0-14)
- Single key selection
- Edit selected parameter
- Save changes

**Implementation Notes:**
- Already has informational message
- Just needs UI implementation
- Reference: express.e parameter editing

**Express.e Reference:** express.e has numbered parameters

---

#### 8. Enhanced New File Display
**Status:** Basic display exists
**Effort:** Low (1-2 days)
**Impact:** Low - minor improvement

**Description:**
Enhanced new file listing with more options.

**Features:**
- `displayNewFilesInDirectories()` - scan specific dirs
- `displaySelectedFileAreas()` - scan selected areas only
- Date range selection UI
- File type filtering
- "Mark all as seen" option

**Implementation Notes:**
- Extend existing new files command
- Add selection UI
- Database marking of seen files

**Express.e Reference:** express.e:27831-28023

---

#### 9. Improved Logging
**Status:** Basic logging works
**Effort:** Low (1 day)
**Impact:** Low - sysop quality of life

**Description:**
Enhanced activity logging for sysop review.

**Features:**
- Account editing logged to CallersLog
- Download/upload detailed logging
- Door usage logging
- Failed login attempt logging
- Suspicious activity flagging
- Log filtering and search
- Log export (CSV, JSON)

**Implementation Notes:**
- CallersLogManager already exists
- Add more log entry types
- Log viewer command for sysops
- Log search functionality

**Express.e Reference:** express.e has detailed logging

---

## Modern Web Features

### HIGH Priority

#### 10. Progressive Web App (PWA)
**Status:** Not implemented
**Effort:** Medium (3-4 days)
**Impact:** High - mobile experience

**Description:**
Make BBS installable as PWA for mobile devices.

**Features:**
- Service worker for offline support
- Web manifest for installation
- Push notifications
- Offline message composing
- Background sync
- App icon and splash screen
- iOS/Android home screen install

**Implementation Notes:**
- Create `manifest.json`
- Implement service worker
- Cache static assets
- Push notification integration
- IndexedDB for offline storage

**Express.e Reference:** Not applicable (modern feature)

---

#### 11. Mobile-Optimized Interface
**Status:** Desktop-focused
**Effort:** Large (1-2 weeks)
**Impact:** High - mobile accessibility

**Description:**
Responsive mobile interface with touch controls.

**Features:**
- Touch-friendly buttons and menus
- Swipe gestures for navigation
- Mobile keyboard optimization
- Reduced data mode
- Portrait/landscape layouts
- Mobile-specific screens
- Haptic feedback
- Mobile app wrapper (Capacitor/Cordova)

**Implementation Notes:**
- Responsive CSS breakpoints
- Touch event handlers
- Mobile detection
- Separate mobile terminal component
- Mobile-optimized fonts and colors

**Express.e Reference:** Not applicable

---

#### 12. WebRTC Voice/Video Chat
**Status:** Mentioned in docs, not implemented
**Effort:** Large (2-3 weeks)
**Impact:** High - modern communication

**Description:**
Real-time voice and video chat between users.

**Features:**
- 1-on-1 voice calls
- 1-on-1 video calls
- Group voice rooms
- Screen sharing
- Text chat during calls
- Call history
- Mute/unmute controls
- Camera on/off controls
- Call notifications
- Recording (with permission)

**Implementation Notes:**
- WebRTC peer connection
- STUN/TURN server setup
- Signaling via WebSocket
- Browser permissions handling
- Bandwidth detection
- Fallback to audio-only

**Express.e Reference:** Not applicable

---

### MEDIUM Priority

#### 13. REST API for Third-Party Clients
**Status:** Not implemented
**Effort:** Large (1-2 weeks)
**Impact:** Medium - ecosystem expansion

**Description:**
Public API for third-party client development.

**Features:**
- Authentication (API keys, OAuth)
- Read messages
- Post messages
- List files
- Download files (with permissions)
- User info retrieval
- Door launching
- Conference navigation
- Rate limiting
- API documentation (Swagger/OpenAPI)
- Client SDKs (Python, JavaScript, Ruby)

**Implementation Notes:**
- Express.js REST routes
- JWT or API key auth
- Rate limiting middleware
- API versioning (v1, v2)
- Comprehensive docs
- Example clients

**Express.e Reference:** Not applicable

---

#### 14. Discord/Slack Integration
**Status:** Discord webhook exists
**Effort:** Medium (3-5 days)
**Impact:** Medium - community bridging

**Description:**
Two-way integration with Discord and Slack.

**Features:**
- **From BBS to Discord:**
  - New user signups
  - File uploads
  - New messages in conferences
  - Door high scores
  - Sysop pages
- **From Discord to BBS:**
  - Post messages to BBS from Discord
  - View online users
  - Search files
  - Check message counts
- Bot commands in Discord
- Conference channel mapping
- User linking (Discord ⟷ BBS accounts)

**Implementation Notes:**
- Discord.js bot
- Slack bolt SDK
- Bidirectional webhook handlers
- Message format conversion
- User auth/linking system

**Express.e Reference:** Not applicable

---

#### 15. Markdown Support in Messages
**Status:** Plain text only
**Effort:** Medium (2-3 days)
**Impact:** Medium - richer content

**Description:**
Allow markdown formatting in messages.

**Features:**
- **Bold**, *italic*, `code`, ~~strikethrough~~
- Links (auto-converted to clickable)
- Lists (ordered, unordered)
- Blockquotes
- Code blocks with syntax highlighting
- Tables (basic)
- Images (inline, if allowed)
- ANSI color preservation
- Markdown preview in composer
- Toggle between plain text and markdown

**Implementation Notes:**
- Markdown parser (marked.js)
- ANSI color code pass-through
- Sanitization (prevent XSS)
- Message metadata flag: `is_markdown`
- Renderer for terminal (convert to ANSI)
- Renderer for web (HTML)

**Express.e Reference:** Not in original

---

### LOW Priority

#### 16. AI-Powered Features
**Status:** Not implemented
**Effort:** Variable (experimental)
**Impact:** Low - novelty feature

**Description:**
Optional AI enhancements (requires API keys).

**Features:**
- **Chat Bot:**
  - Help desk bot for common questions
  - Door/game recommendations
  - Command suggestions
- **Content Moderation:**
  - Spam detection
  - Offensive content flagging
  - Auto-moderation actions
- **Personalization:**
  - File recommendations
  - Conference suggestions
  - Activity pattern analysis
- **Accessibility:**
  - Text-to-speech for visually impaired
  - Speech-to-text for voice input
  - Simplified language mode

**Implementation Notes:**
- OpenAI API or similar
- Opt-in feature (disabled by default)
- Privacy considerations
- Cost management (rate limiting)
- Fallback when API unavailable

**Express.e Reference:** Not applicable

---

#### 17. Gamification System
**Status:** Not implemented
**Effort:** Medium (5-7 days)
**Impact:** Low - engagement boost

**Description:**
Achievement and reward system.

**Features:**
- **Achievements:**
  - First login
  - 100 messages posted
  - 10 files uploaded
  - Beat a door high score
  - Helped another user
  - Sysop recognition awards
- **Badges:**
  - Display in WHO list
  - Show in message headers
  - Profile badge collection
- **Points System:**
  - Earn points for activity
  - Redeem for perks:
    - Extra download quota
    - Conference access
    - Custom title
    - Profile customization
- **Levels:**
  - User levels based on points
  - Level-up announcements
  - Unlock features at levels

**Implementation Notes:**
- New tables: `achievements`, `user_achievements`, `user_points`
- Achievement trigger system
- Point calculation rules
- Level thresholds
- Badge artwork (ANSI art)

**Express.e Reference:** Not in original

---

## Technical Improvements

### MEDIUM Priority

#### 18. Performance Monitoring & Analytics
**Status:** Basic logging only
**Effort:** Medium (3-4 days)
**Impact:** Medium - operational insight

**Description:**
Comprehensive performance monitoring and analytics dashboard.

**Features:**
- **Real-time Metrics:**
  - Active users/connections
  - Memory usage
  - CPU usage
  - Database query performance
  - WebSocket connections
  - Response times
- **Historical Analytics:**
  - User growth over time
  - Peak usage times
  - Popular features/commands
  - Door usage statistics
  - File transfer volumes
  - Message posting trends
- **Alerts:**
  - High memory usage
  - Slow queries
  - Failed logins
  - Errors/crashes
  - Disk space low
- **Dashboard:**
  - Web-based admin panel
  - Real-time charts
  - Export reports

**Implementation Notes:**
- Prometheus + Grafana integration
- Custom metrics collection
- StatsD or similar
- Admin dashboard (React)
- Email/SMS alerts

**Express.e Reference:** Not applicable

---

#### 19. Multi-Instance Support
**Status:** Single instance
**Effort:** Large (2-3 weeks)
**Impact:** Medium - scalability

**Description:**
Run multiple BBS instances with shared database.

**Features:**
- Load balancing across instances
- Shared SQLite or PostgreSQL
- Session sharing (Redis)
- Sticky sessions for WebSocket
- Health checks
- Auto-scaling
- Graceful shutdown
- Zero-downtime deployments

**Implementation Notes:**
- Refactor to support shared database
- Session store in Redis
- Load balancer configuration
- Database connection pooling
- Distributed locking for critical sections

**Express.e Reference:** express.e supports multi-node, enhance here

---

#### 20. Database Migration to PostgreSQL
**Status:** SQLite only
**Effort:** Large (1-2 weeks)
**Impact:** Medium - enterprise readiness

**Description:**
Optional PostgreSQL support for larger deployments.

**Features:**
- PostgreSQL adapter
- Migration scripts from SQLite
- Full-text search with PostgreSQL
- Better concurrent access
- Replication support
- Partitioning for large tables
- Performance tuning
- Backup/restore procedures

**Implementation Notes:**
- Abstraction layer for database
- Separate PostgreSQL repository classes
- Migration tool
- Configuration flag to choose DB
- Keep SQLite for simple deployments

**Express.e Reference:** Not applicable

---

## Security Enhancements

### HIGH Priority

#### 21. Two-Factor Authentication (2FA)
**Status:** Not implemented
**Effort:** Medium (3-4 days)
**Impact:** High - security improvement

**Description:**
Optional 2FA for user accounts.

**Features:**
- TOTP (Time-based One-Time Password)
- QR code generation for setup
- Backup codes
- SMS fallback (optional)
- Email fallback
- Remember device (30 days)
- Force 2FA for sysops
- Recovery process

**Implementation Notes:**
- speakeasy library for TOTP
- QR code generation (qrcode)
- User table: `twofa_secret`, `twofa_enabled`, `twofa_backup_codes`
- Login flow modification
- Recovery code generation
- Device token storage

**Express.e Reference:** Not in original

---

#### 22. IP Reputation & Rate Limiting
**Status:** Basic rate limiting
**Effort:** Medium (2-3 days)
**Impact:** High - abuse prevention

**Description:**
Advanced IP reputation and rate limiting.

**Features:**
- IP reputation database
- Automatic blocking of known bad IPs
- Rate limiting by:
  - Login attempts (5/hour)
  - Message posts (20/hour)
  - File uploads (10/day)
  - API calls (100/hour)
- Temporary bans (progressive)
- Permanent bans
- Whitelist for trusted IPs
- CAPTCHA for suspicious IPs
- Honeypot detection

**Implementation Notes:**
- Redis for rate limiting counters
- IP reputation service integration
- Fail2Ban integration
- CAPTCHA library (e.g., reCAPTCHA)
- Ban management interface

**Express.e Reference:** Not applicable

---

### MEDIUM Priority

#### 23. Audit Log System
**Status:** Basic logging exists
**Effort:** Medium (2-3 days)
**Impact:** Medium - compliance/forensics

**Description:**
Comprehensive audit trail for security events.

**Features:**
- Log all security events:
  - Logins/logouts
  - Failed login attempts
  - Permission changes
  - Account modifications
  - File uploads/downloads
  - Message posts/deletions
  - Door executions
  - Configuration changes
- Tamper-proof logging
- Log retention policies
- Log search and filtering
- Export to SIEM
- Anomaly detection

**Implementation Notes:**
- Separate audit database
- Write-only log table
- Cryptographic signing of log entries
- Log rotation and archival
- Search indexing
- Anomaly detection algorithms

**Express.e Reference:** Not in original

---

## Import/Export Enhancements

### LOW Priority

#### 24. Enhanced Import Options
**Status:** Basic import exists
**Effort:** Medium (3-5 days)
**Impact:** Low - migration assistance

**Description:**
Import from other BBS software.

**Features:**
- Import users from:
  - Synchronet
  - Mystic BBS
  - Telegard
  - RemoteAccess
  - WWIV
  - Generic CSV
- Import messages from:
  - QWK packets
  - FidoNet message bases
  - Jam message bases
  - Hudson message bases
- Import files from:
  - FILES.BBS format
  - FILE_ID.DIZ extraction
  - Recursive directory scan
- Duplicate detection
- Mapping wizard (field mapping)
- Preview before import
- Rollback on error

**Implementation Notes:**
- Format parsers for each BBS type
- Database transaction for atomicity
- Progress reporting
- Import log
- Validation of imported data

**Express.e Reference:** express.e has basic import

---

#### 25. Advanced Export Features
**Status:** Basic export exists
**Effort:** Low (2-3 days)
**Impact:** Low - data portability

**Description:**
Export BBS data to various formats.

**Features:**
- Export users to:
  - CSV
  - JSON
  - XML
  - LDIF (for LDAP)
- Export messages to:
  - QWK packet
  - Mbox format
  - JSON
  - HTML archive
- Export files list to:
  - FILES.BBS
  - CSV
  - JSON
- Scheduled exports
- Incremental exports
- Compression (zip, tar.gz)

**Implementation Notes:**
- Export service
- Format generators
- Cron job support
- Storage in /var/amiexpress-web/exports/

**Express.e Reference:** express.e has basic export

---

## Future Vision

### FUTURE Priority

#### 26. Federation/Network Support
**Status:** Not implemented
**Effort:** Very large (2-3 months)
**Impact:** Future - BBS network

**Description:**
Connect multiple BBS instances in a federation.

**Features:**
- Message distribution across BBSes
- File sharing network
- User directory federation
- Inter-BBS chat
- Shared doors/games
- Network-wide achievements
- Mesh or star topology
- Encryption between nodes
- Node reputation system

**Implementation Notes:**
- Custom protocol or adapt existing (FidoNet, QWK)
- Node discovery
- Message routing
- Conflict resolution
- Security (node authentication)

**Express.e Reference:** FidoNet support in original

---

#### 27. Blockchain Integration (Experimental)
**Status:** Not implemented
**Effort:** Very large (experimental)
**Impact:** Future - decentralization

**Description:**
Experimental blockchain features.

**Features:**
- Decentralized user authentication
- Message immutability proof
- File integrity verification
- Cryptocurrency rewards/payments
- NFT badges/achievements
- Distributed storage (IPFS)
- Smart contracts for automation

**Implementation Notes:**
- Experimental/optional
- High complexity
- Questionable value
- Privacy concerns
- Consider carefully before implementing

**Express.e Reference:** Not applicable

---

## Implementation Priorities

**Recommended order if implementing:**

1. **Message Quoting** - Most requested, improves UX significantly
2. **Enhanced File Search** - Power user feature, high value
3. **2FA** - Security critical, should be early
4. **PWA** - Modern accessibility, mobile users
5. **User Avatars** - Quick win, fun feature
6. **Enhanced Statistics** - Engagement and insights
7. **OLM System** - Major feature, take time
8. **Mobile Interface** - Large effort, high impact
9. **REST API** - Ecosystem expansion
10. **WebRTC** - Modern communication

**Do NOT implement yet** - this is a suggestion list for future consideration after production deployment and user feedback.

---

**Total Suggestions:** 27 enhancements
**Estimated Total Effort:** 6-12 months for all features
**Recommendation:** Prioritize based on user feedback after launch
**Status:** Document only - implementation pending user needs assessment

---

**Created:** 2026-01-04
**Purpose:** Future roadmap planning
**Next Steps:** Deploy current 100% complete system, gather user feedback, then prioritize enhancements
