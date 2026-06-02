/**
 * AmigaGuide viewer for the DOORMAN blessed UI.
 *
 * Wraps web/backend/src/amigaguide/AmigaGuideParser.ts in a blessed UI
 * with node navigation and keyboard-selectable links.
 *
 * Keys:
 *   ↑/↓/PgUp/PgDn — scroll content
 *   Tab / ↓ (in link area) — cycle through links
 *   Enter — follow selected link
 *   1-9 — follow link by number
 *   B — back,  N — next,  P — prev,  C — contents,  H — help
 *   Q / ESC — close
 */
export declare function showAmigaGuideViewer(screen: any, raw: string, title: string, onDone: () => void): void;
//# sourceMappingURL=AmigaGuideViewer.d.ts.map