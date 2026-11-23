#!/usr/bin/env bash
# The Helm chart on a throwaway kind cluster (RFC-0047 §10; .github/workflows/docker.yml):
#   1. installs deploy/helm/cloudhal with two instances and its SeaweedFS;
#   2. checks health, the 503 before the first publish, the first owner, a publish live on the
#      next request through the Service, and that a foreign pod cannot reach the cluster port;
#   3. keeps the Secret over an upgrade and serves the site with three instances.
#
#   scripts/helm-smoke.sh <image ref loaded in docker, e.g. cloudhal:local> [--keep]
# Needs docker, kind, helm and kubectl.
set -euo pipefail
image=${1:?usage: scripts/helm-smoke.sh <image> [--keep]}
keep=${2:-}
cluster="cloudhal-smoke-$$"
ns=cloudhal
root=$(cd "$(dirname "$0")/.." && pwd)
k() { kubectl --context "kind-$cluster" -n "$ns" "$@"; }
step() { echo "✓ $*"; }
fail() {
  echo "✗ $*" >&2
  k get pods -o wide >&2 || true
  k logs statefulset/ch-cloudhal -c cloudhal --tail=80 >&2 || true
  exit 1
}
cleanup() { [ "$keep" = "--keep" ] || kind delete cluster --name "$cluster" >/dev/null 2>&1 || true; }
trap cleanup EXIT

kind create cluster --name "$cluster" --wait 120s >/dev/null
kind load docker-image "$image" --name "$cluster" >/dev/null
repo=${image%:*}
tag=${image##*:}
[ "$repo" = "${repo#*/}" ] && repo="docker.io/library/$repo"
helm --kube-context "kind-$cluster" install ch "$root/deploy/helm/cloudhal" -n "$ns" --create-namespace \
  --set image.repository="$repo" --set image.tag="$tag" --set image.pullPolicy=Never \
  --set replicaCount=2 --set site.name="Smoke Site" >/dev/null
k rollout status statefulset/ch-cloudhal --timeout=600s >/dev/null || fail "the instances did not become ready"
step "two instances and the store are ready"

k run poll --image=curlimages/curl:8.11.1 --restart=Never --command -- sleep 3600 >/dev/null
k wait --for=condition=Ready pod/poll --timeout=180s >/dev/null
c() { k exec poll -- curl -s -m 10 "$@"; }
[ "$(c -o /dev/null -w '%{http_code}' http://ch-cloudhal:8787/api/health)" = 200 ] || fail "health"
[ "$(c -o /dev/null -w '%{http_code}' http://ch-cloudhal:8788/)" = 503 ] || fail "the site before the first publish"
step "health answers, the site answers 503 before the first publish"

secret() { k get secret ch-cloudhal -o "jsonpath={.data.$1}" | base64 -d; }
origin=http://ch-cloudhal:8787
pw=$(openssl rand -hex 12)
signup=$(c -o /dev/null -w '%{http_code}' -c /tmp/jar "$origin/api/auth/sign-up/email" -H "origin: $origin" \
  -H 'content-type: application/json' -H "x-cloudhal-setup-token: $(secret CLOUDHAL_SETUP_TOKEN)" \
  -d "{\"name\":\"Smoke Owner\",\"email\":\"owner@example.com\",\"password\":\"$pw\"}")
[ "$signup" = 200 ] || fail "sign-up of the first owner ($signup)"
publish=$(c -o /dev/null -w '%{http_code}' -b /tmp/jar -X POST "$origin/api/sites/$(secret CLOUDHAL_SITE_ID)/snapshots" \
  -H "origin: $origin" -H 'content-type: application/json' -d '{"publish":true}')
[ "$publish" = 201 ] || fail "publish ($publish)"
c http://ch-cloudhal:8788/ | grep -q "<title>Smoke Site</title>" || fail "the site after the publish"
step "the owner signed up with the setup token; a publish is live on the next request"

if c -o /dev/null -m 4 http://ch-cloudhal-0.ch-cloudhal-peers:7000/ready; then
  echo "! the cluster port answered a foreign pod: this CNI does not enforce NetworkPolicy" >&2
else
  step "a foreign pod cannot reach the cluster port (NetworkPolicy)"
fi

key=$(secret CLOUDHAL_CLUSTER_KEY | shasum)
helm --kube-context "kind-$cluster" -n "$ns" upgrade ch "$root/deploy/helm/cloudhal" --reuse-values --set replicaCount=3 >/dev/null
[ "$(secret CLOUDHAL_CLUSTER_KEY | shasum)" = "$key" ] || fail "the upgrade changed the cluster key"
k rollout status statefulset/ch-cloudhal --timeout=600s >/dev/null || fail "scaling to three"
c http://ch-cloudhal:8788/ | grep -q "<title>Smoke Site</title>" || fail "the site with three instances"
step "an upgrade kept the Secret; three instances serve the site"
echo
echo "Helm smoke test passed."
