# LUMINA 3D — 캐릭터모델링.blend → 캐릭터별 GLB
#
#   blender -b 캐릭터모델링.blend --python export_characters.py -- <out_dir>
#
# 리그가 없는 파츠 분리형 모델이다. 걷기 연출을 위해
#   - 캐릭터 발바닥 가운데를 원점으로 옮기고 정면을 glTF +Z(블렌더 -Y)로 맞춘다
#   - 팔(Arm*)은 어깨, 다리(Leg*)는 골반 쪽 끝을 원점(회전축)으로 바꾼다
#   - 손·엄지는 가까운 팔, 발은 가까운 다리의 자식으로 묶는다
# 원본 .blend는 저장하지 않는다.
import bpy, sys, os, json
from mathutils import Vector, Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import simplify_material  # noqa: E402

OUT = sys.argv[sys.argv.index('--') + 1]
os.makedirs(OUT, exist_ok=True)
scene = bpy.context.scene
vl = bpy.context.view_layer

CHARS = {
    'Lumi_01_Flame': 'flame',
    'Lumi_02_Flower': 'flower',
    'Lumi_03_Crystal': 'crystal',
    'Lumi_04_Vine': 'vine',
    'Lumi_05_Cloud': 'cloud',
    'Lumi_06_Hexa': 'hexa',
}
MAX_TRIS = 9000  # 파츠당


def world_verts(o):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = o.evaluated_get(dg)
    me = ev.to_mesh()
    pts = [o.matrix_world @ v.co for v in me.vertices]
    ev.to_mesh_clear()
    return pts


def set_origin(o, world_point):
    """메시 데이터를 옮겨 오브젝트 원점을 world_point로 바꾼다(모양은 그대로)."""
    local = o.matrix_world.inverted() @ world_point
    o.data.transform(Matrix.Translation(-local))
    o.matrix_world = o.matrix_world @ Matrix.Translation(local)


def bake_mods(o):
    for m in list(o.modifiers):
        try:
            with bpy.context.temp_override(object=o, active_object=o, selected_objects=[o]):
                bpy.ops.object.modifier_apply(modifier=m.name)
        except Exception as e:
            print('modifier', o.name, m.name, e)


report = {}
# 커브 → 메시, 공유 메시 분리
bpy.ops.object.select_all(action='DESELECT')
for o in scene.objects:
    if o.type == 'CURVE':
        o.select_set(True)
        vl.objects.active = o
if bpy.context.selected_objects:
    bpy.ops.object.convert(target='MESH')
for o in scene.objects:
    if o.type == 'MESH' and o.data.users > 1:
        o.data = o.data.copy()

done_mats = set()
for cname, cid in CHARS.items():
    col = bpy.data.collections[cname]
    parts = [o for o in col.all_objects if o.type == 'MESH']
    for o in parts:
        # 부모 해제(월드 변환 유지) 후 모디파이어 적용
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
        bake_mods(o)
        o.data.calc_loop_triangles()
        n = len(o.data.loop_triangles)
        if n > MAX_TRIS:
            m = o.modifiers.new('WebDecimate', 'DECIMATE')
            m.ratio = MAX_TRIS / n
            bake_mods(o)
        for s in o.material_slots:
            if s.material and s.material.name not in done_mats:
                done_mats.add(s.material.name)
                simplify_material(s.material)
    pts = [p for o in parts for p in world_verts(o)]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    foot = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
    height = mx.z - mn.z

    torso = next((o for o in parts if 'Torso' in o.name), None)
    tc = sum(world_verts(torso), Vector()) / len(world_verts(torso)) if torso else foot + Vector((0, 0, height * 0.4))

    arms = [o for o in parts if '_Arm' in o.name]
    legs = [o for o in parts if '_Leg' in o.name]
    for a in arms:
        vs = world_verts(a)
        # 어깨 = 몸통 중심에 가장 가까운 끝 부분(가장 가까운 정점들의 평균)
        vs.sort(key=lambda p: (p - tc).length)
        k = max(1, len(vs) // 12)
        set_origin(a, sum(vs[:k], Vector()) / k)
    for g in legs:
        vs = world_verts(g)
        vs.sort(key=lambda p: -p.z)
        k = max(1, len(vs) // 12)
        set_origin(g, sum(vs[:k], Vector()) / k)

    vl.update()

    def nearest(o, cands):
        c = sum(world_verts(o), Vector()) / max(1, len(world_verts(o)))
        return min(cands, key=lambda a: min((p - c).length for p in world_verts(a))) if cands else None

    def attach(child, parent):
        # 부모의 현재 월드 행렬 역행렬을 넣어 월드 위치를 그대로 유지한다
        vl.update()
        child.parent = parent
        child.matrix_parent_inverse = parent.matrix_world.inverted()

    links = []
    for o in parts:
        n = o.name
        par = None
        if ('_Hand' in n or '_Thumb' in n or '_Wrist' in n) and arms:
            par = nearest(o, arms)
        elif ('_Foot' in n or '_Ankle' in n) and legs:
            par = nearest(o, legs)
        if par:
            links.append((o, par))
    for o, par in links:
        attach(o, par)

    # 루트: 발바닥 가운데, 블렌더 -Y(정면) → glTF +Z
    root = bpy.data.objects.new(f'Lumi_{cid}', None)
    scene.collection.objects.link(root)
    root.location = foot
    vl.update()
    for o in parts:
        if o.parent is None:
            attach(o, root)
    # 원점으로 옮긴다(자식들이 함께 따라온다)
    root.location = (0, 0, 0)
    vl.update()
    # 이름 정리: 게임에서 역할로 찾는다
    for o in parts:
        o.name = f'{cid}__{o.name.split("_", 1)[1] if "_" in o.name else o.name}'

    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    for o in parts:
        o.select_set(True)
    path = os.path.join(OUT, f'{cid}.glb')
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
        export_cameras=False, export_lights=False, export_texcoords=False, export_animations=False,
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
    )
    tris = sum(len(o.data.loop_triangles) for o in parts if o.data.calc_loop_triangles() is None)
    report[cid] = dict(height=round(height, 3), parts=[o.name for o in parts], arms=[a.name for a in arms],
                       legs=[g.name for g in legs], tris=tris, kb=round(os.path.getsize(path) / 1024))
    # 다음 캐릭터와 섞이지 않게 루트를 떼어 둔다
    root.location = (0, 0, -1000)

with open(os.path.join(OUT, 'characters.json'), 'w', encoding='utf-8') as f:
    json.dump(report, f, ensure_ascii=False, indent=1)
print('CHARS', json.dumps(report, ensure_ascii=False))
