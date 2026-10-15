/**
 * The one AmigaDOS command-line parser.
 *
 * Execute(), SystemTagList() and the batch scheduler all take a shell line:
 *
 *     "C:LHA" >NIL: -F t "Work:a b.lha"
 *     quicknew >bbs:screens/quicknew.txt 1
 *     sort <in.txt >>out.txt
 *
 * The shell, not the program, strips redirections, and it does so wherever
 * they stand in the line. Quotes group words, and a redirect target may be
 * quoted too. Everything outside quotes that is `>`, `>>` or `<` starts a
 * redirection whose target is the rest of that word (or the next word).
 *
 * Each word is returned twice: `value` (quotes removed) for programs that
 * resolve paths, and `raw` (quotes kept) for doors that parse their own
 * argument shapes such as `-UC"0" -O"path"15`.
 */

export interface CommandWord {
  /** The word with its quotes removed. */
  value: string;
  /** The word exactly as written, quotes included. */
  raw: string;
}

export interface OutputRedirect {
  path: string;
  /** `>>` rather than `>` */
  append: boolean;
}

export interface ParsedCommandLine {
  /** First word, quotes removed ('' for an empty line). */
  program: string;
  /** The words after the program, quotes removed. */
  args: string[];
  /** The words after the program, quotes kept. */
  rawArgs: string[];
  /** Every word, program first. */
  words: CommandWord[];
  /** The line with the redirections cut out, for code that still wants text. */
  commandText: string;
  /** `>file` / `>>file`; the last one wins, as in the shell. */
  stdout?: OutputRedirect;
  /** `<file`; the last one wins. */
  stdin?: string;
}

function isSpace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n';
}

export function parseAmigaCommandLine(line: string): ParsedCommandLine {
  const words: CommandWord[] = [];
  const kept: string[] = []; // source text of everything that is not a redirection
  let stdout: OutputRedirect | undefined;
  let stdin: string | undefined;

  let i = 0;
  const n = line.length;

  /** Read one word starting at i (quotes group, whitespace and redirects end it). */
  const readWord = (stopAtRedirect: boolean): CommandWord | null => {
    let value = '';
    let raw = '';
    let inQuotes = false;
    let started = false;
    while (i < n) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
        started = true;
        raw += ch;
        i++;
        continue;
      }
      if (!inQuotes && (isSpace(ch) || (stopAtRedirect && (ch === '>' || ch === '<')))) break;
      value += ch;
      raw += ch;
      started = true;
      i++;
    }
    return started ? { value, raw } : null;
  };

  while (i < n) {
    const ch = line[i];
    if (isSpace(ch)) {
      i++;
      continue;
    }
    if (ch === '>' || ch === '<') {
      const out = ch === '>';
      i++;
      let append = false;
      if (out && line[i] === '>') {
        append = true;
        i++;
      }
      while (i < n && isSpace(line[i])) i++;
      const target = readWord(true);
      if (target && target.value) {
        if (out) stdout = { path: target.value, append };
        else stdin = target.value;
      }
      continue;
    }
    const word = readWord(true);
    if (word) {
      words.push(word);
      kept.push(word.raw);
    }
  }

  return {
    program: words[0]?.value ?? '',
    args: words.slice(1).map((w) => w.value),
    rawArgs: words.slice(1).map((w) => w.raw),
    words,
    commandText: kept.join(' '),
    stdout,
    stdin,
  };
}
