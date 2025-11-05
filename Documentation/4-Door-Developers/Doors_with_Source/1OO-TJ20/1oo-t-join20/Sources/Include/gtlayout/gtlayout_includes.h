/*
**	GadTools layout toolkit
**
**	Copyright © 1993-1996 by Olaf `Olsen' Barthel
**		Freely distributable.
*/

#ifndef _GTLAYOUT_INCLUDES_H
#define _GTLAYOUT_INCLUDES_H 1

#include <exec/execbase.h>
#include <exec/resident.h>
#include <exec/memory.h>

#include <dos/dosextens.h>

#include <graphics/videocontrol.h>
#include <graphics/gfxmacros.h>
#include <graphics/gfxbase.h>

	// We don't want the old declarations

#define INTUI_V36_NAMES_ONLY

#include <intuition/intuitionbase.h>
#include <intuition/gadgetclass.h>
#include <intuition/imageclass.h>
#include <intuition/classusr.h>
#include <intuition/icclass.h>
#include <intuition/screens.h>
#include <intuition/classes.h>
#include <intuition/sghooks.h>

#include <libraries/gadtools.h>
#include <libraries/locale.h>

#include <devices/timer.h>

#include <stdarg.h>
#include <stdlib.h>
#include <string.h>
#include <stddef.h>

#include <clib/intuition_protos.h>
#include <clib/graphics_protos.h>
#include <clib/gadtools_protos.h>
#include <clib/diskfont_protos.h>
#include <clib/utility_protos.h>
#include <clib/keymap_protos.h>
#include <clib/locale_protos.h>
#include <clib/exec_protos.h>
#include <clib/alib_protos.h>
#include <clib/macros.h>

#include <pragmas/intuition_pragmas.h>
#include <pragmas/graphics_pragmas.h>
#include <pragmas/gadtools_pragmas.h>
#include <pragmas/diskfont_pragmas.h>
#include <pragmas/utility_pragmas.h>
#include <pragmas/keymap_pragmas.h>
#include <pragmas/locale_pragmas.h>
#include <pragmas/exec_pragmas.h>

#endif	// _GTLAYOUT_INCLUDES_H
