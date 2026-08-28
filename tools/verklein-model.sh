#!/bin/zsh
# Bring a generated mesh down to something a phone can draw at 60fps.
#
# An image-to-3D service hands back a couple of million triangles and 2K PBR
# maps. That is one to two orders of magnitude more than a runner can afford for
# an object that is on screen at a couple of hundred pixels. Welding first
# matters: the simplifier cannot collapse across split vertices, and a raw
# export is full of them.
set -e
cd "$(dirname "$0")/.."

IN="${1:-tools/modellen-bron/fatbike-textuur.glb}"
UIT="${2:-public/modellen/fatbike.glb}"
RATIO="${3:-0.012}"
TEX="${4:-1024}"
T1="$(mktemp -t spaak1).glb"
T2="$(mktemp -t spaak2).glb"

if [ ! -f "$IN" ]; then
  echo "Niet gevonden: $IN"
  exit 1
fi

echo "invoer: $IN"
npx gltf-transform weld "$IN" "$T1" >/dev/null
npx gltf-transform simplify "$T1" "$T2" --ratio "$RATIO" --error 0.004 >/dev/null
npx gltf-transform resize "$T2" "$T1" --width "$TEX" --height "$TEX" >/dev/null
npx gltf-transform webp "$T1" "$T2" --quality 82 >/dev/null
npx gltf-transform prune "$T2" "$UIT" >/dev/null
rm -f "$T1" "$T2"

npx gltf-transform inspect "$UIT" 2>/dev/null | grep -E "TRIANGLES|resolution|image/" | head -6
ls -lh "$UIT" | awk '{print "bestand:", $9, $5}'
