# Proposed: let a door advance the caller's message pointers

**Status:** implemented in amiexpress-web as `AEW_SETPOINTER` (10300);
proposed for AmiExpress proper.
**Date:** 2026-09-13
**Contact:** the amiexpress-web board (bbs.uprough.net)

## Summary

A door has no way to tell AmiExpress that the caller has read mail. We propose
one additive XIM command that lets it, designed so that a board which does not
implement it needs no change at all and doors keep working against it.

## The problem

Doors can already *read* the caller's pointers:

```e
CASE LAST_READ                    -> express.e:3963
  msg.data:=lastMsgReadConf
CASE LAST_SCANNED                 -> express.e:3965
  msg.data:=lastNewReadConf
```

There is no matching write, and as far as we can tell that is deliberate
rather than an oversight - three lines further down, `MSGBASE_LOC` uses the
settable idiom for a field that *was* meant to be written:

```e
CASE MSGBASE_LOC                  -> express.e:3967
  IF (msg.data)
    AstrCopy(msg.string,msgBaseLocation,26)
  ELSE
    StrCopy(msgBaseLocation,msg.string,26)
    checkPathSlash(msgBaseLocation)
  ENDIF
```

The other routes into that state are closed too, and again reasonably so:

- `LOADACCOUNT` (`express.e:4557-4562`) and `SAVEACCOUNT` (`:4587-4595`) both
  call `loadMsgPointers` afterwards, so anything a door changed in its copy is
  discarded. The pointers live in `confBase`, not in the `user` record.
- `saveMsgPointers` (`:4916-4973`) writes `confBases.item(...)` - an in-memory
  array the board flushes itself. A door writing `Conf.DB` on disk would be
  racing that copy, and the board's copy wins at logoff.

So every writer of `lastMsgReadConf` in express.e is a board-side reader:
`readit` at `:12370` and `:12376`, and the custom ASCII/QWK dumps at `:26493`
and `:26725`, each followed by `saveMsgPointers`.

That is entirely correct while the board is the thing doing the reading.

## Why it matters now

We have a door (`SUBS`) that reads the message base off the disk itself -
`HeaderFile`, `MailStats` and the body files - specifically so it runs on a
real Amiga AmiExpress rather than depending on any extension. It registers
through `Commands/BBSCmd/*.info`, and it can be installed over `R` so that it
*is* the board's message reader.

At that point nothing advances the pointer. Every message reads as new for
ever, and the door's own "N new for you" is a number the caller cannot move.

This is not hypothetical: on our board it showed as `103 messages here. 103 new
for you.` on every single visit, with every pointer sitting at 0.

Note that `express.e:4947` already treats a zero pointer as an error worth
logging - so the board itself considers this state wrong.

## The proposal

One additive command. We used 10300 because our port keeps its own extensions
above express.e's `MAX_CMD` (1003); any free number works, and the door takes
it from a header constant.

```
Command:  SET_POINTER
Request:  msg.data   = 0
          msg.string = "<VERB> <n>"
Reply:    msg.data   = 1  stored
                     = 0  refused, or command not implemented
```

Verbs:

| Verb   | Sets               | express.e variable |
|--------|--------------------|--------------------|
| `READ` | manual read pointer| `lastMsgReadConf`  |
| `SCAN` | new-scan pointer   | `lastNewReadConf`  |

Sketch, in the style of the surrounding cases:

```e
CASE SET_POINTER
  msg.data:=setMsgPointerFromDoor(msg.string)
```

where `setMsgPointerFromDoor` parses the verb and number, applies the rules
below, calls `saveMsgPointers(currentConf,currentMsgBase)` and returns 1, or
returns 0 if it did nothing.

### Rules

1. **Forward only.** A lower value than the current one is accepted and
   ignored. This mirrors express.e's own writers, which are
   `IF(msgNum>lastMsgReadConf) THEN lastMsgReadConf:=msgNum` and never a plain
   assignment - so a door walking a list backwards, or re-reading an old
   message, cannot un-read everything after it. Rewinding stays a sysop
   operation.
2. **Both pointers are preserved.** Setting one must not disturb the other;
   `saveMsgPointers` writes both from the globals.
3. **Refuse, never fail.** An unknown verb, an unparseable or negative number,
   no caller logged on, or no current conference all answer 0. A door must
   never hang or die because a pointer would not store.
4. **Same clamping as the board.** The value is subject to whatever
   `validatePointers` / the `lowestNotDel` and `highMsgNum` clamps already do
   (`express.e:5037-5046`); a door's number is not more trusted than the
   board's own.

### The part that makes it safe to adopt slowly

The request carries `msg.data = 0`. An AmiExpress that has never heard of the
command falls through to its unknown-command default, **which replies with
`msg.data` unchanged** - that is, 0.

So `1` means stored and `0` means "this board will not do this", with no
version negotiation, no capability query, and no new failure mode. A door
written against this proposal runs unmodified on an unpatched AmiExpress and
simply keeps today's behaviour.

This is why the *value* travels in `msg.string` rather than `msg.data`: if the
value were in `msg.data`, a stored pointer of 1 would be indistinguishable from
"command unknown".

## Reference implementation

- Wire handling and rationale: `web/backend/src/amiga-emulation/xim/msgpointer.ts`
- Routing: `web/backend/src/amiga-emulation/XIMProtocol.ts` (`AEW_SETPOINTER`)
- Command number: `web/backend/src/amiga-emulation/xim/types.ts`
- Tests, including the degradation contract and the forward-only rule:
  `web/backend/tests/xim/a-door-can-mark-mail-read.test.ts`

All of it is MIT-licensed along with the rest of this repository and may be
taken verbatim.

## What we are not proposing

- No change to `LAST_READ` / `LAST_SCANNED`. They stay read-only; making them
  settable would overload `msg.data`, which is the reply channel, and would
  lose the "unknown command" signal described above.
- No door access to another caller's pointers. The command acts only on the
  caller currently online in that node's conference.
- No new file format, and no change to `Conf.DB`.
