MODULES = score

all:	$(MODULES)

score:	score.s relocator.s config.i
	vasm.vasmm68k-mot -no-opt -o $@ -Fbin $<

clean:

