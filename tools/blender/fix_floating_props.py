# 공중에 떠 있는 소품을 바로 아래 지형(테라스·둔덕·호수 바닥)에 내려놓는다.
#
#   blender -b <scene.blend> --python fix_floating_props.py --          # 미리보기(저장 안 함)
#   blender -b <scene.blend> --python fix_floating_props.py -- --apply  # .blend에 저장
#
# 수직(Z)으로만 움직인다. 좌우 배치·회전·크기는 건드리지 않는다.
# 테라스·둔덕·호수는 커브를 깎아 만든 것이라 평가한 메시로 바닥을 만든다.
import sys

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
APPLY = '--apply' in argv
GAP = float(next((a.split('=')[1] for a in argv if a.startswith('--gap=')), '0.3'))  # 이보다 많이 뜨면 내린다
EMBED = 0.04  # 살짝 파묻어 경계가 뜨지 않게

GROUND_MATS = {'M_IvoryTerrace', 'M_IvoryTerraceSide', 'M_LilacBank', 'M_LilacBankUnder', 'M_LilacSoil', 'M_LagoonBed'}
PROP_MATS = {'M_ApricotPetalStone', 'M_MintCrystalReed', 'M_MintLeaf', 'M_MintLeaf2', 'M_BudStem', 'M_SproutMint', 'M_SproutPeach'}
GEOM = {'MESH', 'CURVE', 'SURFACE', 'FONT', 'META'}
# 내보내기에서 빠지는 컬렉션(원본 템플릿 에셋)은 건드리지 않는다
SKIP_COLLECTIONS = {'KIT_공통에셋', 'CAMERAS', 'NAV_동선표시', 'ENV_조명_Lights'}

dg = bpy.context.evaluated_depsgraph_get()


def mats(o):
    return {s.material.name for s in o.material_slots if s.material}


def eval_mesh(o):
    ev = o.evaluated_get(dg)
    try:
        return ev, ev.to_mesh()
    except RuntimeError:
        return ev, None


def world_bounds(o):
    """평가한 메시 기준 월드 경계. (가운데 x, 가운데 y, 바닥 z) 또는 None"""
    ev, me = eval_mesh(o)
    if me is None or not len(me.vertices):
        ev.to_mesh_clear()
        return None
    mw = o.matrix_world
    pts = [mw @ v.co for v in me.vertices]
    ev.to_mesh_clear()
    xs = [p.x for p in pts]
    ys = [p.y for p in pts]
    zs = [p.z for p in pts]
    return Vector(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, min(zs)))


def build_bvh(objs):
    verts, faces = [], []
    for o in objs:
        ev, me = eval_mesh(o)
        if me is None:
            continue
        base = len(verts)
        mw = o.matrix_world
        verts.extend([mw @ v.co for v in me.vertices])
        for p in me.polygons:
            idx = [base + i for i in p.vertices]
            for k in range(1, len(idx) - 1):
                faces.append((idx[0], idx[k], idx[k + 1]))
        ev.to_mesh_clear()
    return BVHTree.FromPolygons(verts, faces), len(faces)


def shipped(o):
    return not any(c.name in SKIP_COLLECTIONS for c in o.users_collection)


objs = [o for o in bpy.context.scene.objects if o.type in GEOM and shipped(o)]
ground = [o for o in objs if mats(o) & GROUND_MATS]
props = [o for o in objs if mats(o) & PROP_MATS]
bvh, nfaces = build_bvh(ground)
print(f'[fix] 지형 {len(ground)}개({nfaces:,} 삼각형), 소품 {len(props)}개')

moved, skipped = [], []
for o in props:
    b = world_bounds(o)
    if b is None:
        continue
    hit, _, _, _ = bvh.ray_cast(Vector((b.x, b.y, b.z + 0.4)), Vector((0, 0, -1)), 200.0)
    if hit is None:
        skipped.append(f'  ? {o.name:24} 아래에 지형 없음')
        continue
    gap = b.z - hit.z
    if gap <= GAP:
        continue
    drop = gap - EMBED
    moved.append((o, drop, gap, hit.z))

print(f'[fix] 떠 있는 소품 {len(moved)}개, 아래가 빈 소품 {len(skipped)}개')
for o, drop, gap, groundz in sorted(moved, key=lambda m: -m[1]):
    print(f'  ↓ {o.name:24} {gap:5.2f}m 떠 있음 → {drop:5.2f}m 내림 (지면 z={groundz:6.2f})')
for line in skipped:
    print(line)

for o, drop, _, _ in moved:
    o.location.z -= drop

if APPLY:
    bpy.ops.wm.save_mainfile()
    print(f'[fix] {len(moved)}개 내리고 저장 완료 {bpy.data.filepath}')
else:
    print(f'[fix] {len(moved)}개 내렸다(미리보기, 저장 안 함 — 저장하려면 -- --apply)')
