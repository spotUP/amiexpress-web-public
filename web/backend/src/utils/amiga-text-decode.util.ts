/**
 * Amiga text-file decoder
 *
 * Reads a text file (screen, bulletin, or any Amiga ANSI art) and returns its
 * content as a JS string with the correct encoding applied. Handles:
 *   - SAUCE metadata (PC ANSI art convention)
 *   - Encoding auto-detection (CP437 vs ISO-8859-1)
 *   - iCE colors transform (SGR blink → bright background)
 *   - PETSCII .seq files (passed through as UTF-8 for downstream PETSCII handling)
 *
 * This module exists because reading these files via `fs.readFileSync(path, 'utf8')`
 * — or `fileCache.readString(path, 'utf8')` — silently corrupts standalone
 * high-bit bytes such as 0xB7 (·), 0xA9 (©), 0xAE (®). UTF-8 decoding replaces
 * each invalid byte with U+FFFD, which then re-encodes as `EF BF BD` and
 * renders in the user's terminal as `ï¿½` (the classic mojibake).
 *
 * Bulletins, BullHelp, and screens all use the same Amiga charset conventions,
 * so they all funnel through the functions here.
 */

import * as path from "path";
import { fileCache } from "./file-cache.util";

const iconv = require("iconv-lite");

/**
 * SAUCE metadata structure (Standard Architecture for Universal Comment Extensions)
 * Used primarily by PC ANSI art to store metadata.
 */
export interface SauceInfo {
  hasSauce: boolean;
  dataType?: number; // 1=Character, 2=Graphics, etc
  fileType?: number; // For dataType 1: 0=ASCII, 1=ANSI, 2=ANSiMation, etc
  tInfo1?: number; // Width in characters
  tInfo2?: number; // Height in characters
  tInfoFlags?: number; // Flags: bit 0 = non-blink (iCE colors)
  iceColors?: boolean; // True if iCE colors (blink disabled, 16 bg colors)
}

export interface AmigaTextResult {
  text: string;
  encoding: "cp437" | "iso-8859-1" | "utf-8";
  iceColors: boolean;
  width?: number;
  height?: number;
}

const SAUCE_MARKER = Buffer.from("SAUCE00", "ascii");

export function parseSauceMetadata(buffer: Buffer): SauceInfo {
  const markerIndex = buffer.lastIndexOf(SAUCE_MARKER);
  if (markerIndex === -1) {
    return { hasSauce: false };
  }
  // SAUCE record is 128 bytes starting at marker:
  //   +94 DataType (1 byte)
  //   +95 FileType (1 byte)
  //   +96 TInfo1 (2 bytes LE) — width
  //   +98 TInfo2 (2 bytes LE) — height
  //   +104 TInfoFlags (1 byte) — bit 0 = iCE colors
  try {
    const dataType = buffer[markerIndex + 94];
    const fileType = buffer[markerIndex + 95];
    const tInfo1 = buffer.readUInt16LE(markerIndex + 96);
    const tInfo2 = buffer.readUInt16LE(markerIndex + 98);
    const tInfoFlags = buffer[markerIndex + 104] || 0;
    const iceColors = (tInfoFlags & 0x01) !== 0;
    return {
      hasSauce: true,
      dataType,
      fileType,
      tInfo1,
      tInfo2,
      tInfoFlags,
      iceColors,
    };
  } catch {
    return { hasSauce: true };
  }
}

export function stripSauceMetadata(buffer: Buffer): Buffer {
  const markerIndex = buffer.lastIndexOf(SAUCE_MARKER);
  if (markerIndex === -1) return buffer;
  // Remove any leading SUB (0x1A) preceding the SAUCE block.
  const subIndex = buffer.lastIndexOf(0x1a, markerIndex);
  const cutIndex = subIndex === -1 ? markerIndex : subIndex;
  return buffer.slice(0, cutIndex);
}

/**
 * Auto-detect encoding from buffer content.
 *
 * 1. SAUCE metadata → CP437 (PC ANSI standard).
 * 2. .ans extension → CP437 (PC ANSI convention).
 * 3. Score CP437 box-drawing/shading bytes vs ISO-8859-1 fractions/symbols.
 * 4. Default ISO-8859-1 (Amiga convention).
 *
 * Key character differences (high bit only):
 *   0xB0–B2: CP437 ░▒▓ vs Latin-1 °±²
 *   0xB3–DA: CP437 box-drawing vs Latin-1 misc symbols
 *   0xDB–DF: CP437 block elements vs Latin-1 letters
 *   0xBC–BE: Latin-1 ¼½¾ (used in Amiga art) — strong Latin-1 indicator
 */
export function detectEncoding(
  buffer: Buffer,
  filePath: string,
  sauceInfo: SauceInfo,
): "cp437" | "iso-8859-1" {
  if (sauceInfo.hasSauce) return "cp437";

  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".ans") return "cp437";

  let cp437Score = 0;
  let latin1Score = 0;

  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i];

    // Skip ANSI escape sequences (their bytes don't tell us anything about charset)
    if (byte === 0x1b && i + 1 < buffer.length && buffer[i + 1] === 0x5b) {
      while (
        i < buffer.length &&
        buffer[i] !== 0x6d &&
        buffer[i] !== 0x48 &&
        buffer[i] !== 0x4a &&
        buffer[i] !== 0x4b &&
        buffer[i] !== 0x41 &&
        buffer[i] !== 0x42 &&
        buffer[i] !== 0x43 &&
        buffer[i] !== 0x44
      ) {
        i++;
      }
      continue;
    }

    // CP437 box-drawing & block (excluding ¼½¾ which collide with Latin-1)
    if (byte >= 0xb3 && byte <= 0xda && byte !== 0xbc && byte !== 0xbd && byte !== 0xbe) {
      cp437Score += 3;
    }
    // CP437 shading
    if (byte >= 0xb0 && byte <= 0xb2) cp437Score += 2;
    // CP437 block elements
    if (byte >= 0xdb && byte <= 0xdf) cp437Score += 3;

    // Latin-1 fractions (very common in Amiga ANSI art)
    if (byte === 0xbc || byte === 0xbd || byte === 0xbe) latin1Score += 3;
    // Latin-1 accented letters
    if (byte >= 0xe0 && byte <= 0xff) latin1Score += 1;
    // Latin-1 specific symbols rare in CP437 art: ©, ®, ·
    if (byte === 0xa9 || byte === 0xae || byte === 0xb7) latin1Score += 2;
  }

  if (cp437Score >= 10 && cp437Score > latin1Score * 2) return "cp437";
  return "iso-8859-1";
}

/**
 * Read an Amiga text file (screen, bulletin, ANSI art) and return its decoded
 * content with metadata. Handles SAUCE stripping and encoding auto-detection.
 *
 * Does NOT apply iCE colors transform. Use readAmigaTextFileWithTransforms()
 * for that.
 */
export function readAmigaTextFile(filePath: string): AmigaTextResult {
  const rawBuffer = fileCache.readBuffer(filePath);
  const sauceInfo = parseSauceMetadata(rawBuffer);
  const buffer = stripSauceMetadata(rawBuffer);
  const ext = path.extname(filePath).toLowerCase();

  // PETSCII .seq files stay UTF-8 so downstream PETSCII handling is preserved.
  if (ext === ".seq") {
    return {
      text: buffer.toString("utf-8"),
      encoding: "utf-8",
      iceColors: false,
    };
  }

  const encoding = detectEncoding(buffer, filePath, sauceInfo);

  try {
    const text = iconv.decode(buffer, encoding);
    return {
      text,
      encoding,
      iceColors: sauceInfo.iceColors || false,
      width: sauceInfo.tInfo1,
      height: sauceInfo.tInfo2,
    };
  } catch (error) {
    console.warn(
      `[amiga-text-decode] ${encoding} decode failed, falling back to utf-8:`,
      (error as Error).message,
    );
    return {
      text: buffer.toString("utf-8"),
      encoding: "utf-8",
      iceColors: false,
    };
  }
}

/**
 * Transform ANSI for iCE colors mode.
 *
 * In iCE colors mode (common in PC ANSI art) the SGR blink attribute (5)
 * encodes high-intensity background instead of blinking. This gives 16
 * background colors (8 normal + 8 bright). Detect SGR 5 combined with bg
 * 40–47 and rewrite to bright bg 100–107, dropping the blink.
 */
export function transformIceColors(content: string): string {
  let blinkEnabled = false;
  let currentBg = -1;

  return content.replace(/\x1b\[([0-9;]*)m/g, (match, params) => {
    if (!params) {
      blinkEnabled = false;
      currentBg = -1;
      return match;
    }

    const codes = params.split(";").map((c: string) => parseInt(c, 10) || 0);
    const newCodes: number[] = [];
    let needsBrightBg = false;

    for (let i = 0; i < codes.length; i++) {
      const code = codes[i];
      if (code === 0) {
        blinkEnabled = false;
        currentBg = -1;
        newCodes.push(code);
      } else if (code === 5) {
        blinkEnabled = true;
        if (currentBg >= 40 && currentBg <= 47) {
          needsBrightBg = true;
        }
      } else if (code === 25) {
        blinkEnabled = false;
        newCodes.push(code);
      } else if (code >= 40 && code <= 47) {
        currentBg = code;
        newCodes.push(blinkEnabled ? code + 60 : code);
      } else if (code >= 100 && code <= 107) {
        currentBg = code;
        newCodes.push(code);
      } else if (code === 49) {
        currentBg = -1;
        newCodes.push(code);
      } else {
        newCodes.push(code);
      }
    }

    if (needsBrightBg && currentBg >= 40 && currentBg <= 47) {
      for (let i = 0; i < newCodes.length; i++) {
        if (newCodes[i] >= 40 && newCodes[i] <= 47) {
          newCodes[i] = newCodes[i] + 60;
          currentBg = newCodes[i];
        }
      }
    }

    if (newCodes.length === 0) return "";
    return `\x1b[${newCodes.join(";")}m`;
  });
}

/**
 * Smart Amiga text-file reader: encoding-aware decode + iCE colors transform.
 *
 * Use this for any text content that ships in the Amiga charset conventions —
 * screen files, bulletins, BullHelp, conference banners. NEVER use
 * readString/readFileSync('utf8') on these files: standalone high-bit bytes
 * (0xB7, 0xA9, 0xAE, etc.) survive iconv but die under UTF-8.
 */
export function readAmigaTextFileWithTransforms(filePath: string): AmigaTextResult {
  const result = readAmigaTextFile(filePath);
  const debugEnabled = process.env.SCREEN_DEBUG !== "0";

  if (debugEnabled) {
    console.log(`[amiga-text-decode] ${filePath}`);
    console.log(
      `[amiga-text-decode]   Encoding: ${result.encoding}, iCE: ${result.iceColors}`,
    );
    if (result.width || result.height) {
      console.log(
        `[amiga-text-decode]   SAUCE dimensions: ${result.width}x${result.height}`,
      );
    }
  }

  if (result.iceColors) {
    if (debugEnabled) {
      console.log(`[amiga-text-decode]   Applying iCE colors transformation`);
    }
    result.text = transformIceColors(result.text);
  }

  return result;
}
