# Smoke Calama

Sitio educativo sobre la contaminación del aire en **Calama (Antofagasta, Chile)**: mapa 3D sobre el relieve real, columnas por estación que crecen con la concentración medida, animación del tiempo (hora, día, mes y año) con series oficiales, evidencia sobre el MP10 crónico, el polvo de los colegios y los **planes de tratamiento y recuperación** que hoy están vigentes o en trámite.

**Sitio publicado:** https://calama-respira-ztxwnernxw3.qoder.website

## Qué incluye

- **Mapa 3D con MapLibre GL JS**: relieve real (Terrain Tiles de Mapzen), cámara inclinada, vista general / ciudad / toda la red, base de mapa o satélite.
- **Columnas de contaminación** por estación, con altura proporcional a la concentración y color según umbrales (guía OMS, norma chilena, límite diario). A escala general las estaciones urbanas se agrupan para que no se pisen; el grupo se abre al acercar.
- **Motor de tiempo** con tres marcos: perfil horario (Día), serie diaria (Mes) y promedio mensual (Año), play/pausa, velocidad y *scrubber* accesible. Gráfico y tabla siguen el mismo instante.
- **Modo para niños y modo técnico**: lenguaje, caras de estado del aire, analogías y un quiz de cuatro preguntas; el modo técnico muestra umbrales, cobertura y fuentes.
- **Evidencia verificada**: promedios anuales 2021–2025 de la SMA/SINCA, inventario de emisiones 2016, MP2,5 contra norma y OMS, y el estudio de 2026 en 38 colegios.
- **Planes de tratamiento y recuperación**: medidas provisionales R.E. 204/2024, nuevo PDA, PRAS/CRAS, franja arbórea y vivero, y el estado de cada instrumento. Ver [`docs/planes-de-recuperacion.md`](docs/planes-de-recuperacion.md).
- Accesibilidad: foco visible, teclado completo (columnas, scrubber, ficha), `aria-live`, alternativas en tabla, `prefers-reduced-motion`, contraste AA verificado.

## Datos

| Dato | Fuente |
| --- | --- |
| Cumplimiento MP10/MP2,5/SO₂ 2021–2024 | SMA, informes DFZ-2024-211 y DFZ-2025-553 |
| Series diarias y horarias 2025–2026 | SINCA (exportaciones oficiales de la red Calama) |
| Inventario de emisiones 2016 | D.S. N° 5/2022 |
| Normas y guías | D.S. 12/2022, D.S. 12/2011, D.S. 104/2018, guías OMS 2021 |
| Colegios (38) | Zanetta-Colombo et al., *Environment International*, 2026 |
| Medidas y planes | R.E. 204/2024, MMA; Primer Tribunal Ambiental; Contraloría (2026) |

La capa `web/data/calama-data.js` se genera con los scripts de `tools/` a partir de los archivos de `research/sinca/` y de los valores validados de los informes de la SMA. Los periodos se marcan como **validados** (SMA) o **preliminares** (SINCA) en el propio dato.

## Estructura

```
web/                 sitio estático (index.html, styles.css, app.js, data/, vendor/, assets/)
tools/               generación del dataset y parches de accesibilidad
research/sinca/      series crudas exportadas de SINCA
research/pw/         arnés de verificación (Playwright + axe)
docs/                notas de investigación (planes de recuperación)
```

## Ejecutar en local

El sitio es estático: no requiere build.

```bash
python -m http.server 7845 -d web
# abrir http://127.0.0.1:7845/
```

Necesita conexión para las teselas del mapa (OpenStreetMap/Esri), el relieve (terrain tiles) y las tipografías.

## Verificación

El arnés vive en `research/pw` (requiere `playwright-core`, `axe-core` y Chrome instalado).

```bash
cd research/pw
npm install
node v2.js        # 72 checks de interacción, consola y responsive
node v2-final.js  # teclado, 320 px, reduced-motion, enlaces e imágenes
node a11y.js      # axe-core: 0 violaciones en 6 estados
node contrast.js  # contraste por sección: 0 hallazgos
```

Los informes y capturas se escriben en `research/` (fuera del repositorio).

## Licencias y créditos

- **Código**: MIT (ver `LICENSE`).
- **Textos y visualizaciones propias**: CC BY-SA 4.0.
- **Datos**: pertenecen a sus fuentes (SMA, SINCA/MMA, SINIA). Se reproducen con atribución y con la fecha de consulta.
- **Foto**: mina de Chuquicamata, Diego Delso / Wikimedia Commons, CC BY-SA 4.0.
- **Mapa**: MapLibre GL JS (BSD-3); cartografía © OpenStreetMap (ODbL); imágenes © Esri y proveedores; relieve: Terrain Tiles de Mapzen (CC BY 4.0).
- **Tipografías**: Archivo, Baloo 2, Instrument Serif, IBM Plex Mono (SIL OFL).

Proyecto independiente, sin afiliación con el Estado ni con las empresas mencionadas. No es un sistema oficial de alerta: para decisiones de salud, sigue a la autoridad sanitaria.
