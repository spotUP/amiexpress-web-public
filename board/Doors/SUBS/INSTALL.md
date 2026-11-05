# SUBS - installing it, and what each choice costs you

SUBS is a second way into the board's OWN message bases - a list of the
newest messages, a reader, and a way to post without leaving it. It is never a
store or a set of rules of its own: it shows the board's messages, moves the
board's pointers in express.e's meanings, and posts through the board.

It is a 68K door. It reads this conference's message base off the disk itself -
`<conf>/MsgBase/HeaderFile`, `MailStats` and the numbered body files - through
ordinary AmigaDOS and the ordinary AmiExpress door interface. For reading it
asks the board only for things a real AmiExpress answers: where the conference
is (`BB_CONFLOCAL`, 127), where its message base is (`MSGBASE_LOC`, 604), who
is calling, how far this caller has been scanned (`LAST_SCANNED`, 603), and
the caller's ACS (`DT_QUERYBIT`, 1002). That is why it runs on a real Amiga
running real AmiExpress and not only on amiexpress-web.

## What it shows

Every message in the conference the caller may read, in plain number order:

- public messages (`P`) and censored-public ones (`p`), to everybody
- private messages (`R`) to their sender and their recipient
- private messages between other people to a caller with `ACS.SYSOP_READ`,
  and private mail to `EALL` / `ALL` to a caller with `ACS.READ_PRIV_EALL` /
  `ACS.READ_PRIV_ALL` - the board's own rule (readit, express.e:12343-12355),
  asked of the board with `DT_QUERYBIT`
- deleted messages (`D`) to nobody, including the sysop

Bodies are shown as the board shows them: a body that is valid UTF-8 (the
board writes UTF-8) is converted to Latin-1, anything else is already Latin-1.

**New** means every post at or above the caller's scan pointer, worded as
"6 new posts". The board's join scan counts mail addressed to the caller; the
two are different numbers on purpose and are worded differently.

## Reading counts on the board

On the way out SUBS tells the board how far the caller got, with this port's
`AEW_SETPOINTER` (10300) - a real AmiExpress ignores it and keeps its pointers:

- `READ` = the highest message he opened (express.e's `lastMsgReadConf`)
- `SCAN` = one past it, the next message to scan (`lastNewReadConf`;
  express.e:5103 prints it minus one). Opening the newest message marks
  everything below it read - express.e's high-water mark.
- `RECV n` = he opened private mail addressed to him; the board marks it
  received exactly as `R` does (express.e:8943-8949).

## Posting

`E` posts to everyone, `R` replies to the selected message (same subject, no
quoting), and the caller stays in the door afterwards.

On this board the post goes through the board's own save over `AEW_POSTMSG`
(10500): the board's posting access is asked BEFORE the caller types
(`ACS.ENTER_MESSAGE`, and `ACS.EALL_MESSAGES` for a post to everyone), and the
saved message gets everything `E` gives one - the post count, the callers log,
notifications, achievements, the board's own copy and UTF-8 body.

On a board that does not answer `AEW_POSTMSG` - a real AmiExpress - the door
appends the message itself, in express.e's order (lock, number from
`MailStats`, body, header, `MailStats`, unlock), under express.e's own
`MailLock`: an exclusive `Lock()` on the file, which is created when missing
and never written or deleted. None of saveNewMSG's side effects happen there;
no door can reach them on a real board.

## The two registrations

Both already ship in `Commands/BBSCmd/`, and both point at the same binary.
The door asks the board which name launched it (`GET_CUSTOM_MSGBASE_MENUCMD`,
605) and behaves accordingly, because AmigaDOS gives a door one argument and
that argument is the node number.

| Command   | What it does                                                |
|-----------|-------------------------------------------------------------|
| `SUBS`    | the full screen: the message list, the reader, post and reply |
| `SUBSCAN` | the topics that are new to this caller, then exits            |

A board with no command 605 - a classic AmiExpress - gets the full door under
either name, which is the right way round: an unexplained listing is a worse
failure than a door that works.

### What SUBSCAN prints

The conference's count, then the NEW messages only, newest last, at most
fifteen of them with `+N more.` when there are more than that, and a last line
saying `Type SUBS to read them.` A caller who is caught up gets the count and
nothing else; a conference with nothing he may read prints nothing at all.

```
Amiga Chat  740 messages, 6 new posts

  #735  Spot           Re: the 060 board
  #736  Mahoney        DEMO party rules
  ...
  Type SUBS to read them.
```

It does not clear the screen and it does not wait for a key. It runs inside a
conference join, with the board's own screen half-drawn around it, and the
sysop's rule for that (2026-09-14) is plain: "it should only list the topics
here and exit to the prompt". At forty columns the sender goes and the subject
is clipped rather than wrapped.

## Launching it when a caller joins a conference

Put this line in the conference's join bulletin (`Conf<n>/bull20.txt` on this
board - see the first note below):

```
~XISUBSCAN
```

`~XI` starts a door without announcing it and strips the token from the text.
The line runs for everyone, every time; the listing never clears the screen and
never waits for a key.

`~XISUBS` there would open the FULL door on every join and hold the caller
until they pressed Q. Do not do that - it is what the sysop asked to be rid of.
The full door is for a caller who types `SUBS`, and the conference menu
(`Screens/Conf/Menu.*`) lists it as `[SUBS] Message Feed`.

No conference hands its whole message base to SUBS any more (express.e's
`CUSTOM` tooltype with `MSGBASE.DEF`): that was removed on 2026-09-30 and the
door no longer answers message functions.

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
and account editing (`U`). SUBS offers reading, navigating,
posting and replying. **If your callers use `D`, `M`, `F` or the editors, do
not install `R.info`.**

Search order, if you want it in some conferences and not others:
conference (`Conf<N>Cmd`), then node (`Node<N>Cmd`), then global (`BBSCmd`).

`E` is deliberately not overridden: the board's `E` writes to anybody, with
quoting and attachments; SUBS posts to everyone only.

## Settings

Set from the admin door settings page, or by hand in `SUBS.cfg` beside the
binary. A missing `SUBS.cfg` is not an error - the setting has a working
default.

| Key          | Default | What it does                                        |
|--------------|---------|-----------------------------------------------------|
| `FeedWindow` | 100     | how many of the newest messages the door holds       |

`SysopLevel` and `SysopName` are gone: who reads private mail is the board's
ACS, and comments to the sysop went with `CUSTOM`. An old `SUBS.cfg` that still
has them is read without complaint.

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
