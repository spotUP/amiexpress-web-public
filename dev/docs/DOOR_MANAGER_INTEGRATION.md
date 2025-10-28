# Door Manager Integration Guide

## Quick Start

### 1. Install Dependencies

```bash
cd backend
npm install
```

The `adm-zip` package has been added to `package.json` for ZIP archive handling.

### 2. Create Required Directories

```bash
mkdir -p doors/archives
```

### 3. Integrate with BBS

Add the Door Manager command handler to your BBS. Here are three integration options:

---

## Integration Option 1: Direct Command (Recommended)

Add to your main command processor in `src/index.ts`:

```typescript
// Around line 800-900, in your command handler
socket.on('terminal-input', async (data: string) => {
  const input = data.trim();
  const command = input.toUpperCase();

  // ... existing commands ...

  // Door Manager command
  if (command === 'DOORMAN' || command === 'DM') {
    try {
      const { executeDoor } = await import('./doors/DoorManager');
      await executeDoor(socket);
    } catch (error) {
      socket.emit('ansi-output', '\x1b[31mError loading Door Manager\x1b[0m\r\n');
      console.error('Door Manager error:', error);
    }
    return;
  }

  // ... rest of commands ...
});
```

**Usage:** Users type `DOORMAN` or `DM` at any command prompt.

---

## Integration Option 2: Door Menu Entry

If you have a doors menu system, add Door Manager as an entry:

```typescript
// In your doors configuration
const systemDoors = [
  {
    id: 'doormanager',
    name: 'Door Manager',
    description: 'Install and manage BBS doors',
    command: 'DOORMAN',
    access: 255, // Sysop only
    handler: async (socket: Socket) => {
      const { executeDoor } = await import('./doors/DoorManager');
      await executeDoor(socket);
    }
  },
  // ... other doors
];
```

---

## Integration Option 3: Sysop Menu

Add to sysop-only functions:

```typescript
// In sysop menu handler
function showSysopMenu(socket: Socket, session: BBSSession) {
  socket.emit('ansi-output', '\x1b[1;36m=== Sysop Menu ===\x1b[0m\r\n\r\n');
  socket.emit('ansi-output', '1. User Management\r\n');
  socket.emit('ansi-output', '2. File Management\r\n');
  socket.emit('ansi-output', '3. Message Management\r\n');
  socket.emit('ansi-output', '4. Door Manager\r\n');  // ← Add this
  socket.emit('ansi-output', 'Q. Quit\r\n\r\n');
  socket.emit('ansi-output', 'Select: ');

  session.subState = LoggedOnSubState.SYSOP_MENU;
}

function handleSysopMenu(socket: Socket, session: BBSSession, input: string) {
  switch (input.toUpperCase()) {
    case '4':
      import('./doors/DoorManager').then(({ executeDoor }) => {
        executeDoor(socket);
      });
      break;
    // ... other cases
  }
}
```

---

## File Upload Integration

The Door Manager requires file upload capability via Socket.io. Add these event handlers if not already present:

```typescript
// In your Socket.io server setup
socket.on('file-upload-request', (data: { filename: string; size: number }) => {
  // Validate upload request
  if (data.size > 10 * 1024 * 1024) {
    socket.emit('upload-error', { message: 'File too large (max 10MB)' });
    return;
  }

  // Accept upload
  socket.emit('upload-accepted', {
    uploadId: crypto.randomBytes(16).toString('hex'),
    chunkSize: 64 * 1024 // 64KB chunks
  });
});

socket.on('file-upload-chunk', async (data: {
  uploadId: string;
  chunk: Buffer;
  isLast: boolean;
  filename: string;
}) => {
  // Handle file chunk upload
  // ... implementation ...

  if (data.isLast) {
    // File complete, emit to Door Manager
    socket.emit('file-uploaded', {
      filename: data.filename,
      path: savedPath
    });
  }
});
```

**Note:** If your BBS doesn't have file upload yet, the Door Manager will show the upload UI but uploads won't work until you implement the backend.

---

## Security Configuration

### Restrict to Sysops (Recommended)

Wrap the Door Manager execution in an access check:

```typescript
if (command === 'DOORMAN' || command === 'DM') {
  // Check sysop access
  if (session.user.securityLevel < 255) {
    socket.emit('ansi-output', '\x1b[31m╔═══════════════════════════════════════════╗\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[31m║  ACCESS DENIED: SYSOP ONLY                ║\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[31m╚═══════════════════════════════════════════╝\x1b[0m\r\n');
    return;
  }

  // Launch Door Manager
  const { executeDoor } = await import('./doors/DoorManager');
  await executeDoor(socket);
  return;
}
```

### File System Permissions

Ensure proper permissions on door directories:

```bash
chmod 755 backend/doors
chmod 755 backend/doors/archives
```

---

## Testing the Installation

### 1. Build the Backend

```bash
cd backend
npm run build
```

### 2. Start the Server

```bash
npm run dev
```

### 3. Connect to BBS

Log in with a sysop account (security level 255).

### 4. Launch Door Manager

```
Command: DOORMAN
```

You should see:

```
╔════════════════════════════════════════════════════════════════════════════════╗
║                              DOOR MANAGER                                       ║
╚════════════════════════════════════════════════════════════════════════════════╝

Installed Doors:

 [*] [TS] DoorManager                             1.2 MB
 [*] [TS] SAmiLog                                 45 KB
 [*] [TS] CheckUP                                 38 KB

────────────────────────────────────────────────────────────────────────────────
↑/↓ Navigate  ENTER Info  U Upload  Q Quit
```

### 5. Test Navigation

- Press ↑/↓ to navigate (selected row should have blue background)
- Press ENTER to view door information
- Press B to go back
- Press Q to exit

---

## Creating Test Door Archives

### Example 1: Simple Text Door

```bash
mkdir test-door
cd test-door

cat > FILE_ID.DIZ << 'EOF'
Test Door v1.0
By AmiExpress Team

A simple test door for
demonstrating the Door Manager
installation system.

Type: Text Door
EOF

cat > README.TXT << 'EOF'
Test Door
=========

This is a test door for the Door Manager.

Installation:
1. Upload via Door Manager
2. Install from info page
3. Launch from door menu

That's it!
EOF

echo "console.log('Test door executed!');" > testdoor.ts

zip test-door.zip *
```

### Example 2: Door with Documentation

```bash
mkdir adventure-door
cd adventure-door

cat > FILE_ID.DIZ << 'EOF'
Adventure Quest v2.1
By John Smith

An interactive text adventure
with multiple paths and endings.

Version: 2.1
Author: John Smith
Type: Adventure Game
EOF

cat > README.TXT << 'EOF'
Adventure Quest
===============

INSTALLATION
------------
Install via Door Manager

GAMEPLAY
--------
- Navigate: N, S, E, W
- Inventory: I
- Look: L
- Take: GET <item>
- Use: USE <item>

Save your game with SAVE command!
EOF

cat > INSTALL.NFO << 'EOF'
╔══════════════════════════════════════╗
║     ADVENTURE QUEST INSTALLATION     ║
╚══════════════════════════════════════╝

Requirements:
- AmiExpress-Web v1.0+
- 1MB disk space

Installation is automatic via Door Manager!
EOF

echo "// Adventure door code here" > adventure.ts

zip adventure-door.zip *
```

---

## Troubleshooting

### Door Manager doesn't appear

**Check:**
1. Command handler added correctly
2. Import path is correct: `./doors/DoorManager`
3. File exists at `backend/src/doors/DoorManager.ts`
4. Build succeeded without errors

**Fix:**
```bash
cd backend
npm run build
# Check for TypeScript errors
```

### "Cannot find module 'adm-zip'"

**Fix:**
```bash
cd backend
npm install adm-zip
npm run build
```

### Upload fails

**Check:**
1. `doors/archives` directory exists
2. Directory is writable
3. File upload handlers are implemented
4. File size under 10MB

**Fix:**
```bash
mkdir -p backend/doors/archives
chmod 755 backend/doors/archives
```

### Install fails

**Check:**
1. Archive is valid ZIP format
2. Archive contains executable
3. `doors/` directory is writable

**Fix:**
```bash
chmod 755 backend/doors
# Verify ZIP file
unzip -t yourfile.zip
```

---

## Advanced Configuration

### Custom Door Paths

Modify paths in `DoorManager.ts`:

```typescript
constructor(socket: Socket) {
  this.socket = socket;
  this.doorsPath = path.join(__dirname, '../../doors');           // Change here
  this.archivesPath = path.join(__dirname, '../../doors/archives'); // And here
  // ...
}
```

### Custom Upload Limits

Modify in `handleUpload()`:

```typescript
this.socket.emit('request-file-upload', {
  accept: '.zip,.lha',              // Add LHA support
  maxSize: 50 * 1024 * 1024,       // Increase to 50MB
  destination: this.archivesPath
});
```

### Page Size

Modify in `showList()`:

```typescript
const pageSize = 20; // Change from 15 to 20 doors per page
```

---

## Next Steps

1. ✅ Install dependencies (`npm install`)
2. ✅ Create directories (`mkdir -p doors/archives`)
3. ✅ Integrate command handler (see options above)
4. ✅ Build and test (`npm run build && npm run dev`)
5. 🔜 Create test door archives
6. 🔜 Test upload functionality
7. 🔜 Test install/uninstall
8. 🔜 Deploy to production

---

## Support

For issues:
1. Check this integration guide
2. Review `DOOR_MANAGER_README.md`
3. Check console for errors
4. Review BBS logs
5. Open GitHub issue

---

**Integration Guide**
**Version:** 1.0.0
**Date:** October 17, 2025
