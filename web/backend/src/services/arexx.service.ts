// Enhanced AREXX Scripting Engine for AmiExpress-Web
// Implements a subset of AREXX suitable for web-based BBS automation

import { db } from '../database';
import { AREXXContext, AREXXScript } from '../types';
import { SysopDebugUtil, DebugSeverity } from '../utils/sysop-debug.util';
import { AREXXFileIO } from './arexx-file-io';
import { callersLogManager } from './CallersLogManager';
import { getSystemTime } from '../utils/date-time.util';

/**
 * AREXX Variable Storage
 */
class AREXXVariables {
  private vars: Map<string, any> = new Map();

  set(name: string, value: any): void {
    this.vars.set(name.toUpperCase(), value);
  }

  get(name: string): any {
    return this.vars.get(name.toUpperCase());
  }

  has(name: string): boolean {
    return this.vars.has(name.toUpperCase());
  }

  delete(name: string): void {
    this.vars.delete(name.toUpperCase());
  }

  clear(): void {
    this.vars.clear();
  }

  getAll(): Map<string, any> {
    return new Map(this.vars);
  }
}

/**
 * AREXX Built-in Functions
 */
class AREXXFunctions {
  /**
   * String functions
   */
  static UPPER(str: string): string {
    return str.toUpperCase();
  }

  static LOWER(str: string): string {
    return str.toLowerCase();
  }

  static LEFT(str: string, n: number): string {
    return str.substring(0, n);
  }

  static RIGHT(str: string, n: number): string {
    return str.substring(str.length - n);
  }

  static SUBSTR(str: string, start: number, length?: number): string {
    return length !== undefined ? str.substring(start - 1, start - 1 + length) : str.substring(start - 1);
  }

  static LENGTH(str: string): number {
    return str.length;
  }

  static POS(needle: string, haystack: string): number {
    const pos = haystack.indexOf(needle);
    return pos === -1 ? 0 : pos + 1; // AREXX uses 1-based indexing
  }

  static WORD(str: string, n: number): string {
    const words = str.trim().split(/\s+/);
    return words[n - 1] || ''; // AREXX uses 1-based indexing
  }

  static WORDS(str: string): number {
    return str.trim().split(/\s+/).length;
  }

  /**
   * Conversion functions
   */
  static D2C(num: number): string {
    return String.fromCharCode(num);
  }

  static C2D(char: string): number {
    return char.charCodeAt(0);
  }

  static D2X(num: number): string {
    return num.toString(16).toUpperCase();
  }

  static X2D(hex: string): number {
    return parseInt(hex, 16);
  }

  /**
   * Numeric functions
   */
  static ABS(num: number): number {
    return Math.abs(num);
  }

  static MAX(...args: number[]): number {
    return Math.max(...args);
  }

  static MIN(...args: number[]): number {
    return Math.min(...args);
  }

  static RANDOM(min?: number, max?: number): number {
    if (min === undefined) return Math.random();
    if (max === undefined) return Math.floor(Math.random() * min);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Time/Date functions
   */
  static TIME(format?: string): string {
    const now = getSystemTime();
    switch (format?.toUpperCase()) {
      case 'H':
      case 'HOURS':
        return String(now.getHours());
      case 'M':
      case 'MINUTES':
        return String(now.getHours() * 60 + now.getMinutes());
      case 'S':
      case 'SECONDS':
        return String(Math.floor(now.getTime() / 1000));
      default:
        return now.toTimeString().split(' ')[0]; // HH:MM:SS
    }
  }

  static DATE(format?: string): string {
    const now = getSystemTime();
    const d = String(now.getDate()).padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[now.getMonth()];
    const yyyy = now.getFullYear();
    const yy = String(yyyy).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    switch (format?.toUpperCase()) {
      case 'B': // Base date: days since 1 Jan year 1 (RKRM)
      case 'BASEDATE':
        return String(Math.floor((now.getTime() / (1000 * 60 * 60 * 24)) + 719162));
      case 'C': // Century date
      case 'CENTURY':
        return String(Math.floor((now.getTime() / (1000 * 60 * 60 * 24)) + 719162) % 36525);
      case 'D':
      case 'DAYS':
        // Days into year (1-366)
        {
          const start = new Date(yyyy, 0, 0);
          return String(Math.floor((now.getTime() - start.getTime()) / 86400000));
        }
      case 'E': // European: dd/mm/yy
      case 'EUROPEAN':
        return `${d}/${mm}/${yy}`;
      case 'I': // ISO: yyyy-mm-dd
      case 'ISO':
        return `${yyyy}-${mm}-${d}`;
      case 'J': // Julian: yydd[d]
      case 'JULIAN':
        {
          const start = new Date(yyyy, 0, 0);
          const day = Math.floor((now.getTime() - start.getTime()) / 86400000);
          return `${yy}${String(day).padStart(3, '0')}`;
        }
      case 'M':
      case 'MONTH':
        return ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'][now.getMonth()];
      case 'N': // Normal: dd Mon yyyy
      case 'NORMAL':
        return `${d} ${month} ${yyyy}`;
      case 'O': // Ordered: yy/mm/dd
      case 'ORDERED':
        return `${yy}/${mm}/${d}`;
      case 'S': // Standard: yyyymmdd
      case 'STANDARD':
        return `${yyyy}${mm}${d}`;
      case 'U': // USA: mm/dd/yy
      case 'USA':
        return `${mm}/${d}/${yy}`;
      case 'W':
      case 'WEEKDAY':
        return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()];
      default:
        // RKRM default = Normal: dd Mon yyyy
        return `${d} ${month} ${yyyy}`;
    }
  }

  // ====================================================================
  // String functions (REXX/Standard — RKRM Languages "ARexx Function
  // Reference"). Every function returns the 1-based-indexed REXX
  // result; bounds are clamped to mirror the host's permissive
  // behaviour where a missing arg or out-of-range index returns ''
  // rather than aborting.
  // ====================================================================

  static ABBREV(haystack: string, needle: string, length?: number): number {
    const h = String(haystack ?? ''), n = String(needle ?? '');
    const len = length === undefined ? n.length : Number(length);
    if (n.length < len) return 0;
    return h.startsWith(n) ? 1 : 0;
  }

  static CENTER(str: string, width: number, pad?: string): string {
    return AREXXFunctions.CENTRE(str, width, pad);
  }
  static CENTRE(str: string, width: number, pad?: string): string {
    const s = String(str ?? '');
    const w = Number(width) || 0;
    const p = (pad === undefined || pad === '') ? ' ' : String(pad)[0];
    if (s.length >= w) {
      const trimAmt = s.length - w;
      const leftTrim = Math.floor(trimAmt / 2);
      return s.substring(leftTrim, leftTrim + w);
    }
    const padAmt = w - s.length;
    const left = Math.floor(padAmt / 2);
    const right = padAmt - left;
    return p.repeat(left) + s + p.repeat(right);
  }

  static CHANGESTR(needle: string, haystack: string, replacement: string): string {
    const n = String(needle ?? ''), h = String(haystack ?? ''), r = String(replacement ?? '');
    if (n.length === 0) return h;
    return h.split(n).join(r);
  }

  static COMPARE(s1: string, s2: string, pad?: string): number {
    // Returns 0 if equal, else 1-based position of first difference.
    const a = String(s1 ?? ''), b = String(s2 ?? '');
    const p = (pad === undefined || pad === '') ? ' ' : String(pad)[0];
    const max = Math.max(a.length, b.length);
    for (let i = 0; i < max; i++) {
      const ca = i < a.length ? a[i] : p;
      const cb = i < b.length ? b[i] : p;
      if (ca !== cb) return i + 1;
    }
    return 0;
  }

  static COMPRESS(str: string, chars?: string): string {
    const s = String(str ?? '');
    if (chars === undefined) return s.replace(/\s+/g, '');
    const set = new Set(String(chars));
    let out = '';
    for (const c of s) if (!set.has(c)) out += c;
    return out;
  }

  static COPIES(str: string, n: number): string {
    const count = Number(n) || 0;
    if (count <= 0) return '';
    return String(str ?? '').repeat(count);
  }

  static COUNTSTR(needle: string, haystack: string): number {
    const n = String(needle ?? ''), h = String(haystack ?? '');
    if (n.length === 0) return 0;
    let i = 0, count = 0;
    while ((i = h.indexOf(n, i)) !== -1) { count++; i += n.length; }
    return count;
  }

  static DATATYPE(value: any, type?: string): any {
    const v = String(value ?? '');
    if (type === undefined) {
      if (/^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(v)) return 'NUM';
      return 'CHAR';
    }
    const t = String(type).toUpperCase().charAt(0);
    switch (t) {
      case 'A': return /^[A-Za-z0-9]+$/.test(v) ? 1 : 0;          // Alphanumeric
      case 'B': return /^[01]+$/.test(v) ? 1 : 0;                  // Binary
      case 'L': return /^[a-z]+$/.test(v) ? 1 : 0;                 // Lowercase
      case 'M': return /^[A-Za-z]+$/.test(v) ? 1 : 0;              // Mixed-case alpha
      case 'N': return /^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(v) ? 1 : 0; // Number
      case 'S': return /^[A-Za-z_][A-Za-z0-9_]*$/.test(v) ? 1 : 0; // Symbol
      case 'U': return /^[A-Z]+$/.test(v) ? 1 : 0;                 // Uppercase
      case 'W': return /^[+-]?\d+$/.test(v) ? 1 : 0;               // Whole number
      case 'X': return /^[0-9A-Fa-f]+$/.test(v) ? 1 : 0;           // Hex
      default: return 0;
    }
  }

  static DELSTR(str: string, n: number, length?: number): string {
    const s = String(str ?? '');
    const start = Math.max(1, Number(n) || 1) - 1;
    if (start >= s.length) return s;
    const len = length === undefined ? s.length - start : Number(length);
    return s.substring(0, start) + s.substring(start + len);
  }

  static DELWORD(str: string, n: number, length?: number): string {
    const s = String(str ?? '');
    const words = s.split(/(\s+)/);
    // Keep separators interleaved so we can reconstruct exact spacing.
    const wordIdxs: number[] = [];
    for (let i = 0; i < words.length; i++) if (i % 2 === 0 && words[i].length > 0) wordIdxs.push(i);
    const start = Math.max(1, Number(n) || 1) - 1;
    if (start >= wordIdxs.length) return s;
    const len = length === undefined ? wordIdxs.length - start : Number(length);
    const removeStart = wordIdxs[start];
    const removeEnd = (start + len < wordIdxs.length) ? wordIdxs[start + len] : words.length;
    return words.slice(0, removeStart).join('') + words.slice(removeEnd).join('');
  }

  static INSERT(s1: string, s2: string, n?: number, length?: number, pad?: string): string {
    const ins = String(s1 ?? ''), tgt = String(s2 ?? '');
    const at = Number(n ?? 0);
    const w = length === undefined ? ins.length : Math.max(0, Number(length));
    const p = (pad === undefined || pad === '') ? ' ' : String(pad)[0];
    const padded = ins.length < w ? ins + p.repeat(w - ins.length) : ins.substring(0, w);
    if (at >= tgt.length) return tgt + p.repeat(at - tgt.length) + padded;
    return tgt.substring(0, at) + padded + tgt.substring(at);
  }

  static JUSTIFY(str: string, width: number, pad?: string): string {
    const s = String(str ?? '').trim();
    const w = Number(width) || 0;
    if (w <= 0) return '';
    const p = (pad === undefined || pad === '') ? ' ' : String(pad)[0];
    const words = s.split(/\s+/).filter(Boolean);
    if (words.length === 0) return p.repeat(w);
    if (words.length === 1) return (words[0] + p.repeat(w)).substring(0, w);
    const totalChars = words.reduce((a, b) => a + b.length, 0);
    const gaps = words.length - 1;
    const totalGapChars = w - totalChars;
    if (totalGapChars <= gaps) {
      // Not enough room — single space between, truncate.
      return words.join(' ').substring(0, w);
    }
    const baseGap = Math.floor(totalGapChars / gaps);
    let extra = totalGapChars - baseGap * gaps;
    let out = words[0];
    for (let i = 1; i < words.length; i++) {
      out += p.repeat(baseGap + (extra > 0 ? 1 : 0)) + words[i];
      if (extra > 0) extra--;
    }
    return out;
  }

  static LASTPOS(needle: string, haystack: string, start?: number): number {
    const n = String(needle ?? ''), h = String(haystack ?? '');
    if (n.length === 0) return 0;
    const startIdx = start === undefined ? h.length : Math.min(h.length, Number(start));
    const pos = h.lastIndexOf(n, startIdx - 1);
    return pos === -1 ? 0 : pos + 1;
  }

  static OVERLAY(s1: string, s2: string, n?: number, length?: number, pad?: string): string {
    const ins = String(s1 ?? '');
    const tgt = String(s2 ?? '');
    const at = Math.max(1, Number(n ?? 1)) - 1;
    const w = length === undefined ? ins.length : Math.max(0, Number(length));
    const p = (pad === undefined || pad === '') ? ' ' : String(pad)[0];
    const piece = ins.length < w ? ins + p.repeat(w - ins.length) : ins.substring(0, w);
    let result = tgt;
    if (at > result.length) result += p.repeat(at - result.length);
    return result.substring(0, at) + piece + result.substring(at + piece.length);
  }

  static REVERSE(str: string): string {
    return String(str ?? '').split('').reverse().join('');
  }

  static SPACE(str: string, n?: number, pad?: string): string {
    const s = String(str ?? '').trim();
    const count = n === undefined ? 1 : Math.max(0, Number(n));
    const p = (pad === undefined || pad === '') ? ' ' : String(pad)[0];
    const words = s.split(/\s+/).filter(Boolean);
    return words.join(p.repeat(count));
  }

  static STRIP(str: string, mode?: string, char?: string): string {
    const s = String(str ?? '');
    const c = (char === undefined || char === '') ? ' ' : String(char)[0];
    const m = String(mode ?? 'B').toUpperCase().charAt(0);
    const escC = c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (m === 'L') return s.replace(new RegExp(`^${escC}+`), '');
    if (m === 'T') return s.replace(new RegExp(`${escC}+$`), '');
    return s.replace(new RegExp(`^${escC}+|${escC}+$`, 'g'), '');
  }

  static SUBWORD(str: string, n: number, length?: number): string {
    const s = String(str ?? '');
    const words = s.trim().split(/\s+/).filter(Boolean);
    const start = Math.max(1, Number(n) || 1) - 1;
    if (start >= words.length) return '';
    const end = length === undefined ? words.length : Math.min(words.length, start + Number(length));
    return words.slice(start, end).join(' ');
  }

  static TRANSLATE(str: string, outTable?: string, inTable?: string, pad?: string): string {
    const s = String(str ?? '');
    if (outTable === undefined) return s.toUpperCase();
    const out = String(outTable);
    const inT = String(inTable ?? '');
    const p = (pad === undefined || pad === '') ? ' ' : String(pad)[0];
    let result = '';
    for (const ch of s) {
      if (inT.length === 0) {
        // Default in-table: identity. Use outTable as character class
        // mapped from char code — REXX default behaviour upper-cases.
        result += ch.toUpperCase();
        continue;
      }
      const idx = inT.indexOf(ch);
      if (idx < 0) { result += ch; continue; }
      result += idx < out.length ? out[idx] : p;
    }
    return result;
  }

  static VERIFY(str: string, ref: string, mode?: string, start?: number): number {
    const s = String(str ?? ''), r = String(ref ?? '');
    const m = String(mode ?? 'N').toUpperCase().charAt(0);
    const startIdx = Math.max(1, Number(start ?? 1)) - 1;
    for (let i = startIdx; i < s.length; i++) {
      const inRef = r.indexOf(s[i]) !== -1;
      if (m === 'M' ? inRef : !inRef) return i + 1;
    }
    return 0;
  }

  static WORDINDEX(str: string, n: number): number {
    const s = String(str ?? '');
    const target = Math.max(1, Number(n) || 1);
    let idx = 0, wc = 0;
    while (idx < s.length) {
      while (idx < s.length && /\s/.test(s[idx])) idx++;
      if (idx >= s.length) break;
      wc++;
      if (wc === target) return idx + 1;
      while (idx < s.length && !/\s/.test(s[idx])) idx++;
    }
    return 0;
  }

  static WORDLENGTH(str: string, n: number): number {
    const s = String(str ?? '');
    const target = Math.max(1, Number(n) || 1);
    const words = s.trim().split(/\s+/).filter(Boolean);
    if (target > words.length) return 0;
    return words[target - 1].length;
  }

  static WORDPOS(needle: string, haystack: string, start?: number): number {
    const n = String(needle ?? '').trim().split(/\s+/).filter(Boolean);
    const h = String(haystack ?? '').trim().split(/\s+/).filter(Boolean);
    if (n.length === 0) return 0;
    const startIdx = Math.max(1, Number(start ?? 1)) - 1;
    for (let i = startIdx; i <= h.length - n.length; i++) {
      let match = true;
      for (let j = 0; j < n.length; j++) {
        if (h[i + j] !== n[j]) { match = false; break; }
      }
      if (match) return i + 1;
    }
    return 0;
  }

  // ====================================================================
  // Conversion functions (extra)
  // ====================================================================

  static B2X(bin: string): string {
    const s = String(bin ?? '').replace(/\s+/g, '');
    let out = '';
    for (let i = 0; i < s.length; i += 4) {
      const chunk = s.slice(i, i + 4).padStart(4, '0');
      out += parseInt(chunk, 2).toString(16).toUpperCase();
    }
    return out;
  }
  static X2B(hex: string): string {
    let out = '';
    for (const c of String(hex ?? '').replace(/\s+/g, '')) {
      out += parseInt(c, 16).toString(2).padStart(4, '0');
    }
    return out;
  }
  static C2X(s: string): string {
    let out = '';
    for (const c of String(s ?? '')) out += c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0');
    return out;
  }
  static X2C(hex: string): string {
    const h = String(hex ?? '').replace(/\s+/g, '');
    let out = '';
    for (let i = 0; i < h.length; i += 2) out += String.fromCharCode(parseInt(h.slice(i, i + 2), 16));
    return out;
  }

  // ====================================================================
  // Numeric (extra)
  // ====================================================================

  static SIGN(n: number): number {
    const x = Number(n);
    if (x > 0) return 1;
    if (x < 0) return -1;
    return 0;
  }

  static TRUNC(n: number, decimals?: number): string {
    const x = Number(n);
    const d = decimals === undefined ? 0 : Math.max(0, Number(decimals));
    if (d === 0) return String(Math.trunc(x));
    const factor = Math.pow(10, d);
    return (Math.trunc(x * factor) / factor).toFixed(d);
  }

  static FORMAT(n: number, before?: number, after?: number, _expp?: number, _expt?: number): string {
    const x = Number(n);
    const a = after === undefined ? -1 : Math.max(0, Number(after));
    let s = a < 0 ? String(x) : x.toFixed(a);
    if (before !== undefined) {
      const b = Math.max(0, Number(before));
      const intPart = s.split('.')[0];
      const intMagnitude = intPart.replace('-', '');
      if (intMagnitude.length < b) {
        s = (intPart.startsWith('-') ? '-' : '') +
            ' '.repeat(b - intMagnitude.length) +
            intMagnitude +
            (s.includes('.') ? '.' + s.split('.')[1] : '');
      }
    }
    return s;
  }

  // ====================================================================
  // Bit operations
  // ====================================================================

  static BITAND(s1: string, s2: string, pad?: string): string {
    const a = String(s1 ?? ''), b = String(s2 ?? '');
    const p = (pad === undefined || pad === '') ? '\xff' : String(pad)[0];
    const len = Math.max(a.length, b.length);
    let out = '';
    for (let i = 0; i < len; i++) {
      const ca = i < a.length ? a.charCodeAt(i) : p.charCodeAt(0);
      const cb = i < b.length ? b.charCodeAt(i) : p.charCodeAt(0);
      out += String.fromCharCode(ca & cb);
    }
    return out;
  }
  static BITOR(s1: string, s2: string, pad?: string): string {
    const a = String(s1 ?? ''), b = String(s2 ?? '');
    const p = (pad === undefined || pad === '') ? '\x00' : String(pad)[0];
    const len = Math.max(a.length, b.length);
    let out = '';
    for (let i = 0; i < len; i++) {
      const ca = i < a.length ? a.charCodeAt(i) : p.charCodeAt(0);
      const cb = i < b.length ? b.charCodeAt(i) : p.charCodeAt(0);
      out += String.fromCharCode(ca | cb);
    }
    return out;
  }
  static BITXOR(s1: string, s2: string, pad?: string): string {
    const a = String(s1 ?? ''), b = String(s2 ?? '');
    const p = (pad === undefined || pad === '') ? '\x00' : String(pad)[0];
    const len = Math.max(a.length, b.length);
    let out = '';
    for (let i = 0; i < len; i++) {
      const ca = i < a.length ? a.charCodeAt(i) : p.charCodeAt(0);
      const cb = i < b.length ? b.charCodeAt(i) : p.charCodeAt(0);
      out += String.fromCharCode(ca ^ cb);
    }
    return out;
  }

  // ====================================================================
  // Misc
  // ====================================================================

  static QUEUED(): number { return 0; } // Data queue size — we don't model an external queue.
  static SOURCELINE(_n?: number): string { return ''; } // Source line — empty (we'd need to track line→source mapping).
  static ERRORTEXT(code: number): string {
    // RKRM error-message map. Subset commonly raised: 5 invalid expr,
    // 6 unmatched paren, 7 keyword used wrong, 13 invalid character,
    // 14 incomplete DO, 15 invalid hex, 16 label not found,
    // 17 unexpected PROCEDURE, 18 THEN expected, 19 string/symbol expected,
    // 20 symbol expected, 21 invalid data, 25 invalid integer,
    // 26 invalid whole number, 27 division by zero, 30 string too long,
    // 35 invalid expression, 36 unmatched bracket, 37 unexpected END,
    // 39 dot OR colon expected, 40 incorrect call to routine, 41 bad arith,
    // 42 arithmetic overflow, 43 routine not found, 44 function did not
    // return data, 45 NOVALUE, 46 invalid template, 50 unrecognised TRACE,
    // 51 invalid result.
    const map: Record<number, string> = {
      3: 'Failure during initialisation',
      4: 'Program interrupted',
      5: 'Machine resources exhausted',
      6: 'Unmatched "/*" or quote',
      7: 'WHEN or OTHERWISE expected',
      8: 'Unexpected THEN or ELSE',
      9: 'Unexpected WHEN or OTHERWISE',
      10: 'Unexpected or unmatched END',
      11: 'Control stack overflow',
      13: 'Invalid character in program',
      14: 'Incomplete DO/SELECT/IF',
      15: 'Invalid hexadecimal or binary string',
      16: 'Label not found',
      17: 'Unexpected PROCEDURE',
      18: 'THEN expected',
      19: 'String or symbol expected',
      20: 'Symbol expected',
      21: 'Invalid data on end of clause',
      25: 'Invalid integer',
      26: 'Invalid whole number',
      27: 'Division by zero',
      30: 'Name or string > 250 characters',
      35: 'Invalid expression',
      36: 'Unmatched ( in expression',
      37: 'Unexpected , or )',
      38: 'Invalid template',
      40: 'Incorrect call to routine',
      41: 'Bad arithmetic conversion',
      42: 'Arithmetic overflow/underflow',
      43: 'Routine not found',
      44: 'Function did not return data',
      45: 'No data specified on function RETURN',
      46: 'Invalid variable reference',
      48: 'Failure in system service',
      49: 'Interpretation error',
      50: 'Unrecognised reserved symbol',
      51: 'Invalid function name',
    };
    return map[Number(code)] || '';
  }
  static CONDITION(_opt?: string): string { return ''; } // Condition info — minimal.
  static SYMBOL(name: string): string {
    // We can't introspect from a static fn — caller patches this.
    // Returns LIT (literal) by default; runtime overrides to VAR/BAD.
    return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(String(name ?? '')) ? 'LIT' : 'BAD';
  }
}

/**
 * Split a REXX physical line into clauses on `;` while respecting
 * single/double quotes (RKRM "Using ARexx" §3.1 — newline OR `;`
 * end a clause; `;` inside a literal string does NOT split).
 *
 * Doesn't currently track parenthesis depth — REXX itself doesn't
 * forbid bare `;` inside parens, but no shipped AmiExpress AREXX
 * door we've audited relies on it. Add depth tracking here if a
 * door turns up that does.
 */
// Strip REXX block comments (slash-star ... star-slash) from the
// script while preserving everything else (including newlines outside
// of comments). Comments may span multiple lines and may nest per
// RKRM §3.2 — we honour nesting so an outer comment containing an
// inner comment is fully removed when the outer terminator is reached.
//
// String literals ('...' or "...") are NOT comment-aware in REXX: a
// star-slash inside a string is just data. We track quote state
// outside of comments so a string containing star-slash doesn't end
// a comment that started before it.
//
// Pre-existing preprocessScript was line-based and filtered any line
// that started with slash-star — fine for hand-written multi-line
// comments, but RexxOpt-optimized builds pack the entire script onto
// a single line that begins with the header comment followed by
// star-slash;real_code. SOMEINFO.rexx exhibited this: line 2 was the
// 3KB script preceded by the file's header comment, the whole line
// was dropped, leaving an empty script and silent completion.
// Stripping block comments globally fixes that and keeps multi-line
// comment support intact.
//
// Plain // line comments are intentionally NOT block comments —
// preprocessScript handles those separately.
export function stripRexxBlockComments(src: string): string {
  let out = '';
  let i = 0;
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  while (i < src.length) {
    const c = src[i];
    if (depth === 0) {
      if (!inDouble && c === "'" && src[i - 1] !== '\\') inSingle = !inSingle;
      else if (!inSingle && c === '"' && src[i - 1] !== '\\') inDouble = !inDouble;
      if (!inSingle && !inDouble && c === '/' && src[i + 1] === '*') {
        depth = 1;
        i += 2;
        continue;
      }
      out += c;
      i++;
      continue;
    }
    // Inside comment — look for nested open or close.
    if (c === '/' && src[i + 1] === '*') { depth++; i += 2; continue; }
    if (c === '*' && src[i + 1] === '/') {
      depth--;
      i += 2;
      continue;
    }
    // Preserve newlines so reported line numbers in errors stay
    // roughly aligned with the source file.
    if (c === '\n') out += '\n';
    i++;
  }
  return out;
}

export function splitRexxStatements(line: string): string[] {
  const out: string[] = [];
  let buf = '';
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (!inDouble && ch === "'") inSingle = !inSingle;
    else if (!inSingle && ch === '"') inDouble = !inDouble;
    if (ch === ';' && !inSingle && !inDouble) {
      out.push(buf);
      buf = '';
    } else {
      buf += ch;
    }
  }
  if (buf.length > 0) out.push(buf);
  return out;
}

/**
 * BBS-Specific AREXX Functions
 */
class BBSFunctions {
  private context: any;

  constructor(context: any) {
    this.context = context;
  }

  /*
   * BBSWRITE / Transmit / SendString / SendMessage / PutUser /
   * PutUstr / Prompt are all defined later in this class — see the
   * Aedoc4.guide §Cap1102 implementation block below. emitToTerminal
   * is the shared sink that handles socket / outputCallback / output
   * (array OR function) routing.
   */

  /**
   * Get user input
   */
  async BBSREAD(): Promise<string> {
    // In real implementation, this would wait for user input
    return this.context.lastInput || '';
  }

  /**
   * Get user name
   */
  BBSGETUSERNAME(): string {
    return this.context.user?.username || 'Unknown';
  }

  /**
   * Get user security level
   */
  BBSGETUSERLEVEL(): number {
    return this.context.user?.secLevel || 0;
  }

  /**
   * Get current conference
   */
  BBSGETCONF(): number {
    return this.context.session?.currentConf || 0;
  }

  /**
   * Join conference
   */
  async BBSJOINCONF(confId: number): Promise<boolean> {
    if (this.context.session) {
      this.context.session.currentConf = confId;
      return true;
    }
    return false;
  }

  /**
   * Post message
   */
  async BBSPOSTMSG(subject: string, body: string, isPrivate: boolean = false, toUser?: string): Promise<number> {
    try {
      const messageId = await db.createMessage({
        subject,
        body,
        author: this.context.user?.username || 'System',
        timestamp: getSystemTime(),
        conferenceId: this.context.session?.currentConf || 1,
        messageBaseId: this.context.session?.currentMsgBase || 1,
        isPrivate,
        toUser
      });
      return messageId;
    } catch (error) {
console.error('AREXX BBSPOSTMSG error:', error);
      SysopDebugUtil.debug(
        this.context.socket || null,
        this.context.session || null,
        'AREXX Script',
        `Failed to post message via BBSPOSTMSG()`,
        {
          error: error instanceof Error ? error.message : String(error),
          subject,
          toUser,
          isPrivate,
          username: this.context.user?.username
        },
        DebugSeverity.WARNING
      );
      return 0;
    }
  }

  /**
   * Get message count
   */
  async BBSGETMSGCOUNT(confId?: number, baseId?: number): Promise<number> {
    try {
      const messages = await db.getMessages(
        confId || this.context.session?.currentConf || 1,
        baseId || this.context.session?.currentMsgBase || 1
      );
      return messages.length;
    } catch (error) {
      SysopDebugUtil.debug(
        this.context.socket || null,
        this.context.session || null,
        'AREXX Script',
        `Failed to get message count via BBSGETMSGCOUNT()`,
        {
          error: error instanceof Error ? error.message : String(error),
          confId,
          baseId
        },
        DebugSeverity.WARNING
      );
      return 0;
    }
  }

  /**
   * Log event
   */
  async BBSLOG(level: string, message: string): Promise<void> {
    const logLevel = ['info', 'warning', 'error'].includes(level.toLowerCase())
      ? level.toLowerCase() as 'info' | 'warning' | 'error'
      : 'info';

    await db.logSystemEvent(logLevel, message, {
      userId: this.context.user?.id,
      conferenceId: this.context.session?.currentConf
    });
  }

  /**
   * Get user by username or ID
   */
  async BBSGETUSER(usernameOrId: string | number): Promise<any> {
    try {
      if (typeof usernameOrId === 'number') {
        const users = await db.getUsers();
        return users.find(u => String(u.id) === String(usernameOrId));
      } else {
        return await db.getUserByUsername(usernameOrId);
      }
    } catch (error) {
console.error('AREXX BBSGETUSER error:', error);
      SysopDebugUtil.debug(
        this.context.socket || null,
        this.context.session || null,
        'AREXX Script',
        `Failed to get user via BBSGETUSER()`,
        {
          error: error instanceof Error ? error.message : String(error),
          usernameOrId
        },
        DebugSeverity.WARNING
      );
      return null;
    }
  }

  /**
   * Update user field
   */
  async BBSSETUSER(field: string, value: any): Promise<boolean> {
    try {
      if (!this.context.user?.id) return false;
      await db.updateUser(this.context.user.id, { [field]: value });
      return true;
    } catch (error) {
console.error('AREXX BBSSETUSER error:', error);
      SysopDebugUtil.debug(
        this.context.socket || null,
        this.context.session || null,
        'AREXX Script',
        `Failed to update user field via BBSSETUSER()`,
        {
          error: error instanceof Error ? error.message : String(error),
          field,
          value,
          userId: this.context.user?.id
        },
        DebugSeverity.WARNING
      );
      return false;
    }
  }

  /**
   * Get number of users online
   */
  async BBSGETONLINECOUNT(): Promise<number> {
    try {
      // Count connected sessions
      // In a real implementation, would query active sessions
      return 1; // At least the current user
    } catch (error) {
      SysopDebugUtil.debug(
        this.context.socket || null,
        this.context.session || null,
        'AREXX Script',
        `Failed to get online count via BBSGETONLINECOUNT()`,
        {
          error: error instanceof Error ? error.message : String(error)
        },
        DebugSeverity.WARNING
      );
      return 0;
    }
  }

  /**
   * Get list of online users
   */
  async BBSGETONLINEUSERS(): Promise<string[]> {
    try {
      // Return list of online usernames
      // In a real implementation, would query active sessions
      if (this.context.user?.username) {
        return [this.context.user.username];
      }
      return [];
    } catch (error) {
      SysopDebugUtil.debug(
        this.context.socket || null,
        this.context.session || null,
        'AREXX Script',
        `Failed to get online users via BBSGETONLINEUSERS()`,
        {
          error: error instanceof Error ? error.message : String(error)
        },
        DebugSeverity.WARNING
      );
      return [];
    }
  }

  /**
   * Get conference name
   */
  async BBSGETCONFNAME(confId?: number): Promise<string> {
    try {
      const id = confId || this.context.session?.currentConf || 1;
      const conferences = await db.getConferences();
      const conf = conferences.find(c => c.id === id);
      return conf?.name || 'Unknown';
    } catch (error) {
      SysopDebugUtil.debug(
        this.context.socket || null,
        this.context.session || null,
        'AREXX Script',
        `Failed to get conference name via BBSGETCONFNAME()`,
        {
          error: error instanceof Error ? error.message : String(error),
          confId
        },
        DebugSeverity.WARNING
      );
      return 'Unknown';
    }
  }

  /**
   * Get all conferences
   */
  async BBSGETCONFERENCES(): Promise<number> {
    try {
      const conferences = await db.getConferences();
      return conferences.length;
    } catch (error) {
      SysopDebugUtil.debug(
        this.context.socket || null,
        this.context.session || null,
        'AREXX Script',
        `Failed to get conference count via BBSGETCONFERENCES()`,
        {
          error: error instanceof Error ? error.message : String(error)
        },
        DebugSeverity.WARNING
      );
      return 0;
    }
  }

  /**
   * Check if user has access level
   */
  BBSCHECKLEVEL(requiredLevel: number): boolean {
    return (this.context.user?.secLevel || 0) >= requiredLevel;
  }

  /**
   * Send private message to user
   */
  async BBSSENDPRIVATE(toUser: string, subject: string, body: string): Promise<number> {
    return await this.BBSPOSTMSG(subject, body, true, toUser);
  }

  /**
   * Get last caller info from CallersLog
   * Returns the username of the most recent user who logged in
   */
  async BBSGETLASTCALLER(): Promise<string> {
    try {
      const nodeId = this.context.session?.nodeId || 0;
      const lastCaller = callersLogManager.getLastCaller(nodeId);
      return lastCaller || 'System';
    } catch (error) {
      SysopDebugUtil.debug(
        this.context.socket || null,
        this.context.session || null,
        'AREXX Script',
        `Failed to get last caller via BBSGETLASTCALLER()`,
        {
          error: error instanceof Error ? error.message : String(error)
        },
        DebugSeverity.WARNING
      );
      return 'Unknown';
    }
  }

  /**
   * File Operations (Phase 3)
   */
  async BBSREADFILE(filename: string): Promise<string> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');

      // Security: only allow reading from specific BBS directories
      const basePath = path.join(process.cwd(), 'data', 'files');
      const fullPath = path.join(basePath, filename);

      // Prevent directory traversal
      if (!fullPath.startsWith(basePath)) {
        throw new Error('Access denied: Invalid file path');
      }

      const content = await fs.readFile(fullPath, 'utf-8');
      return content;
    } catch (error) {
console.error('BBSREADFILE error:', error);
      SysopDebugUtil.debug(
        this.context.socket || null,
        this.context.session || null,
        'AREXX Script',
        `Failed to read file via BBSREADFILE()`,
        {
          error: error instanceof Error ? error.message : String(error),
          filename
        },
        DebugSeverity.WARNING
      );
      return '';
    }
  }

  async BBSWRITEFILE(filename: string, content: string, append: boolean = false): Promise<boolean> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');

      // Security: only allow writing to specific BBS directories
      const basePath = path.join(process.cwd(), 'data', 'files');
      const fullPath = path.join(basePath, filename);

      // Prevent directory traversal
      if (!fullPath.startsWith(basePath)) {
        throw new Error('Access denied: Invalid file path');
      }

      // Ensure directory exists
      await fs.mkdir(path.dirname(fullPath), { recursive: true });

      if (append) {
        await fs.appendFile(fullPath, content, 'utf-8');
      } else {
        await fs.writeFile(fullPath, content, 'utf-8');
      }

      return true;
    } catch (error) {
console.error('BBSWRITEFILE error:', error);
      SysopDebugUtil.debug(
        this.context.socket || null,
        this.context.session || null,
        'AREXX Script',
        `Failed to write file via BBSWRITEFILE()`,
        {
          error: error instanceof Error ? error.message : String(error),
          filename,
          append
        },
        DebugSeverity.WARNING
      );
      return false;
    }
  }

  /**
   * Menu and Door Functions (Phase 3)
   */
  async BBSSHOWMENU(menuName: string): Promise<void> {
    try {
      // Read menu file from data/menus directory
      const menuContent = await this.BBSREADFILE(`../menus/${menuName}.ans`);
      if (menuContent) {
        await this.BBSWRITE(menuContent);
      } else {
        await this.BBSWRITE(`Menu '${menuName}' not found`);
      }
    } catch (error) {
console.error('BBSSHOWMENU error:', error);
      SysopDebugUtil.debug(
        this.context.socket || null,
        this.context.session || null,
        'AREXX Script',
        `Failed to show menu via BBSSHOWMENU()`,
        {
          error: error instanceof Error ? error.message : String(error),
          menuName
        },
        DebugSeverity.WARNING
      );
      await this.BBSWRITE(`Error loading menu: ${menuName}`);
    }
  }

  async BBSLAUNCHDOOR(doorName: string, params: string[] = []): Promise<number> {
    try {
      // Log door launch
      await this.BBSLOG('info', `Launching door: ${doorName} with params: ${params.join(' ')}`);

      // In a real implementation, this would:
      // 1. Check if door exists in doors registry
      // 2. Create door drop file (DOOR.SYS, DORINFO1.DEF, etc.)
      // 3. Launch door process or load TypeScript module
      // 4. Capture door output and send to user
      // 5. Return door exit code

      // For now, return success indicator
      await this.BBSWRITE(`Door '${doorName}' would launch here with params: ${params.join(', ')}`);
      return 0; // Success
    } catch (error) {
console.error('BBSLAUNCHDOOR error:', error);
      return 1; // Error
    }
  }

  /**
   * File Area Functions (Phase 3)
   */
  async BBSGETFILECOUNT(areaId?: number): Promise<number> {
    try {
      const areaToUse = areaId || this.context.session?.currentFileArea || 1;
      const files = await db.getFileEntries(areaToUse);
      return files.length;
    } catch (error) {
console.error('BBSGETFILECOUNT error:', error);
      return 0;
    }
  }

  async BBSGETFILEAREAS(): Promise<number> {
    try {
      const confId = this.context.session?.currentConf || 1;
      const areas = await db.getFileAreas(confId);
      return areas.length;
    } catch (error) {
console.error('BBSGETFILEAREAS error:', error);
      return 0;
    }
  }

  async BBSGETAREANAME(areaId?: number): Promise<string> {
    try {
      const areaToUse = areaId || this.context.session?.currentFileArea || 1;
      const areas = await db.getFileAreas(this.context.session?.currentConf || 1);
      const area = areas.find(a => a.id === areaToUse);
      return area?.name || 'Unknown';
    } catch (error) {
console.error('BBSGETAREANAME error:', error);
      return 'Unknown';
    }
  }

  async BBSSEARCHFILES(pattern: string, areaId?: number): Promise<string> {
    try {
      const areaToUse = areaId || this.context.session?.currentFileArea || 1;
      const files = await db.getFileEntries(areaToUse, { search: pattern });
      return files.map(f => f.filename).join(', ');
    } catch (error) {
console.error('BBSSEARCHFILES error:', error);
      return '';
    }
  }

  /**
   * Phase 4 BBS Functions - File Management
   */
  async BBSDELETEFILE(filename: string): Promise<boolean> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');

      // Security: only allow deleting from specific BBS directories
      const basePath = path.join(process.cwd(), 'data', 'files');
      const fullPath = path.join(basePath, filename);

      // Prevent directory traversal
      if (!fullPath.startsWith(basePath)) {
        throw new Error('Access denied: Invalid file path');
      }

      await fs.unlink(fullPath);
      await this.BBSLOG('info', `File deleted: ${filename}`);
      return true;
    } catch (error) {
console.error('BBSDELETEFILE error:', error);
      return false;
    }
  }

  async BBSRENAMEFILE(oldFilename: string, newFilename: string): Promise<boolean> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');

      // Security: only allow renaming in specific BBS directories
      const basePath = path.join(process.cwd(), 'data', 'files');
      const oldPath = path.join(basePath, oldFilename);
      const newPath = path.join(basePath, newFilename);

      // Prevent directory traversal
      if (!oldPath.startsWith(basePath) || !newPath.startsWith(basePath)) {
        throw new Error('Access denied: Invalid file path');
      }

      await fs.rename(oldPath, newPath);
      await this.BBSLOG('info', `File renamed: ${oldFilename} -> ${newFilename}`);
      return true;
    } catch (error) {
console.error('BBSRENAMEFILE error:', error);
      return false;
    }
  }

  /**
   * Phase 4 BBS Functions - System Information
   */
  async BBSGETDISKSPACE(): Promise<number> {
    try {
      const fs = await import('fs');
      const path = await import('path');

      // Get disk space for data directory
      const dataPath = path.join(process.cwd(), 'data');

      // This is a simplified version - in production would use proper disk space check
      // For now, return a reasonable estimate in bytes (1GB = 1,073,741,824 bytes)
      return 1073741824;
    } catch (error) {
console.error('BBSGETDISKSPACE error:', error);
      return 0;
    }
  }

  async BBSGETDOORLIST(): Promise<string> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');

      // Read doors from doors directory
      const doorsPath = path.join(process.cwd(), 'Doors');
      const entries = await fs.readdir(doorsPath, { withFileTypes: true });

      const doors = entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name);

      return doors.join(', ');
    } catch (error) {
console.error('BBSGETDOORLIST error:', error);
      return '';
    }
  }

  async BBSGETMENULIST(): Promise<string> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');

      // Read menus from data/menus directory
      const menusPath = path.join(process.cwd(), 'data', 'menus');

      try {
        const entries = await fs.readdir(menusPath, { withFileTypes: true });
        const menus = entries
          .filter(entry => entry.isFile() && entry.name.endsWith('.ans'))
          .map(entry => entry.name.replace('.ans', ''));

        return menus.join(', ');
      } catch (err) {
        // Directory might not exist yet
        return '';
      }
    } catch (error) {
console.error('BBSGETMENULIST error:', error);
      return '';
    }
  }

  /**
   * Phase 4 - Door Drop File Creation
   * Create DOOR.SYS and DORINFO1.DEF for door programs
   */
  async BBSCREATEDROPFILE(doorName: string, format: 'DOOR.SYS' | 'DORINFO1.DEF' = 'DOOR.SYS'): Promise<boolean> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');

      const user = this.context.user;
      const session = this.context.session;

      // Create drop files directory
      const dropPath = path.join(process.cwd(), 'data', 'doors', 'dropfiles');
      await fs.mkdir(dropPath, { recursive: true });

      if (format === 'DOOR.SYS') {
        // DOOR.SYS format (PCBoard-style)
        const doorSysContent = [
          'COM1:',                                    // Comm port
          '115200',                                   // Baud rate
          '8',                                        // Parity
          '1',                                        // Node number
          '115200',                                   // DTE rate
          'Y',                                        // Screen display
          'Y',                                        // Printer toggle
          'Y',                                        // Page bell
          'Y',                                        // Caller alarm
          user?.username || 'Guest',                  // User name
          user?.location || 'Unknown',                // Location
          user?.phone || '000-000-0000',              // Phone
          user?.dataphone || '000-000-0000',          // Data phone
          user?.password || '',                       // Password
          String(user?.secLevel || 0),                // Security level
          String(user?.numLogons || 0),               // Total logons
          user?.lastDateOn || '',                     // Last date on
          String(user?.secondsRemaining || 3600),     // Seconds remaining
          String(user?.minutesRemaining || 60),       // Minutes remaining
          'GR',                                       // Graphics mode
          String(session?.currentPage || 1),          // Page length
          'N',                                        // Expert mode
          '1,2,3,4,5,6,7',                           // Conferences
          String(session?.numUploads || 0),           // Uploads
          String(session?.numDownloads || 0),         // Downloads
          String(session?.uploadKbytes || 0),         // Upload KB
          String(session?.downloadKbytes || 0),       // Download KB
          String(user?.userComment || ''),            // User comment
          String(session?.doorUsage || 0),            // Doors opened
          String(session?.numMessages || 0)           // Messages left
        ].join('\r\n');

        await fs.writeFile(path.join(dropPath, 'DOOR.SYS'), doorSysContent, 'utf-8');
      } else {
        // DORINFO1.DEF format (RBBS QuickBBS-style)
        const dorinfoContent = [
          'AmiExpress Web',                           // BBS name
          'Sysop',                                    // Sysop name
          'Sysop',                                    // Sysop first name
          'User',                                     // Sysop last name
          'COM1',                                     // Comm port
          '115200 BAUD,N,8,1',                       // Baud/parity
          '0',                                        // Network type
          user?.username || 'Guest',                  // User name
          user?.firstName || 'Guest',                 // User first name
          user?.lastName || 'User',                   // User last name
          user?.location || 'Unknown',                // Location
          String(user?.secLevel || 0),                // Security level
          String(user?.minutesRemaining || 60),       // Minutes remaining
          '-1'                                        // Fossil (-1 = no fossil)
        ].join('\r\n');

        await fs.writeFile(path.join(dropPath, 'DORINFO1.DEF'), dorinfoContent, 'utf-8');
      }

      await this.BBSLOG('info', `Drop file created: ${format} for door ${doorName}`);
      return true;
    } catch (error) {
console.error('BBSCREATEDROPFILE error:', error);
      return false;
    }
  }

  /**
   * AmiExpress-Specific AREXX Door Functions
   * These match the original AmiExpress AREXX API used by legacy doors
   */

  /**
   * SendString - Send text to terminal WITHOUT trailing CRLF.
   * AmiExpress AREXX docs (Aedoc4.guide §Cap1102): "exactly the same
   * as the TRANSMIT command with the only difference that it will not
   * send a carriage return after executing the command, so you can
   * store text behind other text." Used by AVAIL.rexx for "Local
   * time: " followed by `tr time` on the same line.
   *
   * Real AmiExpress doors use: SS=SendString shortcut.
   */
  async SendString(text: string): Promise<void> {
    return this.emitToTerminal(text, /*addCrlf=*/false);
  }

  /**
   * SendMessage - Synonym for SendString per Aedoc4.guide §Cap1102:
   * "exactly the same as the TRANSMIT command with the only difference
   * that it will not send a carriage return after executing the
   * command". Many AmiExpress doors alias `send=sendmessage` and use
   * it interchangeably with SS.
   */
  async SendMessage(text: string): Promise<void> {
    return this.emitToTerminal(text, /*addCrlf=*/false);
  }

  /**
   * Transmit - Send formatted text with ANSI codes, terminated with
   * CRLF. The big TR/aesayln workhorse for AREXX doors. Real
   * AmiExpress shortcut: TR=Transmit.
   */
  async Transmit(text: string): Promise<void> {
    return this.emitToTerminal(text, /*addCrlf=*/true);
  }

  /**
   * Internal: route output through whichever sink the dispatcher
   * provided. addCrlf=true mirrors TRANSMIT/aesayln (express.e:6929-
   * 6930); false mirrors SENDMESSAGE/aesay (express.e:6932-6934).
   *
   * Routing rule: pick exactly ONE emit channel and use it. The
   * dispatcher's `outputCallback` (when set) typically already
   * forwards to the socket via emitText; emitting through both the
   * socket directly AND the callback writes every byte twice. The
   * `output` array is a separate sink only used by unit tests so
   * an array buffer always gets a copy.
   *
   * Priority:
   *   1. outputCallback function (dispatcher-provided)
   *   2. output as a function (back-compat for legacy contexts)
   *   3. socket.emit (no callback path provided)
   *   4. (always, in addition) push raw text into output if it's an array
   */
  private async emitToTerminal(text: string, addCrlf: boolean): Promise<void> {
    const out = addCrlf ? text + '\r\n' : text;
    let emittedToSink = false;
    if (typeof this.context.outputCallback === 'function') {
      try { await this.context.outputCallback(out); emittedToSink = true; } catch { /* swallow */ }
    } else if (typeof this.context.output === 'function') {
      try { await this.context.output(out); emittedToSink = true; } catch { /* swallow */ }
    }
    if (!emittedToSink && this.context.socket && typeof this.context.socket.emit === 'function') {
      this.context.socket.emit('ansi-output', out);
    }
    if (Array.isArray(this.context.output)) {
      this.context.output.push(text); // unit-test buffer keeps the raw line
    }
  }

  /**
   * BBSWRITE — TS-side helper used by `BBSWRITE "text"` style scripts
   * (our test fixtures, not real AmiExpress doors). Always emits with
   * CRLF so unit tests and TS-only scripts get line-broken output.
   * Real AmiExpress ports go through Transmit / SendString /
   * SendMessage above.
   */
  async BBSWRITE(text: string): Promise<void> {
    return this.emitToTerminal(text, /*addCrlf=*/true);
  }

  /**
   * PutUser - Write a user-data field. Aedoc4.guide §Cap1102:
   *
   *   PUTUSER <x>   "store the DATA to FUNCTION <x>; you also need
   *                  PUTUSTR together with PUTUSER because PUTUSER
   *                  must know what to store into the FUNCTION <x>".
   *
   * The companion PUTUSTR call below stages the value; PUTUSER then
   * commits it. Pattern from the docs:
   *
   *   PUTUSTR "g"      <- value to store
   *   PUTUSER 136      <- field id (here: command for next iteration)
   *
   * Field ids match the same enum used by GETUSER (xim/types.ts
   * XIMCommand). We persist via the database when the field maps to
   * one we know how to update; unknown fields are no-ops with a
   * sysop-debug breadcrumb so a misbehaving script doesn't silently
   * corrupt user data.
   */
  async PutUser(fieldId: number): Promise<void> {
    const value = this.context._pendingPutUstr ?? '';
    this.context._pendingPutUstr = undefined;
    const user = this.context.user;
    if (!user) return;
    const session: any = this.context.session;

    // Field-id → user / session mutator. Mirror the GETUSER table —
    // anything we can READ via getuser N we should be able to WRITE
    // via putuser N (express.e symmetry). Mutations apply in-memory
    // (the BBS persistence layer flushes on session close); a future
    // pass can wire DB writes for fields we want sticky.
    const numericFields: Record<number, (v: any) => void> = {
      102: (v) => { user.location = String(v); },                       // DT_LOCATION
      103: (v) => { user.phone = String(v); user.phoneNumber = String(v); }, // DT_PHONENUMBER
      105: (v) => { user.secLevel = Number(v) || 0; },                  // DT_SECSTATUS
      109: (v) => { (user as any).messagesPosted = Number(v) || 0; (user as any).posts = Number(v) || 0; },
      110: (v) => { user.uploads = Number(v) || 0; },                   // DT_UPLOADS
      111: (v) => { user.downloads = Number(v) || 0; },                 // DT_DOWNLOADS
      112: (v) => { user.calls = Number(v) || 0; (user as any).timesCalled = Number(v) || 0; },
      114: (v) => { (user as any).timeUsed = Number(v) || 0; (user as any).timeOnline = Number(v) || 0; },
      115: (v) => { user.timeLimit = Number(v) || 0; },                 // DT_TIMELIMIT (seconds)
      117: (v) => { (user as any).bytesUpload = Number(v) || 0; (user as any).uploadBytes = Number(v) || 0; },
      118: (v) => { (user as any).bytesDownload = Number(v) || 0; (user as any).downloadBytes = Number(v) || 0; },
      119: (v) => { (user as any).byteLimit = Number(v) || 0; (user as any).dailyBytesLimit = Number(v) || 0; },
      120: (v) => { (user as any).dailyBytesDld = Number(v) || 0; },
      121: (v) => { user.expert = String(v).toUpperCase() === 'X' || v === '1' || v === 1 ? 'X' : 'N'; },
      122: (v) => { (user as any).linesPerScreen = Number(v) || 80; },
      125: (v) => { if (session) session.timeRemaining = Number(v) || 0; }, // DT_TIMEOUT
      136: (v) => {
        // RETURNCOMMAND — set the next command to execute when the
        // door exits. AmiExpress's `g` exits to logoff via this.
        if (session) session.pendingDoorCommands = [...(session.pendingDoorCommands || []), String(v)];
      },
      146: (v) => { (user as any).confAccess = String(v); },
      527: (v) => { (user as any).language = Number(v) || 0; },
      528: (v) => { (user as any).quickFlag = String(v) === '1' || v === 1 || v === true; },
      530: (v) => { user.ansi = String(v) === '1' || v === 1 || v === true; },
      606: (v) => { user.realname = String(v); user.realName = String(v); },
      637: (v) => { (user as any).internetName = String(v); user.email = String(v); },
      // Sysop chat flag — handled at the BBS level, not user-level.
      142: (v) => {
        try {
          const { chatState } = require('../server/initialization');
          if (chatState) chatState.sysopAvailable = String(v).toUpperCase() === 'ON' || v === 1 || v === true;
        } catch { /* fail-soft */ }
      },
    };
    const handler = numericFields[fieldId];
    if (handler) {
      try { handler(value); } catch { /* don't break the script */ }
      return;
    }
    // Unknown field — log via sysop debug so the operator notices.
    SysopDebugUtil.debug(this.context.socket, this.context.session, 'AREXX',
      `PUTUSER on unsupported field ${fieldId} (value="${String(value).slice(0, 40)}")`,
      { fieldId, valuePreview: String(value).slice(0, 40) },
      DebugSeverity.INFO);
  }

  /**
   * PutUstr - Stage a string value for the next PUTUSER call. Per
   * Aedoc4.guide §Cap1102 PUTUSTR / PUTUSER are paired: PUTUSTR sets
   * the data, PUTUSER picks the destination field. We store on the
   * context object so the pair survives across separate REXX clauses.
   */
  async PutUstr(value: string): Promise<void> {
    this.context._pendingPutUstr = value;
  }

  /**
   * Prompt - Combined Transmit + line input. Aedoc4.guide §Cap1102:
   * "the mix of the TRANSMIT & GETCHAR commands. After displaying the
   * TEXT in the "" it will PROMPT the user to insert something until
   * he pressed return. Then the DATA will go to the normal RESULT
   * routine of AREXX."
   *
   * Implementation: emit the prompt with no CRLF (so the user types
   * on the same line as the prompt), then await line input via the
   * door input handler if available; otherwise return ''.
   */
  async Prompt(promptText: string): Promise<string> {
    await this.emitToTerminal(promptText, /*addCrlf=*/false);
    if (typeof this.context.input === 'function') {
      try {
        const line = await this.context.input(''); // empty extra prompt
        return String(line ?? '');
      } catch {
        return '';
      }
    }
    if (this.context.session && typeof this.context.session.doorInputHandler !== 'undefined') {
      // Fall back to door-input handler pattern (executeARexxDoor wires this).
      return await new Promise<string>((resolve) => {
        const session: any = this.context.session;
        session.doorInputHandler = (data: string) => {
          delete session.doorInputHandler;
          resolve(String(data ?? ''));
        };
      });
    }
    return '';
  }

  /**
   * GetUser - Get user data field by ID (AmiExpress-specific)
   * Usage: GetUser 100 (returns username)
   *        GetUser 105 (returns security level)
   *
   * Field IDs match DT_* constants from XIM protocol:
   * 100=NAME, 101=PASSWORD, 102=LOCATION, 105=SECSTATUS,
   * 110=UPLOADS, 111=DOWNLOADS, 112=TIMESCALLED, etc.
   *
   * Note: Real AmiExpress doors use: GU=GetUser shortcut
   */
  async GetUser(fieldId: number): Promise<string> {
    const user = this.context.user;
    const session: any = this.context.session;

    // Lazy-load BBS-wide deps so unit-test boots without these dirs
    // stay clean. Each access fails soft.
    const safeConfig = (key: string, fallback: string): string => {
      try {
        const { config } = require('../config');
        const v = config.get(key);
        return (v !== undefined && v !== null && v !== '') ? String(v) : fallback;
      } catch {
        return fallback;
      }
    };
    const safeChatFlag = (): 'ON' | 'OFF' => {
      try {
        const { chatState } = require('../server/initialization');
        return chatState?.sysopAvailable ? 'ON' : 'OFF';
      } catch {
        return 'OFF';
      }
    };
    const safeNodeCount = (): number => {
      try {
        const { nodeStatusManager } = require('../nodes/NodeStatusManager');
        const nodes = nodeStatusManager?.getActiveNodes?.() || [];
        return Array.isArray(nodes) ? nodes.length : 0;
      } catch {
        return 1;
      }
    };
    const safeConference = async (confId: number): Promise<any> => {
      try {
        const { db } = require('../database');
        const list = await db.getConferences?.();
        if (!Array.isArray(list)) return null;
        return list.find((c: any) => c?.id === confId) || null;
      } catch {
        return null;
      }
    };

    const pad2 = (n: number): string => String(n).padStart(2, '0');
    const formatTime = (d: Date): string =>
      `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
    const formatDate = (d: Date): string => {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return `${days[d.getDay()]} ${pad2(d.getDate())}-${months[d.getMonth()]}-${d.getFullYear()}`;
    };
    const calcSize = (bytes: number): string => {
      // express.e calcSizeText (MiscFuncs.e:3336-3370) — divide by
      // 1024 until <1024, append lowercase unit.
      const units = ['b', 'kb', 'mb', 'gb', 'tb', 'pb'];
      let val = bytes;
      let i = 0;
      while (val >= 1024 && i < units.length - 1) { val = Math.round(val / 1024); i++; }
      return `${val}${units[i]}`;
    };
    const boolToOnOff = (b: any): string => (b ? 'ON' : 'OFF');

    // ====================================================================
    // BBS-level fields (do NOT require a logged-on user).
    // ====================================================================
    switch (fieldId) {
      case 11:  return safeConfig('bbsName', 'AmiExpress-Web');                       // JH_BBSNAME (express.e:1156, 3486)
      case 12:  return safeConfig('sysopName', 'Sysop');                              // JH_SYSOP   (express.e:1158-style)

      case 123: return String(safeNodeCount());                                        // ACTIVE_NODES — live node count
      case 126: return session?.currentConfName || 'Main';                             // BB_CONFNAME (xim/bbs-info.ts:202)
      case 127: return `BBS:Conf${session?.currentConf ?? session?.conferenceId ?? 1}/`; // BB_CONFLOCAL (bbs-info.ts:206)
      case 128: return 'BBS:';                                                         // BB_LOCAL — BBS root assign
      case 129: return String(session?.currentStat ?? 0);                              // BB_STATUS — env_stat
      case 130: return session?.currentCommand || '';                                  // BB_COMMAND — last typed cmd (bbs-info.ts:255)
      case 131: return session?.commandParams || session?.doorParams || '';            // BB_MAINLINE — full cmd line
      case 134: return safeConfig('bbsName', 'BBSConfig');                             // BB_CONFIG — config name
      case 139:                                                                        // SCREEN_ADDRESS / RAWSCREEN_ADDRESS
      case 141: return String(session?.nodeId ?? 1);                                   //   both return node ID as string
      case 140: return String(session?.taskPri ?? 0);                                  // BB_TASKPRI (bbs-info.ts:267)
      case 142: return safeChatFlag();                                                 // BB_CHATFLAG (express.e:1376, 3751, 6924)
      case 144: return formatTime(new Date());                                         // DT_STAMP_CTIME — current time HH:MM:SS
      case 145: return formatDate(new Date()) + ' ' + formatTime(new Date());          // DT_CURR_TIME — full date+time
      case 147: { // BB_PCONFLOCAL — previous-conf local path (express.e prevConf)
        const prev = session?.previousConf ?? session?.lastConf ?? session?.currentConf ?? 1;
        return `BBS:Conf${prev}/`;
      }
      case 148: return session?.previousConfName || session?.currentConfName || 'Main'; // BB_PCONFNAME
      case 149: return String(session?.nodeId ?? 1);                                   // BB_NODEID
      case 150: return safeConfig('callersLog', `BBS:Node${session?.nodeId ?? 1}/CallersLog`); // BB_CALLERSLOG path
      case 151: return safeConfig('udLog', `BBS:Node${session?.nodeId ?? 1}/UDLog`);   // BB_UDLOG path
      case 152: return safeConfig('expressVersion', 'v5.6');                           // EXPRESS_VERSION (index.ts:1410)
      case 162: return safeChatFlag();                                                 // BB_CHATSET — same as BB_CHATFLAG (write also sets it; here we just read)

      case 510: { // BB_CONFNUM — express.e:3832 — 0-based conference number
        const cur = session?.currentConf ?? session?.conferenceId ?? 1;
        return String(Math.max(0, cur - 1));
      }
      case 511: return '0';                                                            // BB_DROPDTR — read returns 0; write hangs up node
      case 512: return String(session?.taskPtr ?? 0);                                  // BB_GETTASK — Amiga task pointer (NA in web)
      case 513: return '0';                                                            // BB_REMOVEPORT — write-only
      case 514: return String(session?.sopt ?? 0);                                     // BB_SOPT — sysop options bitmask
      case 517: return String(session?.logonType ?? 3);                                // BB_LOGONTYPE (bbs-info.ts:260)
      case 518: return '0';                                                            // BB_SCRLEFT — screen left edge
      case 519: return '0';                                                            // BB_SCRTOP  — screen top edge
      case 520: return String((user as any)?.linesPerScreen ?? 80);                    // BB_SCRWIDTH — terminal width
      case 521: return String((user as any)?.linesPerScreen ?? 24);                    // BB_SCRHEIGHT (height tracking on user struct)
      case 522:                                                                        // BB_PURGELINE — write clears input buffer
      case 523:                                                                        // BB_PURGELINESTART
      case 524: return '';                                                             // BB_PURGELINEEND
      case 525: return session?.nonStopText ? '1' : '0';                               // BB_NONSTOPTEXT (bbs-info.ts handleNonStopText)
      case 526: return String(session?.lineCount ?? 0);                                // BB_LINECOUNT — paginator line counter

      // Node / modem identity (xim/types.ts:188-197). On real Amiga
      // these came from the modem driver; on a web BBS we fake them
      // with sensible static values so doors that branch on baud
      // (e.g. SPEEDCHK gating downloads ≥1000 cps) get a "fast"
      // answer rather than empty string. NODE_BAUD specifically
      // surfaces the user's connection rate; web sessions are
      // effectively unbounded so we report 57600 (matches what
      // BB_SCRWIDTH-style display code uses elsewhere).
      case 503: return safeConfig('serialDevice', 'serial.device');                    // NODE_DEVICE
      case 504: return '0';                                                            // NODE_UNIT
      case 505:                                                                        // NODE_BAUD (online baud, string)
      case 516: return String(session?.connectionBaud ?? (user as any)?.baud ?? 57600); // NODE_BAUDRATE
      case 506: return String(session?.nodeId ?? 1);                                   // NODE_NUMBER
    }

    // ====================================================================
    // User-data fields (require a logged-on user).
    // ====================================================================
    if (!user) return '';

    // Resolve aliased fields once for cleanliness — User type ships
    // both the Amiga-style names and modern aliases (see types.ts:1-95).
    const u = user as any;
    const uploadBytes = u.uploadBytes ?? u.bytesUpload ?? 0;
    const downloadBytes = u.downloadBytes ?? u.bytesDownload ?? 0;
    const dailyByteLimit = u.dailyBytesLimit ?? u.byteLimit ?? 0;
    const dailyBytesDld = u.dailyBytesDld ?? 0;
    const callsToday = u.callsToday ?? u.timesOnToday ?? 0;
    const linesPerScreen = u.linesPerScreen ?? u.lineLength ?? 80;
    const expertOn = u.expert === 'X' || u.expert === true || u.expert === 1;
    const ansiOn = u.ansi === true || u.ansi === 'Y' || u.ansiColor === true;
    const internetName = u.internetName || u.email || '';

    switch (fieldId) {
      // --- Identity / contact -----------------------------------------
      case 100: return user.username || '';                                            // DT_NAME (express.e:5294)
      case 101: return '';                                                             // DT_PASSWORD — never disclosed (express.e:5300)
      case 102: return user.location || '';                                            // DT_LOCATION (express.e:5298)
      case 103: return user.phone || user.phoneNumber || '';                           // DT_PHONENUMBER (express.e:5305)
      case 104: return String(user.slotNumber ?? session?.nodeId ?? 1);                // DT_SLOTNUMBER (express.e:5329)

      // --- Security / access ------------------------------------------
      case 105: return String(user.secLevel || 0);                                     // DT_SECSTATUS (express.e:5325)
      case 106: return String(u.ratioType ?? u.secBoard ?? 0);                         // DT_SECBOARD — ratio type (User.ratioType)
      case 107: return String(u.ratio ?? u.secLibrary ?? 0);                           // DT_SECLIBRARY — ratio (User.ratio)
      case 108: return String(u.secBulletin ?? 0);                                     // DT_SECBULLETIN — computer/security bulletin (UserDatabaseManager)

      // --- Counters ---------------------------------------------------
      case 109: return String(u.messagesPosted ?? u.posts ?? 0);                       // DT_MESSAGESPOSTED (express.e:5321)
      case 110: return String(user.uploads || 0);                                      // DT_UPLOADS (express.e:5369)
      case 111: return String(user.downloads || 0);                                    // DT_DOWNLOADS (express.e:5373)
      case 112: return String(u.timesCalled ?? user.calls ?? 0);                       // DT_TIMESCALLED (express.e:5309)
      case 906: return String(callsToday);                                             // DT_CALLEDTODAY

      // --- Time -------------------------------------------------------
      case 113: return user.lastLogin                                                  // DT_TIMELASTON (express.e:5317 formatLongDateTime)
        ? formatDate(new Date(user.lastLogin)) + ' ' + formatTime(new Date(user.lastLogin))
        : 'Never';
      // Time fields return raw SECONDS. Aedoc4 §Cap1101114-116 says
      // "in seconds"; express.e:3595-3614 returns the raw
      // `loggedOnUser.timeUsed` / `timeLimit` / `timeTotal` fields
      // without dividing. Storage matches: time-tracking.util.ts:145
      // computes `(timeTotal - timeUsed) / 60` to display minutes,
      // so the underlying user fields are seconds.
      //
      // Earlier divide-by-60 logic broke doors that do their own
      // seconds→minutes math. KickBox.Rexx: `timet=timel-timeu;
      // timet=timet/60; if timet<15` — with already-divided minutes
      // the user needed 15 hours instead of 15 minutes to play.
      case 114: return String(user.timeUsed ?? u.timeUsed ?? u.timeOnline ?? 0);        // DT_TIMEUSED — seconds used today
      case 115: return String(user.timeLimit ?? 3600);                                  // DT_TIMELIMIT — seconds total allowed
      case 116: return String(user.timeTotal ?? user.timeLimit ?? 3600);                // DT_TIMETOTAL — seconds total daily allowance
      case 125: return String(Math.floor((session?.timeRemaining ?? 0) / 60));         // DT_TIMEOUT — minutes remaining
      case 143: return user.lastLogin                                                  // DT_STAMP_LASTON
        ? formatDate(new Date(user.lastLogin)) + ' ' + formatTime(new Date(user.lastLogin))
        : '';

      // --- Bytes ------------------------------------------------------
      case 117: return String(uploadBytes);                                            // DT_BYTESUPLOAD (express.e:5353 formatBCD)
      case 118: return String(downloadBytes);                                          // DT_BYTEDOWNLOAD (express.e:5357)
      case 119: return String(dailyByteLimit);                                         // DT_DAILYBYTELIMIT (express.e:5377)
      case 120: return String(dailyBytesDld);                                          // DT_DAILYBYTEDLD
      case 703: return calcSize(uploadBytes);                                          // DT_SIZEUPLOAD — express.e:5361 calcSizeText
      case 704: return calcSize(downloadBytes);                                        // DT_SIZEDOWNLOAD — express.e:5365

      // --- Display preferences ---------------------------------------
      case 121: return expertOn ? '1' : '0';                                           // DT_EXPERT — express.e expert flag (X/N)
      case 122: return String(linesPerScreen);                                         // DT_LINELENGTH (express.e linesPerScreen)
      case 530: return ansiOn ? '1' : '0';                                             // DT_ANSICOLOR — ansi colour mode
      case 541: return ansiOn ? '1' : '0';                                             // DT_ISANSI — same source

      // --- Conference access -----------------------------------------
      case 146: return user.confAccess || '';                                          // DT_CONFACCESS (legacy 11-char) — express.e:5333
      case 900: return user.confAccess || '';                                          // DT_CONFACCESS2 (extended 25-char) — re-uses confAccess

      // --- Per-conference accounting (Conference table) --------------
      case 901: { // DT_CBYTESUPLOAD — bytes uploaded in current conference
        const conf = await safeConference(session?.currentConf ?? 1);
        return String(conf?.bytesUpload ?? 0);
      }
      case 902: { // DT_CBYTESDOWNLOAD — bytes downloaded in current conference
        const conf = await safeConference(session?.currentConf ?? 1);
        return String(conf?.bytesDownload ?? 0);
      }
      case 903: { // DT_CFILESUPLOAD — files uploaded in current conference
        const conf = await safeConference(session?.currentConf ?? 1);
        return String(conf?.uploads ?? 0);
      }
      case 904: { // DT_CFILESDOWNLOAD — files downloaded in current conference
        const conf = await safeConference(session?.currentConf ?? 1);
        return String(conf?.downloads ?? 0);
      }

      // --- Names / extended identity ---------------------------------
      case 606: return user.realname || user.realName || user.username || '';          // DT_REALNAME (express.e:5389)
      case 637: return internetName;                                                   // DT_INTERNETNAME (express.e:5385)

      // --- I/O / runtime preferences ---------------------------------
      case 124: { // DT_DUMP — diagnostic dump; mirror express.e by emitting key user fields one per line
        return [
          `Name: ${user.username || ''}`,
          `Location: ${user.location || ''}`,
          `Sec: ${user.secLevel || 0}`,
          `Calls: ${u.timesCalled ?? user.calls ?? 0}`,
          `LastOn: ${user.lastLogin || ''}`,
        ].join('\n');
      }
      case 133: return user.username || '';                                            // DT_USERLOAD — request to (re)load by name; we return current
      case 527: return String(u.language ?? 0);                                        // DT_LANGUAGE (UserMisc.language)
      case 528: return u.quickFlag ? '1' : '0';                                        // DT_QUICKFLAG — quick mode preference
      case 529: return u.goodFile === true || u.goodFile === 1 ? '1' : '0';            // DT_GOODFILE / DT_GOODFILE_FLAG
      case 543: return String(u.msgCode ?? 0);                                         // DT_MSGCODE — msgbase code (custom)
      case 545: return String(u.fileCode ?? 0);                                        // DT_FILECODE — filebase code (custom)
      case 638: return String(u.translator ?? 0);                                      // DT_TRANSLATOR — character translator id
      case 639: return String(u.hostLanguage ?? u.language ?? 0);                      // DT_HOST_LANGUAGE

      // --- Connection metadata ---------------------------------------
      case 700: return session?.connectionHostname || safeConfig('hostName', '');      // DT_HOSTNAME — telnet/SSH peer hostname
      case 701: return session?.remoteAddress || safeConfig('hostIp', '');             // DT_HOSTIP — peer IP
      case 702: return safeConfig('geographic', safeConfig('bbsLocation', ''));        // DT_GEOGRAPHIC — BBS location string
      case 905: return boolToOnOff(u.confAccount ?? false);                            // BB_CONFACCOUNT — per-conf accounting toggle

      // --- Bit query / mutators -- 1000-1002 are write/query-only ---
      case 1000: return '0';                                                            // DT_ADDBIT
      case 1001: return '0';                                                            // DT_REMBIT
      case 1002: return '0';                                                            // DT_QUERYBIT

      default:
        // Match express.e DEFAULT branch (line 6925): empty string.
        return '';
    }
  }

  /**
   * GETCHAR - Get single character from user input (blocking)
   * Usage: GETCHAR (waits for keypress, returns character)
   * Note: Real AmiExpress doors use: GC=GETCHAR shortcut
   *
   * Returns Result variable with the character pressed
   * Special keys: BSPC="08"x (backspace), CR="0d"x (enter)
   */
  async GETCHAR(): Promise<string> {
    // Use the same session.doorInputHandler mechanism every other door
    // type (68K via DoorMessageHandler, TypeScript via createBBSApi) uses
    // for blocking input. The BBS's central socket handler in
    // server/socket-handlers.ts routes incoming user keystrokes through
    // session.doorInputHandler when set, regardless of door type.
    const session = this.context.session;
    if (!session) return '';
    return new Promise<string>((resolve) => {
      session.doorInputHandler = (data: string) => {
        delete session.doorInputHandler;
        // GETCHAR returns the FIRST character; doors that want a full
        // line use PROMPT/getLine instead. AmiExpress's GetChar
        // semantics return one keystroke, with CR mapping to '\r'.
        const ch = (typeof data === 'string' && data.length > 0)
          ? data[0]
          : '';
        resolve(ch);
      };
    });
  }

  /**
   * Showfile - Display a file from BBS directories
   * Usage: Showfile "doors:MyDoor/header.txt"
   * Note: Real AmiExpress doors use: SF=Showfile shortcut
   *
   * Supports Amiga assigns: doors:, conf:, screens:, etc.
   * Files can contain ANSI codes for formatting
   */
  async Showfile(filename: string): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');

      // Resolve Amiga-style assigns through the same code path as
      // file I/O (open/exists/etc) so behavior is consistent across
      // every AREXX call. Previously Showfile rolled its own resolver
      // that anchored to `cwd/data/bbs/BBS` (a path that doesn't exist
      // in our layout), then a directory-traversal check rejected
      // every Doors:* lookup. KickBox's first line — `Showfile
      // 'doors:Kickboxing/KB.Intro'` — printed "Access denied"
      // instead of the title screen.
      let resolvedPath = filename;
      let bbsRoot = '';
      try {
        const { config } = require('../config');
        bbsRoot = String(config.get('dataDir') || '');
      } catch { /* config unavailable in test contexts */ }
      if (!bbsRoot) bbsRoot = process.env.BBS_DATA_DIR || process.cwd();

      // Use AREXXFileIO's resolver if we have one — same Amiga-assign
      // mapping as open()/exists() (doors: → bbsRoot/Doors/, etc).
      // Fall back to the inline mapping for unit-test contexts that
      // construct BBSFunctions without an interpreter wrapper.
      const fileIO = (this.context.interpreter as any)?.fileIO;
      if (fileIO && typeof fileIO.resolveAmigaPath === 'function') {
        resolvedPath = fileIO.resolveAmigaPath(filename);
      } else if (filename.includes(':')) {
        const [assign, ...pathParts] = filename.split(':');
        const relativePath = pathParts.join(':');
        switch (assign.toLowerCase()) {
          case 'doors':    resolvedPath = path.join(bbsRoot, 'Doors',    relativePath); break;
          case 'conf':
          case 'conf1':    resolvedPath = path.join(bbsRoot, 'Conf1',    relativePath); break;
          case 'screens':  resolvedPath = path.join(bbsRoot, 'Screens',  relativePath); break;
          case 'bulletins':resolvedPath = path.join(bbsRoot, 'Bulletins',relativePath); break;
          case 'utils':    resolvedPath = path.join(bbsRoot, 'Utils',    relativePath); break;
          case 'system':   resolvedPath = path.join(bbsRoot, 'System',   relativePath); break;
          case 'libs':     resolvedPath = path.join(bbsRoot, 'Libs',     relativePath); break;
          case 'bbs':      resolvedPath = path.join(bbsRoot,             relativePath); break;
          default:         resolvedPath = path.join(bbsRoot, assign,     relativePath); break;
        }
      } else if (!path.isAbsolute(filename)) {
        resolvedPath = path.join(bbsRoot, filename);
      }

      // Security: confirm the resolved path is inside the BBS root.
      // realpath fails if the file doesn't exist — that's a "not
      // found" error, not a security issue. Don't print "Access
      // denied" in that case; either silently return (real AmiExpress
      // does this for missing optional screens) or surface the I/O
      // error via BBSWRITE for diagnostics.
      const realPath = await fs.realpath(resolvedPath).catch(() => null);
      if (!realPath) {
        // File doesn't exist or isn't readable. Silent skip mirrors
        // express.e displayScreen() behavior — missing screens just
        // don't display, no error to the user.
        return;
      }
      const realRoot = await fs.realpath(bbsRoot).catch(() => bbsRoot);
      if (!realPath.startsWith(realRoot)) {
        await this.BBSWRITE(`[ERROR] Access denied: ${filename}\r\n`);
        return;
      }

      // Read with latin1 — Amiga screen files are ISO-8859-1 with
      // box-drawing / accented bytes. UTF-8 decode would replace
      // those with � and corrupt the ANSI art.
      const content = await fs.readFile(realPath, 'latin1');
      await this.BBSWRITE(content);

    } catch (error) {
console.error('[Showfile] Error:', error);
      await this.BBSWRITE(`[ERROR] File not found: ${filename}\r\n`);
    }
  }

  /**
   * bufferflush - Flush output buffer to terminal
   * Usage: bufferflush
   *
   * In original AmiExpress, this forces all buffered output to be sent immediately
   * In our implementation, output is already sent immediately via socket
   * This is kept for compatibility with legacy doors
   */
  async bufferflush(): Promise<void> {
    // Real AmiExpress: forces buffered output to flush + clears any
    // pending input. Socket.io flushes synchronously per emit, so the
    // output side is already a no-op for us. Drop any pending input
    // by clearing the doorInputHandler — STNG and other doors call
    // bufferflush() right before redrawing the menu specifically to
    // discard a queued keystroke from the previous selection.
    const session: any = this.context.session;
    if (session && typeof session.doorInputHandler !== 'undefined') {
      delete session.doorInputHandler;
    }
    return Promise.resolve();
  }

  /**
   * shutdown - Gracefully close door and return to BBS
   * Usage: shutdown
   *
   * Signals the BBS that the door is terminating normally
   * Cleans up resources and returns user to main menu
   */
  async shutdown(): Promise<void> {
    try {
      await this.BBSLOG('info', `Door shutdown requested by ${this.context.user?.username || 'unknown'}`);

      // Signal the interpreter to terminate. The session.doorShutdown
      // flag is honored by executeARexxDoor's outer post-script
      // cleanup; setting returnRequested + exitRequested also
      // propagates through any DO/SELECT frames so the REXX exit
      // happens immediately rather than at the next clause boundary.
      if (this.context.session) {
        (this.context.session as any).doorShutdown = true;
      }
      if (this.context.interpreter) {
        const ip = this.context.interpreter as any;
        ip.returnRequested = true;
        ip.exitRequested = true;
      }
    } catch (error) {
console.error('[shutdown] Error:', error);
    }
  }

  /**
   * Address - Set AREXX command port (AmiExpress compatibility)
   * Usage: Address Value "AERexxControl"Node
   *
   * In original AmiExpress, this sets the AREXX command port to AERexxControlN
   * where N is the node number. In our implementation, this is handled automatically
   * via the context, so this is a no-op for compatibility.
   */
  async Address(port: string): Promise<void> {
    // No-op for compatibility
    // Original: Address Value "AERexxControl"Node
    // We handle port addressing automatically via context
    return Promise.resolve();
  }
}

/**
 * AREXX Procedure Definition
 */
interface Procedure {
  name: string;
  params: string[];
  body: string[];
  startLine: number;
  endLine: number;
}

/**
 * AREXX Interpreter
 */
export class AREXXInterpreter {
  private variables: AREXXVariables;
  private bbsFunctions: BBSFunctions;
  private context: any;
  private output: string[] = [];
  private breakRequested: boolean = false;
  private iterateRequested: boolean = false;
  private returnRequested: boolean = false;
  private returnValue: any = undefined;
  private procedures: Map<string, Procedure> = new Map();
  private variableStack: AREXXVariables[] = [];  // Stack for local variable scopes
  private labels: Map<string, number> = new Map();  // Label positions (SIGNAL support)
  private signalRequested: boolean = false;
  private signalLabel: string = '';
  // Active condition traps installed via `SIGNAL ON <condition>`.
  // Key: condition name uppercase (ERROR / SYNTAX / HALT / IOERR /
  // NOTREADY / NOVALUE / FAILURE). Value: target label uppercased.
  private signalTraps: Map<string, string> = new Map();
  private traceEnabled: boolean = false;
  private recursionDepth: number = 0;
  private maxRecursionDepth: number = 100;
  private commandLineArgs: string[] = [];  // ARG support
  // Current ADDRESS host (RKRM "Using ARexx" §4.4). Default per
  // RKRM is the literal string "COMMAND" (the AmigaDOS shell), but
  // AmiExpress AREXX doors immediately switch to "AERexxControl<N>"
  // via `address value nodeid` so scripts that read this variable
  // get the right name.
  private currentAddressHost: string = 'COMMAND';
  private previousAddressHost: string = '';
  // Cached preprocessed lines so CALL <label> can re-enter at the
  // label's index and run the subroutine body. Populated by
  // execute() before executeLines starts.
  private scriptLines: string[] = [];
  // EXIT propagates through CALL frames — RETURN does not. AmiExpress
  // doors exit via `CALL EXIT` which goes to a label whose body is
  // `SHUTDOWN; EXIT`; the EXIT must end the script, not just the
  // CALL OFF / CALL ON subroutine.
  private exitRequested: boolean = false;
  // REXX file I/O state — open handles, current pragma directory.
  // Constructed in the constructor so each script run gets its own
  // sandbox. AREXXFileIO.closeAll() is called on script exit so leaked
  // handles don't pile up across runs.
  private fileIO: AREXXFileIO;
  // Stem default values: when a script writes `a. = "default"`, every
  // subsequent read of an undefined `a.SOMETHING` returns "default"
  // (RKRM §4.1.2). Map key: stem name (uppercase, no trailing dot).
  private stemDefaults: Map<string, string> = new Map();
  // External data queue (PUSH / QUEUE / PULL). PUSH inserts at front
  // (LIFO), QUEUE inserts at back (FIFO). PULL removes from front and
  // assigns; QUEUED() returns the size.
  private dataQueue: string[] = [];
  // ADDLIB() registry — tracks which libraries the script has
  // pretended to load. SHOW('L', name) checks this. Real Amiga
  // would dlopen the .library; we just remember the name.
  private loadedLibraries: Set<string> = new Set();
  // SIGL — the line number at which the most recent SIGNAL fired
  // (RKRM §7). Updated on every condition trap so error handlers
  // can read it. Defaults to 0.
  private siglLine: number = 0;

  /**
   * Resolve a (possibly compound) symbol to its concrete variable
   * name. RKRM §4.1.2 — "compound symbols" are how REXX models
   * arrays / dicts:
   *
   *   a.0  = "count"     — literal "0" stored at A.0
   *   a.i  = "x"         — i is a var; if i=5, stored at A.5
   *   a.b.c              — multi-segment; resolve each tail segment
   *
   * Each tail segment is resolved as: if defined as a variable use
   * its value, else use the segment's uppercase literal text. The
   * stem head is always uppercase. Returns a single uppercase
   * string suitable for variables.set/.get/.has.
   */
  private resolveCompoundName(name: string): string {
    if (!name || !name.includes('.')) return name.toUpperCase();
    const parts = name.split('.');
    const head = parts[0].toUpperCase();
    const tailParts = parts.slice(1).map(seg => {
      if (seg === '') return ''; // stem default form `a.`
      const upper = seg.toUpperCase();
      const v = this.variables.get(upper);
      if (v === undefined) return upper;
      return String(v).toUpperCase();
    });
    return head + '.' + tailParts.join('.');
  }

  /** Stem-aware variable setter. */
  private setVariable(name: string, value: any): void {
    if (name.includes('.')) {
      // Special form: `a. = value` sets the stem default.
      if (name.endsWith('.')) {
        const stem = name.slice(0, -1).toUpperCase();
        this.stemDefaults.set(stem, String(value ?? ''));
        return;
      }
      const resolved = this.resolveCompoundName(name);
      this.variables.set(resolved, value);
      return;
    }
    this.variables.set(name, value);
  }

  /** Stem-aware variable getter. Returns undefined for unknown symbols
   * (caller falls back to UPPERCASE-symbol convention). */
  private getVariable(name: string): any {
    if (name.includes('.')) {
      const resolved = this.resolveCompoundName(name);
      const v = this.variables.get(resolved);
      if (v !== undefined) return v;
      // Stem default fallback.
      const stem = resolved.split('.')[0];
      const def = this.stemDefaults.get(stem);
      if (def !== undefined) return def;
      return undefined;
    }
    return this.variables.get(name);
  }

  /** Stem-aware existence check. */
  private hasVariable(name: string): boolean {
    if (name.includes('.')) {
      const resolved = this.resolveCompoundName(name);
      if (this.variables.has(resolved)) return true;
      const stem = resolved.split('.')[0];
      return this.stemDefaults.has(stem);
    }
    return this.variables.has(name);
  }

  constructor(context: any, args: string[] = []) {
    this.context = context;
    // Self-reference so BBSFunctions.shutdown() can flag exit on the
    // running interpreter (sets returnRequested/exitRequested to
    // unwind through nested DO/SELECT frames immediately rather than
    // waiting for the next clause boundary).
    this.context.interpreter = this;
    this.variables = new AREXXVariables();
    this.bbsFunctions = new BBSFunctions(context);
    this.commandLineArgs = args;
    // File I/O context — bbsRoot resolves Amiga assigns (BBS:/DOORS:
    // etc) to host paths. Default: dataDir from config (the BBS root)
    // — same place door dispatcher resolves door scripts.
    let bbsRoot = process.env.BBS_DATA_DIR || process.cwd();
    try {
      const { config } = require('../config');
      bbsRoot = String(config.get('dataDir')) || bbsRoot;
    } catch { /* fall back to env / cwd */ }
    this.fileIO = new AREXXFileIO(bbsRoot);

    // Set initial variables from context
    if (context.user) {
      this.variables.set('USERNAME', context.user.username);
      this.variables.set('USERLEVEL', context.user.secLevel);
      this.variables.set('USERID', context.user.id);
    }
    if (context.session) {
      this.variables.set('CONFERENCE', context.session.currentConf);
      this.variables.set('MSGBASE', context.session.currentMsgBase);
    }
    this.variables.set('BBSNAME', 'AmiExpress Web');
    this.variables.set('VERSION', '1.0');

    // Set command-line arguments (ARG support - Phase 4)
    for (let i = 0; i < args.length; i++) {
      this.variables.set(`ARG${i + 1}`, args[i]);
    }
    this.variables.set('ARGCOUNT', args.length);
  }

  /**
   * Execute AREXX script
   */
  async execute(script: string): Promise<{ success: boolean, output: string[], error?: string }> {
    this.output = [];
    this.breakRequested = false;
    this.iterateRequested = false;
    this.returnRequested = false;
    this.returnValue = undefined;
    this.signalRequested = false;
    this.signalLabel = '';
    this.labels.clear();
    this.recursionDepth = 0;

    try {
      const lines = this.preprocessScript(script);
      this.scriptLines = lines; // expose for CALL <label> re-entry

      // Build label map (Phase 4 - SIGNAL support)
      this.buildLabelMap(lines);

      await this.executeLines(lines);

      // Flush + release any open file handles. AREXX scripts that
      // open() but never close() (rare but happens — see crashes /
      // SIGNAL exits) would otherwise leak buffered writes.
      try { this.fileIO.closeAll(); } catch { /* best-effort */ }

      return { success: true, output: this.output };
    } catch (error) {
      try { this.fileIO.closeAll(); } catch { /* best-effort */ }
      SysopDebugUtil.debug(
        this.context.socket || null,
        this.context.session || null,
        'AREXX Script',
        `AREXX script execution failed`,
        {
          error: error instanceof Error ? error.message : String(error),
          output: this.output.slice(-5), // Last 5 lines of output for context
          scriptLength: script.length
        },
        DebugSeverity.CRITICAL
      );
      return {
        success: false,
        output: this.output,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Build label map for SIGNAL support (Phase 4)
   */
  private buildLabelMap(lines: string[]): void {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // Label format: LabelName:
      if (line.endsWith(':') && !line.includes(' ')) {
        const label = line.substring(0, line.length - 1).toUpperCase();
        this.labels.set(label, i);
        if (this.traceEnabled) {
console.log(`Label registered: ${label} at line ${i}`);
        }
      }
    }
  }

  /**
   * Preprocess script into lines
   */
  private preprocessScript(script: string): string[] {
    // Step 0: strip REXX block comments `/* ... */` from the entire
    // script before any line splitting. The previous filter dropped
    // any line that *started* with `/*` — fine for hand-written
    // multi-line comments, but RexxOpt-style "optimized" builds pack
    // the whole script onto a single line that begins with a comment
    // followed by `*/;real code...`. SOMEINFO.rexx exhibited this:
    // line 2 was the entire 3KB script preceded by the file's
    // header comment, all dropped, leaving an empty script. Strip
    // block comments globally instead so anything OUTSIDE `/* */`
    // pairs survives. Respect REXX string literals so a `*/` inside
    // a `'` or `"` quoted constant doesn't end the comment.
    const stripped = stripRexxBlockComments(script);

    // Step 1: physical-line split + line-comment strip.
    //
    // `//` in REXX is the integer-divide operator (`a // b` →
    // a div b). Stripping any line content from `//` onwards
    // therefore corrupts both:
    //   1. real REXX integer-divide expressions
    //   2. string literals that happen to contain `//` —
    //      e.g. STNG.Rexx ASCII-art lines like:
    //        TR '[33m  \___ \ /__ __/_ \/_/_ /  //_/___/ /__  '
    //      whose `  //_/___/ /__  '` was being chopped, leaving
    //      an unbalanced `'` that swallowed every following
    //      clause.
    //
    // Some AmiExpress door authors do use `//` as a non-standard
    // line comment (we have a unit test for it). Compromise:
    // strip only when the `//` appears OUTSIDE quoted strings AND
    // is preceded by whitespace (so it looks like a comment marker
    // appended to a clause, not an in-expression operator). Walk
    // char-by-char so we can track quote state.
    const physical = stripped
      .split('\n')
      .map(line => {
        let inSingle = false, inDouble = false;
        for (let i = 0; i < line.length - 1; i++) {
          const c = line[i];
          if (!inDouble && c === "'") inSingle = !inSingle;
          else if (!inSingle && c === '"') inDouble = !inDouble;
          if (!inSingle && !inDouble && c === '/' && line[i + 1] === '/') {
            // Treat as line comment only if a whitespace char
            // precedes (or it's at the very start). Otherwise
            // assume it's REXX `//` integer divide and leave it.
            const prev = i > 0 ? line[i - 1] : '';
            if (i === 0 || prev === ' ' || prev === '\t') {
              line = line.substring(0, i);
              break;
            }
          }
        }
        return line.trim();
      })
      .filter(line => line.length > 0);

    // Step 2: REXX semicolon-as-statement-separator. Real AmiExpress
    // AREXX doors pack many statements onto a single physical line,
    // separated by `;` (e.g. `tr=transmit;ss=sendstring;gu=getuser`
    // from AVAIL.rexx). RKRM "Using ARexx" §3.1 — newline OR `;`
    // both end a clause. We must respect strings and (...) groupings
    // so a `;` inside a quoted constant doesn't split the line.
    const out: string[] = [];
    for (const line of physical) {
      const parts = splitRexxStatements(line);
      for (const p of parts) {
        const t = p.trim();
        if (t) out.push(t);
      }
    }
    return out;
  }

  /**
   * Execute array of lines
   */
  private async executeLines(lines: string[], startIndex: number = 0, endIndex?: number): Promise<number> {
    const end = endIndex ?? lines.length;
    let i = startIndex;

    // Loop is `while (true)` — not `while (i < end)` — so SIGNAL set on
    // the LAST executed line still triggers a jump even when i would
    // otherwise have walked past `end`. STNG's BEGIN: ... select ...
    // signal BEGIN pattern fires at script's last line; the old loop
    // exited before processing the signal, so the menu redraw never
    // happened and the user saw the whole script run linearly once.
    while (true) {
      // Handle SIGNAL jump (Phase 4 + condition-trap fallback).
      // RKRM §7: an unmatched SIGNAL target (whether explicit goto
      // or a condition trap whose label doesn't exist in the
      // script) is itself a SYNTAX condition; we mirror express.e's
      // permissive behaviour by ending the script cleanly with
      // RC=1 instead of throwing — many AmiExpress doors set
      // `signal on error` then never define an `ERROR:` label,
      // relying on the runtime to just exit.
      if (this.signalRequested) {
        const targetLine = this.labels.get(this.signalLabel.toUpperCase());
        if (targetLine !== undefined) {
          // Only consume the signal here if the target is within
          // OUR line range. When a recursive frame (WHEN body, IF
          // body, DO body) sees a signal whose label is OUTSIDE
          // its slice, we MUST let the flag propagate up so the
          // outer executeLines can jump there. Without this guard
          // STNG.Rexx's option-3 fired `signal CRSTNG` inside the
          // SELECT WHEN body; the inner executeLines cleared the
          // flag while jumping to CRSTNG (which sat past its
          // endIndex), the outer loop then ran the post-SELECT
          // `signal BEGIN` statement and overwrote the goto target.
          if (targetLine >= startIndex && targetLine < end) {
            i = targetLine + 1; // Jump to line after label
            this.signalRequested = false;
            this.signalLabel = '';
            continue;
          }
          // Target is outside this slice — break out, leave flag
          // set so the parent frame can do the jump.
          break;
        }
        // No label — clear the request and exit cleanly.
        this.signalRequested = false;
        this.signalLabel = '';
        this.variables.set('RC', '1');
        this.returnRequested = true;
        break;
      }

      if (i >= end) break;

      if (this.breakRequested || this.iterateRequested || this.returnRequested) {
        break;
      }

      const line = lines[i];

      // Skip labels (they're just markers)
      if (line.endsWith(':') && !line.includes(' ')) {
        i++;
        continue;
      }

      // Skip comments
      if (line.startsWith('/*') || line.startsWith('//')) {
        i++;
        continue;
      }

      // Trace mode (Phase 4)
      if (this.traceEnabled) {
console.log(`[TRACE] Line ${i}: ${line}`);
      }

      // Optional diagnostic so a sysop debugging an AREXX door can
      // see in backend.log which clauses actually executed without
      // having to enable full TRACE mode (which is also noisy with
      // labels / DO-loop expansion). Gated on AREXX_TRACE=1 — same
      // env var the native engine uses, so one toggle covers both.
      if (process.env.AREXX_TRACE === '1') {
        try {
          process.stderr.write(`[arexx-clause] ${line}\n`);
        } catch { /* never throw out of the executor */ }
      }

      // Handle multi-line constructs
      if (line.toUpperCase().startsWith('DO ') || line.toUpperCase() === 'DO') {
        i = await this.executeDo(lines, i);
        continue;
      }

      if (line.toUpperCase() === 'SELECT' || line.toUpperCase().startsWith('SELECT ')) {
        i = await this.executeSelect(lines, i);
        continue;
      }

      if (line.toUpperCase().startsWith('PROCEDURE ')) {
        i = await this.defineProcedure(lines, i);
        continue;
      }

      // IF ... THEN DO ... END — handled HERE so we can skip / run a
      // multi-line block based on the condition. executeIf only handles
      // the inline form (`IF X THEN single_statement`); when the THEN
      // action is `DO`, the body extends to the matching END and the
      // loop must skip it on a false condition. STNG.Rexx hit this:
      // `if ~exists('STNGdat') then do ... signal BEGIN ... end` —
      // the IF condition was false, but executeIf returned without
      // touching `i`, so the next iteration unconditionally ran the
      // body's signal BEGIN, sending option 3 back to the menu.
      if (line.toUpperCase().startsWith('IF ')) {
        const ifMatch = line.match(/^IF\s+(.+?)\s+THEN\s+(.+)$/i);
        if (ifMatch) {
          const [, cond, action] = ifMatch;
          const condTrue = await this.evaluateCondition(cond.trim());
          const actionUpper = action.trim().toUpperCase();
          if (actionUpper === 'DO' || actionUpper.startsWith('DO ')) {
            // Multi-line: find matching END.
            let depth = 1;
            let scan = i + 1;
            while (scan < end && depth > 0) {
              const u = lines[scan].toUpperCase().trim();
              if (u === 'DO' || u.startsWith('DO ')) depth++;
              else if (u.startsWith('SELECT')) depth++;
              else if (u.endsWith(' THEN DO') || u.endsWith(' THEN DO;')) depth++;
              else if (u === 'END' || u.startsWith('END ')) depth--;
              if (depth === 0) break;
              scan++;
            }
            if (scan < end) {
              if (condTrue) {
                await this.executeLines(lines, i + 1, scan);
              }
              i = scan + 1; // skip past END
              // After the IF/ELSE block, peek for an ELSE clause.
              if (i < end) {
                const peek = lines[i].toUpperCase().trim();
                if (peek === 'ELSE' || peek.startsWith('ELSE ')) {
                  // ELSE inline action OR ELSE DO ... END
                  const elseLine = lines[i].substring(lines[i].toUpperCase().indexOf('ELSE') + 4).trim();
                  if (elseLine.toUpperCase() === 'DO' || elseLine.toUpperCase().startsWith('DO ')) {
                    let edepth = 1;
                    let escan = i + 1;
                    while (escan < end && edepth > 0) {
                      const eu = lines[escan].toUpperCase().trim();
                      if (eu === 'DO' || eu.startsWith('DO ')) edepth++;
                      else if (eu.startsWith('SELECT')) edepth++;
                      else if (eu.endsWith(' THEN DO') || eu.endsWith(' THEN DO;')) edepth++;
                      else if (eu === 'END' || eu.startsWith('END ')) edepth--;
                      if (edepth === 0) break;
                      escan++;
                    }
                    if (escan < end) {
                      if (!condTrue) {
                        await this.executeLines(lines, i + 1, escan);
                      }
                      i = escan + 1;
                    } else {
                      i++;
                    }
                  } else if (elseLine) {
                    // Inline ELSE statement
                    if (!condTrue) await this.executeLine(elseLine);
                    i++;
                  } else {
                    i++;
                  }
                }
              }
              continue;
            }
          } else {
            // Inline THEN — single statement. Run it (or skip).
            if (condTrue) await this.executeLine(action.trim());
            i++;
            // Peek for ELSE.
            if (i < end) {
              const peek = lines[i].toUpperCase().trim();
              if (peek === 'ELSE' || peek.startsWith('ELSE ')) {
                const elseLine = lines[i].substring(lines[i].toUpperCase().indexOf('ELSE') + 4).trim();
                if (elseLine && !condTrue) await this.executeLine(elseLine);
                i++;
              }
            }
            continue;
          }
        }
      }

      // Single-line commands
      await this.executeLine(line);
      i++;
    }

    return i;
  }

  /**
   * Execute single AREXX line
   */
  private async executeLine(line: string): Promise<void> {
    // BREAK command
    if (line.toUpperCase() === 'BREAK' || line.toUpperCase() === 'LEAVE') {
      this.breakRequested = true;
      return;
    }

    // ITERATE command
    if (line.toUpperCase() === 'ITERATE' || line.toUpperCase() === 'CONTINUE') {
      this.iterateRequested = true;
      return;
    }

    // RETURN command
    if (line.toUpperCase() === 'RETURN' || line.toUpperCase().startsWith('RETURN ')) {
      this.returnRequested = true;
      const value = line.substring(6).trim();
      if (value) {
        this.returnValue = await this.evaluateExpression(value);
      }
      return;
    }

    // EXIT command (RKRM §6.2) — terminate the script. Optional
    // return-value expression is evaluated and stored as returnValue
    // for the dispatcher. Behaves like RETURN at the top-level scope
    // but propagates through any subroutine frames so a nested
    // `CALL EXIT` actually exits the script (not just the
    // subroutine), which is what AmiExpress doors expect.
    if (line.toUpperCase() === 'EXIT' || line.toUpperCase().startsWith('EXIT ')) {
      this.returnRequested = true;
      this.exitRequested = true;
      const value = line.substring(4).trim();
      if (value) {
        try { this.returnValue = await this.evaluateExpression(value); }
        catch { this.returnValue = value; }
      }
      return;
    }

    // SIGNAL command (RKRM "Using ARexx" §7.1).
    //
    //   SIGNAL labelname                    — goto label
    //   SIGNAL VALUE expr                   — goto label-from-expr
    //   SIGNAL ON <cond> [NAME labelname]   — install condition trap
    //   SIGNAL OFF <cond>                   — disable condition trap
    //
    // Conditions: ERROR, SYNTAX, HALT, IOERR, NOTREADY, NOVALUE,
    // FAILURE. When a condition fires later, the trap's label is
    // jumped to (default label = condition name uppercased).
    //
    // AmiExpress doors invoke `signal on error;signal on syntax;
    // signal on ioerr` early. The previous handler treated this as
    // a goto whose label was "on error" — `SIGNAL label not found`.
    // Now we recognise the trap form and install handlers; if the
    // condition later fires and there's no matching label, we fall
    // back to a clean script exit (mirrors express.e behaviour
    // where unhandled traps return RC=1 instead of crashing).
    if (line.toUpperCase().startsWith('SIGNAL ')) {
      const rest = line.substring('SIGNAL '.length).trim();
      const upper = rest.toUpperCase();
      // ON / OFF condition trap forms
      const onMatch = upper.match(/^(ON|OFF)\s+(ERROR|SYNTAX|HALT|IOERR|NOTREADY|NOVALUE|FAILURE)(?:\s+NAME\s+(\S+))?$/);
      if (onMatch) {
        const enable = onMatch[1] === 'ON';
        const cond = onMatch[2];
        const label = onMatch[3] || cond; // default label = condition name
        if (enable) {
          this.signalTraps.set(cond, label.toUpperCase());
        } else {
          this.signalTraps.delete(cond);
        }
        return;
      }
      // VALUE expr — evaluate then goto
      if (upper.startsWith('VALUE ')) {
        const expr = rest.substring('VALUE '.length).trim();
        const v = String(await this.evaluateExpression(expr));
        this.signalRequested = true;
        this.signalLabel = v;
        return;
      }
      // Bare goto
      this.signalRequested = true;
      this.signalLabel = rest;
      return;
    }

    // ARG command (Phase 4)
    if (line.toUpperCase().startsWith('ARG ')) {
      await this.executeArg(line);
      return;
    }

    // INTERPRET command (Phase 4)
    if (line.toUpperCase().startsWith('INTERPRET ')) {
      await this.executeInterpret(line);
      return;
    }

    // OPTIONS command (Phase 4)
    if (line.toUpperCase().startsWith('OPTIONS ')) {
      await this.executeOptions(line);
      return;
    }

    // TRACE command (Phase 4)
    if (line.toUpperCase().startsWith('TRACE ')) {
      await this.executeTrace(line);
      return;
    }

    // PARSE command
    if (line.toUpperCase().startsWith('PARSE ')) {
      await this.executeParse(line);
      return;
    }

    // ADDRESS keyword — statement form (RKRM "Using ARexx" §4.4):
    //   ADDRESS                       → toggle to previous host
    //   ADDRESS env                   → set env-name as static host
    //   ADDRESS VALUE expr            → set host = value-of(expr)
    //   ADDRESS env "command"         → send literal command to host
    //
    // AmiExpress AREXX doors uniformly start with `address value
    // "AERexxControl"NODE` to bind to their per-node control port.
    // Without this branch the line falls into the host-command
    // fallback, which silently drops it — defeating any subsequent
    // dispatch the script expects to land on AERexxControl.
    if (line.toUpperCase().startsWith('ADDRESS ') || line.toUpperCase() === 'ADDRESS') {
      await this.executeAddress(line);
      return;
    }

    // SAY command
    if (line.toUpperCase().startsWith('SAY ')) {
      const text = await this.evaluateExpression(line.substring(4));
      this.output.push(String(text));
      await this.bbsFunctions.BBSWRITE(String(text));
      return;
    }

    // CALL command — RKRM "Using ARexx" §6.5. Two forms:
    //   CALL labelname [arg, arg, ...]  → invoke a script subroutine
    //                                     (RETURN comes back here)
    //   CALL functionname [args]        → invoke a built-in / host
    //                                     function (no return-stack
    //                                     unwind, treated as a void
    //                                     call; returns RESULT/RC)
    //
    // AmiExpress doors heavily use the label form (CALL OFF, CALL ON,
    // CALL EXIT — see AVAIL.rexx). We previously only routed to
    // callFunction, which threw "Unknown function: ON".
    if (line.toUpperCase().startsWith('CALL ')) {
      const callRest = line.substring(5).trim();
      // Two CALL syntaxes both appear in real AmiExpress doors:
      //   1. CALL labelName arg1 arg2     — label invocation, space-sep args
      //   2. CALL func(arg1, arg2)        — function-call form, the same
      //                                     way the door would write `func(...)`
      //                                     standalone. KickBox.Rexx uses
      //                                     this for every file-IO call:
      //                                     `call open(file,'path','W')`.
      // Without `(` the first token is the target and the rest are
      // space-separated args (form #1). With `(...)` we strip the
      // parens and split the args expression on top-level commas
      // (form #2) so each argument can be evaluated as a REXX
      // expression — string literals, variable concatenations, the
      // works.
      let target: string;
      let upperTarget: string;
      let args: string[];
      const parenIdx = callRest.indexOf('(');
      if (parenIdx > 0 && callRest.endsWith(')')) {
        target = callRest.substring(0, parenIdx).trim();
        upperTarget = target.toUpperCase();
        const argText = callRest.substring(parenIdx + 1, callRest.length - 1);
        // Top-level comma split — respects quotes and nested parens
        // so `'a,b'` and `f(x,y)` aren't broken apart.
        const splitArgs: string[] = [];
        let depth = 0, start = 0, inSingle = false, inDouble = false;
        for (let k = 0; k < argText.length; k++) {
          const ch = argText[k];
          if (!inDouble && ch === "'") inSingle = !inSingle;
          else if (!inSingle && ch === '"') inDouble = !inDouble;
          else if (!inSingle && !inDouble) {
            if (ch === '(') depth++;
            else if (ch === ')') depth--;
            else if (ch === ',' && depth === 0) {
              splitArgs.push(argText.substring(start, k).trim());
              start = k + 1;
            }
          }
        }
        if (start < argText.length) splitArgs.push(argText.substring(start).trim());
        // Evaluate each arg expression so callee receives values, not text.
        const evalArgs: any[] = [];
        for (const a of splitArgs) {
          if (a === '') { evalArgs.push(''); continue; }
          try { evalArgs.push(await this.evaluateExpression(a)); }
          catch { evalArgs.push(a); }
        }
        args = evalArgs as any;
      } else {
        const parts = callRest.split(/\s+/);
        target = parts[0];
        upperTarget = target.toUpperCase();
        args = parts.slice(1);
      }
      // Prefer label-as-subroutine: jump to it, run until RETURN /
      // EXIT, restore caller's position. The runtime's signal-jump
      // path already handles resuming after the label, so we drive
      // the lookup ourselves and recurse into executeLines for the
      // subroutine body.
      const labelLine = this.labels.get(upperTarget);
      if (labelLine !== undefined) {
        // Fresh subroutine frame: snapshot caller's RETURN state so
        // the subroutine's RETURN doesn't leak into the caller.
        const savedReturn = this.returnRequested;
        const savedReturnValue = this.returnValue;
        this.returnRequested = false;
        this.returnValue = undefined;
        try {
          await this.executeLines(this.scriptLines, labelLine + 1, this.scriptLines.length);
        } finally {
          // After the subroutine returns or exits, the caller
          // continues from the next line. RETURN sets returnValue
          // → expose via REXX's automatic RESULT variable.
          if (this.returnValue !== undefined) {
            this.variables.set('RESULT', String(this.returnValue));
            this.variables.set('result', String(this.returnValue));
          }
          // EXIT propagates through CALL frames; RETURN does not.
          // If the subroutine fired EXIT, leave the request set so
          // executeLines's outer loop notices and ends the script.
          if (!this.exitRequested) {
            this.returnRequested = savedReturn;
            this.returnValue = savedReturnValue;
          }
        }
        return;
      }
      // Not a label — try function lookup (built-in / BBS / user).
      await this.callFunction(upperTarget, args);
      return;
    }

    // IF statement — checked BEFORE assignment so `IF i = 3 THEN ...` doesn't
    // get misclassified as an assignment of variable "IF i" (the line
    // contains `=`).
    if (line.toUpperCase().startsWith('IF ')) {
      await this.executeIf(line);
      return;
    }

    // Assignment: VAR = value. MUST come after keyword checks (SAY, CALL, IF
    // etc.) — otherwise lines like `IF i = 3 THEN SAY 'x'` get parsed as
    // assignment of "IF i" (since the line contains `=`). REXX assignment
    // syntax: a single bare symbol followed by `=`. We restrict the LHS to
    // a simple identifier to avoid sucking up control-flow statements.
    if (line.includes('=') && !line.includes('==') && !line.includes('>=') && !line.includes('<=')) {
      const eqIdx = line.indexOf('=');
      const lhs = line.slice(0, eqIdx).trim();
      // Only treat as assignment if LHS is a bare identifier (no spaces, no
      // operators). Reserved-keyword check guards against IF/DO/WHILE/etc.
      const RESERVED = new Set(['IF', 'DO', 'WHILE', 'UNTIL', 'TO', 'BY', 'SELECT', 'WHEN', 'OTHERWISE', 'THEN', 'ELSE', 'END', 'FOREVER', 'PROCEDURE', 'CALL', 'SAY', 'RETURN', 'EXIT', 'BREAK', 'LEAVE', 'ITERATE', 'CONTINUE', 'PARSE', 'ARG', 'SIGNAL', 'NUMERIC', 'TRACE', 'ADDRESS']);
      // Allow `.` in the LHS so REXX compound symbols (a.b, x.0,
      // quest.i, hiuser.i) parse as assignments. setVariable resolves
      // each tail segment via the variables pool. Trailing `.` is
      // also valid — `a. = "default"` sets the stem default.
      if (/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_0-9]*)*\.?$/.test(lhs) && !RESERVED.has(lhs.toUpperCase())) {
        const value = line.slice(eqIdx + 1).trim();
        const evaluated = await this.evaluateExpression(value);
        this.setVariable(lhs, evaluated);
        return;
      }
    }

    // Function call (standalone). Only fire when the line's first
    // identifier is IMMEDIATELY followed by `(` — `name(args)` shape.
    // `name SPACE something(x)` is a host-command call whose argument
    // expression contains a function call, not a bare function-call
    // statement. The previous "any line with parens" check
    // misclassified `transmit ... substr(ans.i.index,2)` as a bare
    // function call and swallowed it via evaluateExpression — STNG's
    // option-3 answer-display `transmit MAG"[..."substr(...)` hit this
    // path and the answer text never reached the terminal.
    if (/^[A-Za-z_][A-Za-z0-9_]*\(/.test(line)) {
      await this.evaluateExpression(line);
      return;
    }

    // ADDRESS COMMAND fallback — RKRM "Using ARexx" §4.2: any clause
    // that isn't a keyword, assignment, or function call is dispatched
    // to the current address as a host command. The default address
    // for AmiExpress AREXX doors is "AERexxControl<N>", which handles
    // tr/ss/gu/transmit/sendstring/getuser/shutdown/etc. We map the
    // known shortcuts (TR, SS, GU, HK, PM, SF, SEND) to their full
    // host-command names so AVAIL.rexx-style scripts work without
    // each author having to expand them. Result of the call lands in
    // the REXX automatic variable RESULT (express.e:6920-6926 →
    // rxReplyMsg).
    const tokens = line.split(/\s+/);
    const first = (tokens[0] || '').toUpperCase();
    // Host commands per Aedoc4.guide §Cap1102 (the AmiExpress AREXX
    // module specification). Shortcuts (TR, SS, GU, etc.) match what
    // shipped doors actually type; full names match the docs.
    const HOST_CMD_ALIASES: Record<string, string> = {
      // Output
      TR:          'TRANSMIT',     TRANSMIT:    'TRANSMIT',     // text + CRLF
      SS:          'SENDSTRING',   SENDSTRING:  'SENDSTRING',   // text, no CRLF
      SEND:        'SENDMESSAGE',  SENDMESSAGE: 'SENDMESSAGE',  // synonym for SS
      // User-data read/write
      GU:          'GETUSER',      GETUSER:     'GETUSER',
      PU:          'PUTUSER',      PUTUSER:     'PUTUSER',
      PUS:         'PUTUSTR',      PUTUSTR:     'PUTUSTR',
      // Input
      HK:          'GETCHAR',      GETCHAR:     'GETCHAR',
      PM:          'PROMPT',       PROMPT:      'PROMPT',       // line input + display
      // QUERY is a REXX-dialect convenience some AmiExpress doors
      // (STNG, others) use as `query "prompt"; ans = result`.
      // Aedoc4 doesn't list it as a host command, but RexxMaster
      // forwards the prompt+read flow same as PROMPT — alias here.
      QUERY:       'PROMPT',
      // Misc
      SF:          'SHOWFILE',     SHOWFILE:    'SHOWFILE',
      BUFFERFLUSH: 'BUFFERFLUSH',
      SHUTDOWN:    'SHUTDOWN',
    };
    const resolved = HOST_CMD_ALIASES[first];
    if (resolved) {
      const argText = line.substring(tokens[0].length).trim();
      // Evaluate the rest of the line as the command argument (vars,
      // string literals, concatenations all supported via the
      // existing expression evaluator). Bare empty arg → ''.
      let argValue: any = '';
      if (argText) {
        try {
          argValue = await this.evaluateExpression(argText);
        } catch {
          // If evaluation fails (e.g. a numeric arg like `gu 142`
          // where 142 isn't a defined symbol), fall back to the raw
          // token so numeric host-command arguments still reach the
          // handler. evaluateExpression already handles bare ints,
          // but defending here makes the fallback robust to weird
          // token shapes.
          argValue = argText;
        }
      }
      const callResult = await this.callFunction(resolved, [String(argValue ?? '')]);
      // Real REXX stores the host command's return string in RESULT
      // (and a numeric return code in RC). Most AmiExpress AREXX
      // doors read `result` after `gu N` to fetch the value — set
      // both case-folded forms so the ad-hoc lookups in scripts
      // hit something.
      if (callResult !== undefined && callResult !== null) {
        const s = String(callResult);
        this.variables.set('RESULT', s);
        this.variables.set('result', s);
      }
      this.variables.set('RC', '0');
      return;
    }

    // No fallback matched — silently drop. Strict REXX would raise
    // ERROR but we follow express.e's permissive behaviour where
    // unhandled host commands return non-zero RC without aborting.
    this.variables.set('RC', '1');
  }

  /**
   * Execute ARG command (Phase 4)
   * ARG var1, var2, var3, ...
   */
  private async executeArg(line: string): Promise<void> {
    const argLine = line.substring(4).trim(); // Remove "ARG "
    const vars = argLine.split(',').map(v => v.trim());

    for (let i = 0; i < vars.length; i++) {
      if (i < this.commandLineArgs.length) {
        this.variables.set(vars[i], this.commandLineArgs[i]);
      } else {
        this.variables.set(vars[i], '');
      }
    }
  }

  /**
   * Execute INTERPRET command (Phase 4)
   * INTERPRET expression
   */
  private async executeInterpret(line: string): Promise<void> {
    const expr = line.substring(10).trim(); // Remove "INTERPRET "
    const code = String(await this.evaluateExpression(expr));

    // Execute the dynamically generated code
    await this.executeLine(code);
  }

  /**
   * Execute OPTIONS command (Phase 4)
   * OPTIONS option1 option2 ...
   */
  private async executeOptions(line: string): Promise<void> {
    const options = line.substring(8).trim().toUpperCase(); // Remove "OPTIONS "

    // Parse options (space-separated)
    const optionList = options.split(/\s+/);

    for (const option of optionList) {
      switch (option) {
        case 'TRACE':
          this.traceEnabled = true;
          break;
        case 'NOTRACE':
          this.traceEnabled = false;
          break;
        case 'RESULTS':
          // Enable function result display
          break;
        case 'NORESULTS':
          // Disable function result display
          break;
        default:
          if (this.traceEnabled) {
console.log(`[OPTIONS] Unknown option: ${option}`);
          }
      }
    }
  }

  /**
   * Execute TRACE command (Phase 4)
   * TRACE [ON|OFF|option]
   */
  private async executeTrace(line: string): Promise<void> {
    const traceArg = line.substring(6).trim().toUpperCase(); // Remove "TRACE "

    switch (traceArg) {
      case 'ON':
      case 'ALL':
      case 'RESULTS':
        this.traceEnabled = true;
console.log('[TRACE] Tracing enabled');
        break;
      case 'OFF':
      case 'O':
        this.traceEnabled = false;
console.log('[TRACE] Tracing disabled');
        break;
      default:
        this.traceEnabled = true;
console.log(`[TRACE] Trace mode: ${traceArg}`);
    }
  }

  /**
   * Execute IF statement
   */
  private async executeIf(line: string): Promise<void> {
    // Simple IF condition THEN action parsing
    const match = line.match(/IF\s+(.+?)\s+THEN\s+(.+)/i);
    if (!match) throw new Error('Invalid IF statement');

    const [, condition, action] = match;
    const result = await this.evaluateCondition(condition);

    if (result) {
      await this.executeLine(action);
    }
  }

  /**
   * Execute DO loop
   * Supports: DO count, DO WHILE, DO UNTIL, DO FOREVER, DO var = start TO end [BY step]
   */
  private async executeDo(lines: string[], startIndex: number): Promise<number> {
    const doLine = lines[startIndex].substring(3).trim(); // Remove "DO "

    // Find matching END
    let endIndex = this.findMatchingEnd(lines, startIndex);
    if (endIndex === -1) {
      throw new Error('DO without matching END');
    }

    // Parse DO type
    if (!doLine || doLine.toUpperCase() === 'FOREVER') {
      // DO FOREVER
      while (true) {
        this.breakRequested = false;
        this.iterateRequested = false;

        await this.executeLines(lines, startIndex + 1, endIndex);

        if (this.breakRequested) {
          this.breakRequested = false;
          break;
        }
        if (this.returnRequested) {
          break;
        }
      }
    } else if (doLine.toUpperCase().startsWith('WHILE ')) {
      // DO WHILE condition
      const condition = doLine.substring(6).trim();
      while (await this.evaluateCondition(condition)) {
        this.breakRequested = false;
        this.iterateRequested = false;

        await this.executeLines(lines, startIndex + 1, endIndex);

        if (this.breakRequested) {
          this.breakRequested = false;
          break;
        }
        if (this.returnRequested) {
          break;
        }
      }
    } else if (doLine.toUpperCase().startsWith('UNTIL ')) {
      // DO UNTIL condition
      const condition = doLine.substring(6).trim();
      do {
        this.breakRequested = false;
        this.iterateRequested = false;

        await this.executeLines(lines, startIndex + 1, endIndex);

        if (this.breakRequested) {
          this.breakRequested = false;
          break;
        }
        if (this.returnRequested) {
          break;
        }
      } while (!(await this.evaluateCondition(condition)));
    } else if (doLine.includes('=') && doLine.toUpperCase().includes(' TO ')) {
      // DO var = start TO end [BY step]
      const match = doLine.match(/(\w+)\s*=\s*(.+?)\s+TO\s+(.+?)(?:\s+BY\s+(.+))?$/i);
      if (!match) {
        throw new Error('Invalid DO loop syntax');
      }

      const [, varName, startExpr, endExpr, stepExpr] = match;
      const start = Number(await this.evaluateExpression(startExpr.trim()));
      const end = Number(await this.evaluateExpression(endExpr.trim()));
      const step = stepExpr ? Number(await this.evaluateExpression(stepExpr.trim())) : 1;

      for (let i = start; step > 0 ? i <= end : i >= end; i += step) {
        this.variables.set(varName, i);
        this.breakRequested = false;
        this.iterateRequested = false;

        await this.executeLines(lines, startIndex + 1, endIndex);

        if (this.breakRequested) {
          this.breakRequested = false;
          break;
        }
        if (this.returnRequested) {
          break;
        }
      }
    } else {
      // DO count
      const count = Number(await this.evaluateExpression(doLine));
      for (let i = 0; i < count; i++) {
        this.breakRequested = false;
        this.iterateRequested = false;

        await this.executeLines(lines, startIndex + 1, endIndex);

        if (this.breakRequested) {
          this.breakRequested = false;
          break;
        }
        if (this.returnRequested) {
          break;
        }
      }
    }

    return endIndex + 1; // Return index after END
  }

  /**
   * Find matching END for DO/SELECT.
   *
   * Also recognises `WHEN expr THEN DO` and `IF expr THEN DO` as block
   * openers — without that, `select; when X then do; ...; end; ... end`
   * stops at the first inner END, which is the WHEN body's terminator
   * rather than the SELECT's. STNG / SPEEDCHK / most AmiExpress AREXX
   * doors use this pattern heavily.
   */
  private findMatchingEnd(lines: string[], startIndex: number): number {
    let depth = 1;
    for (let i = startIndex + 1; i < lines.length; i++) {
      const line = lines[i].toUpperCase().trim();
      if (line.startsWith('DO ') || line === 'DO' || line.startsWith('SELECT ') || line === 'SELECT') {
        depth++;
      } else if (line.endsWith(' THEN DO') || line.endsWith(' THEN DO;')) {
        // `when X then do` / `if X then do` opens a nested block.
        depth++;
      } else if (line === 'END' || line.startsWith('END ') || line.startsWith('END;')) {
        depth--;
        if (depth === 0) {
          return i;
        }
      }
    }
    return -1;
  }

  /**
   * Execute SELECT statement
   * SELECT; WHEN condition; commands; WHEN condition; commands; OTHERWISE; commands; END
   */
  private async executeSelect(lines: string[], startIndex: number): Promise<number> {
    const endIndex = this.findMatchingEnd(lines, startIndex);
    if (endIndex === -1) {
      throw new Error('SELECT without matching END');
    }

    let i = startIndex + 1;
    let matched = false;

    // Helper: split a `WHEN expr THEN body` line into (condition, action).
    // Real REXX syntax is `WHEN <expr> THEN <action>` where <action> can
    // be a single statement OR `DO` (starting a multi-line block ended
    // by `END`). We must split at THEN, not feed `expr THEN action` to
    // evaluateCondition. The previous code passed the full tail to
    // evaluateCondition, which produced truthy results regardless of
    // the actual expression — every WHEN matched, and STNG-style menu
    // dispatchers ran every option's body in sequence.
    const splitWhen = (whenLine: string): { cond: string; action: string } => {
      const text = whenLine.substring(whenLine.toUpperCase().indexOf('WHEN ') + 5);
      // Find ` THEN ` outside quoted strings.
      let inSingle = false, inDouble = false;
      const upper = text.toUpperCase();
      for (let k = 0; k < text.length - 4; k++) {
        const c = text[k];
        if (!inDouble && c === "'") inSingle = !inSingle;
        else if (!inSingle && c === '"') inDouble = !inDouble;
        if (inSingle || inDouble) continue;
        if (upper.startsWith(' THEN', k) && (k + 5 === text.length || /\s/.test(text[k + 5]))) {
          return {
            cond: text.substring(0, k).trim(),
            action: text.substring(k + 5).trim(),
          };
        }
      }
      // Malformed WHEN — treat the whole tail as condition.
      return { cond: text.trim(), action: '' };
    };

    // Helper: run the body of a WHEN/OTHERWISE clause. Recognises nested
    // DO/END and IF/THEN/ELSE so a clause body that spans multiple lines
    // (the `when X then do ... end` shape STNG, AVAIL, SPEEDCHK et al.
    // use) executes its full contents and returns the index past it.
    const runClauseBody = async (action: string, bodyStart: number, bodyEnd: number): Promise<number> => {
      // Inline action (`when expr then SAY 'x'`) — evaluate immediately
      // and return without consuming any further lines.
      if (action && action.toUpperCase() !== 'DO') {
        await this.executeLine(action);
        return bodyStart;
      }
      // Multi-line body: action was DO (or empty + body lines until
      // next WHEN/OTHERWISE). Recurse through executeLines so DO loops,
      // SELECTs, IF/ELSE, etc inside the body are honoured.
      // Find the END that matches our DO.
      let cursor = bodyStart;
      if (action.toUpperCase() === 'DO') {
        // DO ... END block — find the matching END by counting nesting.
        // Recognise `IF X THEN DO` and `WHEN X THEN DO` as block openers
        // too — without that, a SELECT body with nested IF/THEN/DO/END
        // (the STNG.Rexx option-3 shape) finds its END at the inner
        // IF's terminator, runs only part of the body, then leaks the
        // rest as top-level statements.
        let depth = 1;
        let scan = bodyStart;
        while (scan < bodyEnd && depth > 0) {
          const u = lines[scan].toUpperCase().trim();
          if (u === 'DO' || u.startsWith('DO ')) depth++;
          else if (u.startsWith('SELECT')) depth++;
          else if (u.endsWith(' THEN DO') || u.endsWith(' THEN DO;')) depth++;
          else if (u === 'END' || u.startsWith('END ')) depth--;
          if (depth === 0) break;
          scan++;
        }
        if (scan < bodyEnd) {
          // Run through executeLines from bodyStart to scan (exclusive of END).
          await this.executeLines(lines, bodyStart, scan);
          cursor = scan + 1; // skip the END line itself
        } else {
          cursor = bodyEnd;
        }
      } else {
        // Implicit body: lines from bodyStart up to next WHEN/OTHERWISE/END.
        let scan = bodyStart;
        while (scan < bodyEnd) {
          const u = lines[scan].toUpperCase().trim();
          if (u.startsWith('WHEN ') || u === 'OTHERWISE') break;
          scan++;
        }
        await this.executeLines(lines, bodyStart, scan);
        cursor = scan;
      }
      return cursor;
    };

    while (i < endIndex) {
      const upper = lines[i].toUpperCase().trim();

      // Bail early on signal/return/break — these set on the interpreter
      // by inner statements (e.g. `signal CRSTNG` from a WHEN body) and
      // must propagate up to executeLines so the goto fires immediately
      // instead of after the rest of the SELECT continues to scan.
      if (this.signalRequested || this.returnRequested || this.breakRequested || this.iterateRequested) {
        break;
      }

      if (upper.startsWith('WHEN ')) {
        const { cond, action } = splitWhen(lines[i]);
        i++;
        if (!matched && await this.evaluateCondition(cond)) {
          matched = true;
          i = await runClauseBody(action, i, endIndex);
        } else {
          // Skip this WHEN's body (matched already, or condition false).
          if (action.toUpperCase() === 'DO') {
            // Skip to matching END. Same depth rules as runClauseBody —
            // count `IF X THEN DO` etc as openers.
            let depth = 1;
            while (i < endIndex && depth > 0) {
              const u = lines[i].toUpperCase().trim();
              if (u === 'DO' || u.startsWith('DO ')) depth++;
              else if (u.startsWith('SELECT')) depth++;
              else if (u.endsWith(' THEN DO') || u.endsWith(' THEN DO;')) depth++;
              else if (u === 'END' || u.startsWith('END ')) depth--;
              i++;
              if (depth === 0) break;
            }
          } else if (!action) {
            // Single-clause-per-line shape with body on subsequent lines —
            // skip to next WHEN/OTHERWISE.
            while (i < endIndex) {
              const u = lines[i].toUpperCase().trim();
              if (u.startsWith('WHEN ') || u === 'OTHERWISE') break;
              i++;
            }
          }
          // else: inline action already consumed by `i++` above.
        }
      } else if (upper === 'OTHERWISE' || upper.startsWith('OTHERWISE ')) {
        // OTHERWISE can have an inline action ("otherwise signal BEGIN")
        // or a multi-line body. Both shapes appear in real AmiExpress doors.
        const inline = upper === 'OTHERWISE' ? '' : lines[i].substring(lines[i].toUpperCase().indexOf('OTHERWISE') + 9).trim();
        i++;
        if (!matched) {
          matched = true;
          if (inline) {
            await this.executeLine(inline);
          } else {
            // Multi-line OTHERWISE body — run lines until END.
            await this.executeLines(lines, i, endIndex);
            i = endIndex;
          }
        }
        break;
      } else {
        // Stray line inside SELECT (between clauses) — skip.
        i++;
      }
    }

    return endIndex + 1;
  }

  /**
   * Execute ADDRESS statement (RKRM "Using ARexx" §4.4).
   *
   * Forms supported:
   *   ADDRESS                       — pop to previous host
   *   ADDRESS env                   — set host = env (static name)
   *   ADDRESS VALUE expr            — set host = result of evaluating expr
   *   ADDRESS env "literal cmd"     — one-shot command dispatch
   *   ADDRESS COMMAND "literal cmd" — same, with COMMAND host
   *
   * We track the current host on `this.currentAddressHost` for
   * symmetry with express.e / RKRM. Subsequent bare commands route
   * via HOST_CMD_ALIASES regardless of which host is current — our
   * dispatcher always reaches the BBS-side BBSFunctions because we
   * don't yet model multiple addressable hosts. The host name is
   * still tracked and exposed via the REXX automatic variable
   * `ADDRESS` so scripts that read it (e.g. logging) get the right
   * value.
   */
  private async executeAddress(line: string): Promise<void> {
    const rest = line.substring('ADDRESS'.length).trim();
    if (rest.length === 0) {
      // Toggle: swap current and previous. AmiExpress doors don't
      // typically use this; we just clear current so the next call
      // takes effect.
      const prev = this.previousAddressHost ?? '';
      this.previousAddressHost = this.currentAddressHost;
      this.currentAddressHost = prev;
    } else if (rest.toUpperCase().startsWith('VALUE ')) {
      const expr = rest.substring('VALUE '.length).trim();
      const v = await this.evaluateExpression(expr);
      this.previousAddressHost = this.currentAddressHost;
      this.currentAddressHost = String(v ?? '');
    } else {
      // Could be `ADDRESS env` or `ADDRESS env "cmd"`. Split on first
      // whitespace; if the remainder looks like a quoted command,
      // dispatch it as a one-shot. Otherwise treat as static-set.
      const m = rest.match(/^(\S+)\s*(.*)$/);
      if (!m) return;
      const envName = m[1];
      const tail = (m[2] || '').trim();
      if (tail) {
        // One-shot dispatch: run tail as a host command in this scope
        // by feeding it back into executeLine. The value of tail is
        // typically a quoted string — strip outer quotes for the
        // command text.
        const cmd = (tail.startsWith('"') && tail.endsWith('"')) ||
                    (tail.startsWith("'") && tail.endsWith("'"))
          ? tail.slice(1, -1)
          : tail;
        // Push host, run command, restore.
        const saved = this.currentAddressHost;
        this.currentAddressHost = envName;
        try { await this.executeLine(cmd); } catch { /* swallow */ }
        this.currentAddressHost = saved;
      } else {
        this.previousAddressHost = this.currentAddressHost;
        this.currentAddressHost = envName;
      }
    }
    // Expose to scripts via the reserved REXX variable.
    this.variables.set('ADDRESS', String(this.currentAddressHost ?? ''));
  }

  /**
   * Execute PARSE command (Phase 3)
   * PARSE VAR string template
   * PARSE VALUE expression WITH template
   */
  private async executeParse(line: string): Promise<void> {
    const parseCmd = line.substring(6).trim(); // Remove "PARSE "

    // PARSE forms supported (RKRM "Using ARexx" §6.1):
    //   PARSE ARG template          — parse program command-line args
    //   PARSE PULL template         — pull from external data queue
    //   PARSE VAR varname template  — parse the named variable
    //   PARSE VALUE expr WITH tmpl  — parse the evaluated expression
    //   PARSE SOURCE template       — invocation metadata
    //   PARSE VERSION template      — interpreter version info
    //   PARSE NUMERIC template      — numeric settings
    //
    // Default sources for PARSE ARG come from `commandLineArgs` (set
    // by the dispatcher when the script was invoked). AmiExpress
    // doors universally start with `parse arg node` to capture the
    // node ID — that path is the most important to get right.
    const upperCmd = parseCmd.toUpperCase();

    // PARSE ARG template — uses program args joined with spaces
    if (upperCmd === 'ARG' || upperCmd.startsWith('ARG ')) {
      const template = parseCmd.length > 3 ? parseCmd.substring(3).trim() : '';
      const argString = (this.commandLineArgs || []).join(' ');
      if (template.length === 0) return;
      await this.parseTemplate(argString, template);
      return;
    }

    // PARSE VAR varname template — parse a variable's value
    if (upperCmd.startsWith('VAR ')) {
      const parts = parseCmd.substring(4).trim().split(/\s+/, 2);
      const varName = parts[0];
      const template = parts.slice(1).join(' ');
      const value = String(this.variables.get(varName) || '');
      await this.parseTemplate(value, template);
      return;
    }

    // PARSE PULL template — read from external data queue. We don't
    // model a queue, so PULL falls back to the same source as ARG
    // (RKRM permits this on hosts without a queue: an empty queue
    // makes PULL read from terminal, which for our purposes maps to
    // command-line args).
    if (upperCmd === 'PULL' || upperCmd.startsWith('PULL ')) {
      const template = parseCmd.length > 4 ? parseCmd.substring(4).trim() : '';
      const argString = (this.commandLineArgs || []).join(' ');
      if (template.length === 0) return;
      await this.parseTemplate(argString, template);
      return;
    }

    // PARSE VALUE expr WITH template
    if (upperCmd.includes(' WITH ')) {
      const [valueExpr, template] = parseCmd.split(/\s+WITH\s+/i);
      const value = String(await this.evaluateExpression(valueExpr.replace(/^VALUE\s+/i, '').trim()));
      await this.parseTemplate(value, template);
      return;
    }

    // PARSE SOURCE template — invocation metadata. Real REXX returns
    // "<system> <calltype> <name>" — for us "AmiExpress COMMAND
    // <scriptname>" is enough for any conditional that reads it.
    if (upperCmd === 'SOURCE' || upperCmd.startsWith('SOURCE ')) {
      const template = parseCmd.length > 6 ? parseCmd.substring(6).trim() : '';
      const value = `AmiExpress COMMAND ${this.context?.doorName || 'script'}`;
      if (template.length === 0) return;
      await this.parseTemplate(value, template);
      return;
    }

    // PARSE VERSION template — interpreter banner.
    if (upperCmd === 'VERSION' || upperCmd.startsWith('VERSION ')) {
      const template = parseCmd.length > 7 ? parseCmd.substring(7).trim() : '';
      const value = 'REXX-AmiExpressWeb 1.0';
      if (template.length === 0) return;
      await this.parseTemplate(value, template);
      return;
    }

    // PARSE NUMERIC template — REXX numeric environment.
    if (upperCmd === 'NUMERIC' || upperCmd.startsWith('NUMERIC ')) {
      const template = parseCmd.length > 7 ? parseCmd.substring(7).trim() : '';
      const value = '9 SCIENTIFIC 5'; // digits, form, fuzz — REXX defaults
      if (template.length === 0) return;
      await this.parseTemplate(value, template);
      return;
    }

    throw new Error(`Invalid PARSE syntax: ${line}`);
  }

  /**
   * Parse string according to template (Phase 4 - Advanced)
   * Supports positional parsing: "1 var1 5 var2 10 var3"
   * And word-based parsing: "var1 var2 var3"
   */
  private async parseTemplate(value: string, template: string): Promise<void> {
    const tokens = template.trim().split(/\s+/);
    let valueIndex = 0;

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      // Check if token is a number (positional indicator)
      if (!isNaN(Number(token))) {
        const position = Number(token) - 1; // AREXX uses 1-based indexing
        valueIndex = position;
        continue;
      }

      // Token is a variable name
      if (i + 1 < tokens.length && !isNaN(Number(tokens[i + 1]))) {
        // Next token is a position - extract substring
        const startPos = valueIndex;
        const endPos = Number(tokens[i + 1]) - 1;
        this.variables.set(token, value.substring(startPos, endPos));
        continue;
      }

      // Word-based extraction
      const words = value.trim().split(/\s+/);
      if (valueIndex < words.length) {
        this.variables.set(token, words[valueIndex]);
        valueIndex++;
      } else {
        this.variables.set(token, '');
      }
    }
  }

  /**
   * Define PROCEDURE (Phase 3)
   * PROCEDURE name(param1, param2, ...)
   */
  private async defineProcedure(lines: string[], startIndex: number): Promise<number> {
    const procLine = lines[startIndex].substring(10).trim(); // Remove "PROCEDURE "

    // Parse procedure name and parameters
    const match = procLine.match(/^(\w+)(?:\((.*?)\))?/);
    if (!match) {
      throw new Error('Invalid PROCEDURE syntax');
    }

    const [, name, paramsStr] = match;
    const params = paramsStr ? paramsStr.split(',').map(p => p.trim()) : [];

    // Find matching END for procedure
    const endIndex = this.findMatchingEnd(lines, startIndex);
    if (endIndex === -1) {
      throw new Error('PROCEDURE without matching END');
    }

    // Store procedure definition
    this.procedures.set(name.toUpperCase(), {
      name: name.toUpperCase(),
      params,
      body: lines.slice(startIndex + 1, endIndex),
      startLine: startIndex,
      endLine: endIndex
    });

    return endIndex + 1;
  }

  /**
   * Call procedure with parameters
   */
  private async callProcedure(procName: string, args: any[]): Promise<any> {
    const procedure = this.procedures.get(procName.toUpperCase());
    if (!procedure) {
      return undefined;
    }

    // Recursion depth check (Phase 4)
    this.recursionDepth++;
    if (this.recursionDepth > this.maxRecursionDepth) {
      throw new Error(`Maximum recursion depth exceeded (${this.maxRecursionDepth})`);
    }

    try {
      // Push current variable scope
      this.variableStack.push(this.variables);

      // Create new variable scope with parameters
      const localVars = new AREXXVariables();

      // Copy parameters to local scope
      for (let i = 0; i < procedure.params.length; i++) {
        localVars.set(procedure.params[i], args[i] || '');
      }

      // Set local scope as current
      this.variables = localVars;

      // Execute procedure body
      this.returnRequested = false;
      this.returnValue = undefined;

      for (const line of procedure.body) {
        if (this.returnRequested) break;
        await this.executeLine(line);
      }

      // Restore previous variable scope
      this.variables = this.variableStack.pop() || this.variables;

      return this.returnValue;
    } finally {
      this.recursionDepth--;
    }
  }

  /**
   * Evaluate condition
   */
  private async evaluateCondition(condition: string): Promise<boolean> {
    const c = condition.trim();
    // Unary NOT (`~` / `\` / `^`) — REXX dialects vary; AmiExpress
    // doors use `~` (e.g. STNG.Rexx's `do while ~eof(STNG)` and
    // `if ~exists('hiscores')`). Without this, the recursion-style
    // ~expr was interpreted as a literal symbol followed by garbage,
    // returning truthy strings forever. Result: STNG's read-loop
    // never exited, V8's Map maxed out at 16M stem entries, the
    // script crashed with "Map maximum size exceeded".
    if (c.length > 1 && (c.startsWith('~') || c.startsWith('\\') || c.startsWith('^')) && c[1] !== '=') {
      return !(await this.evaluateCondition(c.substring(1).trim()));
    }
    // Comparison operators (order matters - check multi-char first)
    if (c.includes('>=')) {
      const [left, right] = c.split('>=');
      return Number(await this.evaluateExpression(left.trim())) >= Number(await this.evaluateExpression(right.trim()));
    }
    if (c.includes('<=')) {
      const [left, right] = c.split('<=');
      return Number(await this.evaluateExpression(left.trim())) <= Number(await this.evaluateExpression(right.trim()));
    }
    if (c.includes('~=') || c.includes('!=') || c.includes('<>') || c.includes('\\=')) {
      const parts = c.split(/~=|!=|<>|\\=/);
      return await this.evaluateExpression(parts[0].trim()) != await this.evaluateExpression(parts[1].trim());
    }
    if (c.includes('==')) {
      const [left, right] = c.split('==');
      return await this.evaluateExpression(left.trim()) == await this.evaluateExpression(right.trim());
    }
    if (c.includes('=')) {
      const [left, right] = c.split('=');
      return await this.evaluateExpression(left.trim()) == await this.evaluateExpression(right.trim());
    }
    if (c.includes('>')) {
      const [left, right] = c.split('>');
      return Number(await this.evaluateExpression(left.trim())) > Number(await this.evaluateExpression(right.trim()));
    }
    if (c.includes('<')) {
      const [left, right] = c.split('<');
      return Number(await this.evaluateExpression(left.trim())) < Number(await this.evaluateExpression(right.trim()));
    }

    // Boolean value
    const value = await this.evaluateExpression(c);
    // REXX truthiness: '1' / non-zero numbers are TRUE; '0' / empty
    // are FALSE. JS Boolean('0') is true (non-empty string), which
    // would disagree — treat the value as a number when possible.
    if (typeof value === 'string') {
      if (value === '' || value === '0') return false;
      const n = Number(value);
      if (!isNaN(n)) return n !== 0;
      return true;
    }
    return Boolean(value);
  }

  /**
   * Evaluate expression — REXX semantics, with operator precedence.
   * Order (lowest to highest precedence):
   *   1. `||` concat
   *   2. `+` `-` (binary)
   *   3. `*` `/` `%` `//`
   *   4. unary `-`
   *   5. atom (literal | var | function call | parenthesized expr)
   * All splits are top-level only — they respect quotes and parens.
   */
  private async evaluateExpression(expr: string): Promise<any> {
    expr = expr.trim();
    if (expr.length === 0) return '';

    // Strip enclosing parens if they're balanced and wrap the whole expr
    while (expr.startsWith('(') && expr.endsWith(')')) {
      // Verify the leading `(` matches the trailing `)`
      let depth = 0;
      let allBalanced = true;
      for (let i = 0; i < expr.length; i++) {
        if (expr[i] === '(') depth++;
        else if (expr[i] === ')') {
          depth--;
          if (depth === 0 && i < expr.length - 1) { allBalanced = false; break; }
        }
      }
      if (!allBalanced || depth !== 0) break;
      expr = expr.slice(1, -1).trim();
    }

    // 1. `||` concat (lowest precedence)
    const concatParts = this.splitTopLevel(expr, '||');
    if (concatParts.length > 1) {
      const evaluated = await Promise.all(
        concatParts.map(p => this.evaluateExpression(p.trim())),
      );
      return evaluated.map(v => (v === undefined || v === null) ? '' : String(v)).join('');
    }

    // 2. `+` / `-` (binary additive). Split LEFT-to-RIGHT so `a - b - c`
    // evaluates as (a - b) - c. We split on the LAST top-level operator
    // and recurse, but only when it's NOT a unary sign. Skip if the operator
    // is at position 0 (would be unary).
    {
      const additiveOps = ['+', '-'];
      const idx = this.findLastTopLevelBinaryOp(expr, additiveOps);
      if (idx > 0) {
        const op = expr[idx]!;
        const left = expr.slice(0, idx).trim();
        const right = expr.slice(idx + 1).trim();
        const lv = Number(await this.evaluateExpression(left));
        const rv = Number(await this.evaluateExpression(right));
        if (Number.isFinite(lv) && Number.isFinite(rv)) {
          return op === '+' ? lv + rv : lv - rv;
        }
      }
    }

    // 3. `*` / `/` / `%` / `//` (multiplicative). Same left-to-right rule.
    {
      // Try `//` (integer divide) first — multi-char op, before single `/`
      const idxIDiv = this.findLastTopLevelOp(expr, '//');
      if (idxIDiv > 0) {
        const left = expr.slice(0, idxIDiv).trim();
        const right = expr.slice(idxIDiv + 2).trim();
        const lv = Number(await this.evaluateExpression(left));
        const rv = Number(await this.evaluateExpression(right));
        if (Number.isFinite(lv) && Number.isFinite(rv) && rv !== 0) {
          return Math.trunc(lv / rv);
        }
      }
      const idx = this.findLastTopLevelBinaryOp(expr, ['*', '/', '%']);
      if (idx > 0) {
        const op = expr[idx]!;
        const left = expr.slice(0, idx).trim();
        const right = expr.slice(idx + 1).trim();
        const lv = Number(await this.evaluateExpression(left));
        const rv = Number(await this.evaluateExpression(right));
        if (Number.isFinite(lv) && Number.isFinite(rv)) {
          if (op === '*') return lv * rv;
          if (op === '/') return rv === 0 ? NaN : lv / rv;
          if (op === '%') return rv === 0 ? NaN : lv % rv;
        }
      }
    }

    // 4. Unary `-`
    if (expr.startsWith('-')) {
      const v = await this.evaluateExpression(expr.slice(1).trim());
      const n = Number(v);
      if (Number.isFinite(n)) return -n;
    }

    // 5. Implicit concatenation / abuttal (RKRM "Using ARexx" §4.3).
    //    REXX concatenates adjacent atoms — quoted strings, symbols,
    //    numbers, function calls, paren groups — separated either
    //    by a space (insert a space) or by nothing (abuttal). The
    //    classic AmiExpress idiom from AVAIL.rexx:
    //
    //      not = '[ANSI]'SYSOP'[ANSI] is NOT available...'
    //
    //    is `'literal'` + symbol SYSOP + `'literal'`, abutted. The
    //    previous atom check matched the outer quotes and returned
    //    the entire line minus the outer `'`s, leaving `'SYSOP'`
    //    visible verbatim in the rendered panel. Tokenize first,
    //    and only fall through to the single-atom path when the
    //    expression really IS one atomic token.
    const tokens = this.tokenizeAtoms(expr);
    if (tokens.length > 1) {
      let combined = '';
      for (let ti = 0; ti < tokens.length; ti++) {
        const t = tokens[ti];
        const v = await this.evaluateExpression(t.text);
        const s = v === undefined || v === null ? '' : String(v);
        // Per REXX: blank-separated tokens get one space between them;
        // abutted tokens (no space) concat with no space.
        combined += s;
        if (ti < tokens.length - 1 && tokens[ti + 1].leadingSpace) {
          combined += ' ';
        }
      }
      return combined;
    }

    // 6. Atoms.
    // String literal
    if ((expr.startsWith('"') && expr.endsWith('"')) || (expr.startsWith("'") && expr.endsWith("'"))) {
      // Handle REXX doubled-quote escape ('' inside a 'literal' = ').
      const quote = expr[0];
      const body = expr.substring(1, expr.length - 1);
      return body.split(quote + quote).join(quote);
    }

    // Number literal
    if (!isNaN(Number(expr)) && expr.length > 0) {
      return Number(expr);
    }

    // Function call: NAME(args)
    if (/^\w+\s*\(.*\)$/.test(expr) && expr.endsWith(')')) {
      return await this.evaluateFunction(expr);
    }

    // Variable lookup. Compound symbols (a.b.c) resolve via
    // resolveCompoundName so each tail segment substitutes its
    // variable value (or its uppercase literal if undefined). Stem
    // defaults (`a. = "x"`) cover any undefined a.SOMETHING. Plain
    // symbols hit the variables pool directly.
    if (this.hasVariable(expr)) {
      return this.getVariable(expr);
    }
    // Compound where the head exists but a specific tail doesn't —
    // hasVariable returns false but we still want to return the stem
    // default if one was set, or the resolved-name uppercase literal
    // (REXX convention for undefined compound symbols).
    if (expr.includes('.')) {
      const stem = expr.split('.')[0].toUpperCase();
      const def = this.stemDefaults.get(stem);
      if (def !== undefined) return def;
      return this.resolveCompoundName(expr);
    }

    // Default: return as string (REXX uppercase-symbol convention)
    return expr;
  }

  /**
   * Tokenize an expression at the top level into atomic tokens —
   * quoted strings, identifiers, numbers, paren groups. Two adjacent
   * tokens are abutted (REXX concatenation): if separated by
   * whitespace, REXX inserts a single space; if not, no space.
   *
   * Returned tokens preserve their original surface text so each can
   * be re-evaluated through evaluateExpression. `leadingSpace=true`
   * means there was whitespace BEFORE this token in the source.
   *
   * Skips operator tokens (||, +, -, *, /, etc.) — those are handled
   * by higher-precedence splitters before this gets called. Returns
   * a single-token list when there's only one atom (caller falls
   * through to single-atom evaluation).
   */
  private tokenizeAtoms(s: string): Array<{ text: string; leadingSpace: boolean }> {
    const out: Array<{ text: string; leadingSpace: boolean }> = [];
    let i = 0;
    let prevWasSpace = false;
    const len = s.length;
    while (i < len) {
      // Skip whitespace and remember we saw it (for abuttal vs space-separated).
      while (i < len && /\s/.test(s[i])) { prevWasSpace = true; i++; }
      if (i >= len) break;
      const start = i;
      const ch = s[i];
      if (ch === "'" || ch === '"') {
        // Quoted string — handle REXX doubled-quote escape ('' inside 'foo'').
        const q = ch;
        i++;
        while (i < len) {
          if (s[i] === q) {
            if (s[i + 1] === q) { i += 2; continue; } // doubled escape
            i++; break;
          }
          i++;
        }
      } else if (ch === '(') {
        // Paren group — match nesting at top level.
        let depth = 1;
        i++;
        while (i < len && depth > 0) {
          if (s[i] === '(') depth++;
          else if (s[i] === ')') depth--;
          else if (s[i] === "'" || s[i] === '"') {
            const q2 = s[i];
            i++;
            while (i < len && s[i] !== q2) i++;
          }
          if (depth > 0) i++;
        }
        if (i < len) i++; // consume the ')'
      } else if (/[A-Za-z_]/.test(ch)) {
        // Identifier — possibly a function call (foo(...)).
        while (i < len && /[A-Za-z0-9_.]/.test(s[i])) i++;
        if (i < len && s[i] === '(') {
          let depth = 1;
          i++;
          while (i < len && depth > 0) {
            if (s[i] === '(') depth++;
            else if (s[i] === ')') depth--;
            else if (s[i] === "'" || s[i] === '"') {
              const q2 = s[i];
              i++;
              while (i < len && s[i] !== q2) i++;
            }
            if (depth > 0) i++;
          }
          if (i < len) i++;
        }
      } else if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(s[i + 1] || ''))) {
        // Number — including decimals and basic scientific notation.
        while (i < len && /[0-9.eE+-]/.test(s[i])) {
          // Stop sign-eat early so `1+2` doesn't consume the `+`.
          if ((s[i] === '+' || s[i] === '-') && !/[eE]/.test(s[i - 1] || '')) break;
          i++;
        }
      } else {
        // Operator or stray char — not part of an atom; bail out so
        // the higher-precedence operator splitter handles it. We
        // return whatever atoms we collected so far; the caller will
        // see <=1 token and fall through to its own paths.
        return out.length === 0 ? [{ text: s.trim(), leadingSpace: false }] : out;
      }
      const tok = s.substring(start, i);
      out.push({ text: tok, leadingSpace: prevWasSpace && out.length > 0 });
      prevWasSpace = false;
    }
    return out;
  }

  /**
   * Find the LAST occurrence of any of `ops` at top level (outside quotes
   * and parens) in `s`, AT POSITION > 0 (so we don't catch unary signs).
   * Returns -1 if none found. Used for left-associative binary operators.
   */
  private findLastTopLevelBinaryOp(s: string, ops: string[]): number {
    let inS = false, inD = false, depth = 0;
    let last = -1;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (!inS && !inD) {
        if (c === "'") { inS = true; continue; }
        if (c === '"') { inD = true; continue; }
        if (c === '(') { depth++; continue; }
        if (c === ')') { depth = Math.max(0, depth - 1); continue; }
        if (depth === 0 && i > 0 && ops.includes(c)) {
          // Skip if this `+` / `-` follows another operator (then it's unary):
          // e.g. `a * -b` — the `-` is unary, not binary.
          const prev = s.slice(0, i).trimEnd();
          const lastChar = prev.charAt(prev.length - 1);
          if (lastChar && '+-*/%|&<>=~!('.includes(lastChar)) continue;
          last = i;
        }
      } else if (inS && c === "'") inS = false;
      else if (inD && c === '"') inD = false;
    }
    return last;
  }

  /** Find LAST top-level occurrence of multi-char `op`. */
  private findLastTopLevelOp(s: string, op: string): number {
    let inS = false, inD = false, depth = 0;
    let last = -1;
    const olen = op.length;
    for (let i = 0; i + olen <= s.length; i++) {
      const c = s[i];
      if (!inS && !inD) {
        if (c === "'") { inS = true; continue; }
        if (c === '"') { inD = true; continue; }
        if (c === '(') { depth++; continue; }
        if (c === ')') { depth = Math.max(0, depth - 1); continue; }
        if (depth === 0 && s.substr(i, olen) === op) {
          last = i;
          i += olen - 1;
        }
      } else if (inS && c === "'") inS = false;
      else if (inD && c === '"') inD = false;
    }
    return last;
  }

  /**
   * Split `s` on `delim` at the top level — ignores delim inside single
   * or double quotes and inside balanced parens. Returns an array of
   * substrings. If no top-level delim found, returns [s] unchanged.
   */
  private splitTopLevel(s: string, delim: string): string[] {
    const out: string[] = [];
    let buf = '';
    let inS = false;     // inside '
    let inD = false;     // inside "
    let depth = 0;       // paren depth
    const dlen = delim.length;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (!inS && !inD) {
        if (c === "'" ) { inS = true; buf += c; continue; }
        if (c === '"' ) { inD = true; buf += c; continue; }
        if (c === '(') { depth++; buf += c; continue; }
        if (c === ')') { depth = Math.max(0, depth - 1); buf += c; continue; }
        if (depth === 0 && s.substr(i, dlen) === delim) {
          out.push(buf);
          buf = '';
          i += dlen - 1;
          continue;
        }
      } else if (inS && c === "'") { inS = false; buf += c; continue; }
      else if (inD && c === '"') { inD = false; buf += c; continue; }
      buf += c;
    }
    out.push(buf);
    return out;
  }

  /**
   * Evaluate function call
   */
  private async evaluateFunction(expr: string): Promise<any> {
    const match = expr.match(/^(\w+)\((.*)\)$/);
    if (!match) throw new Error(`Invalid function call: ${expr}`);

    const [, funcName, argsStr] = match;
    const args = argsStr ? await this.parseArguments(argsStr) : [];

    return await this.callFunction(funcName.toUpperCase(), args);
  }

  /**
   * Parse function arguments
   */
  private async parseArguments(argsStr: string): Promise<any[]> {
    const args: any[] = [];
    let current = '';
    let inQuotes = false;
    let depth = 0;

    for (let i = 0; i < argsStr.length; i++) {
      const char = argsStr[i];

      if (char === '"' || char === "'") {
        inQuotes = !inQuotes;
        current += char;
      } else if (char === '(' && !inQuotes) {
        depth++;
        current += char;
      } else if (char === ')' && !inQuotes) {
        depth--;
        current += char;
      } else if (char === ',' && !inQuotes && depth === 0) {
        args.push(await this.evaluateExpression(current.trim()));
        current = '';
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      args.push(await this.evaluateExpression(current.trim()));
    }

    return args;
  }

  /**
   * Call function
   */
  private async callFunction(funcName: string, args: any[]): Promise<any> {
    // Check for user-defined procedures first (Phase 3)
    if (this.procedures.has(funcName.toUpperCase())) {
      return await this.callProcedure(funcName, args);
    }

    // BBS Functions - Original
    if (funcName === 'BBSWRITE') {
      await this.bbsFunctions.BBSWRITE(String(args[0] || ''));
      return;
    }
    if (funcName === 'BBSREAD') {
      return await this.bbsFunctions.BBSREAD();
    }
    if (funcName === 'BBSGETUSERNAME') {
      return this.bbsFunctions.BBSGETUSERNAME();
    }
    if (funcName === 'BBSGETUSERLEVEL') {
      return this.bbsFunctions.BBSGETUSERLEVEL();
    }
    if (funcName === 'BBSGETCONF') {
      return this.bbsFunctions.BBSGETCONF();
    }
    if (funcName === 'BBSJOINCONF') {
      return await this.bbsFunctions.BBSJOINCONF(Number(args[0]));
    }
    if (funcName === 'BBSPOSTMSG') {
      return await this.bbsFunctions.BBSPOSTMSG(
        String(args[0]),
        String(args[1]),
        Boolean(args[2]),
        args[3] ? String(args[3]) : undefined
      );
    }
    if (funcName === 'BBSGETMSGCOUNT') {
      return await this.bbsFunctions.BBSGETMSGCOUNT(
        args[0] ? Number(args[0]) : undefined,
        args[1] ? Number(args[1]) : undefined
      );
    }
    if (funcName === 'BBSLOG') {
      await this.bbsFunctions.BBSLOG(String(args[0]), String(args[1]));
      return;
    }

    // BBS Functions - New
    if (funcName === 'BBSGETUSER') {
      return await this.bbsFunctions.BBSGETUSER(args[0]);
    }
    if (funcName === 'BBSSETUSER') {
      return await this.bbsFunctions.BBSSETUSER(String(args[0]), args[1]);
    }
    if (funcName === 'BBSGETONLINECOUNT') {
      return await this.bbsFunctions.BBSGETONLINECOUNT();
    }
    if (funcName === 'BBSGETONLINEUSERS') {
      return await this.bbsFunctions.BBSGETONLINEUSERS();
    }
    if (funcName === 'BBSGETCONFNAME') {
      return await this.bbsFunctions.BBSGETCONFNAME(args[0] ? Number(args[0]) : undefined);
    }
    if (funcName === 'BBSGETCONFERENCES') {
      return await this.bbsFunctions.BBSGETCONFERENCES();
    }
    if (funcName === 'BBSCHECKLEVEL') {
      return this.bbsFunctions.BBSCHECKLEVEL(Number(args[0]));
    }
    if (funcName === 'BBSSENDPRIVATE') {
      return await this.bbsFunctions.BBSSENDPRIVATE(String(args[0]), String(args[1]), String(args[2]));
    }
    if (funcName === 'BBSGETLASTCALLER') {
      return await this.bbsFunctions.BBSGETLASTCALLER();
    }

    // BBS Functions - Phase 3 (File Operations)
    if (funcName === 'BBSREADFILE') {
      return await this.bbsFunctions.BBSREADFILE(String(args[0]));
    }
    if (funcName === 'BBSWRITEFILE') {
      return await this.bbsFunctions.BBSWRITEFILE(
        String(args[0]),
        String(args[1]),
        args[2] ? Boolean(args[2]) : false
      );
    }

    // BBS Functions - Phase 3 (Menu and Door Functions)
    if (funcName === 'BBSSHOWMENU') {
      await this.bbsFunctions.BBSSHOWMENU(String(args[0]));
      return;
    }
    if (funcName === 'BBSLAUNCHDOOR') {
      return await this.bbsFunctions.BBSLAUNCHDOOR(String(args[0]), args.slice(1).map(String));
    }

    // BBS Functions - Phase 3 (File Area Functions)
    if (funcName === 'BBSGETFILECOUNT') {
      return await this.bbsFunctions.BBSGETFILECOUNT(args[0] ? Number(args[0]) : undefined);
    }
    if (funcName === 'BBSGETFILEAREAS') {
      return await this.bbsFunctions.BBSGETFILEAREAS();
    }
    if (funcName === 'BBSGETAREANAME') {
      return await this.bbsFunctions.BBSGETAREANAME(args[0] ? Number(args[0]) : undefined);
    }
    if (funcName === 'BBSSEARCHFILES') {
      return await this.bbsFunctions.BBSSEARCHFILES(
        String(args[0]),
        args[1] ? Number(args[1]) : undefined
      );
    }

    // BBS Functions - Phase 4 (File Management)
    if (funcName === 'BBSDELETEFILE') {
      return await this.bbsFunctions.BBSDELETEFILE(String(args[0]));
    }
    if (funcName === 'BBSRENAMEFILE') {
      return await this.bbsFunctions.BBSRENAMEFILE(String(args[0]), String(args[1]));
    }

    // BBS Functions - Phase 4 (System Information)
    if (funcName === 'BBSGETDISKSPACE') {
      return await this.bbsFunctions.BBSGETDISKSPACE();
    }
    if (funcName === 'BBSGETDOORLIST') {
      return await this.bbsFunctions.BBSGETDOORLIST();
    }
    if (funcName === 'BBSGETMENULIST') {
      return await this.bbsFunctions.BBSGETMENULIST();
    }

    // BBS Functions - Phase 4 (Door Drop Files)
    if (funcName === 'BBSCREATEDROPFILE') {
      return await this.bbsFunctions.BBSCREATEDROPFILE(
        String(args[0]),
        args[1] as 'DOOR.SYS' | 'DORINFO1.DEF' || 'DOOR.SYS'
      );
    }

    // AmiExpress-Specific AREXX Door Functions
    // These match the original AmiExpress AREXX API for legacy door compatibility
    if (funcName === 'SENDSTRING') {
      await this.bbsFunctions.SendString(String(args[0] || ''));
      return;
    }
    if (funcName === 'TRANSMIT') {
      await this.bbsFunctions.Transmit(String(args[0] || ''));
      return;
    }
    if (funcName === 'GETUSER') {
      return await this.bbsFunctions.GetUser(Number(args[0]));
    }
    if (funcName === 'GETCHAR') {
      return await this.bbsFunctions.GETCHAR();
    }
    if (funcName === 'SHOWFILE') {
      await this.bbsFunctions.Showfile(String(args[0] || ''));
      return;
    }
    if (funcName === 'BUFFERFLUSH') {
      await this.bbsFunctions.bufferflush();
      return;
    }
    if (funcName === 'SHUTDOWN') {
      await this.bbsFunctions.shutdown();
      return;
    }
    if (funcName === 'ADDRESS') {
      await this.bbsFunctions.Address(String(args[0] || ''));
      return;
    }
    // SendMessage = SendString variant per Aedoc4.guide §Cap1102 —
    // explicit registration so scripts that go through the function-
    // call path (rare, but possible) dispatch correctly.
    if (funcName === 'SENDMESSAGE') {
      await this.bbsFunctions.SendMessage(String(args[0] || ''));
      return;
    }
    if (funcName === 'PUTUSER') {
      await this.bbsFunctions.PutUser(Number(args[0]));
      return;
    }
    if (funcName === 'PUTUSTR') {
      await this.bbsFunctions.PutUstr(String(args[0] || ''));
      return;
    }
    if (funcName === 'PROMPT') {
      // Prompt returns a string — exposed via RESULT in the host-
      // command fallback caller.
      return await this.bbsFunctions.Prompt(String(args[0] || ''));
    }

    // ====================================================================
    // rexxsupport.library — file I/O (RKRM Devices Volume).
    // AmiExpress AREXX doors uniformly use these for hi-score/log/cfg
    // persistence. We dispatch to AREXXFileIO so each script run gets
    // its own handle registry.
    // ====================================================================
    switch (funcName) {
      case 'OPEN':    return this.fileIO.open(String(args[0] ?? ''), String(args[1] ?? ''), String(args[2] ?? 'R'));
      case 'CLOSE':   return this.fileIO.close(String(args[0] ?? ''));
      case 'READLN':  return this.fileIO.readln(String(args[0] ?? ''));
      case 'WRITELN': return this.fileIO.writeln(String(args[0] ?? ''), String(args[1] ?? ''));
      case 'READCH':  return this.fileIO.readch(String(args[0] ?? ''), Number(args[1] ?? 1));
      case 'WRITECH': return this.fileIO.writech(String(args[0] ?? ''), String(args[1] ?? ''));
      case 'EOF':     return this.fileIO.eof(String(args[0] ?? ''));
      case 'EXISTS':  return this.fileIO.exists(String(args[0] ?? ''));
      case 'STATEF':  return this.fileIO.statef(String(args[0] ?? ''));
      case 'SEEK':    return this.fileIO.seek(String(args[0] ?? ''), Number(args[1] ?? 0), String(args[2] ?? 'B'));
      case 'PRAGMA':  return this.fileIO.pragma(String(args[0] ?? ''), args[1] === undefined ? undefined : String(args[1]));
      case 'DELETE': {
        // rexxsupport delete(filename) → 1 on success, 0 on failure.
        try {
          const fp = this.fileIO.resolveAmigaPath(String(args[0] ?? ''));
          require('fs').unlinkSync(fp);
          return 1;
        } catch { return 0; }
      }
      case 'MAKEDIR': {
        try {
          const fp = this.fileIO.resolveAmigaPath(String(args[0] ?? ''));
          require('fs').mkdirSync(fp, { recursive: true });
          return 1;
        } catch { return 0; }
      }
      case 'RENAME': {
        try {
          const a = this.fileIO.resolveAmigaPath(String(args[0] ?? ''));
          const b = this.fileIO.resolveAmigaPath(String(args[1] ?? ''));
          require('fs').renameSync(a, b);
          return 1;
        } catch { return 0; }
      }
      case 'CHARS':
      case 'LINES': {
        // Chars/lines remaining on a stream. Approximate via the
        // file-handle's remaining bytes/lines.
        try {
          const fp = this.fileIO.resolveAmigaPath(String(args[0] ?? ''));
          const st = require('fs').statSync(fp);
          return funcName === 'CHARS' ? st.size : 1; // 1 = "lines available"
        } catch { return 0; }
      }
    }

    // ====================================================================
    // Library / SHOW (rexxsupport).
    // SHOW(option, name)   — option: 'L' libraries, 'P' ports, 'F'
    //                        functions; returns 1 if `name` is loaded
    //                        / port exists, else 0. (Single-arg form
    //                        returns a space-separated list — we
    //                        return the registered set.)
    // ADDLIB(name, pri, off, ver) — pretend-load a library; we just
    //                        track the name so SHOW('L', name) reports
    //                        TRUE. Real Amiga loads the .library;
    //                        nothing in our path actually needs the
    //                        binary symbols.
    // REMLIB(name)         — opposite of ADDLIB.
    // ====================================================================
    if (funcName === 'ADDLIB') {
      const name = String(args[0] ?? '');
      if (name) this.loadedLibraries.add(name.toLowerCase());
      return 1;
    }
    if (funcName === 'REMLIB') {
      this.loadedLibraries.delete(String(args[0] ?? '').toLowerCase());
      return 1;
    }
    if (funcName === 'SHOW') {
      const opt = String(args[0] ?? 'L').toUpperCase().charAt(0);
      const name = args[1] === undefined ? undefined : String(args[1]).toLowerCase();
      if (opt === 'L') {
        if (name === undefined) return Array.from(this.loadedLibraries).join(' ');
        return this.loadedLibraries.has(name) ? 1 : 0;
      }
      // P (ports) — we don't model an exec port list at the script
      // level; default to the BBS's known dispatch hosts.
      if (opt === 'P') {
        if (name === undefined) return 'AERexxControl1 AMIEXPRESS';
        return /^aerexxcontrol\d+$/.test(name) || name === 'amiexpress' ? 1 : 0;
      }
      return 0;
    }

    // ====================================================================
    // Data queue (PUSH / QUEUE / PULL / QUEUED — RKRM §5.5).
    // ====================================================================
    if (funcName === 'PUSH') { this.dataQueue.unshift(String(args[0] ?? '')); return 0; }
    if (funcName === 'QUEUE') { this.dataQueue.push(String(args[0] ?? '')); return 0; }
    if (funcName === 'QUEUED') { return this.dataQueue.length; }

    // ====================================================================
    // Misc REXX builtins routed through AREXXFunctions OR handled here
    // because they need access to interpreter state.
    // ====================================================================
    if (funcName === 'VALUE') {
      // VALUE(symbol [, newvalue [, pool]]) — get/set a variable by
      // its computed name. Pool is ignored (we have one variable
      // pool). Returns the OLD value.
      const name = String(args[0] ?? '').toUpperCase();
      const old = this.variables.get(name);
      if (args.length > 1 && args[1] !== undefined) {
        this.variables.set(name, args[1]);
      }
      return old === undefined ? '' : old;
    }
    if (funcName === 'SYMBOL') {
      // SYMBOL(name) → 'VAR' if defined, 'LIT' if undefined-but-valid,
      // 'BAD' if not a valid symbol name.
      const n = String(args[0] ?? '');
      if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(n)) return 'BAD';
      return this.variables.has(n) ? 'VAR' : 'LIT';
    }
    if (funcName === 'ARG') {
      // ARG([n [, option]]) — n=0/missing returns count; n=1.. returns
      // the nth arg. Option 'E' (exists) → 1/0, 'O' (omitted) → 0/1.
      if (args.length === 0) return this.commandLineArgs.length;
      const n = Number(args[0]) || 0;
      const opt = String(args[1] ?? '').toUpperCase().charAt(0);
      const val = n >= 1 && n <= this.commandLineArgs.length ? this.commandLineArgs[n - 1] : '';
      if (opt === 'E') return val !== '' ? 1 : 0;
      if (opt === 'O') return val === '' ? 1 : 0;
      return val;
    }
    if (funcName === 'ADDRESS') {
      // ADDRESS() → name of current host
      return this.currentAddressHost;
    }
    if (funcName === 'ERRORTEXT') {
      return AREXXFunctions.ERRORTEXT(Number(args[0]));
    }
    if (funcName === 'TRACE') {
      // TRACE() — getter; TRACE(opt) — setter. Just toggle the flag.
      if (args.length === 0) return this.traceEnabled ? 'A' : 'O';
      const m = String(args[0]).toUpperCase().charAt(0);
      this.traceEnabled = (m !== 'O' && m !== 'N');
      return '';
    }

    // Standard AREXX Functions (string / numeric / conversion)
    if (funcName in AREXXFunctions) {
      const func = (AREXXFunctions as any)[funcName];
      return func(...args);
    }

    throw new Error(`Unknown function: ${funcName}`);
  }

  /**
   * Get output
   */
  getOutput(): string[] {
    return this.output;
  }

  /**
   * Get variables
   */
  getVariables(): Map<string, any> {
    return this.variables.getAll();
  }
}

/**
 * Enhanced AREXX Engine
 */
export class EnhancedAREXXEngine {
  private scripts: Map<string, AREXXScript> = new Map();

  constructor() {
    this.loadScripts();
  }

  /**
   * Load AREXX scripts from database
   */
  private async loadScripts(): Promise<void> {
    try {
      const scripts = await db.getAREXXScripts();
      for (const script of scripts) {
        this.scripts.set(script.id, script);
      }
console.log(`Loaded ${scripts.length} AREXX scripts`);
    } catch (error) {
console.error('Error loading AREXX scripts:', error);
    }
  }

  /**
   * Execute script by trigger event
   */
  async executeTrigger(event: string, context: any): Promise<any[]> {
    const results: any[] = [];

    for (const [id, script] of this.scripts) {
      if (!script.enabled) continue;

      // Check if script triggers match event
      if (script.triggers && script.triggers.some(t => t.event === event)) {
        const result = await this.executeScript(script, context);
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Execute script by name
   */
  async executeScriptByName(name: string, context: any): Promise<any> {
    const script = Array.from(this.scripts.values()).find(s => s.name === name);
    if (!script) {
      throw new Error(`AREXX script '${name}' not found`);
    }

    return await this.executeScript(script, context);
  }

  /**
   * Execute script by ID
   */
  async executeScriptById(id: string, context: any): Promise<any> {
    const script = this.scripts.get(id);
    if (!script) {
      throw new Error(`AREXX script with ID '${id}' not found`);
    }

    return await this.executeScript(script, context);
  }

  /**
   * Execute specific script
   */
  async executeScript(script: AREXXScript, context: any): Promise<any> {
    try {
console.log(`Executing AREXX script: ${script.name}`);

      // #78 Phase 5 — engine selector. The TS interpreter is always
      // the safe fallback; the native (RexxMast under MOIRA) path is
      // only used when the sysop has supplied the binaries AND the
      // service has fully booted (status.ready=true).
      try {
        const { selectAREXXEngine } = require('./arexx/engine-selector');
        const { rexxMastService } = require('./arexx/rexxmast-service');
        const choice = selectAREXXEngine();
        if (choice.choice === 'native' && rexxMastService.isReady()) {
console.log(`[AREXX] dispatching '${script.name}' via native RexxMast (${choice.reason})`);
          const args = (context.parameters || []) as string[];
          // Preserve the BBS dispatcher's output callback so TR/SS/BBSWRITE
          // emissions reach the socket. Previously we hard-overrode
          // output to an empty array — the bridged interpreter wrote
          // every byte into that array and the user saw nothing on
          // screen. emitToTerminal prefers outputCallback over output,
          // so wiring dispatcherOutput as outputCallback (when it's a
          // function) preserves the socket emit path AND lets the
          // array buffer keep collecting for unit-test consumers.
          const dispatcherOutput = context.output;
          const nativeCtx = {
            ...context,
            output: [],
            outputCallback:
              typeof dispatcherOutput === 'function'
                ? dispatcherOutput
                : context.outputCallback,
          };
          const native = await rexxMastService.executeRexxScript(
            script.script || '',
            args,
            nativeCtx,
          );
          // Log execution (mirror the TS path so the audit trail
          // is consistent regardless of which engine ran).
          await db.executeAREXXScript(script.id, {
            user: context.user,
            sessionId: context.sessionId,
            command: undefined,
            parameters: args,
            variables: {},
          } as any);
          return {
            success: native.success,
            output: native.output,
            error: native.error,
            variables: {},
          };
        }
      } catch (err) {
        // Native dispatch faulted — fall through to TS so the script
        // still runs. Sysop sees the error in backend.log.
console.error('[AREXX] native dispatch failed, falling back to TS:', err);
      }

      // Create interpreter with context. Preserve the dispatcher's
      // `output` (commonly a callback like `(text) => emitText(socket, text)`)
      // by aliasing it to outputCallback before the buffer slot is
      // assigned. Without this the door dispatch loses its emit path
      // and TR/SS calls disappear (AVAIL.rexx → "AVAIL completed."
      // with no panel printed). The unit-test path that passes an
      // array under `output` keeps working through the array branch
      // in BBSWRITE.
      const dispatcherOutput = context.output;
      const outputBuffer: string[] = [];
      // Resolve script command-line args. AmiExpress doors expect the
      // first arg to be the node ID — `parse arg node` is the
      // canonical first line of every shipped AREXX door. Sources
      // (in priority order):
      //   1. context.parameters — set by the BBS dispatcher
      //   2. context.args
      //   3. [String(context.session.nodeId || nodeId)] — fallback so
      //      doors that read PARSE ARG always get *something*
      //      sensible rather than an empty string.
      const scriptArgs: string[] =
        Array.isArray(context.parameters) && context.parameters.length > 0
          ? context.parameters.map(String)
          : Array.isArray(context.args) && context.args.length > 0
            ? context.args.map(String)
            : [String(context.session?.nodeId ?? context.nodeId ?? 1)];
      const interpreter = new AREXXInterpreter({
        ...context,
        output: outputBuffer,
        outputCallback:
          typeof dispatcherOutput === 'function'
            ? dispatcherOutput
            : context.outputCallback,
      }, scriptArgs);

      // Execute script code
      const result = await interpreter.execute(script.script || '');

      // Log execution
      await db.executeAREXXScript(script.id, {
        user: context.user,
        sessionId: context.sessionId,
        command: undefined,
        parameters: context.parameters || [],
        variables: Object.fromEntries(interpreter.getVariables())
      } as any);

      return {
        success: result.success,
        output: result.output,
        error: result.error,
        variables: Object.fromEntries(interpreter.getVariables())
      };
    } catch (error) {
console.error(`AREXX script ${script.id} execution error:`, error);
      throw error;
    }
  }

  /**
   * Add or update script
   */
  async addScript(script: AREXXScript): Promise<void> {
    this.scripts.set(script.id, script);
console.log(`AREXX script ${script.name} added/updated`);
  }

  /**
   * Remove script
   */
  async removeScript(id: string): Promise<void> {
    this.scripts.delete(id);
console.log(`AREXX script ${id} removed`);
  }

  /**
   * Reload scripts from database
   */
  async reloadScripts(): Promise<void> {
    this.scripts.clear();
    await this.loadScripts();
  }

  /**
   * Get all scripts
   */
  getScripts(): AREXXScript[] {
    return Array.from(this.scripts.values());
  }

  /**
   * Get scripts by trigger
   */
  getScriptsByTrigger(event: string): AREXXScript[] {
    return Array.from(this.scripts.values()).filter(script =>
      script.triggers && script.triggers.some(t => t.event === event)
    );
  }
}

// Export singleton instance
export const arexxEngine = new EnhancedAREXXEngine();
