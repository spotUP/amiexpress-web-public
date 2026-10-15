#!/bin/bash
# Verify the door server after deploying the TSV + CORS work.
# Run AFTER the CI deploy reports success - a green workflow has lied on this
# host before, so every check here hits the live service over the network.
B_HTTPS=https://doors.uprough.net/api/door-repo
B_HTTP=http://doors.uprough.net/api/door-repo
fail=0
ok()   { echo "  [OK]    $1"; }
bad()  { echo "  [ERROR] $1"; fail=$((fail+1)); }

echo "=== 1. the service is up and serving the real catalog ==="
doors=$(curl -s -m 10 "$B_HTTPS/health" | python3 -c "import json,sys;print(json.load(sys.stdin)['doors'])" 2>/dev/null)
[ "$doors" = "3300" ] && ok "health reports 3300 doors" || bad "health reports '$doors', expected 3300"

echo "=== 2. CORS, what a browser client needs ==="
h=$(curl -s -D - -o /dev/null -m 10 -H "Origin: https://scenewall.bbs.io" "$B_HTTPS/list.txt" | tr -d '\r')
echo "$h" | grep -qi "access-control-allow-origin: \*" && ok "GET carries Allow-Origin: *" || bad "GET is missing Allow-Origin"
echo "$h" | grep -qi "access-control-expose-headers:.*X-Door-Repo-Revision" && ok "revision header is exposed" || bad "expose-headers missing the revision"
p=$(curl -s -D - -o /dev/null -m 10 -X OPTIONS -H "Origin: https://scenewall.bbs.io" -H "Access-Control-Request-Method: GET" "$B_HTTPS/manifest" | tr -d '\r')
echo "$p" | head -1 | grep -q "204" && ok "preflight returns 204" || bad "preflight: $(echo "$p" | head -1)"
echo "$p" | grep -qi "access-control-max-age: 86400" && ok "preflight caches for 86400s" || bad "preflight max-age missing"

echo "=== 3. plain HTTP, what a 68k client needs (must NOT redirect) ==="
code=$(curl -s -o /dev/null -m 10 -w "%{http_code}" "$B_HTTP/health")
[ "$code" = "200" ] && ok "plain HTTP returns 200, no redirect" || bad "plain HTTP returned $code"

echo "=== 4. the TSV index for uhcsearch ==="
tsv=$(curl -s -m 20 "$B_HTTP/index.tsv")
[ -n "$tsv" ] || bad "index.tsv is empty"
head1=$(printf '%s' "$tsv" | head -1)
[ "$head1" = "$(printf 'Filename\tPath\tSize\tSystem\tDescription')" ] && ok "header row is exactly right" || bad "header row is: $head1"
printf '%s' "$tsv" | head -3 | grep -q $'\r' && bad "CRLF found - his spec requires LF" || ok "LF line endings, no CR"
rows=$(printf '%s' "$tsv" | tail -n +2 | wc -l | tr -d ' ')
[ "$rows" -ge 3000 ] && ok "$rows rows" || bad "only $rows rows"
cols=$(printf '%s' "$tsv" | sed -n '2p' | awk -F'\t' '{print NF}')
[ "$cols" = "5" ] && ok "5 tab-separated columns" || bad "row has $cols columns"

echo "=== 5. the download URL uhcsearch will actually build ==="
code=$(curl -s -o /dev/null -m 20 -w "%{http_code}" "$B_HTTP/archive/AmiExpress/ACC-V103.LHA")
[ "$code" = "200" ] && ok "Path + / + Filename resolves" || bad "segmented archive URL returned $code"
md5live=$(curl -s -m 20 "$B_HTTP/archive/AmiExpress/ACC-V103.LHA" | md5sum | cut -c1-32)
[ "$md5live" = "ef283e5f22a26ad6167de3e2d787b55a" ] && ok "bytes match the known digest" || bad "digest mismatch: $md5live"

echo "=== 6. the .diz sibling, so an Amiga never downloads an archive to read a description ==="
diz=$(curl -s -m 10 "$B_HTTP/archive/ACC-V103.diz")
printf '%s' "$diz" | grep -qi "ACCOUNT ED" && ok ".diz sibling serves the description" || bad ".diz sibling returned: $(printf '%s' "$diz" | head -c 60)"

echo "=== 7. nothing that already worked has changed ==="
for p in health list.txt files/ACC-V103.LHA diz/ACC-V103.LHA; do
  a=$(curl -s -m 20 "https://bbs.uprough.net/api/door-repo/$p" | md5sum | cut -c1-32)
  b=$(curl -s -m 20 "$B_HTTPS/$p" | md5sum | cut -c1-32)
  [ "$a" = "$b" ] && ok "$p identical on both hosts" || bad "$p differs: bbs=$a doors=$b"
done

echo
[ "$fail" = "0" ] && echo "ALL CHECKS PASSED - the docs are safe to send." || echo "$fail CHECK(S) FAILED - do not send the docs yet."
exit $fail
