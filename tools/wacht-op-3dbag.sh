#!/bin/zsh
# Wait for the 3DBAG data service to come back, then rebuild the given zones.
#
# 3DBAG carries the roof type, ridge height, storey count and year of
# construction. Without it a zone still builds, but every roof comes out flat.
# The pipeline never caches that failure, so a later run fills it in.
#
#   npm run wacht -- vondelpark [jordaan ...]
set -e
cd "$(dirname "$0")/.."

ZONES=("${@}")
if [ ${#ZONES[@]} -eq 0 ]; then ZONES=(vondelpark); fi

PROEF="https://data.3dbag.nl/api/BAG3D/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=BAG3D:lod12&outputFormat=application/json&count=1&bbox=52.354,4.863,52.355,4.864,urn:ogc:def:crs:EPSG::4326"
POGINGEN=${POGINGEN:-60}
PAUZE=${PAUZE:-120}

for i in $(seq 1 $POGINGEN); do
  code=$(curl -sS --max-time 40 "$PROEF" -o /dev/null -w "%{http_code}" 2>/dev/null || echo "000")
  echo "[$(date +%H:%M:%S)] poging $i/$POGINGEN: http=$code"
  if [ "$code" = "200" ]; then
    echo "3DBAG antwoordt weer."
    for z in "${ZONES[@]}"; do
      # Drop the cached miss so the zone actually refetches.
      rm -f "tools/mapgen/.cache/$z.3dbag.json"
      echo
      npm run mapgen -- --zone "$z"
    done
    exit 0
  fi
  sleep $PAUZE
done

echo "3DBAG bleef onbereikbaar. Start dit script later opnieuw."
exit 1
