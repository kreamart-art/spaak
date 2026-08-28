#!/bin/zsh
# Bring a generated mesh down to something a phone can draw at 60fps.
#
# An image-to-3D service hands back a couple of million triangles, which is one
# to two orders of magnitude more than a runner can afford for an object that is
# on screen at sixty pixels tall. Welding first matters: the simplifier cannot
# collapse across split vertices, and a raw export is full of them.
set -e
cd "$(dirname "$0")/.."

IN="${1:-tools/modellen-bron/fatbike-split.glb}"
UIT="${2:-public/modellen/fatbike.glb}"
RATIO="${3:-0.012}"
TIJDELIJK="$(mktemp -t spaakmodel).glb"

if [ ! -f "$IN" ]; then
  echo "Niet gevonden: $IN"
  exit 1
fi

echo "invoer: $IN"
npx gltf-transform weld "$IN" "$TIJDELIJK" >/dev/null
npx gltf-transform simplify "$TIJDELIJK" "$UIT" --ratio "$RATIO" --error 0.004 >/dev/null
npx gltf-transform prune "$UIT" "$UIT" >/dev/null
rm -f "$TIJDELIJK"

echo
npx gltf-transform inspect "$UIT" 2>/dev/null | grep -A3 " SCENES" | tail -1
ls -lh "$UIT" | awk '{print "bestand:", $9, $5}'
