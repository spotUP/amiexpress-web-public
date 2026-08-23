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
#
# Coverage on the 3301-row catalog: 77% version, 42% author, 100% plain text.
# Known gaps: block selection can fuse art-heavy DIZ lines (-L-OFFL.LHA,
# KLR_BD14.LHA), and binary_name sometimes names a helper file rather than the
# door (that is a corpus-builder bug, not a renderer bug).

import sqlite3, re, io
FRAME = " :-*()[]|_=+~<>.,'\"`^¦·°#!?/\\"
ART = re.compile(r'^[\s_\-=*#~/\\|:.,+()\[\]<>\'"`^¦°·;!?%$&@]*$')
BANNER = re.compile(r'\b(presents?|brings?|proudly|releases?|bringing|presenting)\b', re.I)
# lines that are credits / distribution / dates, never a description
JUNK = re.compile(r'passed\s+thr|courier|released?\s+(on|at|by)|\bthanx|greets?\b|'
                  r'\bdate\b|\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b|'
                  r'^\s*(by|coded\s+by|written\s+by)\b|'
                  r'\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*,?\s*\d', re.I)
HANDLE = re.compile(r'^[A-Za-z0-9!._\-]{2,20}\s*[\^/]\s*[A-Za-z0-9!._\-]{2,20}$')  # sNoW^5D, Jordan/5D
VERSIONISH = re.compile(r'\bv?\d+\.\d+\b', re.I)
DOORISH = re.compile(r'\b(door|tool|util|utility|wall|scan|stat|list|chat|game|edit|menu|logon|logoff|'
                     r'upload|download|msg|mail|page|check|info|view|manager|maker)\w*\b', re.I)

def alnum_share(s):
    return (sum(c.isalnum() for c in s) / len(s)) if s else 0

def clean(s):
    return re.sub(r'\s+', ' ', s).strip(FRAME).strip()

def score(line):
    c = clean(line)
    if not c or ART.match(c): return -99, c
    if not re.search(r'[A-Za-zÀ-ÿ]{3}', c): return -99, c
    if alnum_share(c) < 0.5: return -99, c
    if len(c) < 6: return -50, c
    s = 0
    if JUNK.search(c): s -= 40
    if HANDLE.match(c): s -= 40
    if VERSIONISH.search(c): s += 12
    if DOORISH.search(c): s += 8
    words = len(re.findall(r'[A-Za-zÀ-ÿ]{3,}', c))
    s += min(words, 6) * 3
    if len(c) > 55: s -= 4
    return s, c

def describe(diz, binary, name, archive):
    lines = [l for l in (diz or '').replace('\r','').split('\n')]
    scored = []
    for i, l in enumerate(lines):
        sc, c = score(l)
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
    prog = pc if (len(pc) >= 3 and len(re.findall(r'[A-Za-zÀ-ÿ]', pc)) >= 3 and alnum_share(pc) > 0.5) else None
    if prog and body and prog.lower() not in body.lower(): out = f"{prog} - {body}"
    elif prog: out = prog
    elif body: out = body
    elif name and score(name)[0] > 0: out = clean(name)
    else: out = archive.rsplit('.',1)[0]
    # A chosen line can still start with the banner word itself
    # ("PRESENTS : ACCOUNT ED"). Strip it - the group is not the door.
    out = re.sub(r'^(presents?|brings?|proudly|releases?|presenting|bringing)\b[\s:.\-]*', '', out, flags=re.I)
    out = clean(out)[:60]
    # drop trailing orphan symbols/single chars left by scene decoration
    out = re.sub(r'(\s+[^A-Za-z0-9À-ÿ]{1,3})+$', '', out)
    return out.strip(FRAME).strip()


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
    desc = re.sub(r'\s+', ' ', desc)
    desc = re.sub(r'\s*([-|:/])\s*$', '', desc).strip(FRAME).strip()
    return desc, (found or '')


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
    out = []
    for ch in s:
        if ch.isalnum() or ch in ALLOWED_PUNCT:
            out.append(ch)
        elif ch in '\u00d7\u00f7':      # multiplication/division signs used as bullets
            out.append(' ')
        else:
            code = ord(ch)
            # keep Latin-1 letters (accented), drop Latin-1 symbols
            if 0xC0 <= code <= 0xFF and ch.isalpha():
                out.append(ch)
            else:
                out.append(' ')
    t = re.sub(r'\s+', ' ', ''.join(out))
    t = re.sub(r'\s*([-/])\s*$', '', t)
    # a lone trailing character is scene ornament, not a word ("Viewer ß")
    t = re.sub(r'\s+[^\sA-Za-z0-9]$', '', t)
    t = re.sub(r'\s+([b-hj-z])$', '', t, flags=re.I)
    return t.strip(FRAME).strip()


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
        raw = (m.group(1) or '').strip(FRAME).strip()
        # a credit runs to the end of the line; trim only trailing clauses
        # that clearly are not part of a handle ("for /X", a version, a year)
        cand = AUTHOR_TAIL.sub('', raw).strip(FRAME).strip()
        cand = re.sub(r'\s+', ' ', cand)
        if cand and len(cand) <= 40 and len(re.findall(r'[A-Za-z0-9]', cand)) >= 2:
            found = cand
            desc = (desc[:m.start()] + ' ' + desc[m.end():])
    if not found and catalog_author and catalog_author.strip():
        found = catalog_author.strip()
    desc = re.sub(r'\s+', ' ', desc).strip(FRAME).strip()
    return desc, (found or '')


def describe_block(diz, name, archive, cap=70):
    """Pick the best PARAGRAPH, not the best line.

    DIZ descriptions wrap across lines behind decoration ("<<<<<<< very
    cool . checks zip files for" continues on the next row), so choosing a
    single line yields a mid-sentence fragment. Group consecutive prose
    lines into blocks, score the block, and read from its start.
    """
    lines = [clean(l) for l in (diz or '').replace('\r','').split('\n')]
    blocks, cur = [], []
    for i, l in enumerate(lines):
        sc, c = score(l)
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
    best = max(blocks, key=block_score)
    parts = [c for _, _, c in best]
    # strip a leading banner word and any "1." numbering from the opener
    parts[0] = re.sub(r'^(presents?|brings?|proudly|releases?|presenting|bringing)\b[\s:.\-]*', '', parts[0], flags=re.I)
    parts[0] = re.sub(r'^\d{1,2}[.)]\s+', '', parts[0]).strip(FRAME).strip()
    # A first line that already stands on its own IS the description - only
    # keep appending when it is too short to mean anything by itself.
    text = parts[0]
    for nxt in parts[1:]:
        if len(text) >= 30: break
        text = f"{text} {nxt}"
    text = re.sub(r'\s+', ' ', text).strip()
    if len(text) > cap:
        text = text[:cap].rsplit(' ', 1)[0]
    return text.strip(FRAME).strip()


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
        return prog[:m.start()].strip(FRAME).strip()
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
    rest = [w for w in re.findall(r"[A-Za-zÀ-ÿ0-9']+", body)
            if w.lower() not in FILLER and squash(w) not in sp]
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
