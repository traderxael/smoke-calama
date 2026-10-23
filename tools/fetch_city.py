"""Descarga las huellas de edificios de Calama y las deja en un JSON simple.

Usa la API 0.6 de OpenStreetMap por mosaicos (rápida y estable para áreas
pequeñas), con solape para no cortar edificios en los bordes.
"""
import json, os, time, urllib.request
import xml.etree.ElementTree as ET

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "research", "city")
os.makedirs(OUT, exist_ok=True)
UA = "SmokeCalama/1.0 (educational project; github.com/traderxael/smoke-calama)"

S, W, N, E = -22.482, -68.968, -22.422, -68.888
STEP = 0.02
PAD = 0.0015
tiles = []
lat = S
while lat < N:
    lon = W
    while lon < E:
        tiles.append((lat - PAD, lon - PAD, min(lat + STEP + PAD, N + PAD), min(lon + STEP + PAD, E + PAD)))
        lon += STEP
    lat += STEP

print("mosaicos", len(tiles))
ways = {}
for i, (s, w, n, e) in enumerate(tiles):
    url = f"https://api.openstreetmap.org/api/0.6/map?bbox={w:.5f},{s:.5f},{e:.5f},{n:.5f}"
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                raw = r.read()
            # el XML viene de la API oficial por HTTPS; se rechaza cualquier DTD
            if b"<!DOCTYPE" in raw[:2048] or b"<!ENTITY" in raw:
                raise ValueError("XML con DTD rechazado")
            root = ET.fromstring(raw)
            nodes = {}
            for nd in root.findall("node"):
                nodes[nd.get("id")] = (float(nd.get("lat")), float(nd.get("lon")))
            got = 0
            for wy in root.findall("way"):
                tags = {t.get("k"): t.get("v") for t in wy.findall("tag")}
                if "building" not in tags:
                    continue
                geom = []
                ok = True
                for ref in wy.findall("nd"):
                    p = nodes.get(ref.get("ref"))
                    if p is None:
                        ok = False
                        break
                    geom.append({"lat": p[0], "lon": p[1]})
                if ok and len(geom) >= 3:
                    ways[wy.get("id")] = {"id": wy.get("id"), "tags": tags, "geometry": geom}
                    got += 1
            print(f"  tile {i + 1}/{len(tiles)} ok: {got} edificios")
            break
        except Exception as ex:
            print(f"  tile {i + 1} intento {attempt + 1} falló: {type(ex).__name__} {str(ex)[:80]}")
            time.sleep(2 + attempt * 3)
    else:
        print(f"  tile {i + 1} SIN DATOS")

out = os.path.join(OUT, "buildings-raw.json")
json.dump({"elements": list(ways.values())}, open(out, "w", encoding="utf-8"), ensure_ascii=False)
print("total edificios", len(ways), "->", os.path.relpath(out))
