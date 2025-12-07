/* Prototypes for functions defined in
gensmake.c
 */

int filetype(unsigned char * );

unsigned char * suffix(unsigned char * );

unsigned char * prefix(unsigned char * );

unsigned char * objout(unsigned char * );

void ExpandDeps(struct FileDesc * );

void GenSmake(FileList * );

void makeicon(unsigned char * );

int iconexists(unsigned char * );

