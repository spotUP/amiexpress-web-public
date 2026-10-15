/*
 * Test door that uses AEDoor.library WriteStr
 */

#include <clib/exec_protos.h>
#include <exec/types.h>
#include <exec/libraries.h>

/* SysBase is provided by startup.o - declare as extern */
extern struct Library *SysBase;

struct Library *AEDoorBase = NULL;

/* External assembly function */
extern void WriteStr(char *text, struct Library *base);

int main(int argc, char **argv) {
    /* Open AEDoor.library */
    AEDoorBase = OpenLibrary("AEDoor.library", 0);
    if (!AEDoorBase) {
        return 20;  /* ERROR */
    }

    /* Call WriteStr via assembly wrapper */
    WriteStr("[PASS] vbcc + AEDoor.library works!\r\n", AEDoorBase);

    /* Close library */
    CloseLibrary(AEDoorBase);
    
    return 0;  /* SUCCESS */
}
