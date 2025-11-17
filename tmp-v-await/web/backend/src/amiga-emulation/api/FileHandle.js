"use strict";
/**
 * FileHandle - Represents an AmigaDOS file handle
 *
 * Based on amitools/vamos/lib/dos/FileHandle.py
 * See: Documentation/3-Developers/AMIGAOS_DOS_FILE_IO_IMPLEMENTATION_GUIDE.md
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileHandle = void 0;
const fs = __importStar(require("fs"));
class FileHandle {
    constructor(amiPath, sysPath, options = {}) {
        /** File descriptor or stream object */
        this.fd = null;
        /** BPTR (Byte Pointer = address / 4) */
        this.bAddr = 0;
        /** Address of FileHandleStruct in emulator memory */
        this.memAddr = 0;
        /** File position for seek operations */
        this.position = 0;
        this.amiPath = amiPath;
        this.sysPath = sysPath;
        this.name = sysPath.split('/').pop() || 'unknown';
        this.needClose = options.needClose !== undefined ? options.needClose : true;
        this.autoFlush = options.autoFlush || false;
        this.isNil = options.isNil || false;
        this.isConsole = options.isConsole || false;
    }
    /**
     * Open the file with specified mode
     */
    open(mode) {
        try {
            // NIL device - don't actually open
            if (this.isNil) {
                this.fd = -1; // Special marker for NULL device
                return true;
            }
            // Console/stdout - don't actually open
            if (this.isConsole) {
                this.fd = -2; // Special marker for console
                return true;
            }
            // Open real file
            let flags;
            if (mode === 'r') {
                flags = fs.constants.O_RDONLY;
            }
            else if (mode === 'w') {
                flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC;
            }
            else { // 'rw'
                flags = fs.constants.O_RDWR | fs.constants.O_CREAT;
            }
            this.fd = fs.openSync(this.sysPath, flags, 0o666);
            this.position = 0;
            return true;
        }
        catch (error) {
            console.error(`[FileHandle] Failed to open ${this.sysPath}:`, error);
            return false;
        }
    }
    /**
     * Read data from file
     */
    read(length) {
        if (this.fd === null) {
            throw new Error('File not open');
        }
        // NIL device always returns empty
        if (this.isNil) {
            return Buffer.alloc(0);
        }
        // Console input - return empty for now (stdin not implemented yet)
        if (this.isConsole && this.fd === -2) {
            return Buffer.alloc(0);
        }
        try {
            console.log(`[FileHandle] read ${length} bytes from ${this.sysPath}`);
            const buffer = Buffer.alloc(length);
            const bytesRead = fs.readSync(this.fd, buffer, 0, length, this.position);
            this.position += bytesRead;
            return buffer.slice(0, bytesRead);
        }
        catch (error) {
            console.error(`[FileHandle] Read error:`, error);
            return Buffer.alloc(0);
        }
    }
    /**
     * Write data to file
     * Returns callback for console output (if console), null otherwise
     */
    write(data) {
        if (this.fd === null) {
            throw new Error('File not open');
        }
        // NIL device - discard data
        if (this.isNil) {
            return { bytesWritten: data.length };
        }
        // Console output - return data for terminal
        if (this.isConsole && this.fd === -2) {
            return { bytesWritten: data.length, consoleData: data };
        }
        try {
            const bytesWritten = fs.writeSync(this.fd, data, 0, data.length, this.position);
            this.position += bytesWritten;
            if (this.autoFlush) {
                fs.fsyncSync(this.fd);
            }
            return { bytesWritten };
        }
        catch (error) {
            console.error(`[FileHandle] Write error:`, error);
            return { bytesWritten: -1 };
        }
    }
    /**
     * Seek to position in file
     */
    seek(position, whence) {
        if (this.fd === null || this.fd < 0) {
            return -1;
        }
        try {
            // whence: 0 = SEEK_SET, 1 = SEEK_CUR, 2 = SEEK_END
            if (whence === 0) {
                this.position = position;
            }
            else if (whence === 1) {
                this.position += position;
            }
            else if (whence === 2) {
                const stats = fs.fstatSync(this.fd);
                this.position = stats.size + position;
            }
            return this.position;
        }
        catch (error) {
            console.error(`[FileHandle] Seek error:`, error);
            return -1;
        }
    }
    /**
     * Get current file position
     */
    tell() {
        return this.position;
    }
    /**
     * Close the file
     */
    close() {
        if (this.needClose && this.fd !== null && this.fd >= 0) {
            try {
                fs.closeSync(this.fd);
            }
            catch (error) {
                console.error(`[FileHandle] Close error:`, error);
            }
        }
        this.fd = null;
    }
    /**
     * String representation for debugging
     */
    toString() {
        return `[FH:'${this.name}'(ami='${this.amiPath}',sys='${this.sysPath}',nc=${this.needClose})@0x${this.memAddr.toString(16)}=B@0x${this.bAddr.toString(16)}]`;
    }
}
exports.FileHandle = FileHandle;
