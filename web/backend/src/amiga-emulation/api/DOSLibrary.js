"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DosLibrary = void 0;
var MoiraEmulator_1 = require("../cpu/MoiraEmulator");
var fs = require("fs");
var path = require("path");
/**
 * dos.library - Amiga DOS Library
 * Provides file I/O, console I/O, and file system operations
 *
 * Complete function offset table (all negative from library base):
 * -30 = Open          -36 = Close         -42 = Read          -48 = Write
 * -54 = Input         -60 = Output        -66 = Seek          -72 = DeleteFile
 * -78 = Rename        -84 = Lock          -90 = UnLock        -96 = DupLock
 * -102 = Examine      -108 = ExNext       -114 = Info         -120 = CreateDir
 * -126 = CurrentDir   -132 = IoErr        -138 = CreateProc   -144 = Exit
 * -150 = LoadSeg      -156 = UnLoadSeg    -162 = DeviceProc   -168 = SetComment
 * -174 = SetProtection -180 = DateStamp   -186 = Delay        -192 = WaitForChar
 * -198 = ParentDir    -204 = IsInteractive -210 = Execute
 *
 * IMPORTANT: Standard dos.library uses -192/-198/-204 for DateStamp/Delay/WaitForChar
 * This table may have older/alternate offsets - doors use standard offsets
 *
 * Note: Some doors may also use undocumented/private offsets
 */
// Amiga DOS mode constants (from dos/dos.h)
var MODE_OLDFILE = 1005; // Open existing file for reading
var MODE_NEWFILE = 1006; // Create new file or overwrite existing
var MODE_READWRITE = 1004; // Open existing file for read/write
// Seek modes (from dos/dos.h)
var OFFSET_BEGINNING = -1; // Seek from start of file
var OFFSET_CURRENT = 0; // Seek from current position
var OFFSET_END = 1; // Seek from end of file
var DosLibrary = /** @class */ (function () {
    function DosLibrary(emulator) {
        this.openFiles = new Map();
        this.nextFileId = 4; // Start after STDIN/STDOUT/STDERR
        this.outputCallback = null;
        this.inputBuffer = '';
        this.lastError = 0;
        // Standard file handles
        this.STDIN_HANDLE = 1;
        this.STDOUT_HANDLE = 2;
        this.STDERR_HANDLE = 3;
        this.NIL_HANDLE = 99; // Special handle for NIL: device
        // DOS error codes
        this.ERROR_NO_ERROR = 0;
        this.ERROR_OBJECT_NOT_FOUND = 205;
        this.ERROR_OBJECT_IN_USE = 202;
        this.ERROR_NO_FREE_STORE = 103;
        this.ERROR_READ_PROTECTED = 204;
        this.ERROR_WRITE_PROTECTED = 214;
        this.ERROR_NO_MORE_ENTRIES = 232;
        // Base path for BBS: logical device
        this.BBS_BASE_PATH = '~/Code/amiexpress-web';
        // Directory and lock management for door support
        this.currentDirectory = this.BBS_BASE_PATH;
        this.doorDirectory = ''; // Set by AmigaDoorSession for PROGDIR: device
        this.locks = new Map();
        this.nextLockId = 1;
        // Directory iteration for ExNext()
        this.dirIterators = new Map();
        this.dirIteratorIndex = new Map();
        // Inherited input/output handles from parent process
        // AmiExpress sets SYS_INPUT=0, SYS_OUTPUT=0 (or doorTrapFH) when launching doors
        // Per AmigaDOS spec: "Input() is used to identify the initial input stream allocated when
        // the program was initiated. Never close the filehandle returned by Input!"
        this.inheritedInput = 0; // 0 = NIL for doors
        this.inheritedOutput = 0; // 0 = NIL for doors
        // Track when delay should end
        this.delayUntil = 0;
        this.emulator = emulator;
        // Initialize standard I/O handles
        this.openFiles.set(this.STDIN_HANDLE, {
            id: this.STDIN_HANDLE,
            name: 'STDIN',
            mode: MODE_OLDFILE,
            position: 0,
            isConsole: true
        });
        this.openFiles.set(this.STDOUT_HANDLE, {
            id: this.STDOUT_HANDLE,
            name: 'STDOUT',
            mode: MODE_NEWFILE,
            position: 0,
            isConsole: true
        });
        this.openFiles.set(this.STDERR_HANDLE, {
            id: this.STDERR_HANDLE,
            name: 'STDERR',
            mode: MODE_NEWFILE,
            position: 0,
            isConsole: true
        });
        // NIL: device (like /dev/null)
        this.openFiles.set(this.NIL_HANDLE, {
            id: this.NIL_HANDLE,
            name: 'NIL:',
            mode: MODE_OLDFILE,
            position: 0,
            isConsole: false
        });
    }
    /**
     * Resolve Amiga path to real filesystem path
     * Supports:
     * - PROGDIR:path/file -> ~/Code/amiexpress-web/Doors/DoorName/path/file
     * - Doors:path/file -> ~/Code/amiexpress-web/Doors/path/file
     * - BBS:path/file -> ~/Code/amiexpress-web/path/file
     * - Relative paths -> resolved from current directory
     * - Absolute paths starting with / -> used as-is
     */
    DosLibrary.prototype.resolvePath = function (amigaPath) {
        console.log("[dos.library] Resolving Amiga path: \"".concat(amigaPath, "\""));
        // Handle PROGDIR: device - door's own directory
        if (amigaPath.toUpperCase().startsWith('PROGDIR:')) {
            var relativePath = amigaPath.substring(8);
            var resolved_1 = path.join(this.doorDirectory, relativePath);
            console.log("[dos.library] PROGDIR: device -> ".concat(resolved_1));
            return resolved_1;
        }
        // Handle Doors: device - doors directory root
        if (amigaPath.toUpperCase().startsWith('DOORS:')) {
            var relativePath = amigaPath.substring(6);
            var resolved_2 = path.join(this.BBS_BASE_PATH, 'Doors', relativePath);
            console.log("[dos.library] Doors: device -> ".concat(resolved_2));
            return resolved_2;
        }
        // Handle BBS: device - BBS system files
        if (amigaPath.toUpperCase().startsWith('BBS:')) {
            var relativePath = amigaPath.substring(4);
            var resolved_3 = path.join(this.BBS_BASE_PATH, relativePath);
            console.log("[dos.library] BBS: device -> ".concat(resolved_3));
            return resolved_3;
        }
        // Handle absolute paths
        if (amigaPath.startsWith('/')) {
            console.log("[dos.library] Absolute path -> ".concat(amigaPath));
            return amigaPath;
        }
        // Handle relative paths - resolve from current directory
        var resolved = path.join(this.currentDirectory, amigaPath);
        console.log("[dos.library] Relative path from ".concat(this.currentDirectory, " -> ").concat(resolved));
        return resolved;
    };
    /**
     * Set the door directory for PROGDIR: device
     * Called by AmigaDoorSession when starting a door
     */
    DosLibrary.prototype.setDoorDirectory = function (doorPath) {
        this.doorDirectory = doorPath;
        console.log("[dos.library] PROGDIR: device set to ".concat(doorPath));
        // Set current directory to door directory by default
        this.currentDirectory = doorPath;
        console.log("[dos.library] Current directory set to ".concat(doorPath));
    };
    /**
     * Set callback for stdout/stderr output
     */
    DosLibrary.prototype.setOutputCallback = function (callback) {
        this.outputCallback = callback;
    };
    /**
     * Queue input data from user
     */
    DosLibrary.prototype.queueInput = function (data) {
        this.inputBuffer += data;
    };
    /**
     * Open - Open a file
     * D1 = filename (pointer to BCPL string or C string)
     * D2 = access mode (MODE_OLDFILE=1005, MODE_NEWFILE=1006, MODE_READWRITE=1004)
     * Returns: D0 = file handle (or 0 if failed)
     */
    DosLibrary.prototype.Open = function () {
        var namePtr = this.emulator.getRegister(MoiraEmulator_1.CPURegister.D1);
        var mode = this.emulator.getRegister(MoiraEmulator_1.CPURegister.D2);
        var filename = this.readString(namePtr);
        console.log("[dos.library] Open(filename=\"".concat(filename, "\", mode=").concat(mode, ")"));
        var fileId = 0;
        // Handle special devices
        // Check if filename starts with "con:" (case-insensitive) - handles all console specifications
        // Examples: "*", "CON:", "CONSOLE:", "con:10/10/320/80/Output/auto/close/wait"
        var isConsoleDevice = filename === '*' ||
            filename.toUpperCase() === 'CONSOLE:' ||
            filename.toUpperCase().startsWith('CON:');
        if (isConsoleDevice) {
            // Explicitly opened console - allocate a new handle (not the standard stdout)
            // The door can and should close this handle
            fileId = this.nextFileId++;
            this.openFiles.set(fileId, {
                id: fileId,
                name: filename,
                mode: mode,
                position: 0,
                isConsole: true,
                buffer: undefined,
                realPath: undefined
            });
            this.lastError = this.ERROR_NO_ERROR;
            console.log("[dos.library] Open: Console device \"".concat(filename, "\" -> handle ").concat(fileId));
        }
        else if (filename === 'NIL:' || filename === 'NIL') {
            // NIL: device - allocate a new handle
            fileId = this.nextFileId++;
            this.openFiles.set(fileId, {
                id: fileId,
                name: filename,
                mode: mode,
                position: 0,
                isConsole: false,
                buffer: undefined,
                realPath: undefined
            });
            this.lastError = this.ERROR_NO_ERROR;
            console.log("[dos.library] Open: NIL: device -> handle ".concat(fileId));
        }
        else {
            // Real file - resolve path and attempt to open
            var realPath = this.resolvePath(filename);
            if (!realPath) {
                console.error("[dos.library] Open: Failed to resolve path \"".concat(filename, "\""));
                fileId = 0;
                this.lastError = this.ERROR_OBJECT_NOT_FOUND;
            }
            else {
                try {
                    var buffer = void 0;
                    if (mode === MODE_OLDFILE || mode === MODE_READWRITE) {
                        // Read mode - file must exist
                        if (!fs.existsSync(realPath)) {
                            console.error("[dos.library] Open: File not found: ".concat(realPath));
                            fileId = 0;
                            this.lastError = this.ERROR_OBJECT_NOT_FOUND;
                        }
                        else {
                            // Load entire file into memory
                            buffer = fs.readFileSync(realPath);
                            fileId = this.nextFileId++;
                            console.log("[dos.library] Open: File opened for reading (".concat(buffer.length, " bytes) -> handle ").concat(fileId));
                        }
                    }
                    else if (mode === MODE_NEWFILE) {
                        // Write mode - create new file or truncate existing
                        buffer = Buffer.alloc(0);
                        fileId = this.nextFileId++;
                        console.log("[dos.library] Open: File opened for writing -> handle ".concat(fileId));
                    }
                    else {
                        console.error("[dos.library] Open: Unknown mode ".concat(mode));
                        fileId = 0;
                        this.lastError = this.ERROR_OBJECT_NOT_FOUND;
                    }
                    if (fileId > 0) {
                        // Store file handle
                        this.openFiles.set(fileId, {
                            id: fileId,
                            name: filename,
                            mode: mode,
                            position: 0,
                            isConsole: false,
                            buffer: buffer,
                            realPath: realPath
                        });
                        this.lastError = this.ERROR_NO_ERROR;
                    }
                }
                catch (error) {
                    console.error("[dos.library] Open: Error opening file ".concat(realPath, ":"), error);
                    fileId = 0;
                    this.lastError = this.ERROR_OBJECT_NOT_FOUND;
                }
            }
        }
        console.log("[dos.library] Open returned: ".concat(fileId));
        return fileId;
    };
    /**
     * Close - Close a file
     * D1 = file handle
     * Returns: D0 = success (DOSTRUE=-1, DOSFALSE=0)
     *
     * From AmigaDOS spec:
     * - Close(0) does nothing and returns success (V47+)
     * - Standard handles should not be closed
     * - If Close() fails, the file handle is STILL deallocated
     * - On success: restores IoErr() to value before call
     * - On failure: sets IoErr() to error code
     */
    DosLibrary.prototype.Close = function () {
        var handle = this.emulator.getRegister(MoiraEmulator_1.CPURegister.D1);
        console.log("[dos.library] Close(handle=".concat(handle, ")"));
        // V47+ behavior: Close(0) does nothing and returns success
        if (handle === 0) {
            console.log("[dos.library] Close(0): No-op, returning success");
            return -1; // DOSTRUE
        }
        // Standard handles should not be closed
        if (handle <= 3 || handle === this.NIL_HANDLE) {
            console.log("[dos.library] Close: Standard handle ".concat(handle, ", returning success without closing"));
            return -1; // DOSTRUE
        }
        var fileHandle = this.openFiles.get(handle);
        if (!fileHandle) {
            console.error("[dos.library] Close: Invalid handle ".concat(handle));
            this.lastError = this.ERROR_OBJECT_NOT_FOUND;
            return 0; // DOSFALSE
        }
        // Save previous IoErr value (will restore on success)
        var previousIoErr = this.lastError;
        var success = true;
        // If file was opened for writing, flush buffer to disk
        if (fileHandle.mode === MODE_NEWFILE || fileHandle.mode === MODE_READWRITE) {
            if (fileHandle.realPath && fileHandle.buffer) {
                try {
                    fs.writeFileSync(fileHandle.realPath, fileHandle.buffer);
                    console.log("[dos.library] Close: Wrote ".concat(fileHandle.buffer.length, " bytes to ").concat(fileHandle.realPath));
                }
                catch (error) {
                    console.error("[dos.library] Close: Error writing file ".concat(fileHandle.realPath, ":"), error);
                    this.lastError = this.ERROR_WRITE_PROTECTED;
                    success = false;
                    // NOTE: Still deallocate handle below (per spec)
                }
            }
        }
        // ALWAYS deallocate the handle, even on failure (per AmigaDOS spec)
        this.openFiles.delete(handle);
        if (success) {
            // On success: restore IoErr() to previous value (per spec)
            this.lastError = previousIoErr;
            console.log("[dos.library] Close: File closed successfully, IoErr restored to ".concat(previousIoErr));
            return -1; // DOSTRUE
        }
        else {
            // On failure: IoErr already set above
            console.log("[dos.library] Close: Failed but handle deallocated, IoErr=".concat(this.lastError));
            return 0; // DOSFALSE
        }
    };
    /**
     * Read - Read from a file
     * D1 = file handle
     * D2 = buffer address
     * D3 = length
     * Returns: D0 = actual length read (or -1 on error)
     */
    DosLibrary.prototype.Read = function () {
        var handle = this.emulator.getRegister(MoiraEmulator_1.CPURegister.D1);
        var bufferAddr = this.emulator.getRegister(MoiraEmulator_1.CPURegister.D2);
        var length = this.emulator.getRegister(MoiraEmulator_1.CPURegister.D3);
        console.log("[dos.library] Read(handle=".concat(handle, ", buffer=0x").concat(bufferAddr.toString(16), ", length=").concat(length, ")"));
        if (handle === this.STDIN_HANDLE) {
            // Read from input buffer
            var bytesToRead_1 = Math.min(length, this.inputBuffer.length);
            for (var i = 0; i < bytesToRead_1; i++) {
                this.emulator.writeMemory(bufferAddr + i, this.inputBuffer.charCodeAt(i));
            }
            // Remove read data from buffer
            this.inputBuffer = this.inputBuffer.substring(bytesToRead_1);
            this.lastError = this.ERROR_NO_ERROR;
            console.log("[dos.library] Read returned: ".concat(bytesToRead_1, " bytes from STDIN"));
            return bytesToRead_1;
        }
        // Handle real file
        var fileHandle = this.openFiles.get(handle);
        if (!fileHandle) {
            console.error("[dos.library] Read: Invalid handle ".concat(handle));
            this.lastError = this.ERROR_OBJECT_NOT_FOUND;
            return -1;
        }
        // NIL: device always returns 0 bytes
        if (handle === this.NIL_HANDLE) {
            this.lastError = this.ERROR_NO_ERROR;
            console.log("[dos.library] Read: NIL: device -> 0 bytes");
            return 0;
        }
        // Check if file has a buffer
        if (!fileHandle.buffer) {
            console.error("[dos.library] Read: No buffer for handle ".concat(handle));
            this.lastError = this.ERROR_READ_PROTECTED;
            return -1;
        }
        // Calculate how many bytes we can read
        var available = fileHandle.buffer.length - fileHandle.position;
        var bytesToRead = Math.min(length, available);
        console.log("[dos.library] Read: position=".concat(fileHandle.position, ", available=").concat(available, ", requested=").concat(length, ", reading=").concat(bytesToRead));
        // Copy bytes from file buffer to emulator memory
        for (var i = 0; i < bytesToRead; i++) {
            var byte = fileHandle.buffer[fileHandle.position + i];
            this.emulator.writeMemory(bufferAddr + i, byte);
        }
        // Update file position
        fileHandle.position += bytesToRead;
        this.lastError = this.ERROR_NO_ERROR;
        console.log("[dos.library] Read returned: ".concat(bytesToRead, " bytes (position now ").concat(fileHandle.position, ")"));
        return bytesToRead;
    };
    /**
     * Write - Write to a file
     * D1 = file handle
     * D2 = buffer address
     * D3 = length
     * Returns: D0 = actual length written (or -1 on error)
     */
    DosLibrary.prototype.Write = function () {
        var handle = this.emulator.getRegister(MoiraEmulator_1.CPURegister.D1);
        var bufferAddr = this.emulator.getRegister(MoiraEmulator_1.CPURegister.D2);
        var length = this.emulator.getRegister(MoiraEmulator_1.CPURegister.D3);
        // Read data from emulated memory
        var bytes = [];
        for (var i = 0; i < length; i++) {
            bytes.push(this.emulator.readMemory(bufferAddr + i));
        }
        // Check if this is a console/stdout/stderr handle
        var fileHandle = this.openFiles.get(handle);
        var isConsoleHandle = (handle === this.STDOUT_HANDLE || handle === this.STDERR_HANDLE ||
            (fileHandle && fileHandle.isConsole));
        if (isConsoleHandle) {
            var text = String.fromCharCode.apply(String, bytes);
            // Send to output callback
            if (this.outputCallback) {
                this.outputCallback(text);
            }
            this.lastError = this.ERROR_NO_ERROR;
            return length;
        }
        // Check if it's NIL: device (discards output)
        var isNilDevice = (handle === this.NIL_HANDLE ||
            (fileHandle && fileHandle.name &&
                (fileHandle.name === 'NIL:' || fileHandle.name === 'NIL')));
        if (isNilDevice) {
            this.lastError = this.ERROR_NO_ERROR;
            console.log("[dos.library] Write: NIL: device -> ".concat(length, " bytes discarded"));
            return length;
        }
        // Handle real file - fileHandle already retrieved above
        if (!fileHandle) {
            console.error("[dos.library] Write: Invalid handle ".concat(handle));
            this.lastError = this.ERROR_OBJECT_NOT_FOUND;
            return -1;
        }
        // Check if file is writable
        if (fileHandle.mode !== MODE_NEWFILE && fileHandle.mode !== MODE_READWRITE) {
            console.error("[dos.library] Write: File not opened for writing (mode=".concat(fileHandle.mode, ")"));
            this.lastError = this.ERROR_WRITE_PROTECTED;
            return -1;
        }
        // Check if file has a buffer
        if (!fileHandle.buffer) {
            console.error("[dos.library] Write: No buffer for handle ".concat(handle));
            this.lastError = this.ERROR_WRITE_PROTECTED;
            return -1;
        }
        console.log("[dos.library] Write: Writing ".concat(length, " bytes at position ").concat(fileHandle.position));
        // Expand buffer if necessary
        var neededSize = fileHandle.position + length;
        if (fileHandle.buffer.length < neededSize) {
            var newBuffer = Buffer.alloc(neededSize);
            fileHandle.buffer.copy(newBuffer);
            fileHandle.buffer = newBuffer;
        }
        // Write bytes to buffer
        for (var i = 0; i < length; i++) {
            fileHandle.buffer[fileHandle.position + i] = bytes[i];
        }
        // Update file position
        fileHandle.position += length;
        this.lastError = this.ERROR_NO_ERROR;
        console.log("[dos.library] Write returned: ".concat(length, " bytes (position now ").concat(fileHandle.position, ")"));
        return length;
    };
    /**
     * Set inherited stdin/stdout handles for the process
     * Called when door session is initialized
     */
    DosLibrary.prototype.setInheritedHandles = function (input, output) {
        this.inheritedInput = input;
        this.inheritedOutput = output;
        console.log("[dos.library] Set inherited handles: Input=".concat(input, ", Output=").concat(output));
    };
    /**
     * Input - Get standard input file handle
     * Returns: D0 = inherited stdin handle
     *
     * From AmigaDOS spec:
     * "Input() is used to identify the initial input stream allocated when
     * the program was initiated. Never close the filehandle returned by Input!"
     */
    DosLibrary.prototype.Input = function () {
        console.log("[dos.library] Input() returning inherited handle ".concat(this.inheritedInput));
        return this.inheritedInput;
    };
    /**
     * Output - Get standard output file handle
     * Returns: D0 = inherited stdout handle
     *
     * From AmigaDOS spec:
     * "Output() is used to identify the initial output stream allocated when
     * the program was initiated."
     */
    DosLibrary.prototype.Output = function () {
        console.log("[dos.library] Output() returning inherited handle ".concat(this.inheritedOutput));
        return this.inheritedOutput;
    };
    /**
     * IoErr - Get last DOS error code
     * Returns: D0 = error code
     */
    DosLibrary.prototype.IoErr = function () {
        console.log("[dos.library] IoErr() returning ".concat(this.lastError));
        return this.lastError;
    };
    /**
     * DateStamp - Get current date/time
     * D1 = pointer to DateStamp structure (3 longs: days, minutes, ticks)
     * Returns: D0 = pointer to DateStamp (same as input)
     *
     * DateStamp structure:
     * - ds_Days: days since Jan 1, 1978
     * - ds_Minute: minutes past midnight (0-1439)
     * - ds_Tick: ticks past minute (0-2999, 50 ticks/sec)
     */
    DosLibrary.prototype.DateStamp = function () {
        var dateStampPtr = this.emulator.getRegister(MoiraEmulator_1.CPURegister.D1);
        // Get current time
        var now = new Date();
        // Calculate days since Jan 1, 1978
        var epoch = new Date('1978-01-01T00:00:00Z');
        var daysSinceEpoch = Math.floor((now.getTime() - epoch.getTime()) / (1000 * 60 * 60 * 24));
        // Calculate minutes past midnight
        var minutesPastMidnight = now.getHours() * 60 + now.getMinutes();
        // Calculate ticks past minute (50 ticks/sec)
        var ticksPastMinute = now.getSeconds() * 50 + Math.floor(now.getMilliseconds() / 20);
        console.log("[dos.library] DateStamp() days=".concat(daysSinceEpoch, ", minutes=").concat(minutesPastMidnight, ", ticks=").concat(ticksPastMinute));
        // Write DateStamp structure (3 x 32-bit longs, big-endian)
        this.writeLong(dateStampPtr, daysSinceEpoch);
        this.writeLong(dateStampPtr + 4, minutesPastMidnight);
        this.writeLong(dateStampPtr + 8, ticksPastMinute);
        return dateStampPtr;
    };
    /**
     * Delay - Delay execution for specified ticks
     * D1 = number of ticks to delay (50 ticks = 1 second)
     *
     * Implementation: Sets delayUntil timestamp that execution loop checks
     */
    DosLibrary.prototype.Delay = function () {
        var ticks = this.emulator.getRegister(MoiraEmulator_1.CPURegister.D1);
        var milliseconds = (ticks / 50) * 1000;
        console.log("[dos.library] Delay(".concat(ticks, " ticks = ").concat(milliseconds, "ms)"));
        // Set delay expiration time
        this.delayUntil = Date.now() + milliseconds;
        console.log("[dos.library] Execution will pause until ".concat(new Date(this.delayUntil).toISOString()));
    };
    // Check if execution should be delayed
    DosLibrary.prototype.isDelayed = function () {
        if (this.delayUntil > 0 && Date.now() < this.delayUntil) {
            return true;
        }
        if (this.delayUntil > 0 && Date.now() >= this.delayUntil) {
            console.log("[dos.library] Delay completed, resuming execution");
            this.delayUntil = 0;
        }
        return false;
    };
    /**
     * WaitForChar - Wait for character input with timeout
     * D1 = file handle
     * D2 = timeout in microseconds (0 = no wait, -1 = wait forever)
     * Returns: D0 = -1 if char available, 0 if timeout
     */
    DosLibrary.prototype.WaitForChar = function () {
        var handle = this.emulator.getRegister(MoiraEmulator_1.CPURegister.D1);
        var timeout = this.emulator.getRegister(MoiraEmulator_1.CPURegister.D2);
        console.log("[dos.library] WaitForChar(handle=".concat(handle, ", timeout=").concat(timeout, ")"));
        if (handle === this.STDIN_HANDLE) {
            // Check if data available in input buffer
            var hasData = this.inputBuffer.length > 0;
            console.log("[dos.library] WaitForChar returned: ".concat(hasData ? 'data available' : 'no data'));
            return hasData ? -1 : 0;
        }
        else {
            return 0;
        }
    };
    /**
     * Seek - Change file position
     * D1 = file handle
     * D2 = position (signed 32-bit offset)
     * D3 = mode (OFFSET_BEGINNING=-1, OFFSET_CURRENT=0, OFFSET_END=1)
     * Returns: D0 = old position (or -1 on error)
     */
    DosLibrary.prototype.Seek = function () {
        var handle = this.emulator.getRegister(MoiraEmulator_1.CPURegister.D1);
        var offset = this.emulator.getRegister(MoiraEmulator_1.CPURegister.D2);
        var mode = this.emulator.getRegister(MoiraEmulator_1.CPURegister.D3);
        console.log("[dos.library] Seek(handle=".concat(handle, ", offset=").concat(offset, ", mode=").concat(mode, ")"));
        // Console handles and NIL: don't support seeking
        if (handle <= 3 || handle === this.NIL_HANDLE) {
            console.error("[dos.library] Seek: Cannot seek on console/NIL handles");
            this.lastError = this.ERROR_OBJECT_IN_USE;
            return -1;
        }
        var fileHandle = this.openFiles.get(handle);
        if (!fileHandle) {
            console.error("[dos.library] Seek: Invalid handle ".concat(handle));
            this.lastError = this.ERROR_OBJECT_NOT_FOUND;
            return -1;
        }
        if (!fileHandle.buffer) {
            console.error("[dos.library] Seek: No buffer for handle ".concat(handle));
            this.lastError = this.ERROR_OBJECT_IN_USE;
            return -1;
        }
        // Save old position
        var oldPosition = fileHandle.position;
        // Calculate new position based on mode
        var newPosition = 0;
        if (mode === OFFSET_BEGINNING) {
            newPosition = offset;
        }
        else if (mode === OFFSET_CURRENT) {
            newPosition = fileHandle.position + offset;
        }
        else if (mode === OFFSET_END) {
            newPosition = fileHandle.buffer.length + offset;
        }
        else {
            console.error("[dos.library] Seek: Invalid mode ".concat(mode));
            this.lastError = this.ERROR_OBJECT_IN_USE;
            return -1;
        }
        // Clamp to valid range
        if (newPosition < 0) {
            newPosition = 0;
        }
        else if (newPosition > fileHandle.buffer.length) {
            newPosition = fileHandle.buffer.length;
        }
        fileHandle.position = newPosition;
        this.lastError = this.ERROR_NO_ERROR;
        console.log("[dos.library] Seek: Moved from ".concat(oldPosition, " to ").concat(newPosition));
        return oldPosition;
    };
    /**
     * DeleteFile - Delete a file
     * D1 = filename (pointer to null-terminated string)
     * Returns: D0 = success (DOSTRUE=-1, DOSFALSE=0)
     */
    DosLibrary.prototype.DeleteFile = function () {
        var namePtr = this.emulator.getRegister(MoiraEmulator_1.CPURegister.D1);
        var filename = this.readString(namePtr);
        console.log("[dos.library] DeleteFile(\"".concat(filename, "\")"));
        var realPath = this.resolvePath(filename);
        if (!realPath) {
            console.error("[dos.library] DeleteFile: Failed to resolve path \"".concat(filename, "\""));
            this.emulator.setRegister(MoiraEmulator_1.CPURegister.D0, 0);
            this.lastError = this.ERROR_OBJECT_NOT_FOUND;
            return;
        }
        // Check if file exists
        if (!fs.existsSync(realPath)) {
            console.error("[dos.library] DeleteFile: File not found: ".concat(realPath));
            this.emulator.setRegister(MoiraEmulator_1.CPURegister.D0, 0);
            this.lastError = this.ERROR_OBJECT_NOT_FOUND;
            return;
        }
        // Check if it's a directory (DeleteFile should only delete files)
        if (fs.statSync(realPath).isDirectory()) {
            console.error("[dos.library] DeleteFile: Cannot delete directory with DeleteFile: ".concat(realPath));
            this.emulator.setRegister(MoiraEmulator_1.CPURegister.D0, 0);
            this.lastError = this.ERROR_OBJECT_IN_USE;
            return;
        }
        try {
            // Delete the file
            fs.unlinkSync(realPath);
            console.log("[dos.library] DeleteFile: Deleted file ".concat(realPath));
            this.emulator.setRegister(MoiraEmulator_1.CPURegister.D0, -1); // DOSTRUE
            this.lastError = this.ERROR_NO_ERROR;
        }
        catch (error) {
            console.error("[dos.library] DeleteFile: Error deleting file ".concat(realPath, ":"), error);
            this.emulator.setRegister(MoiraEmulator_1.CPURegister.D0, 0);
            this.lastError = this.ERROR_WRITE_PROTECTED;
        }
    };
    /**
     * Rename - Rename a file
     * D1 = old filename
     * D2 = new filename
     * Returns: D0 = success (DOSTRUE=-1, DOSFALSE=0)
     */
    DosLibrary.prototype.Rename = function () {
        var oldNamePtr = this.emulator.getRegister(MoiraEmulator_1.CPURegister.D1);
        var newNamePtr = this.emulator.getRegister(MoiraEmulator_1.CPURegister.D2);
        var oldName = this.readString(oldNamePtr);
        var newName = this.readString(newNamePtr);
        console.log("[dos.library] Rename(\"".concat(oldName, "\", \"").concat(newName, "\") - STUB, returning success"));
        // Stub: always return success
        this.emulator.setRegister(MoiraEmulator_1.CPURegister.D0, -1);
        this.lastError = this.ERROR_NO_ERROR;
    };
    /**
     * Lock - Obtain a lock on a file or directory
     * D1 = name (pointer to null-terminated string)
     * D2 = access mode (ACCESS_READ=-2, ACCESS_WRITE=-1)
     * Returns: D0 = lock (or 0 on failure)
     */
    DosLibrary.prototype.Lock = function () {
        var namePtr = this.emulator.getRegister(MoiraEmulator_1.CPURegister.D1);
        var mode = this.emulator.getRegister(MoiraEmulator_1.CPURegister.D2);
        var name = this.readString(namePtr);
        console.log("[dos.library] Lock(\"".concat(name, "\", mode=").concat(mode, ")"));
        var realPath = this.resolvePath(name);
        if (!realPath) {
            console.error("[dos.library] Lock: Failed to resolve path \"".concat(name, "\""));
            this.emulator.setRegister(MoiraEmulator_1.CPURegister.D0, 0);
            this.lastError = this.ERROR_OBJECT_NOT_FOUND;
            return;
        }
        // Check if path exists
        if (!fs.existsSync(realPath)) {
            console.error("[dos.library] Lock: Path does not exist: ".concat(realPath));
            this.emulator.setRegister(MoiraEmulator_1.CPURegister.D0, 0);
            this.lastError = this.ERROR_OBJECT_NOT_FOUND;
            return;
        }
        // Create lock
        var lockId = this.nextLockId++;
        this.locks.set(lockId, {
            id: lockId,
            path: realPath,
            mode: mode
        });
        console.log("[dos.library] Lock: Created lock ".concat(lockId, " for path ").concat(realPath));
        this.emulator.setRegister(MoiraEmulator_1.CPURegister.D0, lockId);
        this.lastError = this.ERROR_NO_ERROR;
    };
    /**
     * UnLock - Release a lock
     * D1 = lock
     */
    DosLibrary.prototype.UnLock = function () {
        var lockId = this.emulator.getRegister(MoiraEmulator_1.CPURegister.D1);
        // Lock ID 0 is special (means "no lock")
        if (lockId === 0) {
            console.log("[dos.library] UnLock: Lock ID 0 (no-op)");
            return;
        }
        if (this.locks.has(lockId)) {
            console.log("[dos.library] UnLock: Released lock ".concat(lockId));
            this.locks.delete(lockId);
        }
        else {
            console.warn("[dos.library] UnLock: Invalid lock ID ".concat(lockId));
        }
        this.lastError = this.ERROR_NO_ERROR;
    };
    /**
     * DupLock - Duplicate a lock
     * D1 = lock to duplicate
     * Returns: D0 = new lock (or 0 on failure)
     */
    DosLibrary.prototype.DupLock = function () {
        var lock = this.emulator.getRegister(MoiraEmulator_1.CPURegister.D1);
        console.log("[dos.library] DupLock(lock=0x".concat(lock.toString(16), ") - STUB, returning same lock"));
        // Return the same lock value
        this.emulator.setRegister(MoiraEmulator_1.CPURegister.D0, lock);
        this.lastError = this.ERROR_NO_ERROR;
    };
    /**
     * Examine - Get information about a file/directory
     * D1 = lock
     * D2 = FileInfoBlock pointer
     * Returns: D0 = success (DOSTRUE=-1, DOSFALSE=0)
     *
     * FileInfoBlock structure (260 bytes):
     * fib_DiskKey (4), fib_DirEntryType (4), fib_FileName (108 BCPL),
     * fib_Protection (4), fib_EntryType (4), fib_Size (4), fib_NumBlocks (4),
     * fib_Date (12 DateStamp), fib_Comment (80 BCPL), fib_OwnerUID (2), fib_OwnerGID (2)
     */
    DosLibrary.prototype.Examine = function () {
        var lockId = this.emulator.getRegister(MoiraEmulator_1.CPURegister.D1);
        var fibPtr = this.emulator.getRegister(MoiraEmulator_1.CPURegister.D2);
        console.log("[dos.library] Examine(lock=".concat(lockId, ", fib=0x").concat(fibPtr.toString(16), ")"));
        var lock = this.locks.get(lockId);
        if (!lock) {
            console.error("[dos.library] Examine: Invalid lock ID ".concat(lockId));
            this.emulator.setRegister(MoiraEmulator_1.CPURegister.D0, 0);
            this.lastError = this.ERROR_OBJECT_NOT_FOUND;
            return;
        }
        try {
            var stats = fs.statSync(lock.path);
            var fileName = path.basename(lock.path);
            // Clear FileInfoBlock (260 bytes)
            for (var i = 0; i < 260; i++) {
                this.emulator.writeMemory(fibPtr + i, 0);
            }
            // fib_DiskKey (4 bytes)
            this.writeLong(fibPtr, 0);
            // fib_DirEntryType (4 bytes) - negative = file, positive = dir
            this.writeLong(fibPtr + 4, stats.isDirectory() ? 2 : -3);
            // fib_FileName (108 bytes BCPL string)
            this.writeBCPLString(fibPtr + 8, fileName, 107);
            // fib_Protection (4 bytes)
            this.writeLong(fibPtr + 116, 0);
            // fib_EntryType (4 bytes)
            this.writeLong(fibPtr + 120, stats.isDirectory() ? 2 : -3);
            // fib_Size (4 bytes)
            this.writeLong(fibPtr + 124, stats.isFile() ? stats.size : 0);
            // fib_NumBlocks (4 bytes)
            this.writeLong(fibPtr + 128, 0);
            // fib_Date (12 bytes DateStamp)
            var mtime = stats.mtime;
            var epoch = new Date('1978-01-01T00:00:00Z');
            var days = Math.floor((mtime.getTime() - epoch.getTime()) / (1000 * 60 * 60 * 24));
            var minutes = mtime.getHours() * 60 + mtime.getMinutes();
            var ticks = mtime.getSeconds() * 50;
            this.writeLong(fibPtr + 132, days);
            this.writeLong(fibPtr + 136, minutes);
            this.writeLong(fibPtr + 140, ticks);
            // fib_Comment (80 bytes BCPL string)
            this.writeBCPLString(fibPtr + 144, '', 79);
            console.log("[dos.library] Examine: ".concat(fileName, " (").concat(stats.isDirectory() ? 'dir' : 'file', ", ").concat(stats.size, " bytes)"));
            // Initialize directory iterator for this lock if it's a directory
            if (stats.isDirectory()) {
                var files = fs.readdirSync(lock.path);
                this.dirIterators.set(lockId, files);
                this.dirIteratorIndex.set(lockId, 0);
                console.log("[dos.library] Examine: Initialized directory iterator (".concat(files.length, " entries)"));
            }
            this.emulator.setRegister(MoiraEmulator_1.CPURegister.D0, -1); // DOSTRUE
            this.lastError = this.ERROR_NO_ERROR;
        }
        catch (error) {
            console.error("[dos.library] Examine: Error examining path ".concat(lock.path, ":"), error);
            this.emulator.setRegister(MoiraEmulator_1.CPURegister.D0, 0);
            this.lastError = this.ERROR_OBJECT_NOT_FOUND;
        }
    };
    /**
     * ExNext - Get next directory entry
     * D1 = lock
     * D2 = FileInfoBlock pointer
     * Returns: D0 = success (DOSTRUE=-1, DOSFALSE=0)
     */
    DosLibrary.prototype.ExNext = function () {
        var lockId = this.emulator.getRegister(MoiraEmulator_1.CPURegister.D1);
        var fibPtr = this.emulator.getRegister(MoiraEmulator_1.CPURegister.D2);
        console.log("[dos.library] ExNext(lock=".concat(lockId, ", fib=0x").concat(fibPtr.toString(16), ")"));
        var lock = this.locks.get(lockId);
        if (!lock) {
            console.error("[dos.library] ExNext: Invalid lock ID ".concat(lockId));
            this.emulator.setRegister(MoiraEmulator_1.CPURegister.D0, 0);
            this.lastError = this.ERROR_OBJECT_NOT_FOUND;
            return;
        }
        // Get or create directory iterator
        if (!this.dirIterators.has(lockId)) {
            // Examine() should have been called first, but we'll initialize here too
            try {
                var files_1 = fs.readdirSync(lock.path);
                this.dirIterators.set(lockId, files_1);
                this.dirIteratorIndex.set(lockId, 0);
            }
            catch (error) {
                console.error("[dos.library] ExNext: Error reading directory ".concat(lock.path, ":"), error);
                this.emulator.setRegister(MoiraEmulator_1.CPURegister.D0, 0);
                this.lastError = this.ERROR_OBJECT_NOT_FOUND;
                return;
            }
        }
        var files = this.dirIterators.get(lockId);
        var index = this.dirIteratorIndex.get(lockId);
        if (index >= files.length) {
            // No more entries
            console.log("[dos.library] ExNext: No more entries");
            this.emulator.setRegister(MoiraEmulator_1.CPURegister.D0, 0);
            this.lastError = this.ERROR_NO_MORE_ENTRIES;
            // Clean up iterator
            this.dirIterators.delete(lockId);
            this.dirIteratorIndex.delete(lockId);
            return;
        }
        var fileName = files[index];
        var filePath = path.join(lock.path, fileName);
        try {
            var stats = fs.statSync(filePath);
            // Clear FileInfoBlock (260 bytes)
            for (var i = 0; i < 260; i++) {
                this.emulator.writeMemory(fibPtr + i, 0);
            }
            // fib_DiskKey (4 bytes)
            this.writeLong(fibPtr, index);
            // fib_DirEntryType (4 bytes)
            this.writeLong(fibPtr + 4, stats.isDirectory() ? 2 : -3);
            // fib_FileName (108 bytes BCPL string)
            this.writeBCPLString(fibPtr + 8, fileName, 107);
            // fib_Protection (4 bytes)
            this.writeLong(fibPtr + 116, 0);
            // fib_EntryType (4 bytes)
            this.writeLong(fibPtr + 120, stats.isDirectory() ? 2 : -3);
            // fib_Size (4 bytes)
            this.writeLong(fibPtr + 124, stats.isFile() ? stats.size : 0);
            // fib_NumBlocks (4 bytes)
            this.writeLong(fibPtr + 128, 0);
            // fib_Date (12 bytes DateStamp)
            var mtime = stats.mtime;
            var epoch = new Date('1978-01-01T00:00:00Z');
            var days = Math.floor((mtime.getTime() - epoch.getTime()) / (1000 * 60 * 60 * 24));
            var minutes = mtime.getHours() * 60 + mtime.getMinutes();
            var ticks = mtime.getSeconds() * 50;
            this.writeLong(fibPtr + 132, days);
            this.writeLong(fibPtr + 136, minutes);
            this.writeLong(fibPtr + 140, ticks);
            // fib_Comment (80 bytes BCPL string)
            this.writeBCPLString(fibPtr + 144, '', 79);
            console.log("[dos.library] ExNext: ".concat(fileName, " (").concat(stats.isDirectory() ? 'dir' : 'file', ", ").concat(stats.size, " bytes)"));
            // Increment iterator
            this.dirIteratorIndex.set(lockId, index + 1);
            this.emulator.setRegister(MoiraEmulator_1.CPURegister.D0, -1); // DOSTRUE
            this.lastError = this.ERROR_NO_ERROR;
        }
        catch (error) {
            console.error("[dos.library] ExNext: Error reading file ".concat(filePath, ":"), error);
            this.emulator.setRegister(MoiraEmulator_1.CPURegister.D0, 0);
            this.lastError = this.ERROR_OBJECT_NOT_FOUND;
        }
    };
    /**
     * Info - Get information about a volume
     * D1 = lock
     * D2 = InfoData pointer
     * Returns: D0 = success (DOSTRUE=-1, DOSFALSE=0)
     */
    DosLibrary.prototype.Info = function () {
        var lock = this.emulator.getRegister(MoiraEmulator_1.CPURegister.D1);
        var infoPtr = this.emulator.getRegister(MoiraEmulator_1.CPURegister.D2);
        console.log("[dos.library] Info(lock=0x".concat(lock.toString(16), ", info=0x").concat(infoPtr.toString(16), ") - STUB"));
        // Stub: fill in minimal InfoData structure
        for (var i = 0; i < 36; i++) {
            this.emulator.writeMemory(infoPtr + i, 0);
        }
        this.emulator.setRegister(MoiraEmulator_1.CPURegister.D0, -1);
        this.lastError = this.ERROR_NO_ERROR;
    };
    /**
     * CreateDir - Create a directory
     * D1 = name (pointer to null-terminated string)
     * Returns: D0 = lock on new directory (or 0 on failure)
     */
    DosLibrary.prototype.CreateDir = function () {
        var namePtr = this.emulator.getRegister(MoiraEmulator_1.CPURegister.D1);
        var name = this.readString(namePtr);
        console.log("[dos.library] CreateDir(\"".concat(name, "\")"));
        var realPath = this.resolvePath(name);
        if (!realPath) {
            console.error("[dos.library] CreateDir: Failed to resolve path \"".concat(name, "\""));
            this.emulator.setRegister(MoiraEmulator_1.CPURegister.D0, 0);
            this.lastError = this.ERROR_OBJECT_NOT_FOUND;
            return;
        }
        // Check if directory already exists
        if (fs.existsSync(realPath)) {
            console.error("[dos.library] CreateDir: Path already exists: ".concat(realPath));
            this.emulator.setRegister(MoiraEmulator_1.CPURegister.D0, 0);
            this.lastError = this.ERROR_OBJECT_IN_USE;
            return;
        }
        try {
            // Create directory (recursive = true to create parent dirs)
            fs.mkdirSync(realPath, { recursive: true });
            console.log("[dos.library] CreateDir: Created directory ".concat(realPath));
            // Return lock to new directory
            var lockId = this.nextLockId++;
            this.locks.set(lockId, {
                id: lockId,
                path: realPath,
                mode: -2 // ACCESS_READ
            });
            this.emulator.setRegister(MoiraEmulator_1.CPURegister.D0, lockId);
            this.lastError = this.ERROR_NO_ERROR;
        }
        catch (error) {
            console.error("[dos.library] CreateDir: Error creating directory ".concat(realPath, ":"), error);
            this.emulator.setRegister(MoiraEmulator_1.CPURegister.D0, 0);
            this.lastError = this.ERROR_WRITE_PROTECTED;
        }
    };
    /**
     * CurrentDir - Change/get current directory
     * D1 = lock (or 0 to get current)
     * Returns: D0 = old directory lock
     */
    DosLibrary.prototype.CurrentDir = function () {
        var lockId = this.emulator.getRegister(MoiraEmulator_1.CPURegister.D1);
        console.log("[dos.library] CurrentDir(lock=".concat(lockId, ")"));
        // Create lock for current directory (to return as "old directory")
        var oldDirLockId = this.nextLockId++;
        this.locks.set(oldDirLockId, {
            id: oldDirLockId,
            path: this.currentDirectory,
            mode: -2 // ACCESS_READ
        });
        if (lockId === 0) {
            // D1=0 means "just get current directory lock, don't change"
            console.log("[dos.library] CurrentDir: Returning current directory lock ".concat(oldDirLockId, " for ").concat(this.currentDirectory));
            this.emulator.setRegister(MoiraEmulator_1.CPURegister.D0, oldDirLockId);
            this.lastError = this.ERROR_NO_ERROR;
            return;
        }
        // Get the lock being set as current directory
        var newLock = this.locks.get(lockId);
        if (!newLock) {
            console.error("[dos.library] CurrentDir: Invalid lock ID ".concat(lockId));
            this.emulator.setRegister(MoiraEmulator_1.CPURegister.D0, 0);
            this.lastError = this.ERROR_OBJECT_NOT_FOUND;
            return;
        }
        // Verify the lock points to a directory
        if (!fs.existsSync(newLock.path) || !fs.statSync(newLock.path).isDirectory()) {
            console.error("[dos.library] CurrentDir: Lock ".concat(lockId, " does not point to a directory: ").concat(newLock.path));
            this.emulator.setRegister(MoiraEmulator_1.CPURegister.D0, 0);
            this.lastError = this.ERROR_OBJECT_NOT_FOUND;
            return;
        }
        // Change current directory
        var oldDir = this.currentDirectory;
        this.currentDirectory = newLock.path;
        console.log("[dos.library] CurrentDir: Changed from ".concat(oldDir, " to ").concat(this.currentDirectory));
        // Return lock for old directory
        this.emulator.setRegister(MoiraEmulator_1.CPURegister.D0, oldDirLockId);
        this.lastError = this.ERROR_NO_ERROR;
    };
    /**
     * CreateProc - Create a new process
     * D1 = name
     * D2 = priority
     * D3 = segList
     * D4 = stackSize
     * Returns: D0 = MsgPort pointer (or 0 on failure)
     */
    DosLibrary.prototype.CreateProc = function () {
        var namePtr = this.emulator.getRegister(MoiraEmulator_1.CPURegister.D1);
        var name = this.readString(namePtr);
        console.log("[dos.library] CreateProc(\"".concat(name, "\") - STUB, returning NULL"));
        // Stub: not supported
        this.emulator.setRegister(MoiraEmulator_1.CPURegister.D0, 0);
        this.lastError = this.ERROR_NO_FREE_STORE;
    };
    /**
     * Exit - Exit program with return code
     * D1 = return code
     *
     * CRITICAL: This function MUST set PC to the exit trap address (0xFFFF00)
     * to signal the emulation loop to terminate the door session cleanly.
     *
     * Reference: AmigaOS autodoc - Exit() terminates the current process.
     * For door programs, we simulate this by jumping to an exit trap address
     * that the emulation loop recognizes as program termination.
     */
    DosLibrary.prototype.Exit = function () {
        var returnCode = this.emulator.getRegister(MoiraEmulator_1.CPURegister.D1);
        console.log("[dos.library] Exit(returnCode=".concat(returnCode, ")"));
        console.log("[dos.library] Setting PC to exit trap address 0xFFFF00 to terminate door");
        // Set PC to exit trap address - this signals the emulation loop to terminate
        var EXIT_TRAP_ADDRESS = 0xFFFF00;
        this.emulator.setRegister(16, EXIT_TRAP_ADDRESS); // PC = exit trap
        console.log("[dos.library] Door will now exit cleanly");
    };
    /**
     * LoadSeg - Load an executable file
     * D1 = name
     * Returns: D0 = segList (or 0 on failure)
     */
    DosLibrary.prototype.LoadSeg = function () {
        var namePtr = this.emulator.getRegister(MoiraEmulator_1.CPURegister.D1);
        var name = this.readString(namePtr);
        console.log("[dos.library] LoadSeg(\"".concat(name, "\") - STUB, returning NULL"));
        // Stub: not supported
        this.emulator.setRegister(MoiraEmulator_1.CPURegister.D0, 0);
        this.lastError = this.ERROR_OBJECT_NOT_FOUND;
    };
    /**
     * UnLoadSeg - Unload a segment list
     * D1 = segList
     * Returns: D0 = success (DOSTRUE=-1, DOSFALSE=0)
     */
    DosLibrary.prototype.UnLoadSeg = function () {
        var segList = this.emulator.getRegister(MoiraEmulator_1.CPURegister.D1);
        console.log("[dos.library] UnLoadSeg(segList=0x".concat(segList.toString(16), ") - STUB"));
        this.emulator.setRegister(MoiraEmulator_1.CPURegister.D0, -1);
        this.lastError = this.ERROR_NO_ERROR;
    };
    /**
     * DeviceProc - Get handler process for a device
     * D1 = name
     * Returns: D0 = MsgPort pointer (or 0 on failure)
     */
    DosLibrary.prototype.DeviceProc = function () {
        var namePtr = this.emulator.getRegister(MoiraEmulator_1.CPURegister.D1);
        var name = this.readString(namePtr);
        console.log("[dos.library] DeviceProc(\"".concat(name, "\") - STUB, returning fake MsgPort"));
        // Return fake MsgPort address
        this.emulator.setRegister(MoiraEmulator_1.CPURegister.D0, 0x4000);
        this.lastError = this.ERROR_NO_ERROR;
    };
    /**
     * SetComment - Set file comment
     * D1 = name
     * D2 = comment
     * Returns: D0 = success (DOSTRUE=-1, DOSFALSE=0)
     */
    DosLibrary.prototype.SetComment = function () {
        var namePtr = this.emulator.getRegister(MoiraEmulator_1.CPURegister.D1);
        var commentPtr = this.emulator.getRegister(MoiraEmulator_1.CPURegister.D2);
        var name = this.readString(namePtr);
        var comment = commentPtr ? this.readString(commentPtr) : '';
        console.log("[dos.library] SetComment(\"".concat(name, "\", \"").concat(comment, "\") - STUB"));
        this.emulator.setRegister(MoiraEmulator_1.CPURegister.D0, -1);
        this.lastError = this.ERROR_NO_ERROR;
    };
    /**
     * SetProtection - Set file protection bits
     * D1 = name
     * D2 = protection bits
     * Returns: D0 = success (DOSTRUE=-1, DOSFALSE=0)
     */
    DosLibrary.prototype.SetProtection = function () {
        var namePtr = this.emulator.getRegister(MoiraEmulator_1.CPURegister.D1);
        var protect = this.emulator.getRegister(MoiraEmulator_1.CPURegister.D2);
        var name = this.readString(namePtr);
        console.log("[dos.library] SetProtection(\"".concat(name, "\", 0x").concat(protect.toString(16), ") - STUB"));
        this.emulator.setRegister(MoiraEmulator_1.CPURegister.D0, -1);
        this.lastError = this.ERROR_NO_ERROR;
    };
    /**
     * ParentDir - Get parent directory lock
     * D1 = lock
     * Returns: D0 = parent lock (or 0 if none)
     */
    DosLibrary.prototype.ParentDir = function () {
        var lock = this.emulator.getRegister(MoiraEmulator_1.CPURegister.D1);
        console.log("[dos.library] ParentDir(lock=0x".concat(lock.toString(16), ") - STUB"));
        // Return 0 (no parent - we're at root)
        this.emulator.setRegister(MoiraEmulator_1.CPURegister.D0, 0);
        this.lastError = this.ERROR_NO_ERROR;
    };
    /**
     * IsInteractive - Check if file handle is interactive
     * D1 = file handle
     * Returns: D0 = TRUE (-1) if interactive, FALSE (0) if not
     */
    DosLibrary.prototype.IsInteractive = function () {
        var handle = this.emulator.getRegister(MoiraEmulator_1.CPURegister.D1);
        console.log("[dos.library] IsInteractive(handle=".concat(handle, ")"));
        // Console handles (1,2,3) are interactive
        if (handle >= 1 && handle <= 3) {
            this.emulator.setRegister(MoiraEmulator_1.CPURegister.D0, -1);
        }
        else {
            this.emulator.setRegister(MoiraEmulator_1.CPURegister.D0, 0);
        }
        this.lastError = this.ERROR_NO_ERROR;
    };
    /**
     * Execute - Execute a command
     * D1 = command name
     * D2 = input file handle
     * D3 = output file handle
     * Returns: D0 = success (DOSTRUE=-1, DOSFALSE=0)
     */
    DosLibrary.prototype.Execute = function () {
        var namePtr = this.emulator.getRegister(MoiraEmulator_1.CPURegister.D1);
        var name = this.readString(namePtr);
        console.log("[dos.library] Execute(\"".concat(name, "\") - STUB, returning failure"));
        // Stub: not supported
        this.emulator.setRegister(MoiraEmulator_1.CPURegister.D0, 0);
        this.lastError = this.ERROR_OBJECT_NOT_FOUND;
    };
    /**
     * Helper: Read null-terminated string from memory
     */
    DosLibrary.prototype.readString = function (address, maxLen) {
        if (maxLen === void 0) { maxLen = 256; }
        var bytes = [];
        for (var i = 0; i < maxLen; i++) {
            var byte = this.emulator.readMemory(address + i);
            if (byte === 0)
                break;
            bytes.push(byte);
        }
        return String.fromCharCode.apply(String, bytes);
    };
    /**
     * Helper: Write 32-bit long to memory (big-endian)
     */
    DosLibrary.prototype.writeLong = function (address, value) {
        this.emulator.writeMemory(address, (value >> 24) & 0xFF);
        this.emulator.writeMemory(address + 1, (value >> 16) & 0xFF);
        this.emulator.writeMemory(address + 2, (value >> 8) & 0xFF);
        this.emulator.writeMemory(address + 3, value & 0xFF);
    };
    /**
     * Helper: Write BCPL string to memory
     * BCPL strings have a length byte followed by characters (no null terminator)
     */
    DosLibrary.prototype.writeBCPLString = function (address, str, maxLen) {
        var len = Math.min(str.length, maxLen);
        // Write length byte
        this.emulator.writeMemory(address, len);
        // Write string characters
        for (var i = 0; i < len; i++) {
            this.emulator.writeMemory(address + 1 + i, str.charCodeAt(i));
        }
        // Pad remaining bytes with zeros
        for (var i = len; i < maxLen; i++) {
            this.emulator.writeMemory(address + 1 + i, 0);
        }
    };
    /**
     * Handle library function call by offset
     *
     * NOTE: Offset -28 does NOT exist in standard dos.library!
     * If door is calling -28, it may be a calculation error.
     * Adding stub handler to catch it.
     */
    DosLibrary.prototype.handleCall = function (offset) {
        // SPECIAL: Handle non-standard offset -28 that some doors call
        if (offset === -28) {
            console.log("[dos.library] WARNING: Offset -28 is NOT a standard dos.library function!");
            console.log("[dos.library] This may indicate an offset calculation error.");
            console.log("[dos.library] Returning success anyway to let door proceed.");
            this.emulator.setRegister(MoiraEmulator_1.CPURegister.D0, -1); // Return success
            return true;
        }
        switch (offset) {
            // File operations
            case -30:
                this.Open();
                return true;
            case -36:
                this.Close();
                return true;
            case -42:
                this.Read();
                return true;
            case -48:
                this.Write();
                return true;
            case -66:
                this.Seek();
                return true;
            case -72:
                this.DeleteFile();
                return true;
            case -78:
                this.Rename();
                return true;
            // Console I/O
            case -54:
                this.Input();
                return true;
            case -60:
                this.Output();
                return true;
            // File/directory locking
            case -84:
                this.Lock();
                return true;
            case -90:
                this.UnLock();
                return true;
            case -96:
                this.DupLock();
                return true;
            // File/directory information
            case -102:
                this.Examine();
                return true;
            case -108:
                this.ExNext();
                return true;
            case -114:
                this.Info();
                return true;
            // Directory operations
            case -120:
                this.CreateDir();
                return true;
            case -126:
                this.CurrentDir();
                return true;
            // Error handling
            case -132:
                this.IoErr();
                return true;
            // Process management
            case -138:
                this.CreateProc();
                return true;
            case -144:
                this.Exit();
                return true;
            // Segment loading
            case -150:
                this.LoadSeg();
                return true;
            case -156:
                this.UnLoadSeg();
                return true;
            // Device/handler
            case -162:
                this.DeviceProc();
                return true;
            // File attributes
            case -168:
                this.SetComment();
                return true;
            case -174:
                this.SetProtection();
                return true;
            // Date/time (STANDARD Amiga offsets from Amiga include files)
            case -192:
                this.DateStamp();
                return true;
            case -198:
                this.Delay();
                return true;
            case -204:
                this.WaitForChar();
                return true;
            default:
                return false; // Unknown function
        }
    };
    return DosLibrary;
}());
exports.DosLibrary = DosLibrary;
