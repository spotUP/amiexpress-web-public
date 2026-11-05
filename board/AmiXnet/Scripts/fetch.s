echo >>bbs:amixnet/logs/amixnet.log "-->Commanding /X to Collect Mail on " NOLINE
date >>bbs:amixnet/logs/amixnet.log 
rx bbs:amixnet/scripts/syscmd.ced <insert node# to call out from here>
bbs:amixnet/scripts/termerge.s @<insert nodeid to call here>
run >nil: bbs:amixnet/scripts/schedule.s
