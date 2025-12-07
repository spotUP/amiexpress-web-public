#ifndef D_DIRWALK_H
#define D_DIRWALK_H

/* Walk a directory tree.  Call the 'dirfunc' function pointer on each */
/* directory, and the 'filefunc' function pointer on each file.        */

int dirwalker(char *name, 
              int (*dirfunc)(char *path, char *dir), 
              int (*filefunc)(char *path, char *file));

#endif
