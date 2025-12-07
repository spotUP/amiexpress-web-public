# Generate prototypes for all .c files in the current directory

gproto:
   scopts genproto
   sc \#?.c
   scopts nogenproto
