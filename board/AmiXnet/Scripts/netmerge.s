.key add,node
.bra {
.ket }
bbs:amixnet/utils/netmerge >>bbs:amixnet/logs/amixnet.log bbs: 0 bbs:AmiXnet/Confs/AX0001/ {add} bbs:node{node}/playpen/
bbs:amixnet/utils/netmerge >>bbs:amixnet/logs/amixnet.log bbs: 0 bbs:AmiXnet/Confs/KS0001/ {add} bbs:node{node}/playpen/
bbs:amixnet/utils/netmerge >>bbs:amixnet/logs/amixnet.log bbs: 0 bbs:AmiXnet/Confs/KS0003/ {add} bbs:node{node}/playpen/
bbs:amixnet/utils/netmerge >>bbs:amixnet/logs/amixnet.log bbs: 0 bbs:AmiXnet/Confs/KS0004/ {add} bbs:node{node}/playpen/
bbs:amixnet/scripts/makeroute.s
delete >nil: bbs:node{node}/PlayPen/#?
endcli >nil:
