/**
 * Text as the board shows it: a FILE_ID.DIZ, a DIR description - Amiga art
 * drawn character by character in Topaz, which only lines up in Topaz.
 *
 * The sysop, 2026-09-29, on the File lists page: "the file_id's needs to use
 * the topaz font to make sense". Topaz is the board's face, not the
 * interface's (design-system-usage: "dont use topaz for the ui only for the
 * art"), so it lives here, on the board's text, and nowhere on a page.
 */
export interface BoardTextProps {
  lines: string[];
  className?: string;
}

export function BoardText({ lines, className = '' }: BoardTextProps) {
  return (
    <pre className={`font-topaz whitespace-pre leading-tight text-content-primary ${className}`}>
      {lines.join('\n')}
    </pre>
  );
}
