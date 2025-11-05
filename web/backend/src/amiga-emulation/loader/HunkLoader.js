"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HunkLoader = exports.SegmentType = void 0;
/**
 * Amiga Hunk File Format Loader
 *
 * The Hunk format is the Amiga's native executable format.
 * It consists of various "hunk" types containing code, data, BSS, and relocations.
 *
 * Hunk Types:
 * - HUNK_HEADER (0x3F3): File header with segment info
 * - HUNK_CODE (0x3E9): Code segment
 * - HUNK_DATA (0x3EA): Initialized data segment
 * - HUNK_BSS (0x3EB): Uninitialized data segment
 * - HUNK_RELOC32 (0x3EC): 32-bit relocations
 * - HUNK_END (0x3F2): End of hunk
 *
 * Reference: http://amigadev.elowar.com/read/ADCD_2.1/Includes_and_Autodocs_3._guide/node0239.html
 */
var HunkType;
(function (HunkType) {
    HunkType[HunkType["HUNK_UNIT"] = 999] = "HUNK_UNIT";
    HunkType[HunkType["HUNK_NAME"] = 1000] = "HUNK_NAME";
    HunkType[HunkType["HUNK_CODE"] = 1001] = "HUNK_CODE";
    HunkType[HunkType["HUNK_DATA"] = 1002] = "HUNK_DATA";
    HunkType[HunkType["HUNK_BSS"] = 1003] = "HUNK_BSS";
    HunkType[HunkType["HUNK_RELOC32"] = 1004] = "HUNK_RELOC32";
    HunkType[HunkType["HUNK_RELOC16"] = 1005] = "HUNK_RELOC16";
    HunkType[HunkType["HUNK_RELOC8"] = 1006] = "HUNK_RELOC8";
    HunkType[HunkType["HUNK_EXT"] = 1007] = "HUNK_EXT";
    HunkType[HunkType["HUNK_SYMBOL"] = 1008] = "HUNK_SYMBOL";
    HunkType[HunkType["HUNK_DEBUG"] = 1009] = "HUNK_DEBUG";
    HunkType[HunkType["HUNK_END"] = 1010] = "HUNK_END";
    HunkType[HunkType["HUNK_HEADER"] = 1011] = "HUNK_HEADER";
    HunkType[HunkType["HUNK_OVERLAY"] = 1013] = "HUNK_OVERLAY";
    HunkType[HunkType["HUNK_BREAK"] = 1014] = "HUNK_BREAK";
    HunkType[HunkType["HUNK_DREL32"] = 1015] = "HUNK_DREL32";
    HunkType[HunkType["HUNK_DREL16"] = 1016] = "HUNK_DREL16";
    HunkType[HunkType["HUNK_DREL8"] = 1017] = "HUNK_DREL8";
    HunkType[HunkType["HUNK_LIB"] = 1018] = "HUNK_LIB";
    HunkType[HunkType["HUNK_INDEX"] = 1019] = "HUNK_INDEX";
    HunkType[HunkType["HUNK_RELOC32SHORT"] = 1020] = "HUNK_RELOC32SHORT";
    HunkType[HunkType["HUNK_RELRELOC32"] = 1021] = "HUNK_RELRELOC32";
    HunkType[HunkType["HUNK_ABSRELOC16"] = 1022] = "HUNK_ABSRELOC16";
})(HunkType || (HunkType = {}));
var SegmentType;
(function (SegmentType) {
    SegmentType["CODE"] = "code";
    SegmentType["DATA"] = "data";
    SegmentType["BSS"] = "bss";
})(SegmentType || (exports.SegmentType = SegmentType = {}));
var HunkLoader = /** @class */ (function () {
    function HunkLoader() {
        this.position = 0;
    }
    /**
     * Parse a Hunk file from buffer
     */
    HunkLoader.prototype.parse = function (buffer) {
        var _a;
        this.buffer = buffer;
        this.position = 0;
        var segments = [];
        var relocations = new Map();
        // Read and validate header
        var header = this.readHeader();
        console.log("[HunkLoader] Found ".concat(header.numSegments, " segments"));
        // Allocate memory addresses for segments
        var currentAddress = 0x1000; // Start at 4KB
        var segmentAddresses = [];
        for (var i = 0; i < header.numSegments; i++) {
            segmentAddresses.push(currentAddress);
            console.log("[HunkLoader] Segment ".concat(i, " will be placed at 0x").concat(currentAddress.toString(16), " (size: ").concat(header.segmentSizes[i] * 4, " bytes)"));
            currentAddress += header.segmentSizes[i] * 4; // Sizes are in longwords
            currentAddress = (currentAddress + 0xFF) & ~0xFF; // Align to 256 bytes
        }
        // Read segments
        var segmentIndex = 0;
        while (this.position < this.buffer.length) {
            var rawHunkType = this.readLong();
            // Mask to get hunk type only (bits 0-29), ignoring memory flags (bits 30-31)
            var hunkType = rawHunkType & 0x3FFFFFFF;
            if (hunkType === HunkType.HUNK_END) {
                segmentIndex++;
                continue;
            }
            switch (hunkType) {
                case HunkType.HUNK_CODE:
                case HunkType.HUNK_DATA: {
                    var hunkDataSize = this.readLong() * 4; // Size of data IN FILE (longwords -> bytes)
                    console.log("[HunkLoader] Reading ".concat(hunkType === HunkType.HUNK_CODE ? 'CODE' : 'DATA', " segment:"));
                    console.log("[HunkLoader]   Hunk data size: ".concat(hunkDataSize, " bytes"));
                    console.log("[HunkLoader]   File position BEFORE readBytes: 0x".concat(this.position.toString(16)));
                    var data = this.readBytes(hunkDataSize);
                    console.log("[HunkLoader]   File position AFTER readBytes: 0x".concat(this.position.toString(16)));
                    // Use segments.length as the index (since we're about to push)
                    // NOT segmentIndex (which only increments at HUNK_END)
                    var currentSegmentIndex = segments.length;
                    // CRITICAL: The segment's TOTAL size comes from the header, not the hunk!
                    // The header size includes BSS (uninitialized data).
                    // We allocate the full header size and zero-fill the BSS portion.
                    var totalSegmentSize = header.segmentSizes[currentSegmentIndex] * 4;
                    var bssSize = totalSegmentSize - hunkDataSize;
                    console.log("[HunkLoader]   Header total size: ".concat(totalSegmentSize, " bytes"));
                    if (bssSize > 0) {
                        console.log("[HunkLoader]   BSS size (implicit): ".concat(bssSize, " bytes"));
                    }
                    // Create segment data array with full size (data + BSS)
                    var fullData = new Uint8Array(totalSegmentSize);
                    fullData.set(data, 0); // Copy hunk data to start
                    // Rest is already zero-filled by Uint8Array constructor
                    var segment = {
                        type: hunkType === HunkType.HUNK_CODE ? SegmentType.CODE : SegmentType.DATA,
                        data: fullData,
                        address: segmentAddresses[currentSegmentIndex],
                        size: totalSegmentSize
                    };
                    segments.push(segment);
                    console.log("[HunkLoader] ".concat(segment.type.toUpperCase(), " segment: ").concat(totalSegmentSize, " bytes at 0x").concat(segment.address.toString(16)));
                    break;
                }
                case HunkType.HUNK_BSS: {
                    var size = this.readLong() * 4; // Size in longwords -> bytes
                    // Use segments.length as the index (since we're about to push)
                    var currentSegmentIndex = segments.length;
                    var segment = {
                        type: SegmentType.BSS,
                        data: new Uint8Array(size), // Zero-filled
                        address: segmentAddresses[currentSegmentIndex],
                        size: size
                    };
                    segments.push(segment);
                    console.log("[HunkLoader] BSS segment: ".concat(size, " bytes at 0x").concat(segment.address.toString(16)));
                    break;
                }
                case HunkType.HUNK_RELOC32: {
                    var relocs = [];
                    var groupNum = 0;
                    while (true) {
                        var numOffsets = this.readLong();
                        console.log("[HunkLoader] HUNK_RELOC32 group ".concat(groupNum, ": numOffsets = ").concat(numOffsets, " (0x").concat(numOffsets.toString(16), ")"));
                        if (numOffsets === 0)
                            break; // End of relocations
                        var targetSegment = this.readLong();
                        console.log("[HunkLoader]   targetSegment = ".concat(targetSegment));
                        for (var i = 0; i < numOffsets; i++) {
                            var offset = this.readLong();
                            relocs.push({ offset: offset, targetSegment: targetSegment });
                            if (i < 10 || offset === 0x248) {
                                console.log("[HunkLoader]     reloc[".concat(i, "] = 0x").concat(offset.toString(16)));
                            }
                        }
                        groupNum++;
                    }
                    // CRITICAL FIX: Use the last pushed segment index, not segmentIndex
                    // segmentIndex only increments at HUNK_END, so it's still pointing to previous segment
                    var actualSegmentIndex = segments.length - 1;
                    relocations.set(actualSegmentIndex, relocs);
                    console.log("[HunkLoader] Found ".concat(relocs.length, " relocations for segment ").concat(actualSegmentIndex, " (segmentIndex=").concat(segmentIndex, ") in ").concat(groupNum, " groups"));
                    break;
                }
                case HunkType.HUNK_SYMBOL:
                case HunkType.HUNK_DEBUG:
                    // Skip these for now
                    this.skipToEnd();
                    break;
                default:
                    // Unknown hunk type - likely reached end of valid hunks and reading data
                    // Don't warn excessively, just stop parsing
                    if (hunkType > 0x400 || hunkType < 0x3E7) {
                        // This doesn't look like a valid hunk type, probably reached data section
                        console.log("[HunkLoader] Reached invalid hunk type 0x".concat(hunkType.toString(16), ", stopping parse"));
                        // Exit the while loop by setting position to end
                        this.position = this.buffer.length;
                        break;
                    }
                    console.warn("[HunkLoader] Unknown hunk type: 0x".concat(hunkType.toString(16)));
                    break;
            }
        }
        // Entry point is typically the start of the first code segment
        var entryPoint = ((_a = segments.find(function (s) { return s.type === SegmentType.CODE; })) === null || _a === void 0 ? void 0 : _a.address) || 0x1000;
        return {
            segments: segments,
            relocations: relocations,
            entryPoint: entryPoint
        };
    };
    /**
     * Load parsed Hunk file into emulator memory
     */
    HunkLoader.prototype.load = function (emulator, hunkFile) {
        console.log('[HunkLoader] Loading segments into memory...');
        // Load all segments
        for (var _i = 0, _a = hunkFile.segments; _i < _a.length; _i++) {
            var segment = _a[_i];
            console.log("[HunkLoader] Loading ".concat(segment.type, " segment at 0x").concat(segment.address.toString(16), ", data.length=").concat(segment.data.length));
            // DEBUG: Check if this segment contains the critical address 0x1248
            var segmentEnd = segment.address + segment.data.length;
            var contains1248 = (segment.address <= 0x1248) && (segmentEnd > 0x1248);
            console.log("[HunkLoader]   Segment range: 0x".concat(segment.address.toString(16), " - 0x").concat(segmentEnd.toString(16), ", contains 0x1248? ").concat(contains1248));
            if (contains1248) {
                var offset = 0x1248 - segment.address;
                var byte0 = segment.data[offset];
                var byte1 = segment.data[offset + 1];
                console.log("[HunkLoader] *** This segment contains 0x1248! ***");
                console.log("[HunkLoader]   Segment type: ".concat(segment.type));
                console.log("[HunkLoader]   Segment base: 0x".concat(segment.address.toString(16)));
                console.log("[HunkLoader]   Segment size: ".concat(segment.data.length, " bytes"));
                console.log("[HunkLoader]   Offset in segment data: 0x".concat(offset.toString(16)));
                console.log("[HunkLoader]   Bytes in segment.data[".concat(offset, "/").concat(offset + 1, "]: 0x").concat(byte0.toString(16).padStart(2, '0'), " 0x").concat(byte1.toString(16).padStart(2, '0')));
                console.log("[HunkLoader]   As word: 0x".concat(((byte0 << 8) | byte1).toString(16).padStart(4, '0')));
                console.log("[HunkLoader]   Expected: 0x4eae (JSR (A6,d16))");
                if (((byte0 << 8) | byte1) !== 0x4eae) {
                    console.log("[HunkLoader]   *** SEGMENT DATA IS ALREADY CORRUPTED IN BUFFER! ***");
                }
                // CHECK CORRUPTION LOCATION at offset 0x250 (memory 0x1250)
                var offset1250 = 0x1250 - segment.address;
                if (offset1250 >= 0 && offset1250 < segment.data.length - 16) {
                    console.log("\n[HunkLoader] *** CHECKING CORRUPTION LOCATION 0x1250 ***");
                    console.log("[HunkLoader]   Offset in segment.data: 0x".concat(offset1250.toString(16)));
                    console.log("[HunkLoader]   segment.data bytes at offset ".concat(offset1250, ":"));
                    var hexStr = '  ';
                    for (var i = 0; i < 16; i++) {
                        hexStr += segment.data[offset1250 + i].toString(16).padStart(2, '0') + ' ';
                    }
                    console.log(hexStr);
                    console.log("[HunkLoader]   Expected: 4e ae fe 86 60 12 2c 78 00 04 2e 88 67 08 20 79");
                    // Check if it matches the expected JSR instruction
                    if (segment.data[offset1250] !== 0x4E || segment.data[offset1250 + 1] !== 0xAE) {
                        console.log("[HunkLoader]   *** CORRUPTION CONFIRMED IN segment.data BUFFER! ***");
                        console.log("[HunkLoader]   The hunk file parsing read wrong bytes from file!");
                    }
                    else {
                        console.log("[HunkLoader]   segment.data buffer is CORRECT at 0x1250");
                    }
                }
            }
            // Copy segment data to emulator memory
            for (var i = 0; i < segment.data.length; i++) {
                emulator.writeMemory(segment.address + i, segment.data[i]);
            }
            // VERIFY: Check if 0x1248 was written correctly
            if (contains1248) {
                var offset = 0x1248 - segment.address;
                var verify0 = emulator.readMemory(0x1248);
                var verify1 = emulator.readMemory(0x1249);
                var verifyWord = (verify0 << 8) | verify1;
                console.log("[HunkLoader] *** VERIFY AFTER WRITE ***");
                console.log("[HunkLoader]   Source buffer had: 0x".concat(segment.data[offset].toString(16).padStart(2, '0')).concat(segment.data[offset + 1].toString(16).padStart(2, '0')));
                console.log("[HunkLoader]   Memory now has:    0x".concat(verifyWord.toString(16).padStart(4, '0')));
                if (verifyWord !== ((segment.data[offset] << 8) | segment.data[offset + 1])) {
                    console.log("[HunkLoader]   *** WRITE TO MEMORY CORRUPTED DATA! ***");
                }
            }
        }
        // DEBUG: Check memory at critical address BEFORE relocations
        console.log('[HunkLoader] === MEMORY CHECK BEFORE RELOCATIONS ===');
        var check1248_before = (emulator.readMemory(0x1248) << 8) | emulator.readMemory(0x1249);
        console.log("[HunkLoader] Memory at 0x1248 BEFORE relocations: 0x".concat(check1248_before.toString(16).padStart(4, '0')));
        console.log("[HunkLoader] Expected: 0x4eae (JSR (A6,d16))");
        if (check1248_before !== 0x4eae) {
            console.log("[HunkLoader] *** ALREADY CORRUPTED BEFORE RELOCATIONS! ***");
        }
        // Apply relocations
        for (var _b = 0, _c = hunkFile.relocations.entries(); _b < _c.length; _b++) {
            var _d = _c[_b], segmentIndex = _d[0], relocs = _d[1];
            var segment = hunkFile.segments[segmentIndex];
            console.log("[HunkLoader] Applying ".concat(relocs.length, " relocations to segment ").concat(segmentIndex));
            for (var _e = 0, relocs_1 = relocs; _e < relocs_1.length; _e++) {
                var reloc = relocs_1[_e];
                // Validate target segment exists
                if (reloc.targetSegment >= hunkFile.segments.length) {
                    console.warn("[HunkLoader] Skipping invalid relocation: target segment ".concat(reloc.targetSegment, " doesn't exist (only ").concat(hunkFile.segments.length, " segments)"));
                    continue;
                }
                var targetSegment = hunkFile.segments[reloc.targetSegment];
                var relocAddress = segment.address + reloc.offset;
                // CRITICAL: Check if this relocation affects 0x1248
                var isCriticalRange = (relocAddress >= 0x1246 && relocAddress <= 0x124a) ||
                    (relocAddress >= 0x2b38 && relocAddress <= 0x2b3e);
                if (isCriticalRange) {
                    console.log("[HunkLoader] *** CRITICAL RELOCATION DETECTED ***");
                    console.log("[HunkLoader]   Segment ".concat(segmentIndex, " (base 0x").concat(segment.address.toString(16), ")"));
                    console.log("[HunkLoader]   Relocation offset: 0x".concat(reloc.offset.toString(16)));
                    console.log("[HunkLoader]   Absolute address: 0x".concat(relocAddress.toString(16)));
                    console.log("[HunkLoader]   Target segment: ".concat(reloc.targetSegment, " (base 0x").concat(targetSegment.address.toString(16), ")"));
                }
                // Read the current value at the relocation point
                var byte0 = emulator.readMemory(relocAddress);
                var byte1 = emulator.readMemory(relocAddress + 1);
                var byte2 = emulator.readMemory(relocAddress + 2);
                var byte3 = emulator.readMemory(relocAddress + 3);
                var currentValue = (byte0 << 24) | (byte1 << 16) | (byte2 << 8) | byte3;
                if (isCriticalRange) {
                    console.log("[HunkLoader]   BEFORE: Memory at 0x".concat(relocAddress.toString(16), " = 0x").concat(currentValue.toString(16).padStart(8, '0')));
                    console.log("[HunkLoader]   BEFORE: Bytes = ".concat(byte0.toString(16).padStart(2, '0'), " ").concat(byte1.toString(16).padStart(2, '0'), " ").concat(byte2.toString(16).padStart(2, '0'), " ").concat(byte3.toString(16).padStart(2, '0')));
                }
                // Add the target segment's base address
                var newValue = currentValue + targetSegment.address;
                if (isCriticalRange) {
                    console.log("[HunkLoader]   AFTER:  New value = 0x".concat(newValue.toString(16).padStart(8, '0')));
                    console.log("[HunkLoader]   This will OVERWRITE memory at 0x".concat(relocAddress.toString(16), "!"));
                }
                // Write back the relocated address (big-endian)
                emulator.writeMemory(relocAddress, (newValue >> 24) & 0xFF);
                emulator.writeMemory(relocAddress + 1, (newValue >> 16) & 0xFF);
                emulator.writeMemory(relocAddress + 2, (newValue >> 8) & 0xFF);
                emulator.writeMemory(relocAddress + 3, newValue & 0xFF);
                if (isCriticalRange) {
                    // Verify what was written
                    var verify0 = emulator.readMemory(relocAddress);
                    var verify1 = emulator.readMemory(relocAddress + 1);
                    var verify2 = emulator.readMemory(relocAddress + 2);
                    var verify3 = emulator.readMemory(relocAddress + 3);
                    console.log("[HunkLoader]   VERIFY: Bytes = ".concat(verify0.toString(16).padStart(2, '0'), " ").concat(verify1.toString(16).padStart(2, '0'), " ").concat(verify2.toString(16).padStart(2, '0'), " ").concat(verify3.toString(16).padStart(2, '0')));
                    console.log("[HunkLoader] *** END CRITICAL RELOCATION ***");
                }
            }
        }
        console.log("[HunkLoader] Load complete. Entry point: 0x".concat(hunkFile.entryPoint.toString(16)));
    };
    /**
     * Read Hunk header
     */
    HunkLoader.prototype.readHeader = function () {
        var hunkType = this.readLong();
        if (hunkType !== HunkType.HUNK_HEADER) {
            throw new Error("Expected HUNK_HEADER (0x3F3), got 0x".concat(hunkType.toString(16)));
        }
        // Skip resident library names (if any)
        while (true) {
            var nameLength = this.readLong();
            if (nameLength === 0)
                break;
            this.position += nameLength * 4; // Skip name
        }
        var numSegments = this.readLong();
        var firstSegment = this.readLong();
        var lastSegment = this.readLong();
        // Read segment sizes
        var segmentSizes = [];
        for (var i = firstSegment; i <= lastSegment; i++) {
            var size = this.readLong() & 0x3FFFFFFF; // Clear flags
            segmentSizes.push(size);
        }
        return { numSegments: numSegments, segmentSizes: segmentSizes };
    };
    /**
     * Read 32-bit big-endian long
     */
    HunkLoader.prototype.readLong = function () {
        var value = this.buffer.readUInt32BE(this.position);
        this.position += 4;
        return value;
    };
    /**
     * Read bytes
     */
    HunkLoader.prototype.readBytes = function (length) {
        var bytes = this.buffer.slice(this.position, this.position + length);
        this.position += length;
        return bytes;
    };
    /**
     * Skip to next HUNK_END
     */
    HunkLoader.prototype.skipToEnd = function () {
        while (this.position < this.buffer.length) {
            var hunkType = this.readLong();
            if (hunkType === HunkType.HUNK_END) {
                break;
            }
        }
    };
    return HunkLoader;
}());
exports.HunkLoader = HunkLoader;
