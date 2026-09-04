const FONT_COOKIE = 'bbs_font'
const MODEM_COOKIE = 'bbs_modem_speed'

export function readCookieFont(): string | null {
  const val = readCookie(FONT_COOKIE)
  return val || null
}

export function writeCookieFont(font: string): void {
  writeCookie(FONT_COOKIE, font, 365)
}

export function readCookieModemSpeed(): number | null {
  const val = readCookie(MODEM_COOKIE)
  if (val === null) return null
  const n = parseInt(val, 10)
  return isNaN(n) ? null : n
}

export function writeCookieModemSpeed(bps: number): void {
  writeCookie(MODEM_COOKIE, String(bps), 365)
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(`(?:^|;\\s*)${name}=([^;]*)`)
  return match ? decodeURIComponent(match[1]) : null
}

function writeCookie(name: string, value: string, days: number): void {
  if (typeof document === 'undefined') return
  const expires = new Date(Date.now() + days * 864e5).toUTCString()
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`
}