# Bug Tracker - Professional Bug Reporting System for BBS

A comprehensive, feature-rich bug tracking system designed for Bulletin Board Systems with modern UI/UX, webhook integrations, and powerful analytics.

## 🌟 Features

### Core Functionality
- **Multi-Category Organization**: System Commands, Doors, General System
- **Sub-Categories & Tags**: Granular organization with custom tags
- **Priority Levels**: Low, Medium, High, Critical
- **Full Status Tracking**: New → Acknowledged → In Progress → Fixed/Closed
- **Detailed Bug Reports**: Title, description, steps to reproduce, expected vs actual behavior
- **Attachment Support**: Screenshots, logs, and other files

### User Experience
- **Arrow Key Navigation**: Smooth, intuitive menu navigation
- **Modern CLI Aesthetics**: ANSI/ASCII art with colors and animations
- **Progress Indicators**: Visual feedback during form submission
- **Responsive Layout**: Adapts to terminal dimensions
- **Input Validation**: Required fields and confirmation dialogs
- **Help Menus**: Context-sensitive help throughout

### Advanced Features
- **Search & Filtering**: Keyword search, category filters, date ranges
- **User Authentication**: Integration with BBS user system
- **Ownership Controls**: Reporters can edit/delete their own reports
- **Comment System**: Users and sysops can add comments
- **Notification System**: BBS mail notifications to sysop

### Webhook Integration
- **Multi-Platform Support**: Discord, Slack, generic webhooks
- **Rich Embeds**: Color-coded, formatted notifications
- **Category Routing**: Route specific categories to specific channels
- **Retry Logic**: Exponential backoff with configurable attempts
- **Custom Payloads**: Flexible payload formatting

### Analytics Dashboard
- **Real-Time Metrics**: Total, open, closed bug counts
- **Category Breakdown**: Visual bar charts
- **Priority Distribution**: Track critical vs low priority
- **Resolution Times**: Average time to fix
- **Top Reporters**: Leaderboard of contributors
- **Activity Trends**: 7-day activity graphs
- **Stale Bug Detection**: Bugs open > 30 days

### Sysop Tools
- **Bulk Operations**: Mass status updates
- **Report Assignment**: Assign bugs to team members
- **Internal Notes**: Private sysop-only comments
- **Duplicate Detection**: Mark and link duplicate reports
- **Export Functionality**: JSON export for backups
- **Data Management**: Comprehensive CRUD operations

## 📦 Installation

```bash
# Navigate to the bug-tracker directory
cd sdk/doors/bug-tracker

# Install dependencies
npm install

# Start the door
npm start
```

## ⚙️ Configuration

### Webhook Configuration

Create a `webhook.config.json` file:

```json
{
  "webhooks": [
    {
      "platform": "discord",
      "url": "https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN",
      "enabled": true,
      "username": "Bug Tracker Bot",
      "avatarUrl": "https://example.com/avatar.png",
      "categories": ["System Commands", "Doors"],
      "retryAttempts": 3,
      "retryDelay": 1000
    },
    {
      "platform": "slack",
      "url": "https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK",
      "enabled": true,
      "username": "Bug Tracker",
      "categories": ["General System"]
    }
  ]
}
```

### BBS Integration

Add to your BBS menu (Commands/BBSCmd/BUGS.info):

```
COMMAND=BUGS
LOCATION=Doors:bug-tracker/index.ts
ACCESS=0
TYPE=XIM
STACK=4096
MULTINODE=YES
NAME=Bug Tracker
DESCRIPTION=Report and track system bugs
```

## 🎮 Usage

### For Users

1. **Report a Bug**
   - Select "Report New Bug" from main menu
   - Choose category (arrow keys)
   - Fill out the form fields
   - Select priority level
   - Submit and receive bug ID

2. **View Bugs**
   - Browse all bugs with pagination
   - Navigate with arrow keys
   - Press Enter to view details
   - Add comments to existing bugs

3. **Search & Filter**
   - Filter by category
   - Search by keywords
   - View your own reports

### For Sysops

1. **Management Interface**
   - Access with security level 100+
   - Change bug statuses
   - Bulk update operations
   - Delete inappropriate reports

2. **Analytics Dashboard**
   - View real-time statistics
   - Analyze trends and patterns
   - Identify critical issues
   - Track resolution performance

3. **Webhook Management**
   - Configure notification endpoints
   - Route categories to channels
   - Test webhook delivery
   - Monitor webhook health

## 🎨 UI/UX Features

### Visual Elements
- **Color Coding**: Priority-based colors (Red=Critical, Yellow=High, etc.)
- **Box Drawing**: Professional borders and separators
- **Icons**: Unicode symbols for visual clarity (🐛 ⚠️ 📂 👤)
- **Progress Bars**: Step-by-step form completion indicators
- **Charts**: ASCII bar charts and trend graphs

### Animations
- **Loading Spinners**: During webhook delivery
- **Smooth Transitions**: Between screens
- **Highlight Effects**: Selected menu items
- **Success Feedback**: Visual confirmation messages

### Accessibility
- **Keyboard Only**: Complete navigation without mouse
- **Clear Labels**: Descriptive field names
- **Help Text**: Context-sensitive instructions
- **Error Messages**: Informative validation feedback

## 📊 Data Structure

### Bug Report Schema

```typescript
{
  "id": 1,
  "title": "Command fails with error",
  "category": "System Commands",
  "subcategory": "FILE",
  "description": "The FILE command crashes when...",
  "stepsToReproduce": "1. Type FILE\n2. Press Enter\n3. Error occurs",
  "expectedBehavior": "Should display file list",
  "actualBehavior": "Crashes with error code 42",
  "priority": "High",
  "status": "In Progress",
  "reporter": "JohnDoe",
  "reporterId": 123,
  "reportedAt": 1699564800000,
  "updatedAt": 1699564900000,
  "resolvedAt": null,
  "tags": ["crash", "files"],
  "attachments": [
    {
      "filename": "error.log",
      "path": "/attachments/error.log",
      "size": 1024,
      "timestamp": 1699564800000
    }
  ],
  "comments": [
    {
      "author": "Sysop",
      "authorId": 1,
      "text": "Looking into this...",
      "timestamp": 1699564850000
    }
  ],
  "assignedTo": "Sysop",
  "internalNotes": "May be related to bug #5"
}
```

## 🔒 Security

- **Input Sanitization**: All user inputs are sanitized
- **Authentication**: BBS user session validation
- **Authorization**: Security level checks for sysop features
- **SQL Injection Prevention**: N/A (using JSON storage)
- **XSS Prevention**: ANSI-only output, no HTML
- **Rate Limiting**: Prevent spam submissions

## 🛠️ Development

### Project Structure

```
bug-tracker/
├── index.ts          # Main door application
├── webhook.ts        # Webhook notification system
├── analytics.ts      # Analytics and metrics engine
├── package.json      # NPM dependencies
├── tsconfig.json     # TypeScript configuration
├── README.md         # This file
└── data/
    ├── bugs.json     # Bug reports storage
    └── webhooks.json # Webhook configuration
```

### Building

```bash
npm run build
```

### Testing

```bash
npm test
```

## 📝 API Integration

### Webhook Payload Format

**Discord:**
```json
{
  "username": "Bug Tracker",
  "embeds": [{
    "title": "🐛 Bug Report #123",
    "description": "Bug title here",
    "color": 15158332,
    "fields": [
      {"name": "📂 Category", "value": "System Commands"},
      {"name": "⚠️ Priority", "value": "High"},
      {"name": "👤 Reporter", "value": "JohnDoe"}
    ]
  }]
}
```

**Slack:**
```json
{
  "username": "Bug Tracker",
  "attachments": [{
    "fallback": "Bug #123: Title",
    "color": "#e67e22",
    "fields": [
      {"title": "Category", "value": "System Commands"},
      {"title": "Priority", "value": "High"}
    ]
  }]
}
```

## 🚀 Performance

- **Efficient Rendering**: Minimal screen updates
- **Lazy Loading**: Paginated lists for large datasets
- **Caching**: Metrics calculated on-demand
- **Async Operations**: Non-blocking webhook delivery

## 📄 License

MIT License - See LICENSE file for details

## 👥 Credits

Developed using the AmiExpress BBS Door SDK
- Framework: @amiexpress/bbs-door-sdk
- Platform: AmiExpress-Web BBS
- Language: TypeScript

## 🐛 Reporting Issues

Found a bug in the Bug Tracker? How meta! Please report it using... the Bug Tracker! 😄

Or contact the sysop via BBS mail.

## 🎯 Roadmap

- [ ] Email notifications
- [ ] Custom field types
- [ ] Attachment uploads via ZMODEM
- [ ] Integration with issue trackers (GitHub, Jira)
- [ ] AI-powered duplicate detection
- [ ] Automated testing suite
- [ ] Mobile-responsive web view
- [ ] RESTful API for external integrations

---

**Version:** 1.0.0
**Last Updated:** 2025-01-08
**Compatibility:** AmiExpress-Web BBS v1.0+
