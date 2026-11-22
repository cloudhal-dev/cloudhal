#!/bin/sh
# Reads `cloudhal selfhost secrets` (KEY=value lines) on stdin and creates one Docker secret per
# value, named cloudhal_<key in lower case, without a CLOUDHAL_ prefix>, for deploy/swarm/stack.yml.
# Refuses to replace a secret that exists: the site id and the cluster key must never change for an installation.
#
#   docker run --rm ghcr.io/cloudhal-dev/cloudhal:latest secrets | deploy/swarm/create-secrets.sh
set -eu
created=0
while IFS= read -r line; do
  case "$line" in
    "" | "#"*) continue ;;
  esac
  key=${line%%=*}
  value=${line#*=}
  name="cloudhal_$(printf '%s' "${key#CLOUDHAL_}" | tr '[:upper:]' '[:lower:]')"
  if docker secret inspect "$name" >/dev/null 2>&1; then
    echo "create-secrets: $name exists; left as it is" >&2
    continue
  fi
  printf '%s' "$value" | docker secret create "$name" - >/dev/null
  echo "create-secrets: created $name"
  created=$((created + 1))
done
echo "create-secrets: $created secret(s) created"
