#!/usr/bin/env bash
# Czeka aż WFS zbiorczy GUGiK wróci do zdrowia, po czym uruchamia pełny ETL
# dla powiatu otwockiego (TERYT 1417). Raport: data/etl-1417-report.json
set -u
HEALTH_URL="https://mapy.geoportal.gov.pl/wss/service/PZGIK/EGIB/WFS/UslugaZbiorcza"
FILTER='FILTER=<Filter><PropertyIsLike wildCard="%" singleChar="_" escapeChar=\""><PropertyName>ms:ID_DZIALKI</PropertyName><Literal>1417%</Literal></PropertyIsLike></Filter>'
cd /root/wt-etl-real/scripts/sync-egib
export EGIB_PMTILES__TIPPECANOE_PATH=/root/tippecanoe/tippecanoe
export EGIB_SOURCES__USE_WFS=1

for i in $(seq 1 200); do
  code=$(curl -s -o /tmp/wfs-health.xml -w "%{http_code}" -m 60 --get "$HEALTH_URL" \
    --data-urlencode "service=WFS" \
    --data-urlencode "version=2.0.0" \
    --data-urlencode "request=GetFeature" \
    --data-urlencode "typeNames=ms:dzialki" \
    --data-urlencode "count=1" \
    --data-urlencode "${FILTER//\\\"/\"}")
  if [ "$code" = "200" ]; then
    echo "$(date -Is) WFS healthy (200), uruchamiam ETL"
    break
  fi
  echo "$(date -Is) WFS unhealthy (HTTP $code), próba $i — czekam 120 s"
  sleep 120
done

exec /root/venv-etl/bin/python -m egib_sync \
  --wfs --powiat 1417 \
  --data-dir /root/wt-etl-real/data \
  --report /root/wt-etl-real/data/etl-1417-report.json \
  --log-level INFO
