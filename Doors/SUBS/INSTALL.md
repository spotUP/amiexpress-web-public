# SUBS - installing it, and what each choice costs you

SUBS is a 68K door. It reads this conference's message base off the disk
itself - `<conf>/MsgBase/HeaderFile`, `MailStats` and the numbered body files -
through ordinary AmigaDOS and the ordinary AmiExpress door interface. It asks
the board only for things a real AmiExpress answers: where the conference is
(`BB_CONFLOCAL`, 127), where its message base is (`MSGBASE_LOC`, 604), who is
calling, and how far this caller has been scanned (`LAST_SCANNED`, 603).

That is deliberate, and it is why the door works on a real Amiga running real
AmiExpress and not only on amiexpress-web.

## What it shows

Every message in the conference the caller may read, in plain number order:

- public messages (`P`) and censored-public ones (`p`), to everybody
- private messages (`R`) to their sender and their recipient
- deleted messages (`D`) to nobody, including the sysop
- nothing else - there is no other rule, because express.e has no other rule
  at the point of reading (express.e:8929-8933, 12343-12355)

A caller at or above `SysopLevel` also sees private mail between other people.
**That setting defaults to 255 and you should set it deliberately.** A door
cannot read the board's ACS tables, so `ACS.SYSOP_READ` is not available to it;
this setting is the one access rule SUBS has to be told rather than look up. On
a board where nobody holds level 255, the default means nobody gets it.

## The two registrations

Both already ship in `Commands/BBSCmd/`, and both point at the same binary.
The door asks the board which name launched it (`GET_CUSTOM_MSGBASE_MENUCMD`,
605) and behaves accordingly, because AmigaDOS gives a door one argument and
that argument is the node number.

| Command   | What it does                                                |
|-----------|-------------------------------------------------------------|
| `SUBS`    | the full screen: the message list, the reader, post and reply |
| `SUBSCAN` | three lines and exits - for a conference bulletin             |

A board with no command 605 - a classic AmiExpress - gets the full door under
either name, which is the right way round: three unexplained lines is a worse
failure than a door that works.

## Launching it when a caller joins a conference

One line in the conference's bulletin:

```
~XISUBSCAN
```

`~XI` starts a door without announcing it and strips the token from the text.
Use `~XISUBS` instead to open the full door on every join.

Three things that will waste an afternoon if you do not know them:

1. **The bulletin file is not `BULL.TXT`.** `CONF_BULL` resolves to the file
   named `BULL`, security-numbered first - on a board with security-numbered
   screens that is `Conf<n>/bull20.txt`, not `BULL.TXT`.
2. **The first line of the file must start with `~`** or the `allowMCI` gate
   silently renders every MCI code as plain text. No error; the token just
   appears on screen.
3. `noConfBulls` is parsed by the board and read by nothing. It will not turn
   this off.

## Making SUBS the reader (optional, and read this first)

`Commands/BBSCmd/R.info.example` will override the board's own `R` command with
this door. Copy it to `Commands/BBSCmd/R.info` - or to
`Commands/Conf<N>Cmd/R.info` for one conference only - to enable it.

It is **not** enabled by default, on purpose. Replacing a core command on every
board is the kind of surprise that gets a door uninstalled, and the trade is
real:

**What you gain:** the caller arrives in a list of what is actually in the
conference, arrows through it, and reads without typing a message number.

**What you lose:** express.e's own between-messages options. The board's `R`
offers `A`gain, `D`elete, `M`ove, `F`orward, `R`eply, `L`ist, `K`eep unread,
translation (`T`, `TS`, `T!`, `T*`), the header and body editors (`EH`, `EM`),
and account editing (`U`). SUBS release 1 offers reading, navigating and
handing a reply back to the board. **If your callers use `D`, `M`, `F` or the
editors, do not install `R.info` yet.**

Search order, if you want it in some conferences and not others:
conference (`Conf<N>Cmd`), then node (`Node<N>Cmd`), then global (`BBSCmd`).

`E` is deliberately not overridable yet: SUBS does not write messages. Pressing
`P` or `R` in the door hands `EALL` back and the board runs its own message
entry, which is the real express.e one.

## Settings

Set from the admin door settings page, or by hand in `SUBS.cfg` beside the
binary. A missing `SUBS.cfg` is not an error - both settings have working
defaults.

| Key          | Default | What it does                                        |
|--------------|---------|-----------------------------------------------------|
| `FeedWindow` | 100     | how many of the newest messages the door holds       |
| `SysopLevel` | 255     | the level at or above which private mail is visible  |

`FeedWindow` is a memory budget, not a speed one: each row costs about 110
bytes of the door's own storage on the Amiga, so 200 is the ceiling. The door
says on screen when the conference holds more than the window.

## When something is wrong

- **"This conference has no message base on the board."** There is no readable
  `HeaderFile` where the board says the message base is. That is a board
  configuration problem, not a caller one. It is a different message from
  "nobody has posted here yet" precisely so you can tell them apart.
- **"N records unreadable"** on the status line. The `HeaderFile` holds records
  whose layout the door could not identify at either offset. It reports them
  rather than hiding them; the count is the honest answer, and the messages
  themselves are not lost.
