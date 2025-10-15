//----------------------------------------------------------------
//------------ Includes for 1oo% T-Join --------------------------
//----------------------------------------------------------------

typedef struct DesignLine *dl_ptr;

struct DesignLine
{
   char *line;
   dl_ptr next;
};

struct Join_Prefs
   {
   int  TOPAZSIZE;      // size of topaz-logo
   int  IBMSIZE;        // size of ibm-logo
   BOOL INFOBAR;        // show infobar
   BOOL ANSIBAR;        // use anibar ?
   BOOL NUMERICAL;      // allow direct num. input
   BOOL SHOWCONF0;      // is area 0 visible
   BOOL EXTERNALDESC;   // use descriptions from a external file
   BOOL EXTERNALNAMES;  // use areanames from an external file
   BOOL IBMAUTO;        // ibm logo auto sized?
   BOOL TOPAZAUTO;      // iso logo auto sized
   int  OUTPUT;         // which output
   };

