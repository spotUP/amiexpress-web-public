/*
 *   $VER: KillMM.rexx 1.0 (22.7.93)
 *      By Kenneth Yarnall.  This code may be freely distributed.
 *
 *   KillMM.rexx simply removes Middleman from your system.  It does this by
 * sending the 'Quit' command to the Middleman ARexx port, TTX_SASC.
 */

if Show('P','TTX_SASC') then
	Address TTX_SASC 'Quit'

exit 0
