#!/usr/bin/env python3
"""Regression tests for description_rules.py.

Every case here is a real row the catalog's owner reported as reading wrong,
with the archive's own FILE_ID.DIZ as the input. Run:

    python3 dev/scripts/door-index/test_description_rules.py
"""
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import description_rules as R

# The corpus derives its group tags from the archive names; these are the
# prefixes the real 3301-row catalog yields for the archives used below.
R.load_group_tags(['MST-A.LHA', 'MST-B.LHA', 'MST-C.LHA',
                   '5D-A.LHA', '5D-B.LHA', '5D-C.LHA'])

JC40 = """+[ MYSTiC /X-POWER ]-----[ JoinCnf 4.0 ]---+
\u00a6_/\\___/\\___/\\___                          \u00a6
|\\   /\\ __/_  __/ Added Features:          |
|/ Y \\/_.\u00ac\\/  \\   o Totally NEW Lay-Out    |
/  | \\\\\u00ac\u00a6 \\\\  \\\\  o Manages up to 256 Cnfs |
\\__l_//___//__//                           \u00a6
|dL!\\/   \\/  \\/    Try it and be AMAZED!!  |
+-[ EMPiRE/MYSTiC ]----[ XIM - /X 3.38+ ]--+
"""

MT20 = """ _/\\___/\u00a6___/\\___/\\___/\u00a6_/\\__.-------------.
 \\   /\\ | /\\ __/\\ . /\\ |\\ . /| bObO/mYStiC |
 / V \\/_. \\/_.\u00ac\\/_| \\/ |/ |_\\| ~~~~~~~~~~~ |
/  |  \\\u00ac|  \\\u00ac\u00a6  \\\u00ac|  \\ |  \u00a6 \u00ac\\  PRESENTS:  |
\\__\u00a6  /__  /__  / \u00a6__/_\u00a6___  /  ~~~~~~~~~  |
.---\\/---\\/---\\/-/X-pOwEr!-\\/^-------------|
|   MultiTop (Version 2.0)  [RELEASE 2]    |
| The BEST Top Utility ever written for /X |
|  Make your OWN DESIGN (16 designs incl)  |
|        ! WORTH TAKING A LOOK AT !        |
`------------------------------------------'
"""

KB13 = """  __/\\  __________ _ ___  /\\__
.-\\_  \\/  _/   __/______\\/___/-------------.
| /   \\/   \\______  \\_  \\/  \\_   mYSTIC!   |
:/     \\____/   _____/___    / /X dIVISION .
/_______\\-\\_____/--sTZ--l___/--------------:
| KiLLraVeN/MYSTiC BRiNGS: KiLLER-BAUD 1.3 |
| *Creates bulls about users' baud-rates!* :
: o Exclude baud-rates  o Nice lay-out     |
| o Two pages of info!  o Future proof!    |
`------------------------------------------'
"""

USR11 = """      _______   _______           _______
______\\     /__|      /___________\\___  /___
\\_____ \\  _/   /     /__\\   ____/  _ /_/   /
     5D-User V1.10 [-5th Dynasty-]
Command to list all users of the bbs with
many extra features like SEARCH NAME PART or
"""

WHO24 = """|\\______/___/_|\\  /___\\  /_____/___|____/Rpd
`---------------\\/-----\\/----\u00b7presents\u00b7----'
                5D-Who v2.40
   Coded by SvEN tHE CREAToR/5tH DyNASTY
           Now working on /X 3.30
"""

AMN10 = """  ________._____________________________.__
|    5D-AdiMenu V1.0 by [tHE aDDiCT/5D!]   |
| Handles Textfiles like Commands, so use  |
:  it as Doormenu, Filemenu or whatever!   |
"""

FAILURES = []


def check(label, cond, detail=''):
    if cond:
        print(f"[OK]   {label}")
    else:
        print(f"[FAIL] {label} {detail}")
        FAILURES.append(label)


def render(diz, binary, name, archive, version='', author=''):
    """The renderer's description/version/author pipeline, as render_index.py
    runs it."""
    prog = R.prettify_program(R.to_plain(binary or ''))
    body = R.describe_block(diz, name, archive, prog=prog)
    body = R.to_plain(R.prettify_in_text(body))
    body, credit = R.split_banner_credit(body)
    body, requires = R.split_bbs_requirement(body)
    if not requires:
        requires = R.bbs_requirement_from_diz(diz)
    body, ver = R.split_version(body, version)
    body, who = R.split_author(body, author or credit)
    prog = R.capitalise_name(R.strip_version_tail(prog, ver))
    if prog and R.prog_covered_by_body(prog, body):
        prog = None
    desc = R.finalise(R.to_plain(R.compose(R.tidy_case(prog), R.tidy_case(body)) or ''))
    return (desc, (ver or R.version_from_filename(archive)),
            R.tidy_case(R.clean_author(who), handles=True), requires)


BORDER_RUN = re.compile(r'[-_=~*/\\]{3,}')
DANGLING = re.compile(r'\[[^\]]*$|\([^)]*$')

# 1. a border run between two box cells is not part of the description
desc, ver, who, req = render(JC40, 'JoinCnf', 'JoinCnf', 'MST-JC40.LHA')
check('border run "]-----[" never reaches the description',
      not BORDER_RUN.search(desc), f'got {desc!r}')
check('the neighbouring cell ("MYSTiC /X-POWER") is not read as the door',
      'POWER' not in desc.upper(), f'got {desc!r}')

# 2. the version leaves no empty bracket behind, and the release tag goes
desc, ver, who, req = render(MT20, 'MultiTop', 'MultiTop', 'MST-MT20.LHA')
check('"(Version 2.0)" leaves no "(Version )" scar',
      'Version' not in desc, f'got {desc!r}')
check('"[RELEASE 2]" is publishing metadata, not description',
      'RELEASE' not in desc.upper(), f'got {desc!r}')
check('no bracket is left hanging open', not DANGLING.search(desc), f'got {desc!r}')
check('the door\'s real line survives instead',
      'BEST Top Utility' in desc, f'got {desc!r}')
check('version still extracted', ver == '2.0', f'got {ver!r}')

# 3. a mid-line banner splits into description + author credit
desc, ver, who, req = render(KB13, 'KiLLER_Baud', 'KiLLER_Baud', 'MST-KB13.LHA')
check('"<handle> BRiNGS:" is stripped from the description',
      'BRINGS' not in desc.upper() and 'Killraven' not in desc, f'got {desc!r}')
check('the credit becomes the author', who == 'Killraven/Mystic', f'got {who!r}')
check('the door is still named', 'Killer' in desc, f'got {desc!r}')

# 4. dropping a credit tag must not take real prose with it
desc, ver, who, req = render(USR11, '5D-User', '5D-User', '5D-USR11.LHA')
check('"[-5th Dynasty" tag removed', 'Dynasty' not in desc, f'got {desc!r}')
check('the description after the tag is KEPT',
      'list all users' in desc, f'got {desc!r}')

# 5. a compatibility note is not a description
desc, ver, who, req = render(WHO24, None, '5D-Who', '5D-WHO24.LZH')
check('"Now working on /X 3.30" is not chosen as the description',
      'working on' not in desc.lower(), f'got {desc!r}')

# 6. removing an author credit must not leave "by" dangling
desc, ver, who, req = render(AMN10, '5D-AdiMenu', '5D-AdiMenu', '5D_AMN10.LHA')
check('no trailing "by" once the credit tag is gone',
      not re.search(r'\bby$', desc, re.I), f'got {desc!r}')

# 7. unit rules
check('finalise cuts on a word boundary, never mid-bracket',
      R.finalise('MultiTop [RELEASE 2]') == 'MultiTop', f'got {R.finalise("MultiTop [RELEASE 2]")!r}')
check('a balanced bracket survives the frame strip',
      R.finalise('CD Axe (16 designs incl)') == 'CD Axe (16 designs incl)',
      f'got {R.finalise("CD Axe (16 designs incl)")!r}')
check('an unclosed bracket in front of prose loses only the bracket',
      R.finalise('Kickboxing (The Art Of Fighting') == 'Kickboxing The Art Of Fighting',
      f'got {R.finalise("Kickboxing (The Art Of Fighting")!r}')
check('ANSI colour sequences are stripped',
      '\x1b' not in R.clean('The Userstatus Door \x1b[33m-- U know'),
      'escape survived clean()')
check('a version number alone adds nothing to the door name',
      R.body_adds_nothing('Join Cnf', 'JoinCnf 4.0'))

# 8. "/X" is the BBS's NAME - the slash is part of the word, not decoration
CL0T0 = '''.------------[ CALL 13th HOUR ]------------.
|                                          |
| CALLERS LOTTERY v1.o (c) cYBER/iNDY 1995 |
|                                          |
| /X 3.x+ Give your users a Byte Bonus and |
| File bonus when they call your cool BBS! |
|   Totally configurable to your needs!    |
|        Download/Leech/Suck NOW!          |
`--------------------------------------[c]-'
'''
desc, ver, who, req = render(CL0T0, None, 'Callers Lottery', 'AECL0T0.LHA')
check('the requirement moves to its own field', req == '/X 3.x+', f'got {req!r}')
check('and leaves the description behind it',
      'Byte Bonus' in desc and '/X 3.x' not in desc, f'got {desc!r}')
check('a slash in front of X is never stripped as decoration',
      R.clean('  /X dIVISION .') == '/X dIVISION', f'got {R.clean("  /X dIVISION .")!r}')
check('a border run does not swallow the slash of /X',
      R.best_cell('|-------- /X 3.xx door by DELTAFORCE |')[1].startswith('/X'),
      f'got {R.best_cell("|-------- /X 3.xx door by DELTAFORCE |")!r}')

# 9. CP437 box art is not a description, however Python classifies its bytes
SNES = '''  \u00daÂÂÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÂÂ¿
  ³Y³   ÓÄÄÙ Ð  Á ÐÄÄÙ ÓÄÄÙ   ³Y³
  ³Y³ Tricks&PWs for 200 games³Y³
  ÀÁÁÄÄÄÄÄ#10ÄÄSpooNManÄÄÄÄÄÄÄÁÁÙ
'''
desc, ver, who, req = render(SNES, None, 'SnesDX', 'SNESDX10.LZH')
check('box-drawing art never reaches the description',
      'Tricks' in desc and not re.search(r'[\u00b3\u00c4\u00d3\u00da\u00c1]', desc),
      f'got {desc!r}')
check('a superscript digit is art, not an alphanumeric',
      R.to_plain('\u00b3Y\u00b3 games') == 'Y games', f'got {R.to_plain(chr(0xb3) + "Y" + chr(0xb3) + " games")!r}')

# 10. the requirement is read from the whole DIZ, not only the chosen line
desc, ver, who, req = render(JC40, 'JoinCnf', 'JoinCnf', 'MST-JC40.LHA')
check('a requirement in the box border is still found',
      req == '/X 3.38+', f'got {req!r}')

check('"/X", "X" and "AE" name the same BBS',
      R.normalise_requirement('AE', '3,30') == '/X 3.30')
check('4.X and 4.x are one value',
      R.normalise_requirement('AmiExpress', '4.X') == 'AmiExpress 4.x')

print()
if FAILURES:
    print(f"{len(FAILURES)} FAILED: {', '.join(FAILURES)}")
    sys.exit(1)
print('all description rules pass')
