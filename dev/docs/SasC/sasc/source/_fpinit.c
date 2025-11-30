#ifdef M881
#include <dos.h>
#include <constructor.h>
#include <exec/execbase.h>
#include <proto/dos.h>
#endif
#include <stdio.h>
#include <proto/exec.h>

#ifdef FFP
extern struct Library *MathBase;
extern struct Library *MathTransBase;
#else
#ifdef IEEE
extern struct Library *MathIeeeDoubBasBase;
extern struct Library *MathIeeeDoubTransBase;
#endif
#endif

extern int (* far __ctors[])(void);
extern void (* far __dtors[])(void);


int __stdargs __fpinit(void)
{
   void * volatile p = &__ctors;  /* so GO won't eliminate tst */   
   /* call all the autoinit routines */
   if (p)
   {
       if ((*__ctors[-1])()) /* this function calls all the others */
          return 20;
   }

   return 0;
}

#ifdef M881
FP_CONSTRUCTOR(m881)
{
    extern struct ExecBase *SysBase;

    /* Check to see if an 881 is present */
    if ((SysBase->AttnFlags & (1 << AFB_68881)) == 0)
    {
        struct DOSBase *DOSBase;
        long fh;
        int closefh = 0;
        
        DOSBase = (struct DOSBase *)OpenLibrary("dos.library",0);
        fh = Output();
        if (fh == NULL)
        {
            fh = Open(__stdiowin, MODE_NEWFILE);
            closefh = 1;
        }
        
        if (fh)
        {
            Write(fh, "This program requires a math co-processor\n", 42);
            if (closefh)
               Close(fh);
        }
        CloseLibrary((struct Library *)DOSBase);
        return 1;  /* fail */
    }

    __emit(0xf23c);        /* put out the instruction FMOVE.L #$00,FPCR */
    __emit(0x9000);        /* This is Round toward nearest and use      */
    __emit(0x0000);        /* Extended precision.                       */
    __emit(0x0000);
    
    return 0;
}
#endif



void __stdargs __fpterm(void)
{
   void * volatile p = &__dtors;  /* so GO won't eliminate tst */   
   /* call all the auto close routines */
   if (p)
   {
       (*__ctors[-1])(); /* this function calls all the others */
   }

}
