#!/usr/bin/env bash
set -euo pipefail

REGISTRY=${REGISTRY:?REGISTRY must be set to target registry (e.g. ghcr.io/jigsawlodgesociety)}
TAG_SUFFIX=${TAG_SUFFIX:-}

declare -A digests=(
  [backend]=1b3605a581dc
  [worker]=a3a27579ca1e
  [relay]=05871a1aaabd
)

gen_tag() {
  local svc=$1 digest=$2
  if [[ -n $TAG_SUFFIX ]]; then
    printf "%s/jls-%s:%s-%s" "$REGISTRY" "$svc" "$TAG_SUFFIX" "$digest"
  else
    printf "%s/jls-%s:%s" "$REGISTRY" "$svc" "$digest"
  fi
}

for svc in backend worker relay; do
  digest=${digests[$svc]}
  target=$(gen_tag "$svc" "$digest")
  echo "Tagging $digest -> $target"
  docker tag "$digest" "$target"
  echo "Pushing $target"
  docker push "$target"
done
