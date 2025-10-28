# Door Manager Upload Testing Guide

## Overview

This guide explains how to test the Door Manager upload functionality. The upload feature allows sysops to upload door archives (ZIP files) directly through the BBS interface.

---

## Test Door Package

A test door has been created at:
```
~/Code/AmiExpress-Web/backend/test-door.zip
```

**Contents:**
- `FILE_ID.DIZ` - Door metadata (175 bytes)
- `README.TXT` - Documentation (264 bytes)
- `test-door.ts` - TypeScript door executable (749 bytes)

**Total size:** 997 bytes

---

## Manual Testing Steps

### Prerequisites

1. Server running on `http://localhost:3001`
2. Logged in as sysop (security level 255)
3. Frontend client connected to BBS

### Test Procedure

#### Step 1: Access Door Manager

```
Command: DOORMAN
```

You should see:
```
-= DOOR MANAGER =-

Installed Doors:

 [*] [TS] SAmiLog          45 KB
 [*] [TS] CheckUP          38 KB

--------------------------------------------------------------------------------
[UP/DN] Navigate  [ENTER] Info  [U] Upload  [Q] Quit
```

#### Step 2: Press [U] for Upload

Press the `U` key to access upload mode.

You should see:
```
-= UPLOAD DOOR ARCHIVE =-

Upload a door archive (ZIP format)

The archive should contain:
  - Door executable (.ts, .js, or Amiga binary)
  - FILE_ID.DIZ (optional, but recommended)
  - README or documentation (optional)

Please send the ZIP file now, or press [Q] to cancel
(Max size: 10MB)
```

#### Step 3: Send File via Frontend

**Frontend Implementation Required:**

The frontend must emit a socket event when the user selects a file:

```typescript
// In your frontend code
const fileInput = document.getElementById('file-input');
fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];

  if (!file) return;

  // Read file as ArrayBuffer
  const buffer = await file.arrayBuffer();

  // Send to backend
  socket.emit('door-upload', {
    filename: file.name,
    content: Buffer.from(buffer)
  });
});
```

**For testing, you can use the test door:**
```
File: ~/Code/AmiExpress-Web/backend/test-door.zip
```

#### Step 4: Verify Upload Success

After upload, you should automatically see the door information page:

```
-= DOOR INFORMATION =-

Name:       Test Door
Type:       TypeScript (.ts)
Size:       997 bytes
Date:       2025-10-17
Installed:  NO

--- FILE_ID.DIZ ---
Test Door v1.0
By AmiExpress Team

A simple test door for
demonstrating the Door Manager
upload functionality.

Type: Test Door
Date: 2025-10-17
-------------------

[I] Install  [D] Documentation  [B] Back  [Q] Quit
```

#### Step 5: Check File Saved

Verify the file was saved to the archives directory:

```bash
ls -lh doors/archives/test-door.zip
```

Expected output:
```
-rw-r--r--  1 user  staff   997B Oct 17 10:12 doors/archives/test-door.zip
```

#### Step 6: Test Installation (Optional)

From the door information page, press `I` to install the door.

Expected behavior:
- Door extracted to `doors/` directory
- `test-door.ts` file created
- Door marked as "Installed: YES"
- Door appears in the main door list

---

## Backend Socket Event Handler

The upload is handled by this socket event in `src/index.ts` (lines 1139-1214):

```typescript
socket.on('door-upload', async (data: { filename: string; content: Buffer | string }) => {
  console.log('[DOOR UPLOAD] Received file:', data.filename);

  const session = await sessions.get(socket.id);
  if (!session || session.user.securityLevel < 255) {
    socket.emit('door-upload-error', { message: 'Access denied: Sysop only' });
    return;
  }

  // Validate filename (ZIP only)
  const filename = path.basename(data.filename);
  if (!filename.toLowerCase().endsWith('.zip')) {
    socket.emit('door-upload-error', { message: 'Only ZIP files are accepted' });
    return;
  }

  // Convert and validate size (10MB max)
  const buffer = Buffer.isBuffer(data.content) ? data.content : Buffer.from(data.content, 'base64');
  if (buffer.length > 10 * 1024 * 1024) {
    socket.emit('door-upload-error', { message: 'File too large (max 10MB)' });
    return;
  }

  // Save file
  const filepath = path.join(archivesPath, filename);
  fs.writeFileSync(filepath, buffer);

  console.log('[DOOR UPLOAD] File saved:', filepath);

  // Re-scan doors and show info page
  await displayDoorManager(socket, session);
  const newDoor = session.tempData.doorList.find((d: any) => d.filename === filename);
  if (newDoor) {
    session.tempData.selectedIndex = session.tempData.doorList.indexOf(newDoor);
    session.tempData.doorManagerMode = 'info';
    displayDoorManagerInfo(socket, session);
  }

  console.log('[DOOR UPLOAD] Complete, showing info page');
});
```

---

## Validation Checks

The upload handler performs these validations:

1. **Security Check**
   - Only sysops (securityLevel >= 255) can upload
   - Returns "Access denied: Sysop only" error for regular users

2. **File Type Check**
   - Only `.zip` files accepted
   - Returns "Only ZIP files are accepted" error for other types

3. **File Size Check**
   - Maximum 10MB
   - Returns "File too large (max 10MB)" error if exceeded

4. **Path Safety**
   - Uses `path.basename()` to prevent path traversal
   - Files saved to `doors/archives/` only

---

## Expected Server Logs

When upload is successful, you should see these console logs:

```
[DOOR UPLOAD] Received file: test-door.zip
[DOOR UPLOAD] File saved: ~/Code/AmiExpress-Web/backend/doors/archives/test-door.zip
[DOOR UPLOAD] Complete, showing info page
```

---

## Error Scenarios

### 1. Non-ZIP File

**Action:** Upload a `.txt` or other file type

**Expected:**
```
Error: Only ZIP files are accepted
```

### 2. File Too Large

**Action:** Upload a file over 10MB

**Expected:**
```
Error: File too large (max 10MB)
```

### 3. Non-Sysop User

**Action:** Regular user (securityLevel < 255) tries to upload

**Expected:**
```
Error: Access denied: Sysop only
```

### 4. Cancel Upload

**Action:** Press `Q` while in upload mode

**Expected:**
- Returns to door list
- No upload occurs

---

## Test Checklist

- [ ] Door Manager accessible via DOORMAN command
- [ ] [U] Upload option visible in footer
- [ ] Upload mode displays instructions
- [ ] File selection triggers upload event
- [ ] Backend receives file correctly
- [ ] File saved to doors/archives/
- [ ] Info page displayed automatically
- [ ] FILE_ID.DIZ parsed and displayed
- [ ] Install option available
- [ ] Installation extracts door
- [ ] Installed door appears in list

---

## Troubleshooting

### Upload button does nothing

**Cause:** Frontend file upload not implemented

**Fix:** Add file input and socket emit in frontend:
```typescript
socket.emit('door-upload', { filename, content });
```

### "Access denied" error

**Cause:** Not logged in as sysop

**Fix:** Login with user that has securityLevel = 255

### File not appearing in archives

**Cause:** Directory doesn't exist

**Fix:**
```bash
mkdir -p doors/archives
chmod 755 doors/archives
```

### Upload succeeds but no info page

**Cause:** Door scanning failed

**Fix:** Check console for errors in `displayDoorManager()` function

---

## Frontend Implementation Example

Complete frontend upload implementation:

```typescript
// Add file input to upload UI
socket.on('ansi-output', (data: string) => {
  const text = stripAnsi(data);

  if (text.includes('UPLOAD DOOR ARCHIVE')) {
    // Show file picker
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip';

    input.addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      // Validate size
      if (file.size > 10 * 1024 * 1024) {
        console.error('File too large');
        return;
      }

      // Read file
      const buffer = await file.arrayBuffer();

      // Send to backend
      socket.emit('door-upload', {
        filename: file.name,
        content: Buffer.from(buffer)
      });

      console.log('Upload sent:', file.name, file.size, 'bytes');
    });

    input.click();
  }
});

// Listen for upload errors
socket.on('door-upload-error', (data: { message: string }) => {
  console.error('Upload failed:', data.message);
  alert('Upload failed: ' + data.message);
});
```

---

## Success Criteria

Upload functionality is working correctly when:

1. ✅ Sysop can access upload mode via [U] key
2. ✅ File selection triggers upload to backend
3. ✅ Backend validates and saves file
4. ✅ Info page displays automatically
5. ✅ FILE_ID.DIZ parsed correctly
6. ✅ Door can be installed from info page
7. ✅ Installed door appears in door list
8. ✅ Error handling works for invalid uploads

---

## Test Door Details

The included `test-door.zip` contains a simple TypeScript door that:

- Displays a welcome message
- Shows "Upload functionality is working correctly!"
- Waits for key press
- Returns to BBS

This provides a complete end-to-end test of the upload and installation system.

---

## Next Steps After Testing

Once upload is verified working:

1. Test with real Amiga door archives
2. Test FILE_ID.DIZ parsing with various formats
3. Test documentation viewer with different file types
4. Test uninstall functionality
5. Test door execution after installation

---

**Created:** 2025-10-17
**Status:** Ready for Testing
**Test Door:** `test-door.zip` (997 bytes)
