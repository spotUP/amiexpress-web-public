# ---------------------------------------------------------------------
# sdk/c - the AmiExpress C door SDK (phase 0)
#
# Two builds, on purpose:
#
#   host   cc, for the tests. getenv() stands in for GetVar(); the parsing
#          and the defaults are the same code that runs on the 68K.
#   amiga  vbcc, producing a real 68K binary, which is the only thing that
#          can answer "what does a small door actually cost?"
#
# THE LAYERING RULE, as measured rather than as planned. The plan called for
# gcc's -ffunction-sections plus --gc-sections; vbcc has neither, and the
# host's ar (and llvm's emar) cannot write an archive vlink will read - both
# produce "File format not recognized".
#
# What does work, measured on this machine: an Amiga hunk library is the
# CONCATENATION of hunk object files, and vlink pulls a unit out of one only
# when something references a symbol in it. Numbers, from `make measure`:
#
#   hello linked against only the two modules it calls    5048 bytes
#   hello linked against libae.lib, which holds three     5048 bytes
#   hello with the third object listed on the link line   5476 bytes
#
# So: one module per .c file, and doors link the LIBRARY, never a list of
# objects - naming an object costs its full size whether it is called or not.
# ---------------------------------------------------------------------

CC ?= cc
HOST_CFLAGS = -std=c99 -Wall -Wextra -Werror -Iinclude

VBCC ?= /opt/homebrew/Cellar/vbcc/0.9hp3
NDK  ?= /opt/homebrew/Cellar/m68k-amiga-elf-gcc/13.1.0/m68k-amiga-elf/sys-include
VC    = VBCC=$(VBCC) vc
AMIGA_CFLAGS = +aos68k -c99 -DAMIGA -Iinclude -I"$(VBCC)/targets/m68k-amigaos/include" -I"$(NDK)"

MODULES = ae_host ae_out ae_box ae_session ui_profile ui_ansi ui_screen ui_list ui_chrome ui_key ui_input ui_theme ui_settings json_lite ae_chunk ae_transport_amiga ae_session_bbs
AMIGA_OBJS = $(patsubst %,build/amiga/%.o,$(MODULES))

.PHONY: all test amiga lib measure clean

all: test

# ---------------------------------------------------------------------
# Tests (host)
# ---------------------------------------------------------------------

test: build/test_ae_host build/test_ae_session build/test_ui_profile build/test_ui_list build/test_ui_chrome build/test_ui_input build/test_ui_theme build/test_ui_settings
	./build/test_ae_host
	./build/test_ae_session
	./build/test_ui_profile
	./build/test_ui_list
	./build/test_ui_chrome
	./build/test_ui_input
	./build/test_ui_theme
	./build/test_ui_settings

build/test_ae_host: src/ae_host.c tests/test_ae_host.c include/ae_host.h
	@mkdir -p build
	$(CC) $(HOST_CFLAGS) src/ae_host.c tests/test_ae_host.c -o $@

build/test_ae_session: src/ae_session.c tests/test_ae_session.c include/ae_session.h
	@mkdir -p build
	$(CC) $(HOST_CFLAGS) src/ae_session.c tests/test_ae_session.c -o $@

build/test_ui_profile: src/ui_profile.c tests/test_ui_profile.c include/ui_profile.h
	@mkdir -p build
	$(CC) $(HOST_CFLAGS) src/ui_profile.c tests/test_ui_profile.c -o $@

build/test_ui_list: src/ui_ansi.c src/ui_list.c src/ui_profile.c tests/test_ui_list.c include/ui_list.h include/ui_profile.h
	@mkdir -p build
	$(CC) $(HOST_CFLAGS) src/ui_ansi.c src/ui_list.c src/ui_profile.c tests/test_ui_list.c -o $@

build/test_ui_chrome: src/ui_ansi.c src/ui_chrome.c tests/test_ui_chrome.c include/ui_chrome.h
	@mkdir -p build
	$(CC) $(HOST_CFLAGS) src/ui_ansi.c src/ui_chrome.c tests/test_ui_chrome.c -o $@

build/test_ui_input: src/ui_ansi.c src/ui_key.c src/ui_input.c tests/test_ui_input.c include/ui_input.h
	@mkdir -p build
	$(CC) $(HOST_CFLAGS) src/ui_ansi.c src/ui_key.c src/ui_input.c tests/test_ui_input.c -o $@

build/test_ui_theme: src/ui_theme.c tests/test_ui_theme.c include/ui_theme.h include/theme_tables.h
	@mkdir -p build
	$(CC) $(HOST_CFLAGS) src/ui_theme.c tests/test_ui_theme.c -o $@

build/test_ui_settings: src/ui_settings.c src/json_lite.c tests/test_ui_settings.c include/ui_settings.h
	@mkdir -p build
	$(CC) $(HOST_CFLAGS) -D_DEFAULT_SOURCE src/ui_settings.c src/json_lite.c tests/test_ui_settings.c -o $@

# The generated table must match tokens.ts. Needs node; skipped where there
# is none, because a C toolchain is not required to have one.
.PHONY: check-themes
check-themes:
	@cd .. && npx tsx c/tools/generate-theme-tables.ts --check

# ---------------------------------------------------------------------
# The 68K library and the two yardstick doors
# ---------------------------------------------------------------------

amiga: lib build/amiga/hello build/amiga/hello_box build/amiga/hello_list build/amiga/theme-picker

lib: build/amiga/libae.lib

build/amiga/%.o: src/%.c
	@mkdir -p build/amiga
	$(VC) $(AMIGA_CFLAGS) -c $< -o $@

# cat, not ar: see the note at the top. The order is the link order, and
# ae_host goes first because it is what everything else may ask.
build/amiga/libae.lib: $(AMIGA_OBJS)
	@rm -f $@
	cat $(AMIGA_OBJS) > $@

# Linked against the WHOLE library, both of them. hello never calls ae_box,
# so its binary must not contain it.
build/amiga/hello: examples/hello/hello.c build/amiga/libae.lib
	@mkdir -p build/amiga
	$(VC) $(AMIGA_CFLAGS) $< build/amiga/libae.lib -lauto -o $@

build/amiga/hello_box: examples/hello/hello_box.c build/amiga/libae.lib
	@mkdir -p build/amiga
	$(VC) $(AMIGA_CFLAGS) $< build/amiga/libae.lib -lauto -o $@

build/amiga/hello_list: examples/hello/hello_list.c build/amiga/libae.lib
	@mkdir -p build/amiga
	$(VC) $(AMIGA_CFLAGS) $< build/amiga/libae.lib -lauto -o $@

# The proof door: a real one, drawn with the widgets, reading and writing
# through the protocol.
build/amiga/theme-picker: examples/theme-picker/theme_picker.c build/amiga/libae.lib
	@mkdir -p build/amiga
	$(VC) $(AMIGA_CFLAGS) $< build/amiga/libae.lib -lauto -o $@

measure: amiga
	@sh tools/measure-link.sh

clean:
	rm -rf build
