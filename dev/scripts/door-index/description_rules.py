# BBS Doors index: description / version / author extraction rules.
#
# NOT the shipping implementation - this is the reference prototype the door
# server's src/index-tsv.ts must be brought in line with. Tuned across fifteen
# rounds of corrections from the catalog's owner against real rows; every rule
# exists because a specific row read wrong:
#
#   - group tags stripped, but only tags DERIVED FROM THE CORPUS (213 prefixes
#     appearing on 3+ archives), so "MB-MAKER"/"pizza_taxi" keep their names
#   - CamelCase split ("SendMessage" -> "Send Message") but NOT scene
#     mixed-case ("KiLLER", "sTc", "AmiQWK")
#   - elite casing normalised ("dOOR 4 dAYdREAM" -> "Door 4 Daydream") with an
#     acronym allowlist (XIM, BBS, QWK, /X) and ALL-CAPS de-shouting
#   - decoration stripped (guillemets, middots, bars) but ACCENTED LETTERS kept
#   - the best PARAGRAPH is chosen, not the best line: DIZ descriptions wrap
#   - the release banner is skipped: the first wordy line names the GROUP, and
#     the door's name is on the line after it
#   - versions from prefixed ("V1.05"), bare ("MOBNUP 1.9"), the program name
#     ("aereg106") and finally the archive filename. A version after "/X" or
#     "for" is the BBS's REQUIREMENT, not the door's, and stays in the prose
#   - authors to their own column, handles cleaned ("/X\\ardanpet" -> ardanpet)
#   - a body that only restates the program name collapses to the name
#   - a DIZ line is a BOX ROW, scored by its best CELL: the cells either side
#     of a border run ("]-----[") are independent, so neither the border nor
#     the neighbouring cell can bleed into the description
#   - release metadata goes ("[RELEASE 2]"), brackets emptied by extraction go
#     ("(Version )"), and the 60-character cap cuts on a word boundary so it
#     can never sever a bracket group into "[RELEASE 2"
#   - a mid-line banner splits the row: "<handle> BRiNGS: <door>" puts the
#     handle in the author column and the door in the description
#   - a compatibility note ("Now working on /X 3.30") is true but is not a
#     description, and loses to the line that names the door
#
# Run the regression tests after any change here:
#     python3 dev/scripts/door-index/test_description_rules.py
# and re-render with dev/scripts/door-index/render_index.py to diff the whole
# catalog before/after - every rule above was found by reading that diff.
#
# Coverage on the 3301-row catalog: 77% version, 43% author, 100% plain text.
# Known gaps: block selection can fuse art-heavy DIZ lines (-L-OFFL.LHA,
# KLR_BD14.LHA), and binary_name sometimes names a helper file rather than the
# door (that is a corpus-builder bug, not a renderer bug).

import sqlite3, re, io
FRAME = " :-*()[]|_=+~<>.,'\"`^¦¬·°#!?/\\"
ART = re.compile(r'^[\s_\-=*#~/\\|:.,+()\[\]<>\'"`^¦°·;!?%$&@]*$')
BANNER = re.compile(r'\b(presents?|brings?|proudly|releases?|bringing|presenting)\b', re.I)
# lines that are credits / distribution / dates, never a description
JUNK = re.compile(r'passed\s+thr|courier|released?\s+(on|at|by)|\bthanx|greets?\b|'
                  r'\bdate\b|\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b|'
                  r'^\s*(by|coded\s+by|written\s+by)\b|'
                  r'\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*,?\s*\d', re.I)
# A note about which BBS version the door runs on - true, useful, and still
# not a description of what the door DOES.
COMPAT = re.compile(r'\b(?:now\s+work(?:s|ing)|works?\s+(?:only\s+)?(?:with|on)|requires?|needs?)\b.{0,12}\b(?:/?X|amiexpress|fame|daydream|\d)', re.I)
# A copyright/credit line is attribution, not a description.
COPYRIGHT = re.compile(r'©|\(c\)', re.I)
HANDLE = re.compile(r'^[A-Za-z0-9!._\-]{2,20}\s*[\^/]\s*[A-Za-z0-9!._\-]{2,20}$')  # sNoW^5D, Jordan/5D
VERSIONISH = re.compile(r'\bv?\d+\.\d+\b', re.I)
DOORISH = re.compile(r'\b(door|tool|util|utility|wall|scan|stat|list|chat|game|edit|menu|logon|logoff|'
                     r'upload|download|msg|mail|page|check|info|view|manager|maker)\w*\b', re.I)

# ─── a box row is CELLS, not a sentence ────────────────────────────────
# A DIZ line is a row of an ASCII box. "+[ MYSTiC /X-POWER ]-----[ JoinCnf
# 4.0 ]---+" holds two INDEPENDENT cells either side of a border run, and
# ".---\\/---\\/-/X-pOwEr!-\\/^-----|" is a border with one word trapped in
# it. Scoring the whole row drags the border and the neighbouring cell into
# the description ("Mystic /POWER ]-----[ Joincnf"), or lets a word caught
# in a border open a block that then swallows the real line. Split the row
# on border runs and pillars, and judge each cell alone: the door's name
# lives in ONE cell.
CELL_SPLIT = re.compile(r'[|¦]+|[\[\]]?\s*[-_=~*^/\\¬]{3,}(?![Xx](?![A-Za-zÀ-ÿ]))\s*[\[\]]?|\]\s*\[')

# Publishing metadata, not description: the release sequence number a group
# stamps on a box ("[RELEASE 2]", "[DISK 1/2]"), and a bracket left empty by
# pulling its contents into a column of their own ("(Version 2.0)" becomes
# "(Version )" once the version is extracted).
META_BRACKET = re.compile(r'[\[(]\s*(?:release|rel\.?|disk|part|file)\s*\d+(?:\s*(?:of|/)\s*\d+)?\s*[\])]?', re.I)
EMPTY_BRACKET = re.compile(r'[\[(]\s*(?:version|ver|v|rel|no)?\s*[.:]?\s*(?:[\])]|$)', re.I)


def drop_meta_brackets(s):
    if not s: return s
    s = META_BRACKET.sub(' ', s)
    s = EMPTY_BRACKET.sub(' ', s)
    return re.sub(r'\s+', ' ', s).strip()


def _strip_frame(s):
    """strip(FRAME), except for a closing bracket that HAS its opener.

    FRAME contains ")" and "]", so a plain strip turns "MultiTop (Version
    2.0)" into "MultiTop (Version 2.0" - it unbalances the very brackets the
    next rule then has to repair, and the repair loses the text.
    """
    if not s:
        return s
    while s:
        ch = s[-1]
        if ch not in FRAME:
            break
        if ch in ')]':
            opener = '(' if ch == ')' else '['
            head = s[:-1]
            if head.count(opener) > head.count(ch):
                break                      # matched pair - leave it alone
        s = s[:-1]
    while s and s[0] in FRAME and not XNAME.match(s):
        s = s[1:]
    return s.strip()


def finalise(s, cap=60):
    """Cap the description without leaving a scar.

    Cutting at exactly `cap` characters severed "[RELEASE 2]" into
    "[RELEASE 2" - a bracket opened and never closed reads as corruption.
    Cut on a word boundary, then drop any group left hanging open.
    """
    s = _strip_frame(drop_meta_brackets(re.sub(r'\s+', ' ', s or '').strip()))
    if len(s) > cap:
        cut = s[:cap]
        if ' ' in cut:
            cut = cut.rsplit(' ', 1)[0]
        s = cut
    # A bracket opened and never closed is either a truncation scar or a
    # credit tag whose closer the frame-strip already ate ("[-5th Dynasty-]"
    # arrives as "[-5th Dynasty"). Drop it - but only when what follows the
    # opener is a short tag, never when real prose follows it, or
    # "5D-User V1.10 [-5th Dynasty Command to list all users" would lose the
    # description along with the tag.
    for op, cl in (('[', ']'), ('(', ')')):
        i = s.rfind(op)
        if i == -1 or s.find(cl, i) != -1:
            continue
        tail = s[i + 1:]
        if len(tail) <= 24 and len(re.findall(r"[A-Za-zÀ-ÿ0-9']+", tail)) <= 3:
            s = s[:i]                      # a tag: "[-5th Dynasty"
        else:
            s = s[:i] + s[i + 1:]          # prose: drop the bracket, keep the words
    # Removing a credit tag can leave the word that introduced it dangling
    # ("Adi Menu V1.0 by"). A trailing connector is not a description.
    s = re.sub(r'[\s,;:-]*\b(?:coded|written|programmed|created|made|done)?\s*'
               r'(?:by|from|for|with|of|and)\s*$', '', s, flags=re.I)
    return _strip_frame(s)


WORD = re.compile(r'[A-Za-zÀ-ÿ]*[A-Za-z][A-Za-zÀ-ÿ]*[A-Za-z][A-Za-zÀ-ÿ]*')


def high_bit_share(s):
    """Share of characters above ASCII. Scene box art is drawn with them."""
    return (sum(ord(c) > 0x7f for c in s) / len(s)) if s else 0


def alnum_share(s):
    return (sum((c.isascii() and c.isalnum()) or (0xC0 <= ord(c) <= 0xFF and c.isalpha())
                for c in s) / len(s)) if s else 0

# ANSI colour sequences ride along in DIZ text ("ESC[33m") and are invisible
# in a terminal but not in a package listing.
ANSI = re.compile(r'\x1b\[[0-9;]*[A-Za-z]|\x1b')


# "/X" IS the name of the BBS (short for AmiExpress), so the slash is part of
# a word, not frame decoration. Stripping it turned "/X dIVISION" into
# "X Division" on 47 rows.
XNAME = re.compile(r'^/[Xx](?![A-Za-zÀ-ÿ])')


def strip_frame_both(s):
    """strip(FRAME) at both ends, without eating the slash of "/X"."""
    while s and s[-1] in FRAME:
        s = s[:-1]
    while s and s[0] in FRAME and not XNAME.match(s):
        s = s[1:]
    return s


def clean(s):
    s = ANSI.sub('', s)
    s = re.sub(r'[\x00-\x1f\x7f]', ' ', s)
    return strip_frame_both(re.sub(r'\s+', ' ', s).strip()).strip()

def score(line):
    c = clean(line)
    if not c or ART.match(c): return -99, c
    # A 3-letter run is not enough on its own: CP437/Amiga box art
    # ("³Y³ Óääù Ð Á") lands in the Latin-1 letter range and passes that
    # test. Real words in this corpus are ASCII with the odd accent, so
    # demand at least two ASCII letters inside the run.
    if not WORD.search(c): return -99, c
    if high_bit_share(c) > 0.3: return -99, c
    if alnum_share(c) < 0.5: return -99, c
    if len(c) < 6: return -50, c
    s = 0
    if JUNK.search(c): s -= 40
    if COPYRIGHT.search(c): s -= 40
    if COMPAT.search(c): s -= 20      # "Now working on /X 3.30" is a compatibility note
    if HANDLE.match(c): s -= 40
    if VERSIONISH.search(c): s += 12
    if DOORISH.search(c): s += 8
    words = len(re.findall(r'[A-Za-zÀ-ÿ]{3,}', c))
    s += min(words, 6) * 3
    if len(c) > 55: s -= 4
    # "Added Features:" heads a list, it does not describe the door. The
    # colon is tested on the RAW line because clean() strips it off.
    if re.search(r':[\s|¦:.]*$', line): s -= 6
    return s, c

def best_cell(line):
    """Score a box row by its best CELL, falling back to the whole row when
    there is no border inside it.

    A cell torn out of a border must stand on its own to count: two words,
    or one word carrying a version or a door word ("JoinCnf 4.0"). That is
    what keeps "/X-pOwEr!" and "mYSTIC!" - single words trapped in border
    art - from being read as descriptions.
    """
    parts = CELL_SPLIT.split(line)
    if len(parts) <= 1:
        return score(line)
    best = (-99, '')
    for part in parts:
        sc, c = score(part)
        if sc <= -50:
            continue
        words = len(re.findall(r'[A-Za-zÀ-ÿ]{3,}', c))
        if words < 2 and not (words and (VERSIONISH.search(c) or DOORISH.search(c))):
            continue
        if sc > best[0]:
            best = (sc, c)
    return best


def looks_like_program(prog):
    """Does a program name actually look like a name?

    binary_name is sometimes a stray token like "8" or "." - which made a
    useless "8 - real description" prefix. Three characters, three letters,
    mostly alphanumeric.
    """
    p = prog or ''
    return len(p) >= 3 and len(re.findall(r'[A-Za-zÀ-ÿ]', p)) >= 3 and alnum_share(p) > 0.5


def describe(diz, binary, name, archive):
    lines = [l for l in (diz or '').replace('\r','').split('\n')]
    scored = []
    for i, l in enumerate(lines):
        sc, c = best_cell(l)
        if sc <= -50: continue
        # a line right after a banner is likely the door's own name
        if i > 0 and BANNER.search(lines[i-1]): sc += 10
        scored.append((sc, i, c))
    body = None
    if scored:
        best = max(scored, key=lambda t: (t[0], -t[1]))
        if best[0] > 0: body = best[2]
    pc = clean(binary or '')
    # a program name must actually look like a name: 3+ chars with 3+ letters.
    # binary_name is sometimes a stray token like "8" or ".", which made a
    # useless "8 - real description" prefix.
    prog = pc if looks_like_program(pc) else None
    if prog and body and prog.lower() not in body.lower(): out = f"{prog} - {body}"
    elif prog: out = prog
    elif body: out = body
    elif name and score(name)[0] > 0: out = clean(name)
    else: out = archive.rsplit('.',1)[0]
    # A chosen line can still start with the banner word itself
    # ("PRESENTS : ACCOUNT ED"). Strip it - the group is not the door.
    out = re.sub(r'^(presents?|brings?|proudly|releases?|presenting|bringing)\b[\s:.\-]*', '', out, flags=re.I)
    out = finalise(clean(out))
    # drop trailing orphan symbols/single chars left by scene decoration
    out = re.sub(r'(\s+[^A-Za-z0-9À-ÿ]{1,3})+$', '', out)
    return strip_frame_both(out).strip()


# ─── version extraction ────────────────────────────────────────────────
# Scene DIZ files spell versions loosely: "V1.05", "v 1.51", "V3.0", and
# even "v1.o5" with a letter o for zero. Pull it into its own column and
# take it OUT of the description - a package manager wants it as data.
VER_RE = re.compile(r"(?<![A-Za-z0-9.])[vV]\s?\.?\s?(\d{1,2}[.,][0-9oO]{1,3}[a-zA-Z]?)(?![0-9])"
                    r"|(?<![A-Za-z0-9.])[vV]\s?(\d{1,2})(?![0-9.])")

def normalise_version(raw):
    v = raw.strip().lower().replace(',', '.')
    v = re.sub(r'o', '0', v)                 # v1.o5 -> v1.05
    return v

# A bare "1.9" straight after a word is a version too ("MOBNUP 1.9 Nup
# handler"), but "/X 4.x" and "3-4.X" are the BBS's version, not the door's.
BARE_VER = re.compile(r'(?<![\w./-])(\d{1,2}[.,]\d{1,2}[a-z]?)(?![\w.])')
BBS_CONTEXT = re.compile(r'(?:/X|amiexpress|ami|s!x|fame|daydream|for)\s*$', re.I)

def split_version(desc, catalog_version):
    """Return (description_without_version, version_or_empty)."""
    found = None
    # A version right after "/X", "for", "S!X", "FAME" etc. is the BBS's
    # requirement, not the door's: "for /X V3.00+ ... NUP Finder V1.0".
    # Skip those and take the door's own.
    m = None
    for vm in VER_RE.finditer(desc):
        if BBS_CONTEXT.search(desc[:vm.start()]):
            continue
        m = vm
        break
    if not m:
        for bm in BARE_VER.finditer(desc):
            if BBS_CONTEXT.search(desc[:bm.start()]):
                continue                     # that is the BBS version
            m = bm
            break
    if m:
        found = normalise_version(m.group(1) or m.group(2))
        desc = (desc[:m.start()] + ' ' + desc[m.end():])
    if not found and catalog_version and catalog_version.strip():
        found = normalise_version(catalog_version)
    desc = drop_meta_brackets(re.sub(r'\s+', ' ', desc))
    desc = re.sub(r'\s*([-|:/])\s*$', '', strip_frame_both(desc)).strip()
    return desc, (found or '')


# ─── which BBS the door needs ──────────────────────────────────────────
# "For /X 2.3x", "/X 3.x+", "requires AmiExpress 4.x" - the BBS version a
# door was coded against is the single fact a sysop needs before installing
# it, and it is NOT the door's own version. Pull it into its own field so a
# listing can filter on it, the same way the door's version was pulled out.
BBS_NAMES = {'/x': '/X', 'x': '/X', 'ami-express': 'AmiExpress', 'amiexpress': 'AmiExpress',
             'ae': '/X', 's!x': 'S!X', 'sx': 'S!X', 'fame': 'FAME',
             'daydream': 'DayDream', 'dd': 'DayDream', 'dreamdoor': 'DayDream'}
BBS_REQ = re.compile(
    r'(?:\b(?:for|only\s+for|requires?|required|needs?|works?\s+(?:only\s+)?(?:with|on)|'
    r'coded\s+for|written\s+for|compatible\s+with)\b\s*[:\-]?\s*)?'
    r'(?<![A-Za-zÀ-ÿ0-9])(/X|Ami-?Express|S!X|FAME|DayDream|AE|X)\s*'
    r'(?:v(?:er(?:sion)?)?\.?\s*)?'
    r'(\d{1,2}(?:[.,](?:[0-9]{1,3}[a-z]?|[xX]{1,3}))?\+?)', re.I)


def normalise_requirement(name, ver):
    name = BBS_NAMES.get(name.lower().replace('-', ''), name)
    ver = ver.replace(',', '.')
    head, _, tail = ver.partition('.')
    if tail:
        ver = f"{head}.{tail.replace('X', 'x')}"      # 4.X and 4.x are one thing
    return f"{name} {ver}"


def split_bbs_requirement(desc):
    """Return (description_without_requirement, requirement_or_empty).

    "Sexystat For /X 2.3x" -> ("Sexystat", "/X 2.3x").
    """
    if not desc:
        return desc, ''
    m = BBS_REQ.search(desc)
    if not m:
        return desc, ''
    req = normalise_requirement(m.group(1), m.group(2))
    rest = (desc[:m.start()] + ' ' + desc[m.end():])
    rest = strip_frame_both(re.sub(r'\s+', ' ', rest)).strip()
    # A row that says nothing BUT which BBS it needs keeps saying it: the
    # requirement is then all the description has.
    if not re.search(r'[A-Za-zÀ-ÿ]{3}', rest):
        return desc, req
    return rest, req


def bbs_requirement_from_diz(diz):
    """The requirement is a property of the ARCHIVE, not of the one line that
    got picked as the description - "XIM - /X 3.38+" often sits in the
    bottom border of the box, which no description would ever quote."""
    if not diz:
        return ''
    for raw in diz.replace('\r', '').split('\n'):
        # Raw, minus control codes only: every tidy-up in this module strips
        # frame characters off the ends, and "/X 3.38+" sits flush against
        # the box border - so the "+", the whole difference between "3.38"
        # and "3.38 or later", would be stripped as decoration.
        line = re.sub(r'[\x00-\x1f\x7f]', ' ', ANSI.sub('', raw))
        m = BBS_REQ.search(line)
        if m:
            return normalise_requirement(m.group(1), m.group(2))
    return ''


# ─── program-name prettifying ──────────────────────────────────────────
# binary_name is a FILENAME, so it reads like "5D-SendMessage" or
# "5D_Status.FIM": a group tag, then the door's name run together. Neither
# helps someone browsing a package list. Strip the tag, drop the door-type
# extension, and split the words apart.
DOOR_EXT = re.compile(r'\.(exe|fim|xim|aim|sim|tim|iim|rexx|lha|lzx|lzh|info)$', re.I)
GROUP_TAG = re.compile(r'^[A-Za-z0-9!$^&*]{1,5}[-_^!.]')

# Release-group tags, derived from the corpus itself rather than guessed:
# any prefix that appears on 3 or more archives. This is what stops "MB-MAKER"
# becoming "MAKER" and "pizza_taxi" becoming "taxi" - MB and PIZZA are parts of
# names, not groups, and the data says so.
GROUP_TAGS = set()

def load_group_tags(archive_names):
    counts = {}
    for a in archive_names:
        m = re.match(r'^([A-Za-z0-9!$^&]{1,5})[-_^!]', a)
        if m:
            k = m.group(1).upper()
            counts[k] = counts.get(k, 0) + 1
    GROUP_TAGS.clear()
    GROUP_TAGS.update(k for k, n in counts.items() if n >= 3)
    return len(GROUP_TAGS)

def prettify_program(prog):
    if not prog: return prog
    p = DOOR_EXT.sub('', prog.strip())
    # strip a leading group tag, but only if what remains is still a name
    m = GROUP_TAG.match(p)
    if m:
        tag = m.group(0)[:-1].upper()
        stripped = p[m.end():]
        # only a KNOWN group tag is removed, and only if a name survives
        if tag in GROUP_TAGS and len(re.findall(r'[A-Za-zÀ-ÿ]', stripped)) >= 3:
            p = stripped
    p = p.replace('_', ' ').replace('-', ' ')
    # split runTogether words: aB -> a B, and letter/digit boundaries
    # Split real CamelCase ("SendMessage") but NOT scene mixed-case
    # ("KiLLER", "sTc", "pRESENTS"): only break where the capital begins a
    # lowercase word. Amiga scene text inverts capitals constantly, and a
    # naive camel split mangles it.
    p = re.sub(r'(?<=[a-zà-ÿ]{2})(?=[A-ZÀ-Þ][a-zà-ÿ])', ' ', p)
    p = re.sub(r'(?<=[A-Za-zÀ-ÿ])(?=\d)', ' ', p)
    # an acronym followed by a word: LZXstrip -> LZX strip
    p = re.sub(r'(?<=[A-ZÀ-Þ])(?=[A-ZÀ-Þ][a-zà-ÿ]{2})', ' ', p)
    return re.sub(r'\s+', ' ', p).strip()


def prettify_in_text(text):
    """Rewrite group-prefixed program names wherever they appear in prose.

    A DIZ line often names the door in its filename form - "5D-Who coded by
    sTc/5D" - and prettifying only the binary_name field leaves those raw.
    """
    if not text: return text
    def repl(m):
        tag, rest = m.group(1), m.group(2)
        if tag.upper() not in GROUP_TAGS: return m.group(0)
        return prettify_program(rest)
    return re.sub(r'\b([A-Za-z0-9!$^&]{1,5})[-_^!]([A-Za-z][A-Za-z0-9]{2,})', repl, text)


# ─── plain-text normalisation ──────────────────────────────────────────
# Scene DIZ text is full of decorative symbols - guillemets, middots, bars,
# degree signs - that carry no meaning in a package listing. Strip those,
# but KEEP accented letters: "Grusse" vs "Grüße" is a real distinction and
# ISO-8859-1 holds both.
ALLOWED_PUNCT = set(" .,:;!?'\"()[]/\\-_+&%#@*")

def to_plain(s):
    if not s: return s
    s = ANSI.sub('', s)
    out = []
    for ch in s:
        if (ch.isascii() and ch.isalnum()) or ch in ALLOWED_PUNCT:
            out.append(ch)
        elif ch in '\u00d7\u00f7':      # multiplication/division signs used as bullets
            out.append(' ')
        else:
            code = ord(ch)
            # keep Latin-1 letters (accented), drop Latin-1 symbols - which
            # includes everything below 0xC0 ('³', 'µ', '·'), the range scene
            # art draws its pillars and shades from
            if 0xC0 <= code <= 0xFF and ch.isalpha():
                out.append(ch)
            else:
                out.append(' ')
    t = re.sub(r'\s+', ' ', ''.join(out))
    t = re.sub(r'\s*([-/])\s*$', '', t)
    # a lone trailing character is scene ornament, not a word ("Viewer ß")
    t = re.sub(r'\s+[^\sA-Za-z0-9]$', '', t)
    t = re.sub(r'\s+([b-hj-z])$', '', t, flags=re.I)
    return strip_frame_both(t).strip()


# ─── author extraction ─────────────────────────────────────────────────
# "X Info by WHiZ/LOGiC" -> description "X Info", author "WHiZ/LOGiC".
# The catalog already knows the author for ~1438 rows; the rest carry it
# only as a credit inside the DIZ line.
AUTHOR_RE = re.compile(r'\s*[-,]?\s*\b(?:coded|written|programmed|created|made|done)?\s*by\s+(.+)$', re.I)
# trailing clauses that are not part of a handle: "for /X", "v1.0", "1996"
AUTHOR_TAIL = re.compile(r'\s+(?:for|fuer|fur)\b.*$|\s+v?\d+[.,]\d+.*$|\s+(?:19|20)\d{2}.*$', re.I)

def split_author(desc, catalog_author):
    found = None
    m = AUTHOR_RE.search(desc)
    if m:
        raw = strip_frame_both(m.group(1) or '').strip()
        # a credit runs to the end of the line; trim only trailing clauses
        # that clearly are not part of a handle ("for /X", a version, a year)
        cand = strip_frame_both(AUTHOR_TAIL.sub('', raw)).strip()
        cand = re.sub(r'\s+', ' ', cand)
        if cand and len(cand) <= 40 and len(re.findall(r'[A-Za-z0-9]', cand)) >= 2:
            found = cand
            desc = (desc[:m.start()] + ' ' + desc[m.end():])
    if not found and catalog_author and catalog_author.strip():
        found = catalog_author.strip()
    desc = strip_frame_both(re.sub(r'\s+', ' ', desc)).strip()
    return desc, (found or '')


BANNER_SPLIT = re.compile(r'\b(?:presents?|presenting|brings?|bringing|proudly|releases?)\b\s*[:\-]*\s*', re.I)


def split_banner_credit(text):
    """Split "KiLLraVeN/MYSTiC BRiNGS: KiLLER-BAUD 1.3".

    A banner names WHO released the door before it names the door. Splitting
    on the LAST banner word puts the door in the description and hands the
    credit back as an author when it reads like a handle - the same rule the
    line-picker uses, applied to a banner that sits mid-line instead of on a
    line of its own.
    """
    if not text:
        return text, ''
    last = None
    for m in BANNER_SPLIT.finditer(text):
        last = m
    if not last:
        return text, ''
    after = strip_frame_both(text[last.end():]).strip()
    before = strip_frame_both(text[:last.start()]).strip()
    if len(after) < 4 or not re.search(r'[A-Za-zÀ-ÿ]{3}', after):
        return text, ''
    credit = before if (before and len(before) <= 40 and HANDLE.match(before)) else ''
    return after, credit


def describe_block(diz, name, archive, cap=70, prog=None):
    """Pick the best PARAGRAPH, not the best line.

    DIZ descriptions wrap across lines behind decoration ("<<<<<<< very
    cool . checks zip files for" continues on the next row), so choosing a
    single line yields a mid-sentence fragment. Group consecutive prose
    lines into blocks, score the block, and read from its start.
    """
    lines = [l for l in (diz or '').replace('\r','').split('\n')]
    blocks, cur = [], []
    for i, l in enumerate(lines):
        sc, c = best_cell(l)
        prose = sc > 0 and not JUNK.search(c) and not HANDLE.match(c)
        if prose:
            cur.append((sc, i, c))
        else:
            if cur: blocks.append(cur); cur = []
    if cur: blocks.append(cur)
    if not blocks:
        return describe(diz, '', name, archive)
    def block_score(b):
        best = max(s for s, _, _ in b)
        return best + min(len(b), 4) * 4 - b[0][1]      # earlier blocks win ties
    ranked = sorted(blocks, key=block_score, reverse=True)
    # The top block is often the header cell, which is the door's NAME with
    # its version ("JoinCnf 4.0") - and the name is already its own column.
    # Take the best block that adds something the name does not.
    best = ranked[0]
    if prog:
        for b in ranked:
            if not body_adds_nothing(prog, ' '.join(c for _, _, c in b)):
                best = b
                break
    parts = [c for _, _, c in best]
    # strip a leading banner word and any "1." numbering from the opener
    parts[0] = re.sub(r'^(presents?|brings?|proudly|releases?|presenting|bringing)\b[\s:.\-]*', '', parts[0], flags=re.I)
    parts[0] = strip_frame_both(re.sub(r'^\d{1,2}[.)]\s+', '', parts[0])).strip()
    # DIZ feature lists are bulleted ("o Totally NEW Lay-Out"); the bullet is
    # decoration, and joining two bulleted lines must not read "Lay-Out o
    # Manages up to 256 Cnfs"
    parts = [re.sub(r'^[o*·+]\s+', '', pt) for pt in parts]
    parts = [finalise(pt, cap) for pt in parts]
    parts = [pt for pt in parts if pt]
    if not parts:
        return describe(diz, '', name, archive)
    # A first line that already stands on its own IS the description - only
    # keep appending when it is too short to mean anything by itself.
    text = parts[0]
    for nxt in parts[1:]:
        if len(text) >= 30: break
        text = f"{text} {nxt}"
    text = re.sub(r'\s+', ' ', text)
    text = re.sub(r'\s+[o*·]\s+', ' ', text).strip()
    return finalise(text, cap)


# ─── elite-case normalisation ──────────────────────────────────────────
# Scene text inverts capitals: "aWESOME sYSOP pAGER dOOR 4 dAYdREAM".
# Normalise only words that START lowercase and contain capitals - that
# catches the inverted style while leaving real acronyms alone (AmiQWK,
# LZXstrip, /X, BBS, FIM).
ELITE = re.compile(r'^[a-zà-ÿ][A-Za-zÀ-ÿ]*[A-ZÀ-Þ][A-Za-zÀ-ÿ]*$')

def deelite_word(w, handles=False):
    if not ELITE.match(w):
        return w
    core = re.sub(r'[^A-Za-zÀ-ÿ]', '', w)
    # In an AUTHOR field a short token whose tail is all caps is a group
    # acronym wearing a lowercase hat: lNS -> LNS, dLT -> DLT. In prose the
    # same shape is just an inverted word ("dOOR"), so only do this for
    # handles - otherwise "dOOR" would become "DOOR" instead of "Door".
    if handles and len(core) <= 3 and core[1:].isupper():
        return w.upper()
    return w[0].upper() + w[1:].lower()

def deelite(text, handles=False):
    if not text: return text
    return re.sub(r'[A-Za-zÀ-ÿ]+', lambda m: deelite_word(m.group(0), handles), text)


# Acronyms that must survive case normalisation - they are how these doors
# are actually named and searched for.
ACRONYMS = {'XIM','AIM','SIM','TIM','IIM','FIM','BBS','QWK','LZX','LHA','DMS','CRC','ZIP',
            'ANSI','ASCII','MSG','OLM','ID','FTP','IRC','CPU','RAM','ROM','GUI','MUI','OS',
            'PC','DD','ACP','UD','NUP','AGA','ECS','SX','X','II','III','IV'}
MESSY = re.compile(r'[a-zà-ÿ].*[A-ZÀ-Þ]')

def tidy_word(w, handles=False):
    core = re.sub(r'[^A-Za-zÀ-ÿ]', '', w)
    if not core or core.upper() in ACRONYMS:
        return w
    if handles and len(core) <= 3 and core[1:].isupper() and core[0].islower():
        return w.upper()
    # inverted ("dOOR") or messy ("AiRBYTES") case -> Title case
    for acr in ACRONYMS:
        if len(acr) >= 3 and core.upper().endswith(acr) and len(core) > len(acr):
            return w                      # AmiQWK, LZXstrip: acronym inside the name
    if MESSY.search(w) or (w[0].islower() and any(c.isupper() for c in w)):
        return w[0].upper() + w[1:].lower()
    return w

def tidy_case(text, handles=False):
    """Normalise elite/messy casing and de-shout ALL-CAPS prose."""
    if not text: return text
    out = re.sub(r"[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ']*", lambda m: tidy_word(m.group(0), handles), text)
    letters = [c for c in out if c.isalpha()]
    if letters and sum(c.isupper() for c in letters) / len(letters) > 0.7:
        # shouting: Title-case everything that is not a known acronym
        def unshout(m):
            w = m.group(0)
            return w if re.sub(r'[^A-Za-zÀ-ÿ]','',w).upper() in ACRONYMS else w.capitalize()
        out = re.sub(r"[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ']*", unshout, out)
    return out


AUTHOR_JUNK = re.compile(r'^[^A-Za-zÀ-ÿ0-9]*(?:/?X[\\/])?\s*', re.I)

def clean_author(a):
    """Strip art and system tags that bled into the catalog's author field.

    Real example: the author of LOGON.LHA is stored as "/X\\ardanpet".
    """
    if not a: return ''
    a = to_plain(a)
    a = AUTHOR_JUNK.sub('', a).strip(FRAME).strip()
    return a


VERSION_TAIL = re.compile(r'\s*\d{2,4}[a-z]?$', re.I)

def strip_version_tail(prog, version):
    """Remove a version glued onto the program name: "aereg 106" + 1.06.

    Program names are filenames, so the version is often baked in
    (AEREG106.LHA -> binary AEREG106). Once it is in its own column, keeping
    it in the name is noise - but only strip when the digits actually match
    the version we extracted, so "Snes-Tool 110" is not mangled when no
    version was found.
    """
    if not prog or not version:
        return prog
    m = VERSION_TAIL.search(prog)
    if not m:
        return prog
    digits = re.sub(r'[^0-9]', '', m.group(0))
    flat = re.sub(r'[^0-9]', '', version)
    flat_trim = flat.rstrip('0') or flat        # 2.40 -> "24"
    if digits and flat and (digits == flat or digits.lstrip('0') == flat.lstrip('0')
                            or digits == flat_trim or digits.lstrip('0') == flat_trim.lstrip('0')):
        return strip_frame_both(prog[:m.start()]).strip()
    return prog


FILLER = {'presents','presentz','present','another','tool','door','doors','for','the','a','an',
          'new','brings','bring','by','of','and','is','it','this','x','util','utility','v'}

def squash(s):
    return re.sub(r'[^a-z0-9]', '', (s or '').lower())

def body_adds_nothing(prog, body):
    """True when the description only restates the program name.

    "dreamstatus - Presentz Another /X Tool Dream Status" carries no
    information the name does not already give; the name alone reads better
    in a package list.
    """
    if not prog or not body:
        return False
    sp, sb = squash(prog), squash(body)
    if not sp or sp not in sb:
        return False
    # A version number is not information either - it has its own column -
    # so "JoinCnf 4.0" still says nothing the name does not.
    rest = [w for w in re.findall(r"[A-Za-zÀ-ÿ0-9']+", body)
            if w.lower() not in FILLER and squash(w) not in sp and not w.isdigit()]
    return len(rest) < 2

def capitalise_name(prog):
    """An all-lowercase program name reads better capitalised: dreamstatus
    -> Dreamstatus, logon -> Logon. Names that already carry deliberate
    casing (AmiQWK, LZXstrip) are left alone."""
    if not prog or not prog[0].isalpha():
        return prog
    if prog == prog.lower():
        return prog[0].upper() + prog[1:]
    return prog


def prog_covered_by_body(prog, body):
    """Is the program name actually present in the body AS WORDS?

    A squashed-substring test gives false positives: "logon" appears inside
    "how would you like to log on to your BBS", which then wrongly drops the
    door's name from the row.
    """
    if not prog or not body:
        return False
    bw = [squash(w) for w in re.findall(r"[A-Za-zÀ-ÿ0-9']+", body)]
    pw = [squash(w) for w in re.findall(r"[A-Za-zÀ-ÿ0-9']+", prog) if squash(w)]
    if not pw:
        return False
    joined = ''.join(bw)
    return all(w in bw for w in pw) or (len(pw) == 1 and pw[0] in [''.join(bw[i:i+2]) for i in range(len(bw))])


def body_starts_with_prog(prog, body):
    """Does the body already open with the program name? Then it IS the name
    and prefixing would stutter ("Zippy Search - Zippy Search for /X")."""
    if not prog or not body: return False
    bw = [squash(w) for w in re.findall(r"[A-Za-zÀ-ÿ0-9']+", body)]
    sp = squash(prog)
    acc = ''
    for w in bw[:4]:
        acc += w
        if acc == sp: return True
        if len(acc) > len(sp): break
    return False

def compose(prog, body):
    if prog and (not body or body_adds_nothing(prog, body)):
        return prog
    if prog and body_starts_with_prog(prog, body):
        return body
    if prog and body:
        return f"{prog} - {body}"
    return prog or body


# Archive names almost always encode the version: ACC-V105 -> 1.05,
# 5D-ED121 -> 1.21, LNS-ME13 -> 1.3, AC092 -> 0.92. Used ONLY as a last
# resort, after the DIZ text and the catalog field, and only for digit runs
# that can be read unambiguously - a single trailing digit ("5D-CS3") is as
# likely to be a revision as a version, so it is left alone.
FNAME_VER = re.compile(r'[vV]?(\d{2,3})[a-zA-Z]?$')

def version_from_filename(archive_name):
    stem = re.sub(r'\.(lha|lzx|lzh|zip|dms)$', '', archive_name, flags=re.I)
    stem = re.sub(r'[_\-^!]+$', '', stem)
    m = FNAME_VER.search(stem)
    if not m:
        return ''
    d = m.group(1)
    if len(d) == 3:
        return f"{int(d[0])}.{d[1:]}"          # 105 -> 1.05, 092 -> 0.92
    major, minor = d[0], d[1]
    return f"{int(major)}.{minor}"             # 13 -> 1.3, 20 -> 2.0
