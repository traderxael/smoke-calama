import json, math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
summary = json.loads((ROOT / "research" / "sinca-summary.json").read_text(encoding="utf-8"))


def utm19s_to_latlon(easting, northing):
    a = 6378137.0
    f = 1 / 298.257223563
    k0 = 0.9996
    e2 = f * (2 - f)
    ep2 = e2 / (1 - e2)
    x = easting - 500000.0
    y = northing - 10000000.0
    lon0 = math.radians(-69.0)
    M = y / k0
    mu = M / (a * (1 - e2 / 4 - 3 * e2**2 / 64 - 5 * e2**3 / 256))
    e1 = (1 - math.sqrt(1 - e2)) / (1 + math.sqrt(1 - e2))
    phi1 = (mu + (3 * e1 / 2 - 27 * e1**3 / 32) * math.sin(2 * mu)
            + (21 * e1**2 / 16 - 55 * e1**4 / 32) * math.sin(4 * mu)
            + (151 * e1**3 / 96) * math.sin(6 * mu)
            + (1097 * e1**4 / 512) * math.sin(8 * mu))
    N1 = a / math.sqrt(1 - e2 * math.sin(phi1) ** 2)
    T1 = math.tan(phi1) ** 2
    C1 = ep2 * math.cos(phi1) ** 2
    R1 = a * (1 - e2) / (1 - e2 * math.sin(phi1) ** 2) ** 1.5
    D = x / (N1 * k0)
    lat = phi1 - (N1 * math.tan(phi1) / R1) * (
        D**2 / 2
        - (5 + 3 * T1 + 10 * C1 - 4 * C1**2 - 9 * ep2) * D**4 / 24
        + (61 + 90 * T1 + 298 * C1 + 45 * T1**2 - 252 * ep2 - 3 * C1**2) * D**6 / 720
    )
    lon = lon0 + (
        D
        - (1 + 2 * T1 + C1) * D**3 / 6
        + (5 - 2 * C1 + 28 * T1 - 3 * C1**2 + 8 * ep2 + 24 * T1**2) * D**5 / 120
    ) / math.cos(phi1)
    return round(math.degrees(lat), 5), round(math.degrees(lon), 5)


UTM = {
    "hospital": (509242, 7516916),
    "cpvk": (506893, 7518227),
    "cd23": (506399, 7516241),
    "centro": (507389, 7516053),
    "nueva": (536175, 7529174),
    "oasis": (508165, 7515782),
}

coords = {k: utm19s_to_latlon(*v) for k, v in UTM.items()}

stations = {
    "hospital": {
        "name": "Hospital El Cobre",
        "short": "Hospital",
        "zone": "Poniente",
        "lat": coords["hospital"][0],
        "lon": coords["hospital"][1],
        "page": "https://sinca.mma.gob.cl/index.php/estacion/index/id/124",
        "emrp": ["mp10", "mp25", "so2"],
        "note": "Estación EMRP para MP10, MP2,5 y SO2. Es la serie más larga del sector poniente.",    },
    "cpvk": {
        "name": "Colegio Pedro Vergara Keller",
        "short": "CPVK",
        "zone": "Norte",
        "lat": coords["cpvk"][0],
        "lon": coords["cpvk"][1],
        "page": "https://sinca.mma.gob.cl/index.php/estacion/index/id/222",
        "emrp": ["mp10", "mp25"],
        "note": "Estación EMRP para MP10 y MP2,5. Su promedio trianual de MP10 también superó la norma.",
    },
    "cd23": {
        "name": "Club Deportivo 23 de Marzo",
        "short": "23 de Marzo",
        "zone": "Sur",
        "lat": coords["cd23"][0],
        "lon": coords["cd23"][1],
        "page": "https://sinca.mma.gob.cl/index.php/estacion/index/id/207",
        "emrp": ["mp10", "mp25"],
        "note": "Estación EMRP para MP10 y MP2,5. Registra el promedio trianual de MP10 más alto de la red.",
    },
    "centro": {
        "name": "Estación Centro",
        "short": "Centro",
        "zone": "Centro",
        "lat": coords["centro"][0],
        "lon": coords["centro"][1],
        "page": "https://sinca.mma.gob.cl/index.php/estacion/index/id/275",
        "emrp": ["mp10", "mp25"],
        "note": "Estación EMRP urbana para MP10 y MP2,5. Su serie SINCA termina el 31 de diciembre de 2025.",
    },
    "nueva": {
        "name": "Nueva Chiu Chiu",
        "short": "N. Chiu Chiu",
        "zone": "Rural · este",
        "lat": coords["nueva"][0],
        "lon": coords["nueva"][1],
        "page": "https://sinca.mma.gob.cl/index.php/estacion/index/id/282",
        "emrp": [],
        "note": "Localidad al este de Calama. No es EMRP; aporta contexto rural a la red.",
    },
    "oasis": {
        "name": "Oasis",
        "short": "Oasis",
        "zone": "Sur urbano",
        "lat": coords["oasis"][0],
        "lon": coords["oasis"][1],
        "page": "https://sinca.mma.gob.cl/index.php/estacion/index/id/134",
        "emrp": [],
        "note": "Estación de SO2 al sur del radio urbano; no es EMRP.",
    },
}


def period_from_summary(pol, metric, sid):
    s = summary[pol][sid]
    out = {}
    for y in ("25", "26"):
        if s.get(y, {}).get(metric) is not None:
            out[y] = round(s[y][metric], 1)
    return out


mp10_2026 = {k: summary["mp10"][k]["26"]["mean"] for k in ("hospital", "cpvk", "cd23", "nueva")}
mp25_2026 = {k: summary["mp25"][k]["26"]["mean"] for k in ("hospital", "cpvk", "cd23")}
mp10_cov_2026 = {k: summary["mp10"][k]["26"]["coverage"] for k in ("hospital", "cpvk", "cd23", "nueva")}
mp25_cov_2026 = {k: summary["mp25"][k]["26"]["coverage"] for k in ("hospital", "cpvk", "cd23")}
mp10_max_2026 = {k: summary["mp10"][k]["26"]["max"] for k in ("hospital", "cpvk", "cd23", "nueva")}
mp25_max_2026 = {k: summary["mp25"][k]["26"]["max"] for k in ("hospital", "cpvk", "cd23")}
mp10_2025 = {k: summary["mp10"][k]["25"]["mean"] for k in ("hospital", "cpvk", "cd23", "centro", "nueva")}
mp25_2025 = {k: summary["mp25"][k]["25"]["mean"] for k in ("hospital", "cpvk", "cd23", "centro")}
so2_2025 = {k: summary["so2"][k]["25"]["p99"] for k in ("hospital", "cd23", "centro", "nueva", "oasis")}
so2_2026 = {k: summary["so2"][k]["26"]["p99"] for k in ("hospital", "cd23", "nueva", "oasis")}
so2_2025_mean = {k: summary["so2"][k]["25"]["mean"] for k in ("hospital", "cd23", "centro", "nueva", "oasis")}
so2_2026_mean = {k: summary["so2"][k]["26"]["mean"] for k in ("hospital", "cd23", "nueva", "oasis")}
so2_2025_max = {k: summary["so2"][k]["25"]["max"] for k in ("hospital", "cd23", "centro", "nueva", "oasis")}
so2_2026_max = {k: summary["so2"][k]["26"]["max"] for k in ("hospital", "cd23", "nueva", "oasis")}
so2_cov_2025 = {k: summary["so2"][k]["25"]["coverage"] for k in ("hospital", "cd23", "centro", "nueva", "oasis")}
so2_cov_2026 = {k: summary["so2"][k]["26"]["coverage"] for k in ("hospital", "cd23", "nueva", "oasis")}


def monthly(pol, sid, year="26"):
    return summary[pol][sid][year]["monthly"]


data = {
    "meta": {
        "city": "Calama",
        "region": "Región de Antofagasta",
        "country": "Chile",
        "population": 166334,
        "populationSource": "INE, Censo 2024",
        "elevation": "2.260 m s. n. m.",
        "updated": "22.10.2026",
        "dataCut": "19.10.2026",
        "lat": -22.456,
        "lon": -68.924,
        "zoom": 12,
    },
    "stations": stations,
    "pollutants": {
        "mp10": {
            "name": "MP10",
            "longName": "Material particulado respirable",
            "unit": "µg/m³",
            "color": "#B4552F",
            "norm": 50,
            "normLabel": "Norma anual de Chile",
            "normDetail": "50 µg/m³ · promedio de 3 años",
            "normDaily": 130,
            "who": 15,
            "whoLabel": "Guía anual de la OMS (2021)",
            "size": "≤ 10 µm",
            "where": "Tráquea y bronquios",
            "origin": "Polvo de rajo, relaves, tránsito, obras y suelo urbano.",
            "health": "Irrita las vías respiratorias y agrava asma y EPOC. Las partículas más gruesas se depositan en la nariz, la garganta y los bronquios.",
            "periods": [
                {
                    "id": "norma",
                    "label": "2022–2024",
                    "tag": "Norma",
                    "note": "Promedio trianual validado",
                    "source": "SMA · DFZ-2025-553-II-NC",
                    "validated": True,
                    "values": {"hospital": 31, "cpvk": 51, "cd23": 53, "centro": 38},
                },
                {
                    "id": "2024",
                    "label": "2024",
                    "tag": "Último año",
                    "note": "Promedio anual validado",
                    "source": "SMA · DFZ-2025-553-II-NC",
                    "validated": True,
                    "values": {"hospital": 30, "cpvk": 50, "cd23": 48, "centro": 37},
                },
                {
                    "id": "2026",
                    "label": "2026",
                    "tag": "Ahora",
                    "note": "1 ene – 19 oct · datos SINCA",
                    "source": "SINCA · registros publicados",
                    "preliminary": True,
                    "values": {k: round(v, 1) for k, v in mp10_2026.items()},
                    "coverage": mp10_cov_2026,
                    "max": mp10_max_2026,
                },
            ],
        },
        "mp25": {
            "name": "MP2,5",
            "longName": "Material particulado fino",
            "unit": "µg/m³",
            "color": "#C58A2E",
            "norm": 20,
            "normLabel": "Norma anual de Chile",
            "normDetail": "20 µg/m³ · promedio de 3 años",
            "normDaily": 50,
            "who": 5,
            "whoLabel": "Guía anual de la OMS (2021)",
            "size": "≤ 2,5 µm",
            "where": "Alvéolos y torrente sanguíneo",
            "origin": "Combustión, fundición, tránsito y polvo fino suspendido.",
            "health": "Llega al fondo del pulmón y puede pasar a la sangre. Se asocia a enfermedades cardiorrespiratorias y a efectos en el desarrollo.",
            "periods": [
                {
                    "id": "norma",
                    "label": "2022–2024",
                    "tag": "Norma",
                    "note": "Promedio trianual validado",
                    "source": "SMA · DFZ-2025-553-II-NC",
                    "validated": True,
                    "values": {"hospital": 9, "cpvk": 12, "cd23": 11, "centro": 10},
                },
                {
                    "id": "2024",
                    "label": "2024",
                    "tag": "Último año",
                    "note": "Promedio anual validado",
                    "source": "SMA · DFZ-2025-553-II-NC",
                    "validated": True,
                    "values": {"hospital": 9, "cpvk": 11, "cd23": 11, "centro": 11},
                },
                {
                    "id": "2026",
                    "label": "2026",
                    "tag": "Ahora",
                    "note": "1 ene – 19 oct · datos SINCA",
                    "source": "SINCA · registros publicados",
                    "preliminary": True,
                    "values": {k: round(v, 1) for k, v in mp25_2026.items()},
                    "coverage": mp25_cov_2026,
                    "max": mp25_max_2026,
                },
            ],
        },
        "so2": {
            "name": "SO₂",
            "longName": "Dióxido de azufre",
            "unit": "µg/m³",
            "color": "#5B6472",
            "norm": 150,
            "normLabel": "Norma diaria de Chile",
            "normDetail": "150 µg/m³ · P99 de 24 h (promedio de 3 años)",
            "normDaily": 150,
            "who": 40,
            "whoLabel": "Guía diaria de la OMS (2021)",
            "size": "Gas",
            "where": "Vías respiratorias altas",
            "origin": "Fundición de concentrados de cobre y combustibles con azufre.",
            "health": "Puede irritar ojos, nariz y garganta, y agravar el asma. En Calama, los niveles urbanos medidos están muy por debajo de la norma.",
            "periods": [
                {
                    "id": "2025",
                    "label": "2025",
                    "tag": "Año completo",
                    "note": "P99 diario · datos SINCA",
                    "source": "SINCA · registros publicados",
                    "preliminary": True,
                    "values": so2_2025,
                    "mean": so2_2025_mean,
                    "max": so2_2025_max,
                    "coverage": so2_cov_2025,
                },
                {
                    "id": "2026",
                    "label": "2026",
                    "tag": "Ahora",
                    "note": "1 ene – 19 oct · P99 diario",
                    "source": "SINCA · registros publicados",
                    "preliminary": True,
                    "values": so2_2026,
                    "mean": so2_2026_mean,
                    "max": so2_2026_max,
                    "coverage": so2_cov_2026,
                },
            ],
        },
        "metales": {
            "name": "Metales",
            "longName": "Metales en polvo acumulado",
            "unit": "mg/kg",
            "color": "#7A4A35",
            "norm": None,
            "normLabel": "Sin norma para polvo interior",
            "normDetail": "Chile no fija límites para As, Cu ni Mo en polvo; el Pb tiene norma en aire, no en polvo.",
            "who": None,
            "whoLabel": "Sin guía equivalente",
            "size": "Polvo depositado",
            "where": "Aulas, patios y superficies",
            "origin": "Partículas oxidadas de la actividad minera, según el estudio de isótopos y mineralogía.",
            "health": "El plomo y el arsénico preocupan en la infancia por sus efectos en el desarrollo neurológico y cognitivo.",
            "studyOnly": True,
        },
    },
    "study": {
        "title": "The extractive classroom: indoor school environments as reservoirs of mining legacy",
        "journal": "Environment International",
        "year": 2026,
        "schools": 38,
        "unit": "mg/kg · mediana",
        "metals": [
            {"id": "as", "symbol": "As", "name": "Arsénico", "indoor": 247, "outdoor": 250, "factor": "≈10×", "color": "#B4552F"},
            {"id": "cu", "symbol": "Cu", "name": "Cobre", "indoor": 936, "outdoor": 1199, "factor": "5–6×", "color": "#C58A2E"},
            {"id": "pb", "symbol": "Pb", "name": "Plomo", "indoor": 161, "outdoor": 192, "factor": "5–6×", "color": "#5B6472"},
            {"id": "mo", "symbol": "Mo", "name": "Molibdeno", "indoor": 12.9, "outdoor": 15.5, "factor": "≈10×", "color": "#4E6B57"},
        ],
        "findings": [
            "El polvo de las salas tiene una composición similar al polvo exterior, con metales enriquecidos respecto del fondo natural del desierto.",
            "Los isótopos y la mineralogía apuntan a partículas oxidadas de origen minero, no al tráfico vehicular.",
            "Los ensayos con embriones de pez cebra mostraron una respuesta biológica preliminar; no prueban un efecto en niños y niñas.",
        ],
        "quote": "El plomo y el arsénico son particularmente preocupantes durante la infancia por sus posibles efectos en el desarrollo neurológico y cognitivo.",
        "quoteAuthor": "Estela Blanco",
        "quoteRole": "Escuela de Salud Pública UC, coautora",
        "caveat": "Estudio científico independiente. No es un monitoreo oficial ni una medición de exposición personal.",
    },
    "maxDaily2025": {
        k: summary["mp10"][k]["25"]["max"]
        for k in ("hospital", "cpvk", "cd23", "centro")
    },
    "trend": {
        "years": [2021, 2022, 2023, 2024, 2025],
        "mp10": {
            "hospital": [30, 30, 33, 30, mp10_2025["hospital"]],
            "cpvk": [42, 49, 55, 50, mp10_2025["cpvk"]],
            "cd23": [49, 56, 55, 48, mp10_2025["cd23"]],
            "centro": [35, 37, 41, 37, mp10_2025["centro"]],
        },
        "mp25": {
            "hospital": [10, 9, 9, 9, mp25_2025["hospital"]],
            "cpvk": [10, 12, 12, 11, mp25_2025["cpvk"]],
            "cd23": [10, 11, 11, 11, mp25_2025["cd23"]],
            "centro": [9, 9, 10, 11, mp25_2025["centro"]],
        },
        "note": "2021–2024: promedios anuales validados por la SMA. 2025: datos SINCA publicados, sujetos a validación.",
    },
    "monthly": {
        "mp10": {k: monthly("mp10", k) for k in ("hospital", "cpvk", "cd23", "centro", "nueva")},
        "mp25": {k: monthly("mp25", k) for k in ("hospital", "cpvk", "cd23", "centro")},
        "so2": {
            k: {"2025": monthly("so2", k, "25"), "2026": monthly("so2", k, "26")}
            for k in ("hospital", "cd23", "centro", "nueva", "oasis")
        },
    },
    "sources": [
        {"id": "dch", "name": "División Chuquicamata", "kind": "Rajo, fundición y plantas", "tonnes": 15503, "lat": -22.291, "lon": -68.900, "radius": 8200},
        {"id": "rt", "name": "Radomiro Tomic", "kind": "Rajo", "tonnes": 11297, "lat": None, "lon": None, "radius": 0},
        {"id": "dmh", "name": "Ministro Hales", "kind": "Rajo y planta de tostación", "tonnes": 3765, "lat": None, "lon": None, "radius": 0},
        {"id": "talabre", "name": "Tranque Talabre", "kind": "Depósito de relaves", "tonnes": 3377, "lat": -22.3674, "lon": -68.7701, "radius": 4200},
        {"id": "puerto", "name": "Puerto Seco", "kind": "Acopio y tránsito de carga", "tonnes": None, "lat": -22.4422, "lon": -68.8967, "radius": 1500},
        {"id": "ciudad", "name": "Ciudad de Calama", "kind": "Tránsito, obras y polvo resuspendido", "tonnes": None, "lat": -22.456, "lon": -68.924, "radius": 3400},
    ],
    "timeline": [
        {"year": "1915", "title": "Nace la mina", "text": "Comienza la explotación industrial de Chuquicamata, a unos 15 km al norte de Calama."},
        {"year": "2009", "title": "Calama, zona saturada", "text": "El D.S. 57/2009 declara zona saturada por MP10 a la ciudad y su área circundante."},
        {"year": "2022", "title": "Se aprueba el PPDA", "text": "El D.S. 5/2022 fija topes de emisión a las faenas mineras y medidas para el puerto seco, obras y transporte."},
        {"year": "2023", "title": "La justicia anula el plan", "text": "El Primer Tribunal Ambiental acoge el reclamo: la red no representaba a toda la población. La estación del Servicio Médico Legal había quedado fuera."},
        {"year": "2024", "title": "Sin plan vigente", "text": "La Corte Suprema ratifica la anulación. Se inicia un nuevo proceso de PDA y se dictan medidas provisionales."},
        {"year": "2026", "title": "El polvo llega al aula", "text": "Un estudio en 38 colegios encuentra metales de origen minero en el polvo acumulado dentro de las salas."},
    ],
    "citations": [
        {"id": "sma2025", "label": "Informe técnico DFZ-2025-553-II-NC: cumplimiento de normas MP10, MP2,5, SO2 y Pb, Red Calama 2022–2024", "publisher": "Superintendencia del Medio Ambiente", "year": "2025", "url": "https://ppda.mma.gob.cl/wp-content/uploads/2026/01/Examen-Informacion_Red_Calama_2025.pdf"},
        {"id": "sma2024", "label": "Informe técnico DFZ-2024-211-II-NC: cumplimiento de normas MP10 y MP2,5, Red Calama 2021–2023", "publisher": "Superintendencia del Medio Ambiente", "year": "2024", "url": "https://ppda.mma.gob.cl/wp-content/uploads/2024/06/Examen-Informacion_Red-Calama_2024_.pdf"},
        {"id": "sinca", "label": "Red de Calama: series diarias de MP10, MP2,5 y SO2 (consulta 22.10.2026)", "publisher": "SINCA, Ministerio del Medio Ambiente", "year": "2026", "url": "https://sinca.mma.gob.cl/index.php/region/index/id/II"},
        {"id": "ppda", "label": "Plan de Descontaminación Atmosférica para Calama y su área circundante", "publisher": "Ministerio del Medio Ambiente", "year": "2026", "url": "https://ppda.mma.gob.cl/antofagasta/plan-para-la-ciudad-de-calama-y-su-area-circundante/"},
        {"id": "ds5", "label": "D.S. N° 5/2022: establece el PPDA de Calama (inventario de emisiones 2016 y medidas)", "publisher": "Ministerio del Medio Ambiente", "year": "2022", "url": "https://ppda.mma.gob.cl/wp-content/uploads/2022/09/Decreto-5_12-MAY-2022.pdf"},
        {"id": "ds57", "label": "D.S. N° 57/2009: declara zona saturada por MP10 a Calama", "publisher": "MINSEGPRES", "year": "2009", "url": "https://ppda.mma.gob.cl/wp-content/uploads/2022/09/Decreto-57_30-MAY-2009.pdf"},
        {"id": "1ta", "label": "Primer Tribunal Ambiental anula el PDA de Calama", "publisher": "Primer Tribunal Ambiental", "year": "2023", "url": "https://1ta.cl/primer-tribunal-ambiental-ordena-anular-decreto-supremo-que-aprobo-el-plan-de-descontaminacion-atmosferica-de-cala/"},
        {"id": "cs", "label": "Corte Suprema ratifica la anulación del PDA de Calama", "publisher": "Primer Tribunal Ambiental", "year": "2024", "url": "https://1ta.cl/sentencia-de-corte-suprema-ratifica-el-fallo-del-primer-tribunal-ambiental-sobre-la-anulacion-del-pda-de-calama/"},
        {"id": "study", "label": "N. C. Zanetta-Colombo et al.: The extractive classroom: indoor school environments as reservoirs of mining legacy", "publisher": "Environment International", "year": "2026", "url": "https://www.sciencedirect.com/science/article/pii/S0160412026004368"},
        {"id": "uc", "label": "Estudio revela presencia elevada de polvo minero al interior de salas de clase en colegios de Calama", "publisher": "Visión Universitaria UC", "year": "2026", "url": "https://visionuniversitaria.uc.cl/universidad-y-sociedad/polvo-minero-metales-pesados-colegios-calama/"},
        {"id": "ine", "label": "Censo 2024: población de la comuna de Calama", "publisher": "Instituto Nacional de Estadísticas", "year": "2024", "url": "https://censo2024.ine.gob.cl/"},
        {"id": "who", "label": "WHO global air quality guidelines 2021", "publisher": "Organización Mundial de la Salud", "year": "2021", "url": "https://www.who.int/publications/i/item/9789240034228"},
    ],
    "photo": {
        "src": "assets/chuquicamata.jpg",
        "alt": "Vista aérea del rajo de la mina Chuquicamata, en el desierto de Atacama.",
        "caption": "Mina de Chuquicamata, 2016. Foto: Diego Delso / Wikimedia Commons, CC BY-SA 4.0.",
    },
}

(ROOT / "web" / "data").mkdir(parents=True, exist_ok=True)
(ROOT / "web" / "data" / "calama-data.js").write_text(
    "window.CALAMA = " + json.dumps(data, ensure_ascii=False, indent=2) + ";\n",
    encoding="utf-8",
)
(ROOT / "research" / "calama-data.json").write_text(
    json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
)
print(json.dumps(coords, indent=1, ensure_ascii=False))
print("stations", {k: (v["lat"], v["lon"]) for k, v in stations.items()})
print("mp10 2026", mp10_2026)
print("mp25 2026", mp25_2026)
print("so2 2025 p99", so2_2025)
print("so2 2026 p99", so2_2026)
print("bytes", (ROOT / "web" / "data" / "calama-data.js").stat().st_size)
