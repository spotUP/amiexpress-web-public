# Makefile - examples/doorrepo-c
#
# Targets:
#   native      - doorrepo, built for this host with aedoor_native.c (dev/test build)
#   amiga       - doorrepo.amiga, cross-compiled with vbcc for a real AmigaOS
#                 node: aedoor_amiga.c + netio.c's real bsdsocket.library
#                 branch, built against this repo's vendored NDK3.2R4 (see
#                 the AMIGA_NETINCLUDE_VENDOR_LINK block below) by default -
#                 COMPILE-VERIFIED here (see netio.c's header comment and
#                 the task-4/task-6 reports for the full recipe and its
#                 provenance); NOT link/run-verified against a real
#                 bsdsocket.library, since no such runtime is available in
#                 this environment. Pass NETINCLUDE=/path/to/sdk/include to
#                 use a different (e.g. a builder's own AmiTCP/Roadshow) SDK
#                 instead of the vendored one.
#   amiga-stub  - doorrepo.amiga-stub, the same cross-compile but with netio.c's
#                 NETIO_STUB branch instead of real sockets, so it needs no
#                 AmiTCP SDK at all and fully LINKS (not just compiles) to a
#                 loadseg()ble AmigaOS executable - the strongest m68k-clean
#                 proof available here for every module other than netio.c's
#                 real socket branch.
#   test        - builds and runs every unit test under tests/ (native only).
#   live        - builds native and runs it once against http://bbs.uprough.net
#                 (a real, network-touching request against the live door
#                 repo API - see docs/DOOR-REPO-API.md).
#   clean       - removes every build artifact.
#
# C89 throughout (`-c99` below is a vbcc FLAG NAME, not a language version -
# the source itself stays strict C89; see thoughts/shared/plans/
# 2026-08-17-doorrepo-c-client-design.md's pre-flight note on this).

CC ?= cc
# _DEFAULT_SOURCE is required, not cosmetic: netio.c's POSIX branch uses
# select()/fd_set/struct timeval/getaddrinfo, and under -std=c89 glibc hides
# every one of them behind a feature-test macro, so the native build failed to
# compile on Linux with "unknown type name 'fd_set'". macOS's libc exposes them
# regardless, which is why this went unnoticed until the suite ran on a Linux
# CI runner. The macro is glibc's; other libcs ignore it harmlessly.
NATIVE_CFLAGS = -std=c89 -D_DEFAULT_SOURCE -Wall -Wextra -pedantic -O2

# vbcc cross-compiler for the real m68k/AmigaOS target. Both paths are the
# ones verified working for this project (see progress.md); override on the
# command line if your machine has them installed elsewhere.
VBCC ?= /opt/homebrew/Cellar/vbcc/0.9hp3
NDK ?= /opt/homebrew/Cellar/m68k-amiga-elf-gcc/13.1.0/m68k-amiga-elf/sys-include

# Path to an AmiTCP/Roadshow SDK include directory (must provide
# sys/socket.h, netinet/in.h, netdb.h - the headers netio.c's AMIGA branch
# needs and which neither vbcc's own SDK nor the m68k-amiga-elf-gcc NDK
# ship). Only needed to override the vendored default below - see that
# block's comment for why nothing needs to be set for `make amiga` to work
# in THIS repo checkout.
NETINCLUDE ?=

VC = VBCC=$(VBCC) vc

# Deliberately does NOT include -I"$(NDK)" here: $(NDK) (the
# m68k-amiga-elf-gcc sys-include tree) must come LAST in the real `amiga`
# target's search order (see the VENDOR_NDK_ROOT block below for why -
# its own devices/timer.h must not shadow the vendored one), so each
# target below appends $(NDK) itself, in the position that target needs.
AMIGA_CFLAGS = +aos68k -c99 -I"$(VBCC)/targets/m68k-amigaos/include"

# ---------------------------------------------------------------------
# Vendored AmiTCP/Roadshow SDK (NDK3.2R4) used by `amiga` when NETINCLUDE
# is not overridden. This repo vendors a full copy at
# "Documentation/7-Reference Sources/NDK3.2R4/" - Task 4 chased down and
# proved that netio.c's real bsdsocket.library branch compiles with ZERO
# warnings against it (see task-4-report.md's fix-round section for the
# full transcript and the struct __timeval investigation that made this
# possible). Two symlinks are created here rather than pointing vc's -I
# straight at the vendored paths, for two independent reasons:
#
#   1. devices/timer.h ORDERING: the m68k-amiga-elf-gcc tree's own
#      devices/timer.h wraps tv_sec/tv_usec in anonymous unions - a GNU
#      extension vbcc rejects (warning 53). The vendored NDK3.2R4's
#      Include_H/devices/timer.h is a plain, non-union struct that
#      compiles clean. AMIGA_NDK_SHIM contains ONLY that one file, so
#      putting it ahead of $(NDK) in the -I list makes the good copy win
#      without needing to reorganize $(NDK) itself.
#   2. SPACE-IN-PATH: "Documentation/7-Reference Sources/NDK3.2R4/..."
#      contains a literal space, which trips an argv-splitting bug in
#      vc's own wrapper script when passed directly as a -I argument
#      (confirmed in task-4-report.md's fix-round section). Symlinking it
#      to a space-free path under this directory sidesteps the bug
#      entirely.
#
# Both symlinks are (re)created on every `amiga` build (cheap; `ln -sf`/
# `ln -sfn` are idempotent) so a stale link from a moved vendored tree
# never lingers. Neither is committed - see .gitignore.
VENDOR_NDK_ROOT = $(CURDIR)/../../Documentation/7-Reference Sources/NDK3.2R4
AMIGA_NDK_SHIM = amiga-ndk-shim
AMIGA_NETINCLUDE_VENDOR_LINK = amiga-netinclude-vendor

ifeq ($(strip $(NETINCLUDE)),)
AMIGA_NETINCLUDE_DIR = $(AMIGA_NETINCLUDE_VENDOR_LINK)
else
AMIGA_NETINCLUDE_DIR = $(NETINCLUDE)
endif

LIVE_HOST = http://bbs.uprough.net

CORE_SOURCES = flow.c config.c http.c listtxt.c md5.c
HEADERS = flow.h config.h http.h listtxt.h md5.h aedoor.h netio.h

NATIVE_SOURCES = doorrepo.c $(CORE_SOURCES) netio.c aedoor_native.c
AMIGA_SOURCES = doorrepo.c $(CORE_SOURCES) netio.c aedoor_amiga.c

.PHONY: all native amiga amiga-stub test live clean

all: native

# ---------------------------------------------------------------------
# native
# ---------------------------------------------------------------------

native: doorrepo

doorrepo: $(NATIVE_SOURCES) $(HEADERS)
	$(CC) $(NATIVE_CFLAGS) $(NATIVE_SOURCES) -o $@

# ---------------------------------------------------------------------
# amiga (real bsdsocket.library networking, against the vendored NDK3.2R4
# by default - see the VENDOR_NDK_ROOT block above)
# ---------------------------------------------------------------------

amiga: doorrepo.amiga

doorrepo.amiga: $(AMIGA_SOURCES) $(HEADERS)
	@mkdir -p $(AMIGA_NDK_SHIM)/devices
	@ln -sf "$(VENDOR_NDK_ROOT)/Include_H/devices/timer.h" $(AMIGA_NDK_SHIM)/devices/timer.h
	@ln -sfn "$(VENDOR_NDK_ROOT)/SANA+RoadshowTCP-IP/netinclude" $(AMIGA_NETINCLUDE_VENDOR_LINK)
	$(VC) $(AMIGA_CFLAGS) -DAMIGA \
	  -I$(AMIGA_NDK_SHIM) -I"$(AMIGA_NETINCLUDE_DIR)" -I"$(NDK)" \
	  $(AMIGA_SOURCES) -lauto -o $@

# ---------------------------------------------------------------------
# amiga-stub (proves every module other than netio.c's real socket branch
# is m68k-clean, with no AmiTCP SDK required at all)
# ---------------------------------------------------------------------

amiga-stub: doorrepo.amiga-stub

doorrepo.amiga-stub: $(AMIGA_SOURCES) $(HEADERS)
	$(VC) $(AMIGA_CFLAGS) -I"$(NDK)" -DNETIO_STUB $(AMIGA_SOURCES) -lauto -o $@

# ---------------------------------------------------------------------
# test
# ---------------------------------------------------------------------

# -D_DEFAULT_SOURCE for the same reason as NATIVE_CFLAGS above: test-http
# links netio.c's POSIX branch and tests/stub_server.c, both of which need the
# POSIX socket declarations that glibc hides under -std=c89.
TEST_CFLAGS = -std=c89 -D_DEFAULT_SOURCE -Wall -Wextra -pedantic -O0 -g

.PHONY: test-flow test-md5 test-listtxt test-config test-http test-aedoor-native

test: test-flow test-md5 test-listtxt test-config test-http test-aedoor-native

test-flow: flow.c tests/test_flow.c flow.h
	$(CC) $(TEST_CFLAGS) flow.c tests/test_flow.c -o build-test-flow
	./build-test-flow

test-md5: md5.c tests/test_md5.c md5.h
	$(CC) $(TEST_CFLAGS) md5.c tests/test_md5.c -o build-test-md5
	./build-test-md5

test-listtxt: listtxt.c tests/test_listtxt.c listtxt.h
	$(CC) $(TEST_CFLAGS) listtxt.c tests/test_listtxt.c -o build-test-listtxt
	./build-test-listtxt

test-config: config.c flow.c tests/test_config.c config.h flow.h
	$(CC) $(TEST_CFLAGS) config.c flow.c tests/test_config.c -o build-test-config
	./build-test-config

test-http: http.c netio.c config.c flow.c tests/test_http.c tests/stub_server.c http.h netio.h config.h flow.h tests/stub_server.h
	$(CC) $(TEST_CFLAGS) http.c netio.c config.c flow.c tests/stub_server.c tests/test_http.c -o build-test-http
	./build-test-http

test-aedoor-native: aedoor_native.c tests/test_aedoor_native.c aedoor.h
	$(CC) $(TEST_CFLAGS) aedoor_native.c tests/test_aedoor_native.c -o build-test-aedoor-native
	./build-test-aedoor-native

# ---------------------------------------------------------------------
# live (explicitly network-touching: runs the real native binary against
# the live, public door repo API)
# ---------------------------------------------------------------------

live: native
	@echo "Running doorrepo against $(LIVE_HOST) - Q quits immediately."
	@mkdir -p /tmp/doorrepo-live-run
	@cp doorrepo /tmp/doorrepo-live-run/
	@cd /tmp/doorrepo-live-run && printf 'Q\n' | ./doorrepo 1

# ---------------------------------------------------------------------
# clean
# ---------------------------------------------------------------------

clean:
	rm -f doorrepo doorrepo.amiga doorrepo.amiga-stub
	rm -f build-test-flow build-test-md5 build-test-listtxt build-test-config build-test-http build-test-aedoor-native
	rm -f *.o
	rm -rf *.dSYM
	rm -rf $(AMIGA_NDK_SHIM) $(AMIGA_NETINCLUDE_VENDOR_LINK)
