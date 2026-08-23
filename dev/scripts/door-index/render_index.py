#!/usr/bin/env python3
"""Render the 6-column door index (Filename, System, Size, Version, Author,
Description) from door_catalog using description_rules.py.

Prototype renderer: the driver that was previously reconstructed by hand each
session. Kept next to the rules so a bad row can be REPRODUCED, not pasted.

  python3 dev/scripts/door-index/render_index.py database.sqlite [filter...]

With filter arguments, only archives whose name contains one of them are
printed - handy when checking a single reported row.
"""
import sys, os, sqlite3
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import description_rules as R


def render_row(row):
    archive, path, binary, name, ver, author, diz, size = row
    prog = R.prettify_program(R.to_plain(binary or ''))
    # binary_name is sometimes a stray token like "8" or "."; a program name
    # has to look like a name, or the row reads "8 - Door Menu 1996".
    if not R.looks_like_program(prog):
        prog = ''
    body = R.describe_block(diz, name, archive, prog=prog or None)
    body = R.prettify_in_text(body)
    body = R.to_plain(body)
    body, credit = R.split_banner_credit(body)
    body, requires = R.split_bbs_requirement(body)
    if not requires:
        requires = R.bbs_requirement_from_diz(diz)
    body, version = R.split_version(body, ver)
    body, who = R.split_author(body, author or credit)
    prog = R.strip_version_tail(prog, version)
    prog = R.capitalise_name(prog)
    if prog and R.prog_covered_by_body(prog, body):
        prog = None
    desc = R.compose(R.tidy_case(prog), R.tidy_case(body)) or ''
    desc = R.finalise(R.to_plain(desc))
    if not desc:
        # Everything the DIZ offered was a credit (KDZ!LUDB.LHA's only prose
        # line is "dONE bY sERAPH - !BUGFIXED VERSION", which moves wholesale
        # into the author column). A row named after its archive beats a row
        # with no description at all.
        base = archive.rsplit('.', 1)[0]
        desc = R.finalise(R.to_plain(R.tidy_case(R.prettify_in_text(base))))
    if not version:
        version = R.version_from_filename(archive)
    who = R.tidy_case(R.clean_author(who), handles=True)
    system = path.split('/')[0] if '/' in path else 'Unsorted'
    size = f"{size}B" if size < 1024 else f"{round(size/1024)}K"
    return f"{archive}\t{system}\t{size}\t{version or '-'}\t{requires or '-'}\t{who or '-'}\t{desc}"


def main():
    db, filters = sys.argv[1], [a.upper() for a in sys.argv[2:]]
    con = sqlite3.connect(db)
    rows = con.execute(
        "SELECT archive_name, archive_path, binary_name, name, version, author,"
        " file_id_diz, COALESCE(archive_size,0) FROM door_catalog ORDER BY archive_name").fetchall()
    R.load_group_tags([r[0] for r in rows])
    print("Filename\tSystem\tSize\tVersion\tRequires\tAuthor\tDescription")
    for r in rows:
        if filters and not any(f in r[0].upper() for f in filters):
            continue
        print(render_row(r))


main()
