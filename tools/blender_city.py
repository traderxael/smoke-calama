"""Construye el modelo 3D de Calama en Blender (headless) y exporta GLB.

Uso:
  blender -b --factory-startup -P tools/blender_city.py -- <calama-city.json> <salida.glb>

Cada edificio se extruye desde su huella OSM. Los edificios se agrupan por
sector (estación de monitoreo más cercana) y cada sector recibe un material
propio, para poder recolorearlos desde el visor web o al abrirlos en Blender.
"""
import bpy
import json
import math
import os
import sys

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
SRC = argv[0]
DST = argv[1]

with open(SRC, encoding="utf-8") as f:
    data = json.load(f)

meta = data["meta"]
blds = data["buildings"]

# color de referencia por sector: estado de MP10 en enero 2025, 18:00 (SINCA)
REF = {
    "hospital": (0.82, 0.55, 0.19, 1.0),
    "cpvk": (0.82, 0.38, 0.19, 1.0),
    "cd23": (0.70, 0.15, 0.12, 1.0),
    "centro": (0.82, 0.55, 0.19, 1.0),
    "oasis": (0.18, 0.55, 0.36, 1.0),
}
sectors = [s["id"] for s in meta["sectors"]]

# escena limpia
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = "METRIC"
scene.unit_settings.scale_length = 1.0


def make_material(name, rgba):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Roughness"].default_value = 0.85
    bsdf.inputs["Metallic"].default_value = 0.0
    return mat


mats = {}
for sid in sectors:
    mats[sid] = make_material("SECTOR_" + sid.upper(), REF.get(sid, (0.5, 0.5, 0.5, 1.0)))
mat_ground = make_material("SUELO", (0.78, 0.70, 0.58, 1.0))

# suelo (200 x 160 m más allá del bbox real)
gx, gy = 5200.0, 4200.0
ground_verts = [(-gx, -gy, 0.0), (gx, -gy, 0.0), (gx, gy, 0.0), (-gx, gy, 0.0)]
me = bpy.data.meshes.new("suelo")
me.from_pydata(ground_verts, [], [(0, 1, 2, 3)])
me.materials.append(mat_ground)
ob = bpy.data.objects.new("suelo", me)
scene.collection.objects.link(ob)

grouped = {sid: ([], []) for sid in sectors}
for b in blds:
    xs, ys = b["x"], b["y"]
    h = b["h"]
    sid = sectors[b["s"]]
    verts, faces = grouped[sid]
    n = len(xs)
    base = len(verts)
    for i in range(n):
        verts.append((xs[i], ys[i], 0.0))
    for i in range(n):
        verts.append((xs[i], ys[i], h))
    # muros: dos triángulos por arista (compatible con cualquier motor)
    for i in range(n):
        j = (i + 1) % n
        faces.append((base + i, base + j, base + n + j))
        faces.append((base + i, base + n + j, base + n + i))
    # techo: abanico desde el primer vértice
    for i in range(1, n - 1):
        faces.append((base, base + i, base + i + 1))

total_tris = 0
for sid in sectors:
    verts, faces = grouped[sid]
    if not verts:
        continue
    me = bpy.data.meshes.new("edificios_" + sid)
    me.from_pydata(verts, [], faces)
    me.validate()
    me.materials.append(mats[sid])
    ob = bpy.data.objects.new("edificios_" + sid, me)
    scene.collection.objects.link(ob)
    total_tris += len(faces)

bpy.ops.export_scene.gltf(
    filepath=DST,
    export_format="GLB",
    use_selection=False,
    export_apply=True,
    export_yup=True,
    export_cameras=False,
    export_lights=False,
    export_animations=False,
)

size = os.path.getsize(DST)
print("BLENDER_OK edificios=%d caras=%d bytes=%d" % (len(blds), total_tris, size))
