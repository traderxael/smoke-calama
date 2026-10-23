"""Convierte las huellas de edificios de OSM en un dataset 3D para Calama.

Salidas:
  web/data/calama-city.js   dataset compacto (metros locales) para la vista web
  research/city/calama-city.json  intermedio completo (lo usa Blender)
  web/assets/calama-city.dxf      modelo CAD (caras 3D de muros y techos)
"""
import json, math, os, io

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "research", "city", "buildings-raw.json")
OUT_JSON = os.path.join(ROOT, "research", "city", "calama-city.json")
OUT_JS = os.path.join(ROOT, "web", "data", "calama-city.js")
OUT_DXF = os.path.join(ROOT, "web", "assets", "calama-city.dxf")

SECTORS = [
    {"id": "hospital", "name": "Hospital El Cobre", "short": "Hospital", "zone": "Poniente", "lat": -22.45401, "lon": -68.91018},
    {"id": "cpvk", "name": "Colegio Pedro Vergara Keller", "short": "CPVK", "zone": "Norte", "lat": -22.44218, "lon": -68.93301},
    {"id": "cd23", "name": "Club Deportivo 23 de Marzo", "short": "23 de Marzo", "zone": "Sur", "lat": -22.46012, "lon": -68.93780},
    {"id": "centro", "name": "Estación Centro", "short": "Centro", "zone": "Centro", "lat": -22.46182, "lon": -68.92818},
    {"id": "oasis", "name": "Oasis", "short": "Oasis", "zone": "Sur urbano", "lat": -22.46426, "lon": -68.92064},
]

LAT0, LON0 = -22.452, -68.928
R = 6378137.0
MX = R * math.cos(math.radians(LAT0)) * math.pi / 180.0   # metros por grado de longitud
MY = R * math.pi / 180.0                                   # metros por grado de latitud


def project(lat, lon):
    return ((lon - LON0) * MX, (lat - LAT0) * MY)


def area(ring):
    a = 0.0
    for i in range(len(ring)):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % len(ring)]
        a += x1 * y2 - x2 * y1
    return abs(a) / 2.0


def seg_dist(p, a, b):
    (px, py), (ax, ay), (bx, by) = p, a, b
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def simplify(pts, tol):
    if len(pts) <= 3:
        return pts
    # Douglas-Peucker sobre la polilínea abierta (el anillo se cierra al final)
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        dmax, idx = 0.0, -1
        for k in range(i + 1, j):
            d = seg_dist(pts[k], pts[i], pts[j])
            if d > dmax:
                dmax, idx = d, k
        if dmax > tol and idx > 0:
            keep[idx] = True
            stack.append((i, idx))
            stack.append((idx, j))
    return [p for p, k in zip(pts, keep) if k]


TYPE_H = {
    "house": 4.5, "yes": 5.0, "residential": 9.0, "apartments": 12.0,
    "industrial": 8.0, "warehouse": 8.0, "hospital": 14.0, "school": 9.0,
    "church": 12.0, "commercial": 8.0, "retail": 6.0, "roof": 3.5,
    "garage": 3.2, "shed": 3.0, "service": 3.5, "construction": 4.0,
}


def height_of(tags):
    h = tags.get("height")
    if h:
        try:
            return max(2.5, min(60.0, float(str(h).lower().replace("m", "").strip().split()[0].replace(",", "."))))
        except Exception:
            pass
    lv = tags.get("building:levels")
    if lv:
        try:
            return max(2.5, min(60.0, float(str(lv).replace(",", ".")) * 3.0))
        except Exception:
            pass
    return TYPE_H.get(tags.get("building"), 5.0)


def sector_of(x, y):
    best, bd = 0, 1e18
    for i, s in enumerate(SECTORS):
        sx, sy = project(s["lat"], s["lon"])
        d = (x - sx) ** 2 + (y - sy) ** 2
        if d < bd:
            best, bd = i, d
    return best


def clip_halfplane(poly, a, b, c):
    """Conserva los puntos con a*x + b*y <= c (Sutherland-Hodgman)."""
    out = []
    n = len(poly)
    for i in range(n):
        p1, p2 = poly[i], poly[(i + 1) % n]
        f1 = a * p1[0] + b * p1[1] - c
        f2 = a * p2[0] + b * p2[1] - c
        if f1 <= 0:
            out.append(p1)
        if (f1 < 0 < f2) or (f2 < 0 < f1):
            t = f1 / (f1 - f2)
            out.append((p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])))
    return out


def voronoi_areas():
    """Área de cada estación dentro del bbox (Voronoi recortado)."""
    s, w, n, e = -22.482, -68.968, -22.422, -68.888
    x0, y0 = project(s, w)
    x1, y1 = project(n, e)
    rect = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    seeds = [project(st["lat"], st["lon"]) for st in SECTORS]
    areas = {}
    for i, (xi, yi) in enumerate(seeds):
        poly = list(rect)
        for j, (xj, yj) in enumerate(seeds):
            if i == j or not poly:
                continue
            a = 2 * (xj - xi)
            b = 2 * (yj - yi)
            c = xj * xj + yj * yj - xi * xi - yi * yi
            poly = clip_halfplane(poly, a, b, c)
        areas[SECTORS[i]["id"]] = [[round(px, 1), round(py, 1)] for px, py in poly]
    return areas


def main():
    raw = json.load(open(RAW, encoding="utf-8"))
    els = raw.get("elements", [])
    buildings = []
    seen = set()
    for el in els:
        geom = el.get("geometry") or []
        if len(geom) < 3:
            continue
        tags = el.get("tags", {})
        if tags.get("building") in ("no", "roof", "construction"):
            continue
        ring = [project(g["lat"], g["lon"]) for g in geom]
        if ring[0] == ring[-1]:
            ring = ring[:-1]
        if len(ring) < 3:
            continue
        a = area(ring)
        if a < 18:
            continue
        ring = simplify(ring + [ring[0]], 1.2)[:-1]
        if len(ring) < 3:
            continue
        cx = sum(p[0] for p in ring) / len(ring)
        cy = sum(p[1] for p in ring) / len(ring)
        key = (round(cx, 1), round(cy, 1), round(a, 0))
        if key in seen:
            continue
        seen.add(key)
        buildings.append({
            "x": [round(p[0], 1) for p in ring],
            "y": [round(p[1], 1) for p in ring],
            "h": round(height_of(tags), 1),
            "s": sector_of(cx, cy),
            "a": round(a, 1),
        })
    # orden estable por sector y tamaño
    buildings.sort(key=lambda b: (b["s"], -b["a"]))
    per = [0] * len(SECTORS)
    for b in buildings:
        per[b["s"]] += 1
    areas = voronoi_areas()
    meta = {
        "origin": {"lat": LAT0, "lon": LON0, "mx": MX, "my": MY},
        "areas": areas,
        "bbox": [-68.968, -22.482, -68.888, -22.422],
        "buildings": len(buildings),
        "generated": "2026-10-22",
        "source": "OpenStreetMap (huellas de edificios), consulta 22.10.2026",
        "sectors": [
            dict(SECTORS[i], count=per[i], mx=round(project(SECTORS[i]["lat"], SECTORS[i]["lon"])[0], 1),
                 my=round(project(SECTORS[i]["lat"], SECTORS[i]["lon"])[1], 1))
            for i in range(len(SECTORS))
        ],
    }
    full = {"meta": meta, "buildings": buildings}
    os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
    with io.open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(full, f, ensure_ascii=False, separators=(",", ":"))

    # JS compacto: [sector, alto, [x0,y0,x1,y1,...]]
    arr = [[b["s"], b["h"], [v for p in zip(b["x"], b["y"]) for v in p]] for b in buildings]
    with io.open(OUT_JS, "w", encoding="utf-8", newline="") as f:
        f.write("window.CALAMA_CITY = ")
        json.dump({"meta": meta, "b": arr}, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";")

    write_dxf(buildings)

    print("edificios", len(buildings), "por sector", per)
    print("alturas min/max", min(b["h"] for b in buildings), max(b["h"] for b in buildings))
    for p in (OUT_JSON, OUT_JS, OUT_DXF):
        print(os.path.relpath(p, ROOT), round(os.path.getsize(p) / 1024, 1), "KB")


def write_dxf(buildings, max_faces=40000):
    """DXF mínimo (3DFACE) con muros y techo por edificio. Unidades: metros."""
    parts = [
        "0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n6\n0\nENDSEC\n",
        "0\nSECTION\n2\nENTITIES\n",
    ]
    faces = 0
    for b in buildings:
        xs, ys, h = b["x"], b["y"], b["h"]
        n = len(xs)
        if faces >= max_faces:
            break
        for i in range(n):
            j = (i + 1) % n
            parts.append(
                "0\n3DFACE\n8\nMUROS\n"
                f"10\n{xs[i]:.2f}\n20\n{ys[i]:.2f}\n30\n0\n"
                f"11\n{xs[j]:.2f}\n21\n{ys[j]:.2f}\n31\n0\n"
                f"12\n{xs[j]:.2f}\n22\n{ys[j]:.2f}\n32\n{h:.2f}\n"
                f"13\n{xs[i]:.2f}\n23\n{ys[i]:.2f}\n33\n{h:.2f}\n"
            )
            faces += 1
        # techo en abanico (triángulos) para que el DXF muestre el volumen
        for i in range(1, n - 1):
            parts.append(
                "0\n3DFACE\n8\nTECHOS\n"
                f"10\n{xs[0]:.2f}\n20\n{ys[0]:.2f}\n30\n{h:.2f}\n"
                f"11\n{xs[i]:.2f}\n21\n{ys[i]:.2f}\n31\n{h:.2f}\n"
                f"12\n{xs[i+1]:.2f}\n22\n{ys[i+1]:.2f}\n32\n{h:.2f}\n"
                f"13\n{xs[i+1]:.2f}\n23\n{ys[i+1]:.2f}\n33\n{h:.2f}\n"
            )
            faces += 1
    parts.append("0\nENDSEC\n0\nEOF\n")
    os.makedirs(os.path.dirname(OUT_DXF), exist_ok=True)
    with io.open(OUT_DXF, "w", encoding="ascii", newline="\r\n") as f:
        f.write("".join(parts))


if __name__ == "__main__":
    main()
