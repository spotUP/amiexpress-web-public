#include <stdio.h>
#include "dirwalker.h"

int dirfunc(char *path, char *dir)
{
   printf("DIR  %s%s\n", path, dir);
   return 0;
}

int filefunc(char *path, char *file)
{
   printf("FILE %s%s\n", path, file);
   return 0;
}

void main(int argc, char *argv[])
{
   dirwalker(argv[1], dirfunc, filefunc);
}