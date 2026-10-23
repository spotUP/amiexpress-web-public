#!/bin/sh
# Sourced by docker-entrypoint.sh (and by its test): gives JWT_SECRET,
# JWT_REFRESH_SECRET and SESSION_SECRET a strong random value when the
# environment leaves them unset or at a placeholder.
#
# A value set in the environment always wins and is never written anywhere.
# A generated value is kept in $SECRETS_FILE (mode 600, owned by the user who
# runs this) so later starts reuse it and tokens survive a restart.
# The placeholder list matches isPlaceholderSecret() in
# web/backend/src/utils/jwt-secrets.ts - change both together.

SECRETS_FILE="${SECRETS_FILE:-/app/data/.secrets}"

is_placeholder_secret() {
    v=$(printf '%s' "$1" | tr 'A-Z' 'a-z')
    case "$v" in
        ""|change_me|changeme|your_*_here) return 0 ;;
        amiexpress-secret-key-change-in-production) return 0 ;;
        amiexpress-refresh-secret-change-in-production) return 0 ;;
    esac
    return 1
}

random_secret() {
    od -An -tx1 -N48 /dev/urandom | tr -d ' \n'
}

ensure_secret() {
    name="$1"
    eval "current=\${$name:-}"
    if ! is_placeholder_secret "$current"; then
        return 0
    fi
    stored=""
    if [ -f "$SECRETS_FILE" ]; then
        stored=$(sed -n "s/^$name=//p" "$SECRETS_FILE" | head -n 1)
    fi
    if is_placeholder_secret "$stored"; then
        stored=$(random_secret)
        mkdir -p "$(dirname "$SECRETS_FILE")"
        (umask 077; printf '%s=%s\n' "$name" "$stored" >> "$SECRETS_FILE")
        echo "[Entrypoint] $name was unset or a placeholder: generated one into $SECRETS_FILE"
    else
        echo "[Entrypoint] $name was unset or a placeholder: using the one in $SECRETS_FILE"
    fi
    chmod 600 "$SECRETS_FILE" 2>/dev/null
    eval "$name=\$stored"
    export "$name"
}

ensure_secret JWT_SECRET
ensure_secret JWT_REFRESH_SECRET
ensure_secret SESSION_SECRET
