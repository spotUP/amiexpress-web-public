# Knowing where your door is running

A door written for this board can do things a door on a real Amiga cannot:
the caller may be a C64 reading PETSCII, a browser terminal 200 columns wide,
or a mouse. None of that exists under classic AmiExpress on real hardware,
and the same binary may be run on both.

So the board tells you, and you ask before you use anything.

## The variables

Read with `GetVar()` (dos.library V36+), or read `ENV:<name>` as a file.

| Variable | Value | Notes |
|---|---|---|
| `AE_HOST` | `amiexpress-web` | **Absent means classic AmiExpress.** |
| `AE_HOST_VERSION` | e.g. `1.0.0` | Compare as a string, not a number. |
| `AE_CONNECTION` | `web`, `telnet`, `ssh` | How the caller is attached. |
| `AE_CLIENT` | `ansi`, `petscii` | What the caller's terminal reads. |
| `AE_CAPS` | e.g. `ansi,petscii,c64adapt` | Comma-separated, no spaces. |

As `ENV:` files, `AE_HOST` and `AE_HOST_VERSION` are plain names, and the
three per-caller ones carry the node number - `ENV:AE_CLIENT.3` - because
that directory is shared by every node. Through `GetVar()` all five are
plain names: your process already belongs to one node.

## Capabilities

| Capability | Means |
|---|---|
| `ansi` | ANSI colour and cursor control reach the caller. Always present. |
| `petscii` | The caller is a C64. The board transduces your ANSI into PETSCII. |
| `c64adapt` | The board reduces your 80x25 frames to the C64's 40 columns. |
| `wide` | The caller can be sent more than 80 columns. |
| `mouse` | Mouse reports reach your door. |

Test for the capability you are about to use, by name. Do not infer one from
another and do not depend on the order or the count: capabilities will be
appended to the list over time.

## The rule

**Absent `AE_HOST` is the case to be safe in**: 80x25, ANSI only, no mouse.
That is what a classic AmiExpress board looks like from inside a door, and a
door that assumes otherwise draws garbage on real hardware.

```c
#include <proto/dos.h>
#include <string.h>

static int hasCap(const char *caps, const char *want) {
    const char *at = caps;
    size_t n = strlen(want);
    while (*at) {
        const char *end = strchr(at, ',');
        size_t len = end ? (size_t)(end - at) : strlen(at);
        if (len == n && strncmp(at, want, n) == 0) return 1;
        if (!end) break;
        at = end + 1;
    }
    return 0;
}

char host[32], caps[128];

if (GetVar("AE_HOST", host, sizeof(host), 0) > 0
    && strcmp(host, "amiexpress-web") == 0) {

    if (GetVar("AE_CAPS", caps, sizeof(caps), 0) > 0 && hasCap(caps, "petscii")) {
        /* The caller is a C64. */
    }
} else {
    /* Classic AmiExpress: 80x25 ANSI, and nothing else. */
}
```

Note what the PETSCII case actually means: **you still write ANSI.** PETSCII
on this board is a transducer in the backend, not bytes you emit. Knowing the
caller is a C64 tells you to draw for 40 columns and to keep to characters
that survive the conversion - it does not mean you should send PETSCII codes
yourself.

## Where this lives

- `web/backend/src/amiga-emulation/utils/host-vars.ts` - the values and the contract
- `web/backend/src/amiga-emulation/session/EnvironmentManager.ts` - published for `GetVar()`
- `web/backend/src/amiga-emulation/utils/env-initializer.ts` - written as `ENV:` files
- `web/backend/tests/host-vars.test.ts`, `tests/amiga-emulation/environment-vars.test.ts`
