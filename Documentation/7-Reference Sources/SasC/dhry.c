/*
 * DHRYSTONE - A Benchmark Program (Dr. Dobb's Journal, September 1986)
 *
 *
 * MACHINE TYPE     OS              COMPILER        DHRY/SEC  INDEX AMIIDX
 * -----------------------------------------------------------------------
 * IBM PC           PC-DOS 3.1      Microsoft C 3.0      333   1.00   0.76
 * IBM PC/AT        PC-DOS 3.1      Microsoft C 3.0     1041   3.13   2.38
 * IBM PC/AT        PC-DOS 3.0      CI-C86 2.1           684   2.05   1.56
 * IBM PC/AT        VENIX/86 2.1    cc                  1000   3.00   2.28
 * AT&T 3B2/300     UNIX Sys V rel2 cc                   806   2.42   1.84
 * Sun II/120 a)    SunOS (4.2BSD)  cc                  1219   3.66   2.78
 * -----------------------------------------------------------------------
 * IBM PC with
 * 1 PC Turbo 286   PC-DOS 3.1      Microsoft C 3.0     1666   5.00   3.80
 * 2 PC TurbochargerPC-DOS 3.1      Microsoft C 3.0      877   2.63   2.00
 * 3 Pfaster 286    PC-DOS 3.1      Microsoft C 3.0     1724   5.17   3.94
 * 4 QuadSprint     PC-DOS 3.1      Microsoft C 3.0      657   1.97   1.50
 * 5 SpeedPac 286   PC-DOS 3.1      Microsoft C 3.0     1136   3.41   2.59
 * 6 286 Speed Pack PC-DOS 3.1      Microsoft C 3.0     1282   3.84   2.93
 * -----------------------------------------------------------------------
 * HP 9000s700 *)   HP-UX 9         gcc 2.3.3          57692 173.25 131.72
 * -----------------------------------------------------------------------
 * Amiga 500+ c)    Release 2.1     Lattice C 3.03       438   1.32   1.00
 * Amiga 500 b)     Release 2.04    SAS C 5.10b         1351   4.06   3.08
 * Amiga 500 b)     Release 2.04    DICE 2.05            666   2.00   1.52
 * Amiga 500 b)     Release 2.04    DICE 2.06.21         806   2.42   1.84
 * Amiga 500 b)     Release 2.04    gcc 2.2             1162   3.49   2.65
 * Amiga 500+ c)    Release 2.1     gcc 2.3.3           1136   3.41   2.59
 * Amiga 2000 d)    Release 2.04    SAS C 5.10b         9433  28.33  21.54
 * Amiga 500+ e)    Release 2.1     SAS C 6.51          1063   3.19   2.43
 * Amiga 500+ f)    Release 2.1     SAS C 6.51          1612   4.84   3.68
 * Amiga 500+ g)    Release 2.1     SAS C 6.51          2083   6.26   4.76
 * -----------------------------------------------------------------------
 * Compiled with:
 *   Lattice 3.03: lc1 dhrystone.c
 *                 lc2 -v -odhrystone.o dhrystone.q
 *                 alink lib:Lstartup.obj+dhrystone.o to dhrystone
 *                     library time.o+lib:lc.lib+lib:amiga.lib
 *      where time() is wrapper around intuition.library/CurrentTime().
 *
 *   SAS 5.10b:    lc -v -b1 -j85 -O -Ltv dhrystone
 *   DICE:         dcc -o dhrystone dhrystone.c
 *   gcc:          gcc dhrystone.c -O2 -fomit-frame-pointer
 *                        -funroll-loops -finline-functions
 *   SAS 6.51 (d): sc link dhrystone.c nostkchk
 *            (e): sc link dhrystone.c nostkchk opt
 *            (f): sc link dhrystone.c nostkchk opt optcom=100
 *                    optdep=100 optinl optloop optrdep=100
 *
 *  a) 10 MHz Motorola 68010
 *  b) 7.14 MHz Motorola 68000 - PAL version with 3 Mb RAM (2 Mb fast-ram).
 *  d) with GVP 3001 28 MHz Motorola 68030 accelerator board with 32 bit RAM.
 *  c,e-g) 7.14 MHz Motorola 68000 - PAL version with 4 Mb RAM (2 Mb fast-ram).
 *
 *  1)  8 MHz Intel 80286 (no wait states)
 *  2) 10 MHz Intel 8086
 *  3)  8 MHz Intel 80286 + 80287
 *  4)  9.54 MHz Intel 8086 with 4k cache
 *  5)  7.2 MHz Intel 80286
 *  6)  ? MHz Intel 80286
 *
 *  *) Using 1500000 loops at a load avg. of 1.3
 *
 *
 *
 *  LOOPS 500000
 *  A1200 (+8mb Fast Ram) emulated on linux (kubuntu 64bit) with fs-uae 2.2.3
 *	Comp	Version	DHRY/SEC	TIME
 *  gcc		3.4.0	14285   	(35 secs)
 *  sc 		6.58	13513   	(37 secs)
 *  vbcc 	V0.9b	13157		(38 secs)
 *
 *  sc link dhry.c nostkchk opt optcomp=100 optdep=100 optinline optloop
 *  	optrdep=100 optschd cpu=68020
 *
 *  gcc -O3 -Wall -c -fmessage-length=0 -fomit-frame-pointer -m68020
 *  	-funroll-loops -finline-functions
 *
 *  vc +aos68k -O4 -cpu=68020
 *
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifdef NOSTRUCTASSIGN
#define structassign(d, s)  memcpy(&(d), &(s), sizeof(d))
#else
#define structassign(d, s)  d = s
#endif

typedef enum { Ident1, Ident2, Ident3, Ident4, Ident5 } Enumeration;

typedef int     OneToThirty;
typedef int     OneToFifty;
typedef char    CapitalLetter;
typedef char    String30[31];
typedef int     Array1Dim[51];
typedef int     Array2Dim[51][51];

struct Record {
    struct Record   *PtrComp;
    Enumeration     Discr;
    Enumeration     EnumComp;
    OneToFifty      IntComp;
    String30        StringComp;
};

typedef struct Record   RecordType;
typedef RecordType      *RecordPtr;
typedef int             boolean;

/*#define NULL    0*/
#define TRUE    1
#define FALSE   2

#ifndef REG
#define REG
#endif

extern Enumeration  Func1();
extern boolean      Func2();

int LOOPS;

int main( int argc, char  *argv[] )
{
    if ( argc >  1 ) {
	  LOOPS = atoi( argv[1] );
	} else {
	  LOOPS = 500000;
	}
	
    Proc0();
	return 0;
}

/*
 * Package 1
 */
int         IntGlob;
boolean     BoolGlob;
char        Char1Glob;
char        Char2Glob;
Array1Dim   Array1Glob;
Array2Dim   Array2Glob;
RecordPtr   PtrGlob;
RecordPtr   PtrGlobNext;


Proc0()
{
    OneToFifty      IntLoc1;
    REG OneToFifty  IntLoc2;
    OneToFifty      IntLoc3;
    REG char        CharLoc;
    REG char        CharIndex;
    REG Enumeration EnumLoc;
    String30        String1Loc;
    String30        String2Loc;
/*
#define LOOPS   500000
*/
    long                    time();
    long                    starttime;
    long                    benchtime;
    long                    nulltime;
    register unsigned int   i;

    starttime = time(0);
    for(i = 0; i < LOOPS; ++i)
        ;
    nulltime = time(0) - starttime;

    PtrGlobNext = (RecordPtr) malloc(sizeof(RecordType));
    PtrGlob = (RecordPtr) malloc(sizeof(RecordType));
    PtrGlob->PtrComp = PtrGlobNext;
    PtrGlob->Discr = Ident1;
    PtrGlob->EnumComp = Ident3;
    PtrGlob->IntComp = 40;
    strcpy(PtrGlob->StringComp, "DHRYSTONE PROGRAM, SOME STRING");

    /* Start timer */

    starttime = time(0);
    for(i = 0; i < LOOPS; ++i)
    {
        Proc5();
        Proc4();
        IntLoc1 = 2;
        IntLoc2 = 3;
        strcpy(String2Loc, "DHRYSTONE PROGRAM, 2'ND STRING");
        EnumLoc = Ident2;
        BoolGlob = !Func2(String1Loc, String2Loc);
        while(IntLoc1 < IntLoc2)
        {
            IntLoc3 = 5 * IntLoc1 - IntLoc2;
            Proc7(IntLoc1, IntLoc2, &IntLoc3);
            ++IntLoc1;
        }
        Proc8(Array1Glob, Array2Glob, IntLoc1, IntLoc3);
        Proc1(PtrGlob);
        for(CharIndex = 'A'; CharIndex <= Char2Glob; ++CharIndex)
            if(EnumLoc == Func1(CharIndex, 'C'))
                Proc6(Ident1, &EnumLoc);
        IntLoc3 = IntLoc2 * IntLoc1;
        IntLoc2 = IntLoc3 / IntLoc1;
        IntLoc2 = 7 * (IntLoc3 - IntLoc2) - IntLoc1;
        Proc2(&IntLoc1);
    }

    /* Stop timer */

    benchtime = time(0) - starttime - nulltime;
    printf("Dhrystone time for %ld passes = %ld\n", (long) LOOPS, benchtime);
    printf("This machine benchmarks at %ld dhrystones/second\n",
            ((long) LOOPS) / benchtime);
}


Proc1(PtrParIn)
REG RecordPtr PtrParIn;
{
#define NextRecord (*(PtrParIn->PtrComp))

    structassign(NextRecord, *PtrGlob);
    PtrParIn->IntComp = 5;
    NextRecord.IntComp = PtrParIn->IntComp;
    NextRecord.PtrComp = PtrParIn->PtrComp;
    Proc3(NextRecord.PtrComp);
    if(NextRecord.Discr == Ident1)
    {
        NextRecord.IntComp = 6;
        Proc6(PtrParIn->EnumComp, &NextRecord.EnumComp);
        NextRecord.PtrComp = PtrGlob->PtrComp;
        Proc7(NextRecord.IntComp, 10, &NextRecord.IntComp);
    }
    else
        structassign(*PtrParIn, NextRecord);
#undef NextRecord
}


Proc2(IntParIO)
OneToFifty *IntParIO;
{
    REG OneToFifty  IntLoc;
    REG Enumeration EnumLoc;

    IntLoc = *IntParIO + 10;
    for(;;)
    {
        if(Char1Glob == 'A')
        {
            --IntLoc;
            *IntParIO = IntLoc - IntGlob;
            EnumLoc = Ident1;
        }
        if(EnumLoc == Ident1)
            break;
    }
}


Proc3(PtrParOut)
RecordPtr *PtrParOut;
{
    if(PtrGlob != NULL)
        *PtrParOut = PtrGlob->PtrComp;
    else
        IntGlob = 100;
    Proc7(10, IntGlob, &PtrGlob->IntComp);
}


Proc4()
{
    REG boolean BoolLoc;

    BoolLoc = Char1Glob == 'A';
    BoolLoc |= BoolGlob;
    Char2Glob = 'B';
}


Proc5()
{
    Char1Glob = 'A';
    BoolGlob = FALSE;
}


extern boolean Func3();


Proc6(EnumParIn, EnumParOut)
REG Enumeration EnumParIn;
REG Enumeration *EnumParOut;
{
    *EnumParOut = EnumParIn;
    if(!Func3(EnumParIn))
        *EnumParOut = Ident4;
    switch(EnumParIn)
    {
        case Ident1: *EnumParOut = Ident1; break;
        case Ident2: if(IntGlob > 100) *EnumParOut = Ident1;
                     else *EnumParOut = Ident4;
                     break;
        case Ident3: *EnumParOut = Ident2; break;
        case Ident4: break;
        case Ident5: *EnumParOut = Ident3;
    }
}


Proc7(IntParI1, IntParI2, IntParOut)
OneToFifty  IntParI1;
OneToFifty  IntParI2;
OneToFifty  *IntParOut;
{
    REG OneToFifty IntLoc;

    IntLoc = IntParI1 + 2;
    *IntParOut = IntParI2 + IntLoc;
}


Proc8(Array1Par, Array2Par, IntParI1, IntParI2)
Array1Dim   Array1Par;
Array2Dim   Array2Par;
OneToFifty  IntParI1;
OneToFifty  IntParI2;
{
    REG OneToFifty IntLoc;
    REG OneToFifty IntIndex;

    IntLoc = IntParI1 + 5;
    Array1Par[IntLoc] = IntParI2;
    Array1Par[IntLoc + 1] = Array1Par[IntLoc];
    Array1Par[IntLoc + 30] = IntLoc;
    for(IntIndex = IntLoc; IntIndex <= (IntLoc + 1); ++IntIndex)
        Array2Par[IntLoc][IntLoc - 1] = IntLoc;
    ++Array2Par[IntLoc][IntLoc - 1];
    Array2Par[IntLoc + 20][IntLoc] = Array1Par[IntLoc];
    IntGlob = 5;
}


Enumeration Func1(CharPar1, CharPar2)
CapitalLetter CharPar1;
CapitalLetter CharPar2;
{
    REG CapitalLetter   CharLoc1;
    REG CapitalLetter   CharLoc2;

    CharLoc1 = CharPar1;
    CharLoc2 = CharLoc1;
    if(CharLoc2 != CharPar2)
        return Ident1;
    else
        return Ident2;
}


boolean Func2(StrParI1, StrParI2)
String30    StrParI1;
String30    StrParI2;
{
    REG OneToThirty     IntLoc;
    REG CapitalLetter   CharLoc;

    IntLoc = 1;
    while(IntLoc <= 1)
        if(Func1(StrParI1[IntLoc], StrParI2[IntLoc + 1]) == Ident1)
        {
            CharLoc = 'A';
            ++IntLoc;
        }
    if(CharLoc >= 'W' && CharLoc <= 'Z')
        IntLoc = 7;
    if(CharLoc == 'X')
        return TRUE;
    else
    {
        if(strcmp(StrParI1, StrParI2) > 0)
        {
            IntLoc += 7;
            return TRUE;
        }
        else
            return FALSE;
    }
}


boolean Func3(EnumParIn)
REG Enumeration EnumParIn;
{
    REG Enumeration EnumLoc;

    EnumLoc = EnumParIn;
    if(EnumLoc == Ident3)
        return TRUE;
    return FALSE;
}
