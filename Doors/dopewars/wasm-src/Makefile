CC = emcc
CFLAGS = -O2 \
         -I../../../sdk/utils/c-stubs \
         -s MODULARIZE=1 \
         -s EXPORT_NAME=DopewarsWasm \
         -s ALLOW_MEMORY_GROWTH=1 \
         -s ALLOW_TABLE_GROWTH=1 \
         -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","addFunction","UTF8ToString","stringToUTF8","allocate","ALLOC_NORMAL"]' \
         --no-entry \
         -Wno-implicit-function-declaration \
         -Wno-incompatible-pointer-types

SRCS = dopewars.c serverside.c configfile.c tstring.c util.c wasm-exports.c

all: ../dopewars.js

../dopewars.js: $(SRCS) dopewars.h serverside.h glib-stub.h wasm-exports.h
	$(CC) $(CFLAGS) $(SRCS) -o ../dopewars.js

clean:
	rm -f ../dopewars.js ../dopewars.wasm

.PHONY: all clean
