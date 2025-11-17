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
class HunkLoader {
    constructor() {
        this.position = 0;
    }
    /**
     * Parse a Hunk file from buffer
     */
    parse(buffer) {
        var _a;
        this.buffer = buffer;
        this.position = 0;
        const segments = [];
        const relocations = new Map();
        // Read and validate header
        const header = this.readHeader();
        console.log(`[HunkLoader] Found ${header.numSegments} segments`);
        // Allocate memory addresses for segments
        let currentAddress = 0x1000; // Start at 4KB
        const segmentAddresses = [];
        for (let i = 0; i < header.numSegments; i++) {
            segmentAddresses.push(currentAddress);
            console.log(`[HunkLoader] Segment ${i} will be placed at 0x${currentAddress.toString(16)} (size: ${header.segmentSizes[i] * 4} bytes)`);
            currentAddress += header.segmentSizes[i] * 4; // Sizes are in longwords
            currentAddress = (currentAddress + 0xFF) & ~0xFF; // Align to 256 bytes
        }
        // Read segments
        let segmentIndex = 0;
        while (this.position < this.buffer.length) {
            const rawHunkType = this.readLong();
            // Mask to get hunk type only (bits 0-29), ignoring memory flags (bits 30-31)
            const hunkType = rawHunkType & 0x3FFFFFFF;
            if (hunkType === HunkType.HUNK_END) {
                segmentIndex++;
                continue;
            }
            switch (hunkType) {
                case HunkType.HUNK_CODE:
                case HunkType.HUNK_DATA: {
                    const hunkDataSize = this.readLong() * 4; // Size of data IN FILE (longwords -> bytes)
                    console.log(`[HunkLoader] Reading ${hunkType === HunkType.HUNK_CODE ? 'CODE' : 'DATA'} segment:`);
                    console.log(`[HunkLoader]   Hunk data size: ${hunkDataSize} bytes`);
                    console.log(`[HunkLoader]   File position BEFORE readBytes: 0x${this.position.toString(16)}`);
                    const data = this.readBytes(hunkDataSize);
                    console.log(`[HunkLoader]   File position AFTER readBytes: 0x${this.position.toString(16)}`);
                    // Use segments.length as the index (since we're about to push)
                    // NOT segmentIndex (which only increments at HUNK_END)
                    const currentSegmentIndex = segments.length;
                    // CRITICAL: The segment's TOTAL size comes from the header, not the hunk!
                    // The header size includes BSS (uninitialized data).
                    // We allocate the full header size and zero-fill the BSS portion.
                    const totalSegmentSize = header.segmentSizes[currentSegmentIndex] * 4;
                    const bssSize = totalSegmentSize - hunkDataSize;
                    console.log(`[HunkLoader]   Header total size: ${totalSegmentSize} bytes`);
                    if (bssSize > 0) {
                        console.log(`[HunkLoader]   BSS size (implicit): ${bssSize} bytes`);
                    }
                    // Create segment data array with full size (data + BSS)
                    const fullData = new Uint8Array(totalSegmentSize);
                    fullData.set(data, 0); // Copy hunk data to start
                    // Rest is already zero-filled by Uint8Array constructor
                    const segment = {
                        type: hunkType === HunkType.HUNK_CODE ? SegmentType.CODE : SegmentType.DATA,
                        data: fullData,
                        address: segmentAddresses[currentSegmentIndex],
                        size: totalSegmentSize
                    };
                    segments.push(segment);
                    console.log(`[HunkLoader] ${segment.type.toUpperCase()} segment: ${totalSegmentSize} bytes at 0x${segment.address.toString(16)}`);
                    break;
                }
                case HunkType.HUNK_BSS: {
                    const size = this.readLong() * 4; // Size in longwords -> bytes
                    // Use segments.length as the index (since we're about to push)
                    const currentSegmentIndex = segments.length;
                    const segment = {
                        type: SegmentType.BSS,
                        data: new Uint8Array(size), // Zero-filled
                        address: segmentAddresses[currentSegmentIndex],
                        size: size
                    };
                    segments.push(segment);
                    console.log(`[HunkLoader] BSS segment: ${size} bytes at 0x${segment.address.toString(16)}`);
                    break;
                }
                case HunkType.HUNK_RELOC32: {
                    const relocs = [];
                    let groupNum = 0;
                    while (true) {
                        const numOffsets = this.readLong();
                        console.log(`[HunkLoader] HUNK_RELOC32 group ${groupNum}: numOffsets = ${numOffsets} (0x${numOffsets.toString(16)})`);
                        if (numOffsets === 0)
                            break; // End of relocations
                        const targetSegment = this.readLong();
                        console.log(`[HunkLoader]   targetSegment = ${targetSegment}`);
                        for (let i = 0; i < numOffsets; i++) {
                            const offset = this.readLong();
                            relocs.push({ offset, targetSegment });
                            if (i < 10 || offset === 0x248) {
                                console.log(`[HunkLoader]     reloc[${i}] = 0x${offset.toString(16)}`);
                            }
                        }
                        groupNum++;
                    }
                    // CRITICAL FIX: Use the last pushed segment index, not segmentIndex
                    // segmentIndex only increments at HUNK_END, so it's still pointing to previous segment
                    const actualSegmentIndex = segments.length - 1;
                    relocations.set(actualSegmentIndex, relocs);
                    console.log(`[HunkLoader] Found ${relocs.length} relocations for segment ${actualSegmentIndex} (segmentIndex=${segmentIndex}) in ${groupNum} groups`);
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
                        console.log(`[HunkLoader] Reached invalid hunk type 0x${hunkType.toString(16)}, stopping parse`);
                        // Exit the while loop by setting position to end
                        this.position = this.buffer.length;
                        break;
                    }
                    console.warn(`[HunkLoader] Unknown hunk type: 0x${hunkType.toString(16)}`);
                    break;
            }
        }
        // Entry point is typically the start of the first code segment
        const entryPoint = ((_a = segments.find(s => s.type === SegmentType.CODE)) === null || _a === void 0 ? void 0 : _a.address) || 0x1000;
        // === DEBUG: Check bytes at offset 0x22 in segment 0 BEFORE relocations ===
        const seg0 = segments[0];
        if (seg0 && seg0.data.length > 0x25) {
            const b0 = seg0.data[0x22];
            const b1 = seg0.data[0x23];
            const b2 = seg0.data[0x24];
            const b3 = seg0.data[0x25];
            const bytesHex = `${b0.toString(16).padStart(2, '0')} ${b1.toString(16).padStart(2, '0')} ${b2.toString(16).padStart(2, '0')} ${b3.toString(16).padStart(2, '0')}`;
            console.log(`[HunkLoader] === BEFORE RELOCATIONS: segment.data[0x22-0x25] = ${bytesHex} ===`);
            console.log(`[HunkLoader]   Expected from file: b8 80 6d c2`);
            if (b0 !== 0xb8 || b1 !== 0x80) {
                console.log(`[HunkLoader]   *** CORRUPTION ALREADY PRESENT IN PARSED DATA! ***`);
                console.log(`[HunkLoader]   *** The hunk parser read wrong bytes from file! ***`);
            }
        }
        // CRITICAL FIX: Apply relocations to segment data NOW (during parse)
        // instead of waiting until load(). This ensures that when doors execute
        // their startup code (like WHO's "LEA <data_segment>,A4"), they read
        // correctly relocated values instead of zeros.
        console.log('[HunkLoader] Applying relocations to segment data...');
        for (const [segmentIndex, relocs] of relocations.entries()) {
            const segment = segments[segmentIndex];
            console.log(`[HunkLoader] Applying ${relocs.length} relocations to segment ${segmentIndex} @ 0x${segment.address.toString(16)}`);
            for (const reloc of relocs) {
                const targetSegment = segments[reloc.targetSegment];
                const offset = reloc.offset;
                const memoryAddress = segment.address + offset;
                // Read current value at relocation offset (big-endian 32-bit)
                const b0 = segment.data[offset];
                const b1 = segment.data[offset + 1];
                const b2 = segment.data[offset + 2];
                const b3 = segment.data[offset + 3];
                const currentValue = (b0 << 24) | (b1 << 16) | (b2 << 8) | b3;
                // === SPECIAL DEBUG: Track corruption at 0x1022 ===
                if (memoryAddress === 0x1022) {
                    const bytesHex = `${b0.toString(16).padStart(2, '0')} ${b1.toString(16).padStart(2, '0')} ${b2.toString(16).padStart(2, '0')} ${b3.toString(16).padStart(2, '0')}`;
                    console.log(`[CORRUPTION] *** FOUND RELOCATION AT 0x1022 ***`);
                    console.log(`[CORRUPTION]   Segment: ${segmentIndex}, Offset: 0x${offset.toString(16)}`);
                    console.log(`[CORRUPTION]   Current bytes: ${bytesHex}`);
                    console.log(`[CORRUPTION]   Current value: 0x${currentValue.toString(16).padStart(8, '0')}`);
                    console.log(`[CORRUPTION]   Target segment: ${reloc.targetSegment} @ 0x${targetSegment.address.toString(16)}`);
                    console.log(`[CORRUPTION]   Will add base: 0x${targetSegment.address.toString(16)}`);
                }
                // Add target segment's base address
                const newValue = currentValue + targetSegment.address;
                // Write back relocated value (big-endian 32-bit)
                segment.data[offset] = (newValue >>> 24) & 0xFF;
                segment.data[offset + 1] = (newValue >>> 16) & 0xFF;
                segment.data[offset + 2] = (newValue >>> 8) & 0xFF;
                segment.data[offset + 3] = newValue & 0xFF;
                // === SPECIAL DEBUG: Show result at 0x1022 ===
                if (memoryAddress === 0x1022) {
                    const newB0 = segment.data[offset];
                    const newB1 = segment.data[offset + 1];
                    const newB2 = segment.data[offset + 2];
                    const newB3 = segment.data[offset + 3];
                    const newBytesHex = `${newB0.toString(16).padStart(2, '0')} ${newB1.toString(16).padStart(2, '0')} ${newB2.toString(16).padStart(2, '0')} ${newB3.toString(16).padStart(2, '0')}`;
                    console.log(`[CORRUPTION]   New bytes: ${newBytesHex}`);
                    console.log(`[CORRUPTION]   New value: 0x${newValue.toString(16).padStart(8, '0')}`);
                    console.log(`[CORRUPTION]   Expected bytes (from file): b8 80 (CMP.L D0,D4)`);
                    console.log(`[CORRUPTION] *** THIS RELOCATION CORRUPTS 0x1022 ***`);
                }
                // Only log first 10 relocations per segment to avoid spam
                if (relocs.indexOf(reloc) < 10) {
                    console.log(`[HunkLoader]   Reloc @ 0x${memoryAddress.toString(16)} (seg+0x${offset.toString(16)}): 0x${currentValue.toString(16)} -> 0x${newValue.toString(16)} (target seg ${reloc.targetSegment} @ 0x${targetSegment.address.toString(16)})`);
                }
            }
        }
        return {
            segments,
            relocations,
            entryPoint
        };
    }
    /**
     * Load parsed Hunk file into emulator memory
     */
    load(emulator, hunkFile) {
        console.log('[HunkLoader] Loading segments into memory...');
        // Load all segments
        for (const segment of hunkFile.segments) {
            console.log(`[HunkLoader] Loading ${segment.type} segment at 0x${segment.address.toString(16)}, data.length=${segment.data.length}`);
            // DEBUG: Check if this segment contains the critical address 0x1248
            const segmentEnd = segment.address + segment.data.length;
            const contains1248 = (segment.address <= 0x1248) && (segmentEnd > 0x1248);
            console.log(`[HunkLoader]   Segment range: 0x${segment.address.toString(16)} - 0x${segmentEnd.toString(16)}, contains 0x1248? ${contains1248}`);
            if (contains1248) {
                const offset = 0x1248 - segment.address;
                const byte0 = segment.data[offset];
                const byte1 = segment.data[offset + 1];
                console.log(`[HunkLoader] *** This segment contains 0x1248! ***`);
                console.log(`[HunkLoader]   Segment type: ${segment.type}`);
                console.log(`[HunkLoader]   Segment base: 0x${segment.address.toString(16)}`);
                console.log(`[HunkLoader]   Segment size: ${segment.data.length} bytes`);
                console.log(`[HunkLoader]   Offset in segment data: 0x${offset.toString(16)}`);
                console.log(`[HunkLoader]   Bytes in segment.data[${offset}/${offset + 1}]: 0x${byte0.toString(16).padStart(2, '0')} 0x${byte1.toString(16).padStart(2, '0')}`);
                console.log(`[HunkLoader]   As word: 0x${((byte0 << 8) | byte1).toString(16).padStart(4, '0')}`);
                console.log(`[HunkLoader]   Expected: 0x4eae (JSR (A6,d16))`);
                if (((byte0 << 8) | byte1) !== 0x4eae) {
                    console.log(`[HunkLoader]   *** SEGMENT DATA IS ALREADY CORRUPTED IN BUFFER! ***`);
                }
                // CHECK CORRUPTION LOCATION at offset 0x250 (memory 0x1250)
                const offset1250 = 0x1250 - segment.address;
                if (offset1250 >= 0 && offset1250 < segment.data.length - 16) {
                    console.log(`\n[HunkLoader] *** CHECKING CORRUPTION LOCATION 0x1250 ***`);
                    console.log(`[HunkLoader]   Offset in segment.data: 0x${offset1250.toString(16)}`);
                    console.log(`[HunkLoader]   segment.data bytes at offset ${offset1250}:`);
                    let hexStr = '  ';
                    for (let i = 0; i < 16; i++) {
                        hexStr += segment.data[offset1250 + i].toString(16).padStart(2, '0') + ' ';
                    }
                    console.log(hexStr);
                    console.log(`[HunkLoader]   Expected: 4e ae fe 86 60 12 2c 78 00 04 2e 88 67 08 20 79`);
                    // Check if it matches the expected JSR instruction
                    if (segment.data[offset1250] !== 0x4E || segment.data[offset1250 + 1] !== 0xAE) {
                        console.log(`[HunkLoader]   *** CORRUPTION CONFIRMED IN segment.data BUFFER! ***`);
                        console.log(`[HunkLoader]   The hunk file parsing read wrong bytes from file!`);
                    }
                    else {
                        console.log(`[HunkLoader]   segment.data buffer is CORRECT at 0x1250`);
                    }
                }
            }
            // Copy segment data to emulator memory
            for (let i = 0; i < segment.data.length; i++) {
                emulator.writeMemory(segment.address + i, segment.data[i]);
            }
            // VERIFY: Check if 0x1248 was written correctly
            if (contains1248) {
                const offset = 0x1248 - segment.address;
                const verify0 = emulator.readMemory(0x1248);
                const verify1 = emulator.readMemory(0x1249);
                const verifyWord = (verify0 << 8) | verify1;
                console.log(`[HunkLoader] *** VERIFY AFTER WRITE ***`);
                console.log(`[HunkLoader]   Source buffer had: 0x${segment.data[offset].toString(16).padStart(2, '0')}${segment.data[offset + 1].toString(16).padStart(2, '0')}`);
                console.log(`[HunkLoader]   Memory now has:    0x${verifyWord.toString(16).padStart(4, '0')}`);
                if (verifyWord !== ((segment.data[offset] << 8) | segment.data[offset + 1])) {
                    console.log(`[HunkLoader]   *** WRITE TO MEMORY CORRUPTED DATA! ***`);
                }
            }
        }
        // RELOCATIONS NOW APPLIED DURING parse() - No longer needed in load()
        // Relocations are applied to segment data in parse() before returning HunkFile
        // This ensures doors that self-initialize registers (like WHO's LEA <data_segment>,A4)
        // read correctly relocated values instead of zeros.
        console.log('[HunkLoader] Relocations already applied during parse() - skipping load-time relocation');
        console.log(`[HunkLoader] Load complete. Entry point: 0x${hunkFile.entryPoint.toString(16)}`);
    }
    /**
     * Read Hunk header
     */
    readHeader() {
        const hunkType = this.readLong();
        if (hunkType !== HunkType.HUNK_HEADER) {
            throw new Error(`Expected HUNK_HEADER (0x3F3), got 0x${hunkType.toString(16)}`);
        }
        // Skip resident library names (if any)
        while (true) {
            const nameLength = this.readLong();
            if (nameLength === 0)
                break;
            this.position += nameLength * 4; // Skip name
        }
        const numSegments = this.readLong();
        const firstSegment = this.readLong();
        const lastSegment = this.readLong();
        // Read segment sizes
        const segmentSizes = [];
        for (let i = firstSegment; i <= lastSegment; i++) {
            const size = this.readLong() & 0x3FFFFFFF; // Clear flags
            segmentSizes.push(size);
        }
        return { numSegments, segmentSizes };
    }
    /**
     * Read 32-bit big-endian long
     */
    readLong() {
        const value = this.buffer.readUInt32BE(this.position);
        this.position += 4;
        return value;
    }
    /**
     * Read bytes
     */
    readBytes(length) {
        const bytes = this.buffer.slice(this.position, this.position + length);
        this.position += length;
        return bytes;
    }
    /**
     * Skip to next HUNK_END
     */
    skipToEnd() {
        while (this.position < this.buffer.length) {
            const hunkType = this.readLong();
            if (hunkType === HunkType.HUNK_END) {
                break;
            }
        }
    }
}
exports.HunkLoader = HunkLoader;
