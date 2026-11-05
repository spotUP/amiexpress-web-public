echo >>bbs:amixnet.log "-->Initiating TaskTime to collect mail at <insert time to call out here HH:MM:SS>" 
run >nil: bbs:amixnet/utils/TaskTime <insert time to call out here HH:MM:SS> bbs:amixnet/scripts/fetch.s
