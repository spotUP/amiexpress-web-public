/**
 * String Utility Functions
 *
 * Implements MiscFuncs.e string functions for AmiExpress compatibility.
 * All functions match express.e string handling behavior.
 */

/**
 * Case-insensitive string comparison
 * Equivalent to MiscFuncs.e stringCompare()
 *
 * Express.e usage: 31 instances
 * Critical for command matching, user input validation, config parsing
 *
 * @param str1 - First string to compare
 * @param str2 - Second string to compare
 * @returns true if strings match (case-insensitive), false otherwise
 */
export function stringCompare(str1: string, str2: string): boolean {
  if (str1 == null || str2 == null) {
    return str1 === str2;
  }
  return str1.toLowerCase() === str2.toLowerCase();
}

/**
 * Case-insensitive string comparison with partial matching
 * Returns true if str1 starts with str2 (case-insensitive)
 *
 * @param str1 - String to check
 * @param str2 - Prefix to match
 * @returns true if str1 starts with str2 (case-insensitive)
 */
export function stringStartsWith(str1: string, str2: string): boolean {
  if (str1 == null || str2 == null) {
    return false;
  }
  return str1.toLowerCase().startsWith(str2.toLowerCase());
}

/**
 * Convert string to uppercase
 * Equivalent to MiscFuncs.e upperChars()
 *
 * Express.e usage: 13 instances
 * Used for normalizing user input, commands, config values
 *
 * @param text - String to convert
 * @returns Uppercase string
 */
export function upperChars(text: string): string {
  if (text == null) {
    return '';
  }
  return text.toUpperCase();
}

/**
 * Convert string to lowercase
 * Companion to upperChars()
 *
 * @param text - String to convert
 * @returns Lowercase string
 */
export function lowerChars(text: string): string {
  if (text == null) {
    return '';
  }
  return text.toLowerCase();
}

/**
 * Trim whitespace from both ends of string
 * Equivalent to MiscFuncs.e fullTrim()
 *
 * Express.e usage: 12 instances
 * Used for cleaning user input, parsing config files
 *
 * @param text - String to trim
 * @returns Trimmed string
 */
export function fullTrim(text: string): string {
  if (text == null) {
    return '';
  }
  return text.trim();
}

/**
 * Remove trailing slashes from path string
 * Equivalent to MiscFuncs.e removeSlashes()
 *
 * Express.e usage: 4 instances
 * Used for path normalization
 *
 * @param text - Path string
 * @returns Path without trailing slashes
 */
export function removeSlashes(text: string): string {
  if (text == null) {
    return '';
  }
  return text.replace(/\/+$/, '');
}

/**
 * Remove leading slashes from path string
 * @param text - Path string
 * @returns Path without leading slashes
 */
export function removeLeadingSlashes(text: string): string {
  if (text == null) {
    return '';
  }
  return text.replace(/^\/+/, '');
}

/**
 * Pad string to specified length with character
 * @param text - String to pad
 * @param length - Target length
 * @param padChar - Character to pad with (default: space)
 * @param padLeft - Pad on left if true, right if false (default: false)
 * @returns Padded string
 */
export function padString(text: string, length: number, padChar: string = ' ', padLeft: boolean = false): string {
  if (text == null) {
    text = '';
  }

  if (text.length >= length) {
    return text;
  }

  const padding = padChar.repeat(length - text.length);
  return padLeft ? padding + text : text + padding;
}

/**
 * Truncate string to maximum length with optional ellipsis
 * @param text - String to truncate
 * @param maxLength - Maximum length
 * @param ellipsis - Add "..." if truncated (default: true)
 * @returns Truncated string
 */
export function truncateString(text: string, maxLength: number, ellipsis: boolean = true): string {
  if (text == null || text.length <= maxLength) {
    return text || '';
  }

  if (ellipsis && maxLength > 3) {
    return text.substring(0, maxLength - 3) + '...';
  }

  return text.substring(0, maxLength);
}

/**
 * Check if string contains another string (case-insensitive)
 * @param text - String to search in
 * @param search - String to search for
 * @returns true if text contains search (case-insensitive)
 */
export function containsIgnoreCase(text: string, search: string): boolean {
  if (text == null || search == null) {
    return false;
  }
  return text.toLowerCase().includes(search.toLowerCase());
}

/**
 * Replace all occurrences of a string (case-sensitive)
 * @param text - String to search in
 * @param search - String to search for
 * @param replacement - Replacement string
 * @returns String with all occurrences replaced
 */
export function replaceAll(text: string, search: string, replacement: string): string {
  if (text == null) {
    return '';
  }
  return text.split(search).join(replacement);
}

/**
 * Replace all occurrences of a string (case-insensitive)
 * @param text - String to search in
 * @param search - String to search for
 * @param replacement - Replacement string
 * @returns String with all occurrences replaced
 */
export function replaceAllIgnoreCase(text: string, search: string, replacement: string): string {
  if (text == null || search == null) {
    return text || '';
  }

  const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  return text.replace(regex, replacement);
}

/**
 * Split string by delimiter and trim each part
 * @param text - String to split
 * @param delimiter - Delimiter to split on
 * @returns Array of trimmed parts
 */
export function splitAndTrim(text: string, delimiter: string): string[] {
  if (text == null) {
    return [];
  }
  return text.split(delimiter).map(part => part.trim()).filter(part => part.length > 0);
}

/**
 * Join array of strings with delimiter
 * @param parts - Array of strings to join
 * @param delimiter - Delimiter to join with
 * @returns Joined string
 */
export function joinStrings(parts: string[], delimiter: string): string {
  if (parts == null || parts.length === 0) {
    return '';
  }
  return parts.join(delimiter);
}

/**
 * Repeat string N times
 * @param text - String to repeat
 * @param count - Number of times to repeat
 * @returns Repeated string
 */
export function repeatString(text: string, count: number): string {
  if (text == null || count <= 0) {
    return '';
  }
  return text.repeat(count);
}

/**
 * Reverse string
 * @param text - String to reverse
 * @returns Reversed string
 */
export function reverseString(text: string): string {
  if (text == null) {
    return '';
  }
  return text.split('').reverse().join('');
}

/**
 * Count occurrences of substring in string
 * @param text - String to search in
 * @param search - Substring to count
 * @param caseSensitive - Case-sensitive search (default: false)
 * @returns Number of occurrences
 */
export function countOccurrences(text: string, search: string, caseSensitive: boolean = false): number {
  if (text == null || search == null || search.length === 0) {
    return 0;
  }

  const searchText = caseSensitive ? text : text.toLowerCase();
  const searchFor = caseSensitive ? search : search.toLowerCase();

  let count = 0;
  let pos = 0;

  while ((pos = searchText.indexOf(searchFor, pos)) !== -1) {
    count++;
    pos += searchFor.length;
  }

  return count;
}

/**
 * Escape special regex characters in string
 * @param text - String to escape
 * @returns Escaped string safe for use in RegExp
 */
export function escapeRegex(text: string): string {
  if (text == null) {
    return '';
  }
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
