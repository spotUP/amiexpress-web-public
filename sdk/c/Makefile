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

# ae_dos is the platform-free half (byte order, the short-read loop) and
# ae_dos_amiga is the dos.library backend - the same split as
# ae_transport_amiga, whose host twin is likewise absent from this list because
# the host is not what `lib` builds.
MODULES = ae_host ae_out ae_box ae_session ui_profile ui_ansi ui_screen ui_list ui_chrome ui_key ui_input ui_editor ui_doc ui_theme ui_settings json_lite ae_chunk ae_transport_amiga ae_session_bbs ae_net ae_http ae_achieve ae_request ae_msgbase ae_dos ae_dos_amiga ae_userfield
AMIGA_OBJS = $(patsubst %,build/amiga/%.o,$(MODULES))

.PHONY: door-sources-compile all test amiga lib measure settings clean

all: test

# ---------------------------------------------------------------------
# Tests (host)
# ---------------------------------------------------------------------

test: door-sources-compile build/write-message build/test_ae_host build/test_ae_session build/test_ui_profile build/test_ui_list build/test_ui_chrome build/test_ui_screen build/test_ui_input build/test_ui_editor build/test_frame_budget build/test_ui_theme build/test_ui_settings build/test_ui_doc build/test_ae_http build/test_ae_achieve build/test_ae_request build/test_ae_msgbase build/test_ae_dos build/test_texttv build/test_subs_scan build/test_achieve_rows build/test_requests_bulletin build/test_ae_userfield build/test_us_model
	./build/test_ae_host
	./build/test_ae_session
	./build/test_ui_profile
	./build/test_ui_list
	./build/test_ui_chrome
	./build/test_ui_screen
	./build/test_ui_input
	./build/test_ui_editor
	./build/test_frame_budget
	./build/test_ui_theme
	./build/test_ui_settings
	./build/test_ui_doc
	./build/test_ae_http
	./build/test_ae_achieve
	./build/test_ae_request
	./build/test_ae_msgbase
	./build/test_ae_dos
	./build/test_texttv
	./build/test_subs_scan
	./build/test_achieve_rows
	./build/test_requests_bulletin
	./build/test_ae_userfield
	./build/test_us_model

# Every door's own .c, syntax-checked with the host compiler.
#
# The unit tests link a door's PURE helpers (texttv_parse.c, not texttv.c), so
# nothing compiled the door bodies at all: texttv.c called ui_masthead_draw
# with 7 arguments against an 8-argument declaration and shipped that way, with
# the extra parameter read off uninitialised stack. A syntax check is cheap and
# catches exactly that class. It is not a link - the Amiga targets still own
# that - so an unresolved symbol is not what this looks for.
door-sources-compile:
	@for f in examples/*/*.c; do \
		$(CC) -fsyntax-only -Iinclude -I$$(dirname $$f) $$f || exit 1; \
	done
	@echo "door sources: all compile"

build/test_ae_userfield: src/ae_userfield.c src/ae_transport_native.c tests/test_ae_userfield.c include/ae_userfield.h include/ae_transport_native.h
	@mkdir -p build
	$(CC) $(HOST_CFLAGS) src/ae_userfield.c src/ae_transport_native.c tests/test_ae_userfield.c -o $@

build/test_us_model: examples/usersettings/us_model.c tests/test_us_model.c examples/usersettings/us_model.h include/ae_userfield.h
	@mkdir -p build
	$(CC) $(HOST_CFLAGS) -I examples/usersettings -I include examples/usersettings/us_model.c tests/test_us_model.c -o $@

build/test_ae_host: src/ae_host.c tests/test_ae_host.c include/ae_host.h
	@mkdir -p build
	$(CC) $(HOST_CFLAGS) src/ae_host.c tests/test_ae_host.c -o $@

# The file layer, on its stdio backend. ae_dos_amiga.c is deliberately NOT
# here: it needs the NDK and only ever builds for 68K, which is the same reason
# ae_transport_amiga.c never appears in a host test rule.
# The Text-TV door's pure helpers (page validation, request paths,
# content_plain extraction, body preference, UTF-8 to Latin-1, favorites).
# No BBS, no sockets - the door's classic-Amiga edges live here, driven on
# the host. Links json_lite: the body preference reads the proxy's "ansi"
# field through the same extractor the door uses on the wire.
build/test_texttv: examples/texttv/texttv_parse.c src/json_lite.c tests/test_texttv.c examples/texttv/texttv_parse.h include/json_lite.h include/ui_key.h
	@mkdir -p build
	$(CC) $(HOST_CFLAGS) -I examples/texttv -I include examples/texttv/texttv_parse.c src/json_lite.c tests/test_texttv.c -o $@

# The join listing, which every caller sees and nobody asked for - so it is a
# pure function in its own translation unit, the way texttv_parse.c is.
build/test_achieve_rows: examples/achieve/achieve_rows.c tests/test_achieve_rows.c examples/achieve/achieve_rows.h
	@mkdir -p build
	$(CC) $(HOST_CFLAGS) -I examples/achieve examples/achieve/achieve_rows.c tests/test_achieve_rows.c -o $@

# The bulletin REQUESTS writes at exit. Pure, in its own translation unit for
# the same reason achieve_rows.c is: the row budget that keeps bull9 off the
# (Pause)...More prompt is testable without a server or an Amiga.
build/test_requests_bulletin: examples/requests/requests_bulletin.c tests/test_requests_bulletin.c examples/requests/requests_bulletin.h
	@mkdir -p build
	$(CC) $(HOST_CFLAGS) -I examples/requests examples/requests/requests_bulletin.c tests/test_requests_bulletin.c -o $@

build/test_subs_scan: examples/subs/subs_scan.c tests/test_subs_scan.c examples/subs/subs_scan.h include/ae_msgbase.h
	@mkdir -p build
	$(CC) $(HOST_CFLAGS) -I examples/subs -I include examples/subs/subs_scan.c tests/test_subs_scan.c -o $@

build/test_ae_dos: src/ae_dos.c src/ae_dos_native.c tests/test_ae_dos.c include/ae_dos.h
	@mkdir -p build
	$(CC) $(HOST_CFLAGS) src/ae_dos.c src/ae_dos_native.c tests/test_ae_dos.c -o $@

build/test_ae_session: src/ae_session.c tests/test_ae_session.c include/ae_session.h
	@mkdir -p build
	$(CC) $(HOST_CFLAGS) src/ae_session.c tests/test_ae_session.c -o $@

build/test_ui_profile: src/ui_profile.c tests/test_ui_profile.c include/ui_profile.h
	@mkdir -p build
	$(CC) $(HOST_CFLAGS) src/ui_profile.c tests/test_ui_profile.c -o $@

build/test_ui_list: src/ui_ansi.c src/ui_list.c src/ui_profile.c src/ui_theme.c tests/test_ui_list.c include/ui_list.h include/ui_profile.h include/ui_theme.h
	@mkdir -p build
	$(CC) $(HOST_CFLAGS) src/ui_ansi.c src/ui_list.c src/ui_profile.c src/ui_theme.c tests/test_ui_list.c -o $@

build/test_ui_screen: src/ui_ansi.c src/ui_screen.c src/ui_profile.c tests/test_ui_screen.c include/ui_screen.h
	@mkdir -p build
	$(CC) $(HOST_CFLAGS) src/ui_ansi.c src/ui_screen.c src/ui_profile.c tests/test_ui_screen.c -o $@

build/test_ui_chrome: src/ui_ansi.c src/ui_chrome.c tests/test_ui_chrome.c include/ui_chrome.h
	@mkdir -p build
	$(CC) $(HOST_CFLAGS) src/ui_ansi.c src/ui_chrome.c tests/test_ui_chrome.c -o $@

build/test_ui_input: src/ui_ansi.c src/ui_key.c src/ui_input.c tests/test_ui_input.c include/ui_input.h
	@mkdir -p build
	$(CC) $(HOST_CFLAGS) src/ui_ansi.c src/ui_key.c src/ui_input.c tests/test_ui_input.c -o $@

build/write-message: tools/write-message.c src/ae_msgbase.c src/ae_dos.c src/ae_dos_native.c include/ae_msgbase.h
	@mkdir -p build
	$(CC) $(HOST_CFLAGS) tools/write-message.c src/ae_msgbase.c src/ae_dos.c src/ae_dos_native.c -o $@

build/test_frame_budget: src/ui_ansi.c src/ui_key.c src/ui_input.c src/ui_editor.c tests/test_frame_budget.c
	@mkdir -p build
	$(CC) $(HOST_CFLAGS) src/ui_ansi.c src/ui_key.c src/ui_input.c src/ui_editor.c tests/test_frame_budget.c -o $@

build/test_ui_editor: src/ui_ansi.c src/ui_key.c src/ui_input.c src/ui_editor.c tests/test_ui_editor.c include/ui_editor.h
	@mkdir -p build
	$(CC) $(HOST_CFLAGS) src/ui_ansi.c src/ui_key.c src/ui_input.c src/ui_editor.c tests/test_ui_editor.c -o $@

build/test_ui_doc: src/ui_ansi.c src/ui_key.c src/ui_doc.c tests/test_ui_doc.c include/ui_doc.h
	@mkdir -p build
	$(CC) $(HOST_CFLAGS) src/ui_ansi.c src/ui_key.c src/ui_doc.c tests/test_ui_doc.c -o $@

build/test_ui_theme: src/ui_theme.c tests/test_ui_theme.c include/ui_theme.h include/theme_tables.h
	@mkdir -p build
	$(CC) $(HOST_CFLAGS) src/ui_theme.c tests/test_ui_theme.c -o $@

build/test_ui_settings: src/ui_settings.c src/json_lite.c tests/test_ui_settings.c include/ui_settings.h
	@mkdir -p build
	$(CC) $(HOST_CFLAGS) -D_DEFAULT_SOURCE src/ui_settings.c src/json_lite.c tests/test_ui_settings.c -o $@

# The HTTP client, against a forked stub server on a loopback port. The
# socket layer's POSIX branch needs the declarations glibc hides under a
# strict -std, hence -D_DEFAULT_SOURCE.
build/test_ae_http: src/ae_http.c src/ae_net.c tests/stub_server.c tests/test_ae_http.c include/ae_http.h include/ae_net.h
	@mkdir -p build
	$(CC) $(HOST_CFLAGS) -D_DEFAULT_SOURCE src/ae_http.c src/ae_net.c tests/stub_server.c tests/test_ae_http.c -o $@

build/test_ae_achieve: src/ae_achieve.c src/ae_http.c src/ae_net.c src/json_lite.c tests/stub_server.c tests/test_ae_achieve.c include/ae_achieve.h include/ae_http.h
	@mkdir -p build
	$(CC) $(HOST_CFLAGS) -D_DEFAULT_SOURCE src/ae_achieve.c src/ae_http.c src/ae_net.c src/json_lite.c tests/stub_server.c tests/test_ae_achieve.c -o $@

build/test_ae_request: src/ae_request.c src/ae_http.c src/ae_net.c src/json_lite.c tests/stub_server.c tests/test_ae_request.c include/ae_request.h include/ae_http.h
	@mkdir -p build
	$(CC) $(HOST_CFLAGS) -D_DEFAULT_SOURCE src/ae_request.c src/ae_http.c src/ae_net.c src/json_lite.c tests/stub_server.c tests/test_ae_request.c -o $@

# ae_msgbase reads FILES now, not the board, so it links against ae_dos and no
# longer needs the transport at all. Its fixtures are the two real HeaderFiles
# already tracked under web/backend/tests/fixtures/msgheaders/, read relative
# to sdk/c - which is why this test must be run from here.
build/test_ae_msgbase: src/ae_msgbase.c src/ae_dos.c src/ae_dos_native.c \
                       tests/test_ae_msgbase.c include/ae_msgbase.h \
                       include/ae_dos.h
	@mkdir -p build
	$(CC) $(HOST_CFLAGS) src/ae_msgbase.c src/ae_dos.c src/ae_dos_native.c \
	    tests/test_ae_msgbase.c -o $@

# The generated table must match tokens.ts. Needs node; skipped where there
# is none, because a C toolchain is not required to have one.
.PHONY: check-themes
check-themes:
	@cd .. && npx tsx c/tools/generate-theme-tables.ts --check

# ---------------------------------------------------------------------
# The 68K library and the two yardstick doors
# ---------------------------------------------------------------------

amiga: lib build/amiga/hello build/amiga/hello_box build/amiga/hello_list build/amiga/theme-picker build/amiga/achieve build/amiga/requests build/amiga/subs build/amiga/texttv build/amiga/usersettings build/amiga/bench_repaint build/amiga/bench_repaint11

lib: build/amiga/libae.lib

# EVERY header, for every object.
#
# vbcc emits no dependency files, so a 68K object was rebuilt only when its
# .c changed - and a change to a HEADER left every object that includes it
# holding the old value. On 2026-09-13 AE_FIELD_DISPLAY_MODE moved from
# 10300 to 10400 in ae_session.h, `make amiga` reported nothing to do for
# ae_session.o, and the door went on asking the board for 10300 - which is
# AEW_SETPOINTER, so it got someone else's answer. Two rounds of debugging
# went into a binary that was simply stale.
#
# The whole header set, rather than per-file dependencies: there are some
# thirty of them, they are small, and a rule that is approximately right
# every time beats an exact one that has to be maintained.
AMIGA_HEADERS = $(wildcard include/*.h)

build/amiga/%.o: src/%.c $(AMIGA_HEADERS)
	@mkdir -p build/amiga
	$(VC) $(AMIGA_CFLAGS) -c $< -o $@

# ae_net's bsdsocket branch needs the Roadshow netinclude headers and one
# NDK header the gcc sys-include lacks. They come from the vendored NDK
# under Documentation/, through a shim directory the build creates. The
# shim and netinclude go BEFORE $(AMIGA_CFLAGS) so they win over the
# sys-include's copies. Same arrangement as examples/doorrepo-c/Makefile.
# Both reach vc through symlinks under build/, never as paths: the vendored
# NDK lives under "7-Reference Sources", and vc reads a -I with a space in
# it as a second input file ("only one input file allowed").
VENDOR_NDK_ROOT ?= $(CURDIR)/../../Documentation/7-Reference Sources/NDK3.2R4
NET_SHIM = build/amiga/ndk-shim
NET_INCLUDE = build/amiga/netinclude
build/amiga/ae_net.o: src/ae_net.c include/ae_net.h
	@mkdir -p $(NET_SHIM)/devices
	@ln -sf "$(VENDOR_NDK_ROOT)/Include_H/devices/timer.h" $(NET_SHIM)/devices/timer.h
	@ln -sfn "$(VENDOR_NDK_ROOT)/SANA+RoadshowTCP-IP/netinclude" $(NET_INCLUDE)
	$(VC) -I$(NET_SHIM) -I$(NET_INCLUDE) $(AMIGA_CFLAGS) -c $< -o $@

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

# W: the caller's settings (express.e internalCommandW) and the settings hub.
build/amiga/usersettings: examples/usersettings/usersettings.c examples/usersettings/us_model.c examples/usersettings/us_model.h build/amiga/libae.lib
	@mkdir -p build/amiga
	$(VC) $(AMIGA_CFLAGS) -Iexamples/usersettings examples/usersettings/usersettings.c examples/usersettings/us_model.c build/amiga/libae.lib -lauto -o $@

build/amiga/achieve: examples/achieve/achieve.c examples/achieve/achieve_rows.c examples/achieve/achieve_rows.h build/amiga/libae.lib
	@mkdir -p build/amiga
	$(VC) $(AMIGA_CFLAGS) -Iexamples/achieve examples/achieve/achieve.c examples/achieve/achieve_rows.c build/amiga/libae.lib -lauto -o $@

# The global-requests door: reads and writes through ae_request, drawn with
# the same widgets. Links the WHOLE library; make measure proves only what it
# calls costs bytes.
build/amiga/requests: examples/requests/requests.c examples/requests/requests_bulletin.c examples/requests/requests_bulletin.h build/amiga/libae.lib
	@mkdir -p build/amiga
	$(VC) $(AMIGA_CFLAGS) -Iexamples/requests examples/requests/requests.c examples/requests/requests_bulletin.c build/amiga/libae.lib -lauto -o $@

# The public-discussion door: reads through ae_msgbase, hands EALL back to the
# board to compose, drawn with the same widgets at all three widths.
build/amiga/subs: examples/subs/subs.c examples/subs/subs_scan.c examples/subs/subs_scan.h build/amiga/libae.lib
	@mkdir -p build/amiga
	$(VC) $(AMIGA_CFLAGS) -Iexamples/subs examples/subs/subs.c examples/subs/subs_scan.c build/amiga/libae.lib -lauto -o $@

# The Text-TV client: fetches api.texttv.nu over plain HTTP through ae_http,
# drawn with the same widgets at both widths. Two translation units - the
# door and its pure helpers - linked beside the library, never as objects.
build/amiga/texttv: examples/texttv/texttv.c examples/texttv/texttv_parse.c examples/texttv/texttv_parse.h $(AMIGA_HEADERS) build/amiga/libae.lib
	@mkdir -p build/amiga
	$(VC) $(AMIGA_CFLAGS) -Iexamples/texttv examples/texttv/texttv.c examples/texttv/texttv_parse.c build/amiga/libae.lib -lauto -o $@

build/amiga/bench_repaint: examples/bench/bench_repaint.c build/amiga/libae.lib
	@mkdir -p build/amiga
	$(VC) $(AMIGA_CFLAGS) $< build/amiga/libae.lib -lauto -o $@

# The pair the repaint measurement needs: identical but for the frame count,
# so the DIFFERENCE between them is the cost of ten frames with start-up and
# registration cancelled out.
build/amiga/bench_repaint11: examples/bench/bench_repaint.c build/amiga/libae.lib
	@mkdir -p build/amiga
	$(VC) $(AMIGA_CFLAGS) -DBENCH_FRAMES=11 $< build/amiga/libae.lib -lauto -o $@

measure: amiga
	@sh tools/measure-link.sh

# What one keypress costs the proof door, at both widths, through the
# board's own emulator (needs the backend's node_modules). "Doors draw
# smart" in RULES.md: a cursor move is a row, not a screen.
.PHONY: probe
probe: build/amiga/theme-picker
	@cd ../.. && npx tsx --tsconfig web/backend/tsconfig.json dev/scripts/door-probe/repaint-cost.ts sdk/c/build/amiga/theme-picker --cols 80 2>/dev/null
	@cd ../.. && npx tsx --tsconfig web/backend/tsconfig.json dev/scripts/door-probe/repaint-cost.ts sdk/c/build/amiga/theme-picker --cols 40 2>/dev/null

# ---------------------------------------------------------------------------
# door.settings.json, generated from the door's OWN declaration.
#
# A door registers in the admin automatically (the board scans BBSCmd .info at
# boot). Its SETTINGS did not: those needed a hand-written
# Doors/<door>/door.settings.json, so of 138 registered doors 8 had a form.
#
# The declaration now lives beside the code that reads the values
# (examples/<door>/settings.c, using the AE_SETTINGS_* macros), and this
# target emits the manifest the admin already knows how to read. Built for the
# HOST: nothing has to run a 68K binary to learn what it can be told.
#
# Add a door by adding its name here and writing its settings.c.
# Each entry is <example-dir>:<Doors-dir>. Explicit rather than clever: an
# earlier version derived the destination by lowercasing and matching inside a
# pipeline, and the nested shell case broke make outright.
SETTINGS_DOORS = requests:REQUESTS subs:SUBS texttv:TEXTTV

.PHONY: settings
settings:
	@mkdir -p build/host
	@for pair in $(SETTINGS_DOORS); do \
	  src=`echo $$pair | cut -d: -f1`; \
	  dst=`echo $$pair | cut -d: -f2`; \
	  if [ ! -f examples/$$src/settings.c ]; then \
	    echo "  settings: examples/$$src/settings.c missing - skipped"; \
	    continue; \
	  fi; \
	  $(CC) -I include -o build/host/emit-$$src \
	    tools/emit-door-settings.c src/ae_settings.c examples/$$src/settings.c -lm || exit 1; \
	  if [ -d ../../Doors/$$dst ]; then \
	    ./build/host/emit-$$src > ../../Doors/$$dst/door.settings.json || exit 1; \
	    echo "  settings -> Doors/$$dst/door.settings.json"; \
	  else \
	    ./build/host/emit-$$src > build/host/$$src.door.settings.json || exit 1; \
	    echo "  settings: no Doors/$$dst - wrote build/host/$$src.door.settings.json"; \
	  fi; \
	done

clean:
	rm -rf build
