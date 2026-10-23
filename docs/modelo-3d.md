# Modelo 3D del casco urbano de Calama

Cómo se construyó la página **Calama en 3D** (`web/ciudad.html`) y qué límites tiene el modelo. Consulta: **22.10.2026**.

## 1. Antecedentes buscados en GitHub

Se buscó un modelo 3D ya publicado de Calama para reutilizarlo. **No existe**: la búsqueda por "calama 3d" solo devuelve un proyecto homónimo sin relación (`RocketJamDev/calamar-3d`). Las herramientas abiertas que sí resuelven el problema de OSM → 3D son:

| Proyecto | Uso | Enlace |
| --- | --- | --- |
| Blosm (addon de Blender) | importa OpenStreetMap y terrenos a Blender con un clic; requiere Blender y su propio flujo | https://github.com/vvoovv/blosm |
| OSM2World | convierte OSM en modelos 3D; pensado para rendering, no para un dataset propio | https://github.com/tordanik/OSM2World |
| OSMBuildings | visor 3D de edificios OSM en el navegador | https://github.com/OSMBuildings/OSMBuildings |
| three-geo | visualización geográfica 3D con three.js | https://github.com/w3reality/three-geo |

Se eligió un camino propio —OSM API → dataset simplificado → Blender → GLB/DXF + MapLibre— porque el sitio ya usa MapLibre (sin dependencias nuevas en el navegador), porque permite colorear por sector con los datos de SINCA y porque deja un modelo descargable y reproducible.

## 2. Flujo

1. **Descarga** (`tools/fetch_city.py`): API 0.6 de OpenStreetMap, 15 mosaicos de 0,02° con solape, solo `way["building"]`. Se rechaza XML con DTD.
2. **Procesamiento** (`tools/build_city.py`): proyección equirectangular local, filtro de área (< 18 m² se descarta), simplificación Douglas-Peucker (1,2 m), asignación de sector y alturas.
3. **Blender** (`tools/blender_city.py`, headless): extrusión de cada huella, muros y techo, una malla por sector con material `SECTOR_<ID>`, suelo y exportación GLB (glTF 2.0, Y-up).
4. **CAD**: el mismo script genera un DXF con caras 3D (`3DFACE`) de muros y techos en metros.
5. **Web** (`web/city.js`): MapLibre dibuja las extrusiones desde el dataset compacto y colorea cada sector según el instante elegido; sin librerías 3D adicionales.

## 3. Cifras del modelo

| Dato | Valor |
| --- | --- |
| Edificios | 1.385 |
| Caras (muros + techos) | 18.731 |
| Sectores | 5 (estaciones urbanas de la red Calama) |
| Altura mínima / máxima | 3,0 m / 36,0 m (estimadas) |
| `calama-city.glb` | 1,03 MB, 6 mallas, 6 materiales |
| `calama-city.dxf` | 1,85 MB, capas `MUROS` y `TECHOS` |
| `calama-city.js` | 116 KB (huellas en metros locales) |

## 4. Sectores y color

- Cada edificio se asigna a la **estación más cercana** (distancia euclídea en metros locales).
- El área de cada sector es un **Voronoi recortado** al bounding box del casco urbano.
- El color usa los mismos umbrales del mapa principal: guía OMS, norma anual chilena y límite diario.
- Si una estación no mide el contaminante elegido en ese instante (por ejemplo Oasis para MP10), el sector toma el valor de **la estación más cercana que sí mide** y la interfaz lo dice: "sin dato propio · usa Centro".

## 5. Límites que hay que decir en voz alta

- **Cobertura parcial**: OpenStreetMap no tiene todas las construcciones de Calama. Los 1.385 edificios son las huellas mapeadas, no el total de la ciudad.
- **Alturas estimadas**: solo 4 edificios declaran `height` y 33 declaran `building:levels`; el resto usa una altura por tipo (casa 4,5 m, galpón 8 m, hospital 14 m). No es un levantamiento.
- **Altura ×2 en la vista**: para que el volumen se lea a escala urbana; el GLB y el DXF conservan las alturas reales del dataset.
- **Estimación por cercanía**: no es un modelo de dispersión ni una medición por edificio. Un edificio junto a una estación no "mide" lo mismo que la estación.
- **Sin interiores ni usos**: el modelo no distingue vivienda, comercio o industria.

## 6. Reproducir

```bash
python tools/fetch_city.py                     # OSM -> research/city/buildings-raw.json
python tools/build_city.py                     # dataset + DXF
"D:/blender/blender.exe" -b --factory-startup -P tools/blender_city.py -- \
  research/city/calama-city.json web/assets/calama-city.glb
node research/pw/city.js                       # verificación en Chrome headless
```

## 7. Licencias

- **Huellas y modelo derivado**: datos © colaboradores de OpenStreetMap, **ODbL**. Al redistribuir el GLB o el DXF hay que mantener la atribución y la licencia.
- **Blender**: GPL (herramienta); no impone licencia al GLB exportado.
- **Datos de contaminación**: SMA y SINCA (ver `README.md`).
- **Código del sitio**: MIT (ver `LICENSE`).
