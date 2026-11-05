.key add
.bra {
.ket }
bbs:amixnet/utils/netmerge >>bbs:amixnet/logs/amixnet.log bbs: 0 bbs:AmiXnet/Confs/AX0001/ {add} bbs:amixnet/inbound/
bbs:amixnet/utils/netmerge >>bbs:amixnet/logs/amixnet.log bbs: 0 bbs:AmiXnet/Confs/KS0001/ {add} bbs:amixnet/inbound/
bbs:amixnet/utils/netmerge >>bbs:amixnet/logs/amixnet.log bbs: 0 bbs:AmiXnet/Confs/KS0003/ {add} bbs:amixnet/inbound/
bbs:amixnet/utils/netmerge >>bbs:amixnet/logs/amixnet.log bbs: 0 bbs:AmiXnet/Confs/KS0004/ {add} bbs:amixnet/inbound/
bbs:amixnet/scripts/makeroute.s
delete >nil: bbs:amixnet/inbound/#?
endcli >nil:
