# Door File I/O Usage Guide

**How Amiga Door Programs Use the File I/O Implementation**

## Overview

With the complete DOS.library file I/O implementation, doors can now read and write real files. This document shows practical examples of how doors will use these functions.

## Common Door File Operations

### 1. Reading node{n}.user File

Most doors need to read the node user file to get information about the current user.

**Typical door code:**
```c
#include <dos/dos.h>
#include <proto/dos.h>

struct UserData {
    char name[30];
    LONG secLevel;
    LONG timeLeft;
    // ... more fields
};

void readUserFile(void) {
    BPTR fh;
    struct UserData user;
    LONG bytesRead;

    // Open node1.user (or node2.user, etc. depending on node)
    fh = Open("BBS:Node1/node1.user", MODE_OLDFILE);
    if (fh) {
        // Read user structure
        bytesRead = Read(fh, &user, sizeof(struct UserData));

        if (bytesRead == sizeof(struct UserData)) {
            // Successfully read user data
            printf("User: %s\n", user.name);
            printf("Security Level: %ld\n", user.secLevel);
            printf("Time Left: %ld minutes\n", user.timeLeft);
        }

        Close(fh);
    } else {
        printf("Error: Could not open user file\n");
    }
}
```

**What happens in emulator:**
1. Door calls `Open("BBS:Node1/node1.user", 1005)`
2. DosLibrary resolves path to `~/Code/amiexpress-web/Node1/node1.user`
3. File is loaded into memory buffer
4. Handle 4 returned in D0
5. Door calls `Read(4, buffer_address, size)`
6. DosLibrary copies bytes from buffer to emulator memory
7. Door processes user data
8. Door calls `Close(4)`
9. DosLibrary frees file handle

### 2. Loading Configuration File

Doors often have configuration files for game settings, high scores, etc.

**Typical door code:**
```c
#include <dos/dos.h>

#define CONFIG_FILE "BBS:Doors/MyDoor/config.dat"

struct Config {
    LONG maxPlayers;
    LONG difficulty;
    LONG gameSpeed;
    char welcomeMsg[80];
};

BOOL loadConfig(struct Config *cfg) {
    BPTR fh;
    LONG bytesRead;

    fh = Open(CONFIG_FILE, MODE_OLDFILE);
    if (!fh) {
        // Config file doesn't exist - use defaults
        cfg->maxPlayers = 4;
        cfg->difficulty = 2;
        cfg->gameSpeed = 50;
        strcpy(cfg->welcomeMsg, "Welcome to My Door!");
        return FALSE;
    }

    bytesRead = Read(fh, cfg, sizeof(struct Config));
    Close(fh);

    return (bytesRead == sizeof(struct Config));
}
```

**What happens in emulator:**
1. Door tries to open `BBS:Doors/MyDoor/config.dat`
2. If file exists, it's loaded into memory
3. Door reads configuration data
4. If file doesn't exist, Open() returns 0 and door uses defaults

### 3. Saving High Scores

Doors typically maintain high score files.

**Typical door code:**
```c
#include <dos/dos.h>

#define SCORES_FILE "BBS:Doors/MyDoor/scores.dat"

struct HighScore {
    char playerName[30];
    LONG score;
    LONG date;
};

void saveHighScores(struct HighScore *scores, int count) {
    BPTR fh;
    LONG bytesWritten;

    // Open for writing (creates or overwrites file)
    fh = Open(SCORES_FILE, MODE_NEWFILE);
    if (!fh) {
        printf("Error: Could not save high scores\n");
        return;
    }

    // Write all scores
    bytesWritten = Write(fh, scores, count * sizeof(struct HighScore));

    // Close flushes to disk
    Close(fh);

    if (bytesWritten == count * sizeof(struct HighScore)) {
        printf("High scores saved!\n");
    } else {
        printf("Error writing high scores\n");
    }
}
```

**What happens in emulator:**
1. Door calls `Open("BBS:Doors/MyDoor/scores.dat", 1006)`
2. DosLibrary creates empty buffer (file will be created)
3. Handle 4 returned
4. Door calls `Write(4, scores_address, size)`
5. DosLibrary copies bytes from emulator memory to buffer
6. Door calls `Close(4)`
7. DosLibrary writes buffer to disk at `~/Code/amiexpress-web/Doors/MyDoor/scores.dat`

### 4. Reading Line-by-Line

Some doors read text files line by line.

**Typical door code:**
```c
#include <dos/dos.h>

void readTextFile(void) {
    BPTR fh;
    char buffer[256];
    char ch;
    int pos = 0;
    LONG bytesRead;

    fh = Open("BBS:Doors/MyDoor/messages.txt", MODE_OLDFILE);
    if (!fh) {
        return;
    }

    // Read file character by character
    while ((bytesRead = Read(fh, &ch, 1)) == 1) {
        if (ch == '\n') {
            // End of line - process buffer
            buffer[pos] = '\0';
            printf("%s\n", buffer);
            pos = 0;
        } else {
            buffer[pos++] = ch;
            if (pos >= 255) {
                // Line too long - process and reset
                buffer[pos] = '\0';
                printf("%s\n", buffer);
                pos = 0;
            }
        }
    }

    Close(fh);
}
```

**What happens in emulator:**
1. File loaded into memory on Open()
2. Each Read(fh, &ch, 1) copies 1 byte from buffer
3. File position advances by 1
4. When position reaches end, Read() returns 0 (EOF)

### 5. Random Access Files

Doors with player databases often use random access.

**Typical door code:**
```c
#include <dos/dos.h>

#define PLAYER_DB "BBS:Doors/MyDoor/players.dat"

struct Player {
    char name[30];
    LONG level;
    LONG experience;
    LONG gold;
};

BOOL loadPlayer(const char *name, struct Player *player) {
    BPTR fh;
    struct Player temp;
    LONG position;
    BOOL found = FALSE;

    fh = Open(PLAYER_DB, MODE_OLDFILE);
    if (!fh) {
        return FALSE;
    }

    // Search through players
    while (Read(fh, &temp, sizeof(struct Player)) == sizeof(struct Player)) {
        if (strcmp(temp.name, name) == 0) {
            // Found player
            memcpy(player, &temp, sizeof(struct Player));
            found = TRUE;
            break;
        }
    }

    Close(fh);
    return found;
}

BOOL savePlayer(struct Player *player) {
    BPTR fh;
    struct Player temp;
    LONG position;
    BOOL found = FALSE;

    fh = Open(PLAYER_DB, MODE_READWRITE);
    if (!fh) {
        // File doesn't exist - create it
        fh = Open(PLAYER_DB, MODE_NEWFILE);
        if (!fh) return FALSE;
        Write(fh, player, sizeof(struct Player));
        Close(fh);
        return TRUE;
    }

    // Search for existing player
    position = 0;
    while (Read(fh, &temp, sizeof(struct Player)) == sizeof(struct Player)) {
        if (strcmp(temp.name, player->name) == 0) {
            // Found - seek back and overwrite
            Seek(fh, position, OFFSET_BEGINNING);
            Write(fh, player, sizeof(struct Player));
            found = TRUE;
            break;
        }
        position += sizeof(struct Player);
    }

    if (!found) {
        // Not found - append at end
        Write(fh, player, sizeof(struct Player));
    }

    Close(fh);
    return TRUE;
}
```

**What happens in emulator:**
1. File loaded into memory on Open()
2. Read() advances through file sequentially
3. When match found, Seek() changes file position
4. Write() overwrites data at new position
5. Close() flushes modified buffer to disk

### 6. Binary File Processing

Doors that work with binary data (images, maps, etc.).

**Typical door code:**
```c
#include <dos/dos.h>

void processMapFile(void) {
    BPTR fh;
    UBYTE header[16];
    LONG width, height;
    UBYTE *mapData;
    LONG bytesRead;

    fh = Open("BBS:Doors/MyDoor/map.dat", MODE_OLDFILE);
    if (!fh) {
        printf("Map file not found\n");
        return;
    }

    // Read header
    bytesRead = Read(fh, header, 16);
    if (bytesRead != 16) {
        Close(fh);
        return;
    }

    // Parse dimensions from header
    width = (header[0] << 8) | header[1];
    height = (header[2] << 8) | header[3];

    printf("Map size: %ldx%ld\n", width, height);

    // Allocate memory for map
    mapData = AllocMem(width * height, MEMF_PUBLIC);
    if (mapData) {
        // Read map data
        bytesRead = Read(fh, mapData, width * height);

        if (bytesRead == width * height) {
            // Process map data
            processMap(mapData, width, height);
        }

        FreeMem(mapData, width * height);
    }

    Close(fh);
}
```

**What happens in emulator:**
1. Binary file loaded into memory
2. Door reads header bytes
3. Door reads map data
4. All data is in binary format (not text)

### 7. Logging

Doors often write log files.

**Typical door code:**
```c
#include <dos/dos.h>
#include <proto/dos.h>

void logMessage(const char *msg) {
    BPTR fh;
    char timestamp[32];
    struct DateStamp ds;

    // Get current time
    DateStamp(&ds);
    sprintf(timestamp, "[%ld:%02ld] ", ds.ds_Minute / 60, ds.ds_Minute % 60);

    // Open log file in append mode
    fh = Open("BBS:Doors/MyDoor/game.log", MODE_READWRITE);
    if (fh) {
        // Seek to end
        Seek(fh, 0, OFFSET_END);
    } else {
        // Create new file
        fh = Open("BBS:Doors/MyDoor/game.log", MODE_NEWFILE);
    }

    if (fh) {
        Write(fh, timestamp, strlen(timestamp));
        Write(fh, msg, strlen(msg));
        Write(fh, "\n", 1);
        Close(fh);
    }
}
```

**What happens in emulator:**
1. Try to open log file for read/write
2. If exists, file loaded and Seek() moves to end
3. If doesn't exist, create new file
4. Write log entry
5. Close() flushes to disk

## File Paths

### BBS: Device

The BBS: logical device maps to `~/Code/amiexpress-web`:

```
BBS:Node1/node1.user           → ~/Code/amiexpress-web/Node1/node1.user
BBS:Doors/MyDoor/config.dat    → ~/Code/amiexpress-web/Doors/MyDoor/config.dat
BBS:Doors/MyDoor/scores.dat    → ~/Code/amiexpress-web/Doors/MyDoor/scores.dat
```

### Relative Paths

Relative paths are assumed from BBS: base:

```
Node1/node1.user               → ~/Code/amiexpress-web/Node1/node1.user
Doors/MyDoor/data.dat          → ~/Code/amiexpress-web/Doors/MyDoor/data.dat
```

### Absolute Paths

Absolute paths starting with / are used as-is:

```
/tmp/door-temp.dat             → /tmp/door-temp.dat
```

## Error Handling

Doors should always check return values:

```c
BPTR fh;
LONG bytesRead;
char buffer[256];

fh = Open("BBS:Node1/node1.user", MODE_OLDFILE);
if (!fh) {
    // Open failed
    LONG error = IoErr();
    printf("Error opening file: %ld\n", error);
    return;
}

bytesRead = Read(fh, buffer, 256);
if (bytesRead < 0) {
    // Read failed
    LONG error = IoErr();
    printf("Error reading file: %ld\n", error);
    Close(fh);
    return;
}

Close(fh);
```

## Common Patterns

### Safe File Reading

```c
BPTR fh;
LONG fileSize;
UBYTE *buffer;

fh = Open("BBS:file.dat", MODE_OLDFILE);
if (fh) {
    // Get file size
    Seek(fh, 0, OFFSET_END);
    fileSize = Seek(fh, 0, OFFSET_BEGINNING);

    // Allocate buffer
    buffer = AllocMem(fileSize, MEMF_PUBLIC);
    if (buffer) {
        // Read entire file
        if (Read(fh, buffer, fileSize) == fileSize) {
            // Process data
            processData(buffer, fileSize);
        }
        FreeMem(buffer, fileSize);
    }
    Close(fh);
}
```

### Safe File Writing

```c
BPTR fh;
UBYTE *data;
LONG dataSize;

// Prepare data
data = prepareData(&dataSize);

fh = Open("BBS:output.dat", MODE_NEWFILE);
if (fh) {
    if (Write(fh, data, dataSize) == dataSize) {
        printf("Data saved successfully\n");
    } else {
        printf("Error writing data\n");
    }
    Close(fh);
} else {
    printf("Could not create file\n");
}

FreeMem(data, dataSize);
```

### Atomic Updates

```c
// Write to temporary file, then rename
BPTR fh;
BOOL success = FALSE;

fh = Open("BBS:scores.dat.tmp", MODE_NEWFILE);
if (fh) {
    if (Write(fh, data, size) == size) {
        Close(fh);

        // Delete old file and rename
        DeleteFile("BBS:scores.dat");
        if (Rename("BBS:scores.dat.tmp", "BBS:scores.dat")) {
            success = TRUE;
        }
    } else {
        Close(fh);
        DeleteFile("BBS:scores.dat.tmp");
    }
}
```

## Performance Tips

1. **Read entire files at once** - Faster than byte-by-byte
2. **Use proper buffer sizes** - Don't allocate huge buffers unnecessarily
3. **Minimize Open/Close cycles** - Keep files open during processing
4. **Use Seek() efficiently** - Random access is fast with memory buffers
5. **Close files promptly** - Ensures data is flushed to disk

## Debugging

To debug file I/O issues, check backend logs:

```bash
tail -f /tmp/backend.log | grep "dos.library"
```

You'll see:
```
[dos.library] Open(filename="BBS:Node1/node1.user", mode=1005)
[dos.library] Resolving Amiga path: "BBS:Node1/node1.user"
[dos.library] BBS: device -> ~/Code/amiexpress-web/Node1/node1.user
[dos.library] Open: File opened for reading (256 bytes) -> handle 4
[dos.library] Read(handle=4, buffer=0x10000, length=256)
[dos.library] Read returned: 256 bytes (position now 256)
[dos.library] Close(handle=4)
[dos.library] Close: File closed successfully
```

## Summary

The DOS.library file I/O implementation allows doors to:

1. **Read user data** - node{n}.user files
2. **Load configuration** - Door settings and options
3. **Save game state** - High scores, player data, etc.
4. **Access resources** - Maps, graphics, text files
5. **Write logs** - Game events, errors, statistics
6. **Create/modify files** - Any file operation needed

All standard Amiga file I/O patterns are supported, making it easy to port existing doors to the web BBS.
