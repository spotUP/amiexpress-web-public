/**
 * Date/Time Utility Functions
 *
 * Implements MiscFuncs.e date/time functions for AmiExpress compatibility.
 * All functions match express.e formatting and behavior.
 */

/**
 * Get current system time
 * Equivalent to MiscFuncs.e getSystemTime()
 *
 * Express.e usage: 74 instances
 * Centralizes time handling for consistency across BBS
 *
 * @returns Current Date object
 */
export function getSystemTime(): Date {
  return new Date();
}

/**
 * Get current system date (alias for compatibility)
 * @returns Current Date object
 */
export function getSystemDate(): Date {
  return new Date();
}

/**
 * Format date as "MM-DD-YY" (Amiga FORMAT_USA date format)
 * Equivalent to MiscFuncs.e formatLongDate() which uses FORMAT_USA.
 *
 * AmigaDOS DateToStr with FORMAT_USA produces "MM-DD-YY" (2-digit year).
 * MiscFuncs.e:287-297 — dt.format:=FORMAT_USA; DateToStr(dt); StringF(outDateStr,'\s',datestr)
 *
 * Express.e usage: 22 instances (used by ~OD, ~DT MCI codes)
 * Examples: "04-07-26", "12-25-95"
 *
 * @param date - Date to format
 * @returns Formatted date string "MM-DD-YY"
 */
export function formatLongDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);

  return `${month}-${day}-${year}`;
}

/**
 * Format time as "HH:MM:SS" (24-hour format)
 * Equivalent to MiscFuncs.e formatLongTime() which uses FORMAT_USA.
 *
 * AmigaDOS DateToStr with FORMAT_USA produces "HH:MM:SS".
 * MiscFuncs.e:299-318 — dt.format:=FORMAT_USA; DateToStr(dt); StringF(outDateStr,'\s',time)
 *
 * Express.e usage: 10 instances (used by ~CT, ~OT MCI codes)
 * Examples: "14:32:15", "09:05:00"
 *
 * @param date - Date to format
 * @returns Formatted time string "HH:MM:SS"
 */
export function formatLongTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Format date and time as "DDD DD-MMM-YYYY HH:MM:SS"
 * Equivalent to MiscFuncs.e formatLongDateTime() which uses FORMAT_DOS.
 *
 * AmigaDOS DateToStr with FORMAT_DOS produces:
 *   daystr = "Mon", datestr = "07-Jan-26", timestr = "14:32:00"
 * MiscFuncs.e:320-341 assembles:
 *   StringF(outDateStr,'\s[3] \s[7]\d\s \s', daystr, datestr,
 *           IF dt.stamp.days>=8035 THEN 20 ELSE 19, datestr+7, timestr)
 * This produces: "Mon 07-Jan-2026 14:32:00"
 *   - 3-char day abbreviation
 *   - space
 *   - first 7 chars of DOS datestr ("DD-MMM-") + century (20/19) + 2-digit year
 *   - space
 *   - time "HH:MM:SS"
 *
 * Express.e usage: 21 instances (used by ~LC MCI code)
 * Examples: "Mon 07-Jan-2026 14:32:00", "Thu 25-Dec-1995 09:00:00"
 *
 * @param date - Date to format
 * @returns Formatted datetime string "DDD DD-MMM-YYYY HH:MM:SS"
 */
export function formatLongDateTime(date: Date): string {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const dayName = dayNames[date.getDay()];
  const day = String(date.getDate()).padStart(2, '0');
  const month = monthNames[date.getMonth()];
  const fullYear = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  // MiscFuncs.e:338: StringF(outDateStr,'\s[3] \s[7]\d\s \s',daystr,datestr,century,datestr+7,timestr)
  // datestr (FORMAT_DOS) = "DD-MMM-YY", first 7 chars = "DD-MMM-", then century+2digit year
  return `${dayName} ${day}-${month}-${fullYear} ${hours}:${minutes}:${seconds}`;
}

/**
 * Format date/time the way express does: "Mon Jan 07 14:32:00 2026".
 * 1:1 port of MiscFuncs.e:343-364 formatCDateTime().
 *
 * It LOOKS like C's ctime and is not built like it. MiscFuncs.e:361 assembles
 * the string out of the AmigaDOS pieces:
 *
 *   StringF(outDateStr,'\s[3] \s[3] \s[2] \s \d\s',
 *           daystr, datestr+3, datestr, timestr, century, datestr+7)
 *
 * with FORMAT_DOS, where daystr="Monday", datestr="07-Jan-26",
 * timestr="14:32:00" - so the day of month is the FIRST TWO CHARACTERS OF THE
 * DOS DATE, which is zero-padded. C's ctime pads it with a space instead
 * ("Jan  7"), and this used to copy C rather than express: a door asking for
 * DT_STAMP_LASTON got a day the real board never writes.
 *
 * Exactly 24 characters, which is what fits WarOLM's `%-24.24s` field.
 *
 * Audit H-CDateTime flagged the shape before that (`date.toISOString()`) as
 * wrong for the AmigaOS-compat surface. Use `date.toISOString()` directly
 * elsewhere if you need ISO 8601, and `formatLongDateTime` for express's
 * OTHER date format ("Mon 07-Jan-2026 14:32:00", MiscFuncs.e:320-341) - the
 * two are not interchangeable and both are express's.
 *
 * @param date - Date to format
 * @returns "DDD MMM DD HH:MM:SS YYYY"
 */
export function formatCDateTime(date: Date): string {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const dayName = dayNames[date.getDay()];
  const month = monthNames[date.getMonth()];
  // MiscFuncs.e:361 takes `\s[2]` of the FORMAT_DOS date string, which is
  // "07-Jan-26" - zero-padded, not the space-padded day C's ctime writes.
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const year = date.getFullYear();

  return `${dayName} ${month} ${day} ${hours}:${minutes}:${seconds} ${year}`;
}

/**
 * Convert Amiga DateStamp to JavaScript Date
 * Equivalent to MiscFuncs.e dateStampToDateTime()
 *
 * Express.e usage: 4 instances
 *
 * Amiga DateStamp structure:
 * - days: Number of days since January 1, 1978
 * - minutes: Number of minutes since midnight
 * - ticks: Number of ticks (1/50 second) since start of minute
 *
 * @param days - Days since 1978-01-01
 * @param minutes - Minutes since midnight
 * @param ticks - Ticks (1/50 second) since start of minute
 * @returns JavaScript Date object
 */
export function dateStampToDateTime(days: number, minutes: number, ticks: number): Date {
  // A DateStamp is the machine's LOCAL wall clock (see dateTimeToDateStamp):
  // work the calendar out with plain arithmetic, then read those fields as
  // local time, so the instant comes back in the board's own zone.
  const wall = new Date(Date.UTC(1978, 0, 1) + days * 86400000 + minutes * 60000 + ticks * 20);
  return new Date(
    wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate(),
    wall.getUTCHours(), wall.getUTCMinutes(), wall.getUTCSeconds(), wall.getUTCMilliseconds(),
  );
}

/**
 * Convert JavaScript Date to Amiga DateStamp
 * Inverse of dateStampToDateTime()
 *
 * @param date - JavaScript Date to convert
 * @returns Object with days, minutes, ticks
 */
export function dateTimeToDateStamp(date: Date): { days: number; minutes: number; ticks: number } {
  /*
   * THE AMIGA'S CLOCK IS THE LOCAL WALL CLOCK. An Amiga has no time zone: its
   * battery clock is set to the time on the wall, and DateStamp counts days
   * and minutes of THAT. This counted UTC, so every door read the board's
   * time two hours behind in a Swedish summer - QuickNew printed "Time :
   * 19:48:21" at 21:48 (the telnet regression suite, 2026-09-27) - long after
   * the board itself was put on local time. The wall clock's fields are taken
   * in the process's zone (TZ, docker-compose.yml) and counted as plain
   * calendar arithmetic, which is what the DateStamp readers already do.
   */
  const wallMs = Date.UTC(
    date.getFullYear(), date.getMonth(), date.getDate(),
    date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds(),
  );
  const sinceEpoch = wallMs - Date.UTC(1978, 0, 1);
  const days = Math.floor(sinceEpoch / 86400000);
  const intoDay = sinceEpoch - days * 86400000;
  return {
    days,
    minutes: Math.floor(intoDay / 60000),
    ticks: Math.floor((intoDay % 60000) / 20), // 1 tick = 20 ms
  };
}

/**
 * Format duration in seconds as "HH:MM:SS"
 * Useful for displaying elapsed time, session duration, etc.
 *
 * @param seconds - Duration in seconds
 * @returns Formatted duration "HH:MM:SS"
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Format date as "DD/MM/YYYY" (alternative format)
 * @param date - Date to format
 * @returns Formatted date string "DD/MM/YYYY"
 */
export function formatShortDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  return `${day}/${month}/${year}`;
}

/**
 * Format time as "HH:MM" (short format without seconds)
 * @param date - Date to format
 * @returns Formatted time string "HH:MM"
 */
export function formatShortTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${hours}:${minutes}`;
}

/**
 * A two-digit year, as the board itself decides the century.
 *
 * AmiExpress writes dates through AmigaDOS DateToStr, which yields a two-digit
 * year, and rebuilds the century on the way out with
 * `IF dt.stamp.days>=8035 THEN 20 ELSE 19` (MiscFuncs.e:338). 8035 days after
 * the Amiga epoch of 1978-01-01 is 2000-01-01, so the board's own rule is:
 * anything before 2000 is 19xx and anything from 2000 on is 20xx. In
 * two-digit terms that puts 78..99 in the 1900s and 00..77 in the 2000s.
 *
 * Not a guess and not a rolling window: a board's logs can start in 1990 and
 * run to now, and this is the same line the board draws.
 */
export function expandAmigaYear(twoDigitYear: number): number {
  if (twoDigitYear >= 100) return twoDigitYear;
  return twoDigitYear >= 78 ? 1900 + twoDigitYear : 2000 + twoDigitYear;
}
