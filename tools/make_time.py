"""Añade el bloque `time` (diario, mensual y horarios) al dataset del sitio."""
import json
import statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

MACRO_TO_STATION = {
    "233": "cd23",
    "235": "cpvk",
    "236": "centro",
    "217": "hospital",
    "253": "nueva",
    "234": "oasis",
}
PARAM_TO_POL = {"PM10": "mp10", "PM25": "mp25", "0001": "so2"}
PPB_FACTOR = 2.62


def rows(path):
    out = []
    for line in path.read_text(encoding="latin-1").splitlines():
        if line[:6].isdigit():
            parts = [p.strip() for p in line.split(",")]
            if len(parts) < 5:
                continue
            value = None
            for i in (2, 3, 4):
                if parts[i]:
                    try:
                        value = float(parts[i])
                        break
                    except ValueError:
                        pass
            out.append((parts[0], parts[1] if len(parts) > 1 else "", value))
    return out


def daily_series(path, year, convert):
    """Devuelve una lista alineada a los días del año (o hasta el corte)."""
    by_day = {}
    for d, _h, v in rows(path):
        if d.startswith(year):
            by_day[d] = v
    days = sorted(by_day)
    if not days:
        return [], []
    labels = []
    values = []
    for d in days:
        labels.append(f"{d[2:4]}-{d[4:6]}")
        v = by_day[d]
        values.append(None if v is None else round(v * convert, 1))
    return labels, values


def hourly_profile(path, convert):
    buckets = {}
    for d, h, v in rows(path):
        if v is None or not h:
            continue
        hour = int(h[:2])
        buckets.setdefault(hour, []).append(v)
    out = []
    for hour in range(0, 24):
        vals = buckets.get(hour)
        out.append(None if not vals else round(statistics.fmean(vals) * convert, 1))
    return out


def build_time():
    daily = {"mp10": {}, "mp25": {}, "so2": {}}
    monthly = {"mp10": {}, "mp25": {}, "so2": {}
               }
    hourly = {"mp10": {"enero": {}, "julio": {}},
              "mp25": {"enero": {}, "julio": {}},
              "so2": {"enero": {}, "julio": {}}}
    labels = {}

    for macro, station in MACRO_TO_STATION.items():
        for param, pol in PARAM_TO_POL.items():
            factor = PPB_FACTOR if param == "0001" else 1
            base = ROOT / "research" / "sinca" / f"{macro}-{param}-250101.txt"
            if not base.exists():
                continue
            for year in ("25", "26"):
                lab, vals = daily_series(base, year, factor)
                if not vals:
                    continue
                if lab:
                    labels[year] = lab
                daily[pol].setdefault(year, {})[station] = vals
                # medias mensuales a partir de la serie diaria
                months = {}
                for label, v in zip(labels[year], vals):
                    if v is None:
                        continue
                    months.setdefault(label[0:2], []).append(v)
                order = [f"{m:02d}" for m in range(1, 13)]
                monthly[pol].setdefault(year, {})[station] = [
                    round(statistics.fmean(months[m]), 1) if m in months else None for m in order
                ]
            for mes in ("enero", "julio"):
                hp = ROOT / "research" / "sinca" / "horario" / f"{macro}-{param}-{mes}.txt"
                if hp.exists():
                    hourly[pol][mes][station] = hourly_profile(hp, factor)

    return {
        "dayLabels": {"25": labels.get("25", []), "26": labels.get("26", [])},
        "daily": daily,
        "monthly": monthly,
        "hourly": hourly,
        "hourlyMonths": {"enero": "enero 2025 (verano)", "julio": "julio 2025 (invierno)"},
    }


if __name__ == "__main__":
    data_path = ROOT / "web" / "data" / "calama-data.js"
    text = data_path.read_text(encoding="utf-8")
    payload = json.loads(text[text.index("{"): text.rindex("}") + 1])
    payload["time"] = build_time()
    data_path.write_text("window.CALAMA = " + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    (ROOT / "research" / "calama-data.json").write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    t = payload["time"]
    print("bytes", data_path.stat().st_size)
    print("daily mp10 25 stations", list(t["daily"]["mp10"].get("25", {}).keys()))
    print("day labels", len(t["dayLabels"]["25"]), len(t["dayLabels"]["26"]))
    print("hourly mp10 julio", {k: v[:4] for k, v in t["hourly"]["mp10"]["julio"].items()})
    print("hourly so2 enero", list(t["hourly"]["so2"]["enero"].keys()))
    print("monthly mp10 25 cd23", t["monthly"]["mp10"]["25"]["cd23"])
