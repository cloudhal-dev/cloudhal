#!/usr/bin/env bash
# deploy/swarm/stack.yml on this Docker engine (RFC-0047 §10; .github/workflows/docker.yml):
# secrets from the image, the stack with two instances, health, the first owner, a publish live
# on the next request through the routing mesh, and a forced rolling update while the site is
# polled. Turns swarm mode on if it is off, and off again at the end (then only).
#
#   scripts/swarm-smoke.sh <image ref, e.g. cloudhal:local> [--port <n>]
set -euo pipefail
image=${1:?usage: scripts/swarm-smoke.sh <image> [--port <n>]}
port=58787
[ "${2:-}" = "--port" ] && port=${3:?}
root=$(cd "$(dirname "$0")/.." && pwd)
stack="chsmoke$$"
work=$(mktemp -d)
started_swarm=no
step() { echo "✓ $*"; }
fail() {
  echo "✗ $*" >&2
  docker service ps "${stack}_cloudhal" --no-trunc >&2 || true
  docker service logs --tail 80 "${stack}_cloudhal" >&2 || true
  exit 1
}
cleanup() {
  docker stack rm "$stack" >/dev/null 2>&1 || true
  for i in $(seq 1 30); do
    [ -z "$(docker ps -q --filter "label=com.docker.stack.namespace=$stack")" ] && break
    sleep 2
  done
  docker secret ls --format '{{.Name}}' | grep '^cloudhal_' | xargs -r docker secret rm >/dev/null 2>&1 || true
  docker volume rm cloudhal-data-1 cloudhal-data-2 cloudhal-data-3 "${stack}_cloudhal-store" >/dev/null 2>&1 || true
  [ "$started_swarm" = yes ] && docker swarm leave --force >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

if [ "$(docker info --format '{{.Swarm.LocalNodeState}}')" != active ]; then
  docker swarm init >/dev/null
  started_swarm=yes
fi
if docker secret ls --format '{{.Name}}' | grep -q '^cloudhal_'; then
  echo "this swarm already has cloudhal_* secrets: run the smoke test on a scratch engine" >&2
  started_swarm=no
  exit 1
fi
docker node update --label-add cloudhal.store=true "$(docker node ls --format '{{.Self}} {{.ID}}' | awk '$1=="true"{print $2}')" >/dev/null
docker run --rm "$image" secrets > "$work/secrets.env"
"$root/deploy/swarm/create-secrets.sh" < "$work/secrets.env" >/dev/null
set -a
# shellcheck disable=SC1091
. "$work/secrets.env"
set +a
local_tag="ghcr.io/cloudhal-dev/cloudhal:smoke-$$"
docker tag "$image" "$local_tag"
CLOUDHAL_TAG="smoke-$$" CLOUDHAL_PORT=$port CLOUDHAL_SITE_PORT=$((port + 1)) CLOUDHAL_SITE_NAME="Smoke Site" \
  docker stack deploy -c "$root/deploy/swarm/stack.yml" "$stack" >/dev/null 2>&1
studio="http://localhost:$port"
site="http://127.0.0.1:$((port + 1))"
for i in $(seq 1 90); do
  [ "$(docker service ls --filter "name=${stack}_cloudhal" --format '{{.Replicas}}')" = "2/2" ] &&
    curl -sf -o /dev/null "$studio/api/health" && break
  [ "$i" = 90 ] && fail "the stack did not come up within 270 s"
  sleep 3
done
step "two instances, the store and the bucket are up"
for i in $(seq 1 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "$site/")" = 503 ] && break
  [ "$i" = 60 ] && fail "the site never answered its 503 before the first publish"
  sleep 2
done
pw=$(openssl rand -hex 12)
code=$(curl -s -c "$work/jar" -o /dev/null -w '%{http_code}' "$studio/api/auth/sign-up/email" -H "origin: $studio" \
  -H 'content-type: application/json' -H "x-cloudhal-setup-token: $CLOUDHAL_SETUP_TOKEN" \
  -d "{\"name\":\"Smoke Owner\",\"email\":\"owner@example.com\",\"password\":\"$pw\"}")
[ "$code" = 200 ] || fail "sign-up of the first owner ($code)"
code=$(curl -s -b "$work/jar" -o /dev/null -w '%{http_code}' -X POST "$studio/api/sites/$CLOUDHAL_SITE_ID/snapshots" \
  -H "origin: $studio" -H 'content-type: application/json' -d '{"publish":true}')
[ "$code" = 201 ] || fail "publish ($code)"
for i in 1 2 3 4; do curl -s "$site/" | grep -q "<title>Smoke Site</title>" || fail "the site after the publish"; done
step "the owner signed up; a publish is live on the next request through the routing mesh"

: > "$work/codes"
( while [ ! -f "$work/stop" ]; do curl -s -m 10 -o /dev/null -w '%{http_code}\n' "$site/" >> "$work/codes"; sleep 0.3; done ) &
poller=$!
timeout 600 docker service update --force --detach=false "${stack}_cloudhal" >/dev/null 2>&1 || fail "the rolling update"
sleep 3
touch "$work/stop"
wait "$poller" || true
total=$(wc -l < "$work/codes" | tr -d ' ')
ok=$(grep -c '^200$' "$work/codes" || true)
[ $((total - ok)) -le $((total / 20 + 2)) ] || fail "the site answered $ok of $total requests during the update"
step "rolling update: the site answered $ok of $total requests"
docker rmi "$local_tag" >/dev/null 2>&1 || true
echo
echo "Swarm smoke test passed."
