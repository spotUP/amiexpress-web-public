# Makefile - examples/doorrepo-c
#
# Targets:
#   native      - doorrepo, built for this host with aedoor_native.c (dev/test build)
#   amiga       - doorrepo.amiga, cross-compiled with vbcc for a real AmigaOS
#                 node, using aedoor_amiga.c and netio.c's real bsdsocket.library
#                 branch. Needs NETINCLUDE (see below) - UNVERIFIED on this
#                 toolchain, see netio.c's header comment.
#   amiga-stub  - doorrepo.amiga-stub, the same cross-compile but with netio.c's
#                 NETIO_STUB branch instead of real sockets, so it needs no
#                 AmiTCP SDK at all. This is what proves every module OTHER
#                 than netio.c's real Amiga branch is m68k-clean.
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
NATIVE_CFLAGS = -std=c89 -Wall -Wextra -pedantic -O2

# vbcc cross-compiler for the real m68k/AmigaOS target. Both paths are the
# ones verified working for this project (see progress.md); override on the
# command line if your machine has them installed elsewhere.
VBCC ?= /opt/homebrew/Cellar/vbcc/0.9hp3
NDK ?= /opt/homebrew/Cellar/m68k-amiga-elf-gcc/13.1.0/m68k-amiga-elf/sys-include

# Path to a real AmiTCP/Roadshow SDK's include directory (must provide
# sys/socket.h, netinet/in.h, netdb.h - the headers netio.c's AMIGA branch
# needs and which neither vbcc nor the NDK ship). Required ONLY for the
# `amiga` target; `amiga-stub` needs no networking headers at all. Not set
# by default because no such SDK is available in this environment - see
# netio.c's header comment and examples/doorrepo-c's task-6 report for why
# the `amiga` target is consequently unverified here.
NETINCLUDE ?=

VC = VBCC=$(VBCC) vc
AMIGA_CFLAGS = +aos68k -c99 -I"$(VBCC)/targets/m68k-amigaos/include" -I"$(NDK)"

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
# amiga (real bsdsocket.library networking; needs a real AmiTCP SDK)
# ---------------------------------------------------------------------

amiga: doorrepo.amiga

doorrepo.amiga: $(AMIGA_SOURCES) $(HEADERS)
ifeq ($(strip $(NETINCLUDE)),)
	$(error NETINCLUDE is not set. The 'amiga' target needs a real AmiTCP/Roadshow SDK include directory (sys/socket.h, netinet/in.h, netdb.h) for netio.c's bsdsocket.library branch - pass it as NETINCLUDE=/path/to/sdk/include. Use 'make amiga-stub' instead to build every other module m68k-clean without a real SDK)
endif
	$(VC) $(AMIGA_CFLAGS) -I"$(NETINCLUDE)" -DAMIGA $(AMIGA_SOURCES) -lauto -o $@

# ---------------------------------------------------------------------
# amiga-stub (proves every module other than netio.c's real socket branch
# is m68k-clean, with no AmiTCP SDK required at all)
# ---------------------------------------------------------------------

amiga-stub: doorrepo.amiga-stub

doorrepo.amiga-stub: $(AMIGA_SOURCES) $(HEADERS)
	$(VC) $(AMIGA_CFLAGS) -DNETIO_STUB $(AMIGA_SOURCES) -lauto -o $@

# ---------------------------------------------------------------------
# test
# ---------------------------------------------------------------------

TEST_CFLAGS = -std=c89 -Wall -Wextra -pedantic -O0 -g

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

test-config: config.c tests/test_config.c config.h
	$(CC) $(TEST_CFLAGS) config.c tests/test_config.c -o build-test-config
	./build-test-config

test-http: http.c netio.c config.c tests/test_http.c tests/stub_server.c http.h netio.h config.h tests/stub_server.h
	$(CC) $(TEST_CFLAGS) http.c netio.c config.c tests/stub_server.c tests/test_http.c -o build-test-http
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
