# BBS Import/Export User Guide

**AmiExpress-Web Import/Export System**
**Version**: 1.0
**Date**: November 13, 2025

---

## Table of Contents

1. [Overview](#overview)
2. [Supported Formats](#supported-formats)
3. [Before You Begin](#before-you-begin)
4. [Import Workflow](#import-workflow)
5. [Conflict Resolution](#conflict-resolution)
6. [Troubleshooting](#troubleshooting)
7. [Best Practices](#best-practices)
8. [FAQ](#faq)

---

## Overview

The AmiExpress-Web Import/Export system allows you to:

- **Import** complete Amiga AmiExpress BBS archives into the modern web-based system
- **Migrate** from classic Amiga hardware to the web
- **Preserve** all user data, conferences, messages, and configurations
- **Merge** multiple BBS archives intelligently

This guide focuses on the **import** functionality. Export functionality is coming soon.

---

## Supported Formats

### Archive Formats

The importer supports these archive formats:

- **LHA** (.lha) - Standard Amiga archive format
- **LZX** (.lzx) - Advanced Amiga compression
- **ZIP** (.zip) - Cross-platform format
- **TAR** (.tar, .tar.gz, .tgz) - Unix archive format

### File Size Limit

- Maximum archive size: **100 MB**
- For larger archives, consider splitting or contacting the sysop

### What Gets Imported

✅ **User Accounts**
- Usernames, passwords (preserved), real names
- Security levels, flags, access rights
- Statistics (uploads, downloads, calls)
- Time limits, byte limits
- Preferences (ANSI, editor, protocol)

✅ **Conferences**
- Conference names and descriptions
- File areas and paths
- Message bases
- Access levels

✅ **Commands & Doors**
- Command definitions
- Door configurations
- Access requirements

✅ **Configuration**
- BBS settings from bbsConfig.info
- SMTP/email settings
- Access level definitions

✅ **Content** (Optional)
- Bulletins
- Screen files
- Custom menus

---

## Before You Begin

### Prerequisites

1. **Sysop Access**
   - You must be logged in as a sysop (security level 255)
   - Regular users cannot access the import interface

2. **Archive Your Current BBS**
   - The import creates a backup, but manual backup is recommended
   - Export current database: Contact system administrator

3. **Prepare Your Archive**
   - Ensure archive is in supported format (LHA, LZX, ZIP, TAR)
   - Verify archive is under 100MB
   - Test archive can be extracted successfully

### Recommended Amiga BBS Structure

Your archive should contain:

```
BBS_Archive/
├── User.data              # User database (required)
├── User.keys              # User key file
├── user.misc              # User misc data
├── bbsConfig.info         # BBS configuration
├── Conf1-Conf14/          # Conference directories
│   ├── Conf.DB            # Conference database
│   ├── Dir*.info          # File area definitions
│   └── Messages/          # Message files
├── Commands/              # Command definitions
│   ├── BBSCmd/            # BBS commands
│   └── SysCmd/            # System commands
├── Access/                # Access level definitions
│   └── ACS.*.info
├── Bulletins/             # Bulletin files
├── Screens/               # Screen files
└── Node0-Node5/           # Node directories
```

**Note**: Not all files are required. The importer handles missing data gracefully.

---

## Import Workflow

### Step 1: Access the Import Interface

1. **Log in as Sysop**
   - Username: Your sysop account
   - Password: Your sysop password

2. **Navigate to Import Page**
   - URL: `http://your-bbs-url/admin/import`
   - Or from Admin menu: **System Administration** → **Import/Export**

### Step 2: Upload Archive

**Drag & Drop Method:**
1. Drag your archive file to the upload area
2. File uploads automatically

**File Picker Method:**
1. Click "Choose File" button
2. Select your archive file
3. Click "Open"

**Upload Progress:**
- You'll see a spinner while uploading
- Large files may take 1-2 minutes

### Step 3: Validation (Automatic)

The system automatically validates your archive:

**Validation Checks:**
- ✓ Archive structure
- ✓ File format integrity
- ✓ User data validity
- ✓ Conference consistency
- ✓ Configuration correctness
- ✓ Conflict detection

**Validation Results:**

You'll see a summary showing:
- Number of users, conferences, commands, nodes
- Any errors found
- Warnings (non-critical issues)
- **Conflicts** with existing data

### Step 4: Resolve Conflicts

If conflicts are detected, you'll see them organized by category:

#### User Conflicts

When usernames already exist, choose a strategy:

**Skip** (Default - Safest)
- Don't import users that already exist
- Existing users remain unchanged
- **Use when**: You want to preserve existing accounts

**Replace**
- Overwrite existing users with imported data
- **Warning**: Existing user data is lost!
- **Use when**: Import data is more accurate/recent

**Rename**
- Import users with modified usernames (e.g., "john" → "john2")
- Both accounts coexist
- **Use when**: You want to keep both versions

**Merge**
- Combine statistics from both versions
- Higher values win (calls, uploads, downloads)
- Most recent login preserved
- **Use when**: Same user, different BBS instances

#### Conference Conflicts

When conference names match:

**Skip** (Default)
- Don't import conferences that exist
- **Use when**: Current conferences are correct

**Replace**
- Overwrite existing conferences
- **Warning**: Existing data lost!
- **Use when**: Import has updated structure

**Rename**
- Import with "(Imported)" suffix
- Both conferences exist
- **Use when**: Want to keep both

**Merge**
- Combine file areas and message bases
- **Use when**: Want all content from both

#### Command Conflicts

**Skip** (Default) - Don't import conflicting commands
**Replace** - Replace existing commands

### Step 5: Execute Import

1. **Review Your Choices**
   - Check conflict resolution strategies
   - Verify import settings

2. **Click "Execute Import"**
   - A database backup is created automatically
   - Progress bar shows import status
   - **Do not close browser** during import

3. **Import Progress**
   - Watch progress: 0% → 100%
   - Status updates in real-time
   - Typically takes 30 seconds to 5 minutes

### Step 6: Review Results

**Success:**
- ✓ Green banner: "Import completed successfully!"
- Statistics show items imported
- Any warnings are listed

**Partial Success:**
- ⚠ Some items imported, some skipped
- Review warnings for details
- Database is consistent

**Failure:**
- ✗ Red banner with error message
- Database rolled back to backup
- No changes were made
- Contact administrator with error details

---

## Conflict Resolution

### Understanding Conflicts

**Why conflicts occur:**
- Username already exists in database
- Conference with same name exists
- Command with same name defined

**Conflict is not an error** - it's expected when:
- Merging multiple BBS systems
- Re-importing after changes
- Migrating from Amiga to web

### Strategy Selection Guide

| Scenario | User Strategy | Conference Strategy |
|----------|---------------|---------------------|
| **Fresh import, empty database** | Any (no conflicts) | Any (no conflicts) |
| **Re-import after fixes** | Replace | Replace |
| **Merge two BBSs** | Rename or Merge | Rename or Merge |
| **Preserve existing data** | Skip | Skip |
| **Update statistics only** | Merge | Skip |
| **Test import** | Skip (safest) | Skip (safest) |

### Merge Strategy Details

**User Merge** combines:
- Higher call count
- Higher upload/download counts
- More total time online
- Higher security level
- Most recent login date
- Earliest first login date
- **Keeps existing password** (not imported password)

**Conference Merge** combines:
- All file areas from both
- All message bases from both
- Lower access level (more permissive)
- Existing conference name

---

## Troubleshooting

### Common Issues

#### "Upload failed: File too large"
**Solution**: Archive exceeds 100MB limit
- Compress more aggressively
- Split into multiple archives
- Remove non-essential files (old logs, temp files)

#### "Invalid file type"
**Solution**: File extension not recognized
- Ensure file is .lha, .lzx, .zip, .tar, .gz, or .tgz
- Some files may have incorrect extensions
- Try renaming or re-archiving

#### "Archive structure validation failed"
**Solution**: Archive missing required files
- Check archive contains at least one of: User.data, Conf1/, bbsConfig.info
- Verify archive extracts correctly on your computer
- Some warnings are normal (not all files required)

#### "User.data not found"
**Solution**: User file missing or in wrong location
- Ensure User.data is in archive root, not subdirectory
- File name is case-sensitive on some systems
- Check file isn't corrupted

#### "Import failed: Database error"
**Solution**: Internal error during import
- Database automatically rolled back (safe)
- Check browser console for details
- Contact administrator with session ID

#### "Validation timeout"
**Solution**: Large archive taking too long
- Try smaller archive
- Check server resources
- Contact administrator

### Getting Help

If you encounter issues:

1. **Check this guide** - Most issues are documented
2. **Note the error message** - Copy exact text
3. **Save session ID** - Shown in progress view
4. **Contact sysop/admin** with:
   - Error message
   - Session ID
   - Archive file name
   - Steps you took

---

## Best Practices

### Before Importing

✅ **Test with small archive first**
- Create a minimal test archive
- Import to verify workflow
- Then import full archive

✅ **Backup your current BBS**
- Export current data
- Copy database files
- Document current state

✅ **Review import data**
- Extract archive and inspect
- Check user counts look correct
- Verify file structure

✅ **Plan for conflicts**
- Decide strategy before starting
- Document decisions
- Consider impact on users

### During Import

✅ **Don't close browser window**
- Import may take several minutes
- Closing interrupts process
- Wait for "Complete" message

✅ **Monitor progress**
- Watch for error messages
- Note any warnings
- Save session ID

✅ **Have rollback plan**
- Know how to restore backup
- Have administrator contact info
- Document what you're doing

### After Import

✅ **Verify imported data**
- Spot-check user accounts
- Test conference access
- Verify file areas work

✅ **Review warnings**
- Some warnings are normal
- Others may need attention
- Document for future reference

✅ **Notify users if needed**
- If passwords reset
- If usernames changed
- If data merged

✅ **Clean up**
- Delete uploaded archive (optional)
- Remove temporary files
- Update documentation

---

## FAQ

### General Questions

**Q: Can I import multiple times?**
A: Yes! Use "Skip" strategy to avoid duplicates, or "Merge" to combine data.

**Q: Will this overwrite my current BBS?**
A: Depends on conflict strategy. "Skip" is safest. "Replace" overwrites. Backup is automatic.

**Q: Can I undo an import?**
A: Not directly, but automatic backup allows restoration. Contact administrator.

**Q: How long does import take?**
A: Small BBS: 30 seconds. Large BBS: 3-5 minutes. Very large: up to 10 minutes.

**Q: What if import fails?**
A: Database automatically rolls back. No changes are made. Safe to retry.

### Data Questions

**Q: Are passwords preserved?**
A: Yes, password hashes are preserved. Users can login with Amiga passwords.

**Q: What happens to user statistics?**
A: Fully preserved: uploads, downloads, calls, time online, ratios.

**Q: Can I import partial data?**
A: Yes, the system handles missing files gracefully. Import what you have.

**Q: Are message bases imported?**
A: Structure is imported. Message content import coming in future version.

**Q: Do doors still work?**
A: Command definitions are imported. Door binaries need separate installation.

### Technical Questions

**Q: What encoding is used?**
A: Detects Amiga (ISO-8859-1/Latin-1) and converts to UTF-8 automatically.

**Q: Are file areas preserved?**
A: Paths and definitions preserved. Files themselves need separate transfer.

**Q: How are security levels mapped?**
A: Intelligently mapped from Amiga 0-255 scale to modern system.

**Q: Can I automate imports?**
A: API available for automation. See developer documentation.

---

## Support

For additional help:

- **Documentation**: `/Documentation/` directory
- **Developer Guide**: `IMPORT_DEVELOPER_GUIDE.md`
- **API Documentation**: `IMPORT_API_REFERENCE.md`
- **BBS Forums**: Post in Sysop conference
- **GitHub Issues**: Report bugs at repository

---

## Version History

- **1.0** (2025-11-13) - Initial release
  - Complete import workflow
  - Conflict resolution
  - Smart variation handling
  - Web UI interface

---

**End of User Guide**

For technical details, see `IMPORT_DEVELOPER_GUIDE.md`
